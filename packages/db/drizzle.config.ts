/**
 * Drizzle Kit config — migrations and schema push.
 *
 * Uses the session-mode pooler (DATABASE_URL), not DIRECT_URL. Migrations need
 * stable session state: advisory locks, multi-statement DDL, and `SET` all
 * survive on 5432 and are unreliable through transaction mode on 6543.
 */
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Run from the repo root so the root .env is loaded, " +
      "or export it before invoking drizzle-kit.",
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