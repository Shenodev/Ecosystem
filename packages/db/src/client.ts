/**
 * @shenodev/db — shared database client.
 *
 * Single source of truth for the Postgres connection across ShenoStore,
 * ShenoInventory, and ShenoFlow. See docs/TRD.md §5 and docs/Database_Schema.md.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");

// The root .env is the single place DATABASE_URL lives. Do not duplicate it per
// package — RULE 7 keeps one source of truth per setting.
const envPath = resolve(REPO_ROOT, ".env");
if (existsSync(envPath)) {
  loadDotenv({ path: envPath, quiet: true });
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Expected it in the repo root .env " +
      `(${envPath}) or in the process environment.`,
  );
}

export const pool = new Pool({
  connectionString,
  // Supabase terminates TLS with a certificate chain that node-postgres cannot
  // verify against the system store in every container image. Encryption stays
  // on; only chain verification is relaxed.
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export const db = drizzle(pool, { schema });

export { schema };
export * from "./schema.ts";