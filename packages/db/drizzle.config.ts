/**
 * Drizzle Kit config — migrations and schema push.
 *
 * Uses the session-mode pooler (DATABASE_URL), not DIRECT_URL. Migrations need
 * stable session state: advisory locks, multi-statement DDL, and `SET` all
 * survive on 5432 and are unreliable through transaction mode on 6543.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadDotenv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit does not load .env for a config file that lives in a workspace
// package, so DATABASE_URL has to be resolved here or every `db:*` script fails
// with a misleading "not set". Same one-source-of-truth path as src/client.ts.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const envPath = resolve(REPO_ROOT, ".env");
if (existsSync(envPath)) loadDotenv({ path: envPath, quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    `DATABASE_URL is not set. Expected it in ${envPath} or in the process environment.`,
  );
}

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});