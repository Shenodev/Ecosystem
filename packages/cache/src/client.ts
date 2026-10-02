/**
 * @shenodev/cache — shared Redis cache over the Upstash REST API.
 *
 * Upstash speaks HTTPS, so the platform `fetch` covers it. No TCP client, no
 * connection pool, no idle-timeout handling. Adds a redis driver only if
 * pub/sub or blocking commands are ever needed.
 *
 * Credentials come from the repo root .env, matching @shenodev/db — one source
 * of truth per setting (RULE 7).
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

const restUrl = process.env.UPSTASH_REDIS_REST_URL;
const restToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!restUrl || !restToken) {
  throw new Error(
    "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required. " +
      `Expected them in ${envPath} or the process environment.`,
  );
}

/** Strip the trailing slash so `${base}/get/${key}` never doubles up. */
const base = restUrl.replace(/\/+$/, "");
const auth = { Authorization: `Bearer ${restToken}` };

/**
 * Upstash returns 200 with `{ error }` for command failures, so the status code
 * alone is not enough to detect a bad command or a rejected token.
 */
async function command<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}/${path}`, {
    ...init,
    headers: { ...auth, ...init?.headers },
  });

  if (!response.ok) {
    throw new Error(`Upstash ${path} failed: HTTP ${response.status}`);
  }

  const body = (await response.json()) as { result?: T; error?: string };
  if (body.error) {
    throw new Error(`Upstash ${path} failed: ${body.error}`);
  }
  return body.result as T;
}

/** Write a key. Returns the server reply, "OK" on success. */
export async function set(key: string, value: string, ttlSeconds?: number): Promise<string> {
  const suffix = ttlSeconds ? `?EX=${ttlSeconds}` : "";
  return command<string>(`set/${encodeURIComponent(key)}/${encodeURIComponent(value)}${suffix}`, {
    method: "POST",
  });
}

/** Read a key. Returns null when absent — Upstash has no miss sentinel to confuse. */
export async function get(key: string): Promise<string | null> {
  return command<string | null>(`get/${encodeURIComponent(key)}`);
}

/** Delete keys. Returns how many were removed. */
export async function del(...keys: string[]): Promise<number> {
  const path = keys.map((k) => encodeURIComponent(k)).join("/");
  return command<number>(`del/${path}`, { method: "POST" });
}

/** Seconds until expiry. -1 means persistent, -2 means the key is gone. */
export async function ttl(key: string): Promise<number> {
  return command<number>(`ttl/${encodeURIComponent(key)}`);
}