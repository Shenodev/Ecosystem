/**
 * Environment access for @shenodev/auth.
 *
 * The root `.env` is the single place JWT_SECRET lives — same rule as
 * DATABASE_URL in @shenodev/db. Do not duplicate it per package (RULE 7).
 *
 * Kept as its own module rather than inline in jwt.ts so the loading is not
 * order-dependent: whichever module happens to be imported first wins, which
 * is how a library ends up reading env from the wrong place.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");

const envPath = resolve(REPO_ROOT, ".env");
if (existsSync(envPath)) {
  loadDotenv({ path: envPath, quiet: true });
}

/**
 * Below this, an HS256 secret is brute-forceable offline, so a short value is
 * a configuration error rather than a weak-but-valid choice.
 */
const MIN_SECRET_LENGTH = 32;

/**
 * The signing key. Throws rather than falling back to a default — a fallback
 * secret would let anyone with a stale build mint a valid session, and the
 * failure would surface as a working login in production instead of a crash.
 */
export function jwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET is not set. Expected it in the repo root .env " +
        `(${envPath}) or in the process environment.`,
    );
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET is ${secret.length} characters; at least ${MIN_SECRET_LENGTH} are required for HS256.`,
    );
  }
  return new TextEncoder().encode(secret);
}