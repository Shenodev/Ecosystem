/**
 * Connection test for @shenodev/db.
 *
 * Proves three things:
 *   1. DATABASE_URL resolves from the repo root .env
 *   2. A real TCP+TLS connection to Supabase Postgres succeeds
 *   3. The server answers a real query (version + current database)
 *
 * Never prints the connection string or any credential.
 *
 * Run: npm test -w @shenodev/db
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(PKG_ROOT, "../..");

let checks = 0;
let failures = 0;

function check(label: string, ok: boolean, detail = ""): boolean {
  checks++;
  const passed = Boolean(ok);
  if (passed) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
  return passed;
}

/** Redact anything credential-shaped before it reaches a log line. */
function redact(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username}:***@${u.host}${u.pathname}`;
  } catch {
    return "<unparseable connection string>";
  }
}

console.log("@shenodev/db connection test\n");

// ------------------------------------------------------------ 1. env resolves
console.log("environment");
const envPath = resolve(REPO_ROOT, ".env");
check("repo root .env exists", existsSync(envPath), `looked in ${REPO_ROOT}`);

const { config } = await import("dotenv");
const loaded = config({ path: envPath, quiet: true });

const url = process.env.DATABASE_URL;
if (!check("DATABASE_URL is set", Boolean(url))) {
  console.log("\nRESULT: FAIL — cannot connect without DATABASE_URL");
  process.exit(1);
}
check("DATABASE_URL parses as a URL", (() => {
  try {
    return new URL(url!).protocol === "postgresql:";
  } catch {
    return false;
  }
})());

console.log(`  ....  target ${redact(url!)}`);

// -------------------------------------------------------- 2. connect + query
console.log("\nconnection");

type Db = typeof import("../src/client.ts");
let db: Db | undefined;

try {
  const mod = await import("../src/client.ts");
  db = mod.db;
  check("client module exports `db`", Boolean(db));
} catch (err) {
  const e = err as Error;
  check(
    "client module loads",
    false,
    e.message.split("\n")[0].slice(0, 160),
  );
  console.log(`\n${checks - failures}/${checks} checks passed`);
  console.log(`RESULT: FAIL (${failures} failing)`);
  process.exit(1);
}

const sql = (db as unknown as { $client: { query(q: string): Promise<{ rows: Record<string, unknown>[] }> } })
  .$client;

try {
  const version = await sql.query("select version() as v");
  const raw = String(version.rows[0]?.v ?? "");
  check("server returned a version string", raw.length > 0);
  check("server identifies as PostgreSQL", /PostgreSQL/i.test(raw), `got: ${raw.slice(0, 80)}`);
  console.log(`  ....  ${raw.trim()}`);
} catch (err) {
  const e = err as Error & { code?: string };
  check("query version() succeeds", false, `${e.code ?? ""} ${e.message}`.slice(0, 200));
}

try {
  const current = await sql.query("select current_database() as db, current_user as usr");
  const row = current.rows[0] ?? {};
  check("can read current_database()", typeof row.db === "string");
  check("can read current_user()", typeof row.usr === "string");
  console.log(`  ....  database=${row.db} user=${row.usr}`);
} catch (err) {
  const e = err as Error;
  check("query current_database() succeeds", false, e.message.slice(0, 200));
}

// ----------------------------------------------------------- 3. schema present
console.log("\nschema");
try {
  const rows = await sql.query(
    "select table_name from information_schema.tables where table_schema = 'public' and table_name = 'tenants'",
  );
  check("public.tenants exists", rows.rows.length > 0, "run: npm run db:push -w @shenodev/db");
} catch (err) {
  const e = err as Error;
  check("introspection query succeeds", false, e.message.slice(0, 200));
}

await sql.end();

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.log(`RESULT: FAIL (${failures} failing)`);
  process.exit(1);
}
console.log("RESULT: PASS");