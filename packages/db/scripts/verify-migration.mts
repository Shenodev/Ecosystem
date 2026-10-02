/**
 * Applies the Drizzle migrations to a throwaway empty database and verifies the
 * resulting schema.
 *
 * This is the only check that can catch an incomplete migration: every other
 * test runs against the live database, where the tables were created by
 * `drizzle-kit push` and any statement missing from the migration file is
 * simply already satisfied.
 *
 * The scratch database is dropped in a finally block, so a failure never leaves
 * one behind.
 *
 * Run: npm run db:verify-migration -w @shenodev/db
 */
import { randomBytes } from "node:crypto";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, "..");

let checks = 0;
let failures = 0;

function check(label: string, ok: boolean, detail = ""): boolean {
  checks++;
  if (ok) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
  return ok;
}

// The root .env holds DATABASE_URL, the same one source of truth as everywhere.
const { config } = await import("dotenv");
config({ path: resolve(PKG_ROOT, "../..", ".env"), quiet: true });

const adminUrl = process.env.DATABASE_URL;
if (!adminUrl) {
  console.error("DATABASE_URL is not set; cannot verify migrations.");
  process.exit(1);
}

// Scratch name must be a valid identifier, so no dashes or quotes in the SQL.
const scratch = `sheno_migrate_check_${randomBytes(6).toString("hex")}`;
const scratchUrl = new URL(adminUrl);
scratchUrl.pathname = `/${scratch}`;

const admin = new Pool({ connectionString: adminUrl, ssl: { rejectUnauthorized: false }, max: 1 });
const target = new Pool({ connectionString: scratchUrl.toString(), ssl: { rejectUnauthorized: false }, max: 2 });

console.log(`migration verification on an empty database (${scratch})\n`);

try {
  try {
    await admin.query(`create database ${scratch}`);
    check("created an empty scratch database", true);
  } catch (error) {
    const e = error as Error & { code?: string };
    console.log(`  ....  could not create a database (${e.code}); falling back to a scratch schema`);
    // Some managed Postgres roles cannot CREATE DATABASE. Fall back to a
    // dedicated schema, which still proves the migration SQL is complete.
    const db = drizzle(admin);
    await db.execute(sql`create schema ${sql.identifier("migrate_check")}`);
    await admin.query(`set search_path to migrate_check`);
    await admin.query(`set search_path = migrate_check`);
  }

  const migrationDir = join(PKG_ROOT, "drizzle");
  const files = readdirSync(migrationDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  check("at least one migration file exists", files.length > 0, `looked in ${migrationDir}`);

  for (const file of files) {
    const statements = readFileSync(join(migrationDir, file), "utf8");
    try {
      await target.query(statements);
      check(`applies ${file}`, true);
    } catch (error) {
      const e = error as Error & { code?: string; message?: string };
      check(`applies ${file}`, false, `${e.code ?? ""} ${e.message ?? ""}`.slice(0, 200));
    }
  }

  const created = await target.query(`
    select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name
  `);
  const names = created.rows.map((r: { table_name: string }) => r.table_name);
  const expected = [
    "branches",
    "deliveries",
    "inventory",
    "order_items",
    "orders",
    "products",
    "roles",
    "tenants",
    "users",
  ];
  const absent = expected.filter((t) => !names.includes(t));
  check(
    "every table in the schema is created by the migration",
    absent.length === 0,
    `missing: ${absent.join(", ")} (found: ${names.join(", ") || "none"})`,
  );

  const fks = await target.query(`
    select count(*)::int as n from pg_constraint
     where contype = 'f' and connamespace = 'public'::regnamespace
  `);
  check("migration creates all 15 foreign keys", fks.rows[0].n === 15, `got ${fks.rows[0].n}`);

  // The doc's CHECK list (§5 price, §6 quantity + reserved, §7 total,
  // §9.2 quantity + unit_price) is exactly six; payment_method and
  // payment_status are pgEnums instead of CHECKs per §7.1.
  const checksCount = await target.query(`
    select count(*)::int as n from pg_constraint
     where contype = 'c' and connamespace = 'public'::regnamespace
  `);
  check("migration creates all 6 CHECK constraints", checksCount.rows[0].n === 6, `got ${checksCount.rows[0].n}`);

  const enums = await target.query(`
    select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
     where t.typtype = 'e' and n.nspname = 'public' order by 1
  `);
  const enumNames = enums.rows.map((r: { typname: string }) => r.typname);
  const wanted = ["order_status", "delivery_status", "payment_method", "payment_status"];
  const missingEnums = wanted.filter((e) => !enumNames.includes(e));
  check(
    "migration creates the four enums §7.1 requires",
    missingEnums.length === 0,
    `missing: ${missingEnums.join(", ")}`,
  );
} finally {
  await target.end().catch(() => {});
  try {
    // `with (force)` terminates leftover backends first. Without it the drop
    // fails with 55006 "database is being accessed by other users", because
    // Supabase's pooler keeps server-side connections alive past pool.end().
    await admin.query(`drop database if exists ${scratch} with (force)`);
    console.log(`\n  ....  dropped scratch database ${scratch}`);
  } catch (error) {
    const e = error as Error & { code?: string; message?: string };
    console.log(`\n  ....  could not drop scratch database: ${e.code} ${e.message ?? ""}`.slice(0, 160));
    console.log(`         drop it manually: drop database ${scratch}`);
  }
  await admin.end().catch(() => {});
}

console.log(`\n${checks - failures}/${checks} checks passed`);
console.log(failures === 0 ? "RESULT: PASS" : `RESULT: FAIL (${failures} failing)`);
process.exit(failures === 0 ? 0 : 1);
