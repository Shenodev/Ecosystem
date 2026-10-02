/**
 * Round-trip test for @shenodev/cache against the real Upstash instance.
 *
 * Sets test_key = "shenodev", reads it back, asserts the value matches, then
 * deletes the key so the test leaves no state in a shared database.
 *
 * Never prints the REST token.
 *
 * Run: npm test -w @shenodev/cache
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");

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

console.log("@shenodev/cache round-trip test\n");

// ------------------------------------------------------------ 1. credentials
console.log("environment");
const envPath = resolve(REPO_ROOT, ".env");
check("repo root .env exists", existsSync(envPath), `looked in ${REPO_ROOT}`);

const { config } = await import("dotenv");
config({ path: envPath, quiet: true });

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!check("UPSTASH_REDIS_REST_URL is set", Boolean(url))) process.exit(1);
if (!check("UPSTASH_REDIS_REST_TOKEN is set", Boolean(token))) process.exit(1);
check(
  "UPSTASH_REDIS_REST_URL is https",
  url!.startsWith("https://"),
  `got scheme: ${url!.split(":")[0]}`,
);
console.log(`  ....  host ${new URL(url!).host}`);

// ------------------------------------------------------------- 2. round trip
console.log("\nround trip");

const KEY = "test_key";
const VALUE = "shenodev";

type Cache = typeof import("../src/client.ts");
let cache: Cache;

try {
  cache = await import("../src/client.ts");
  check("client module loads", true);
} catch (err) {
  const e = err as Error;
  check("client module loads", false, e.message.split("\n")[0].slice(0, 160));
  console.log(`\n${checks - failures}/${checks} checks passed`);
  console.log(`RESULT: FAIL (${failures} failing)`);
  process.exit(1);
}

// Clean any residue from a previous failed run so SET asserts real work.
await cache.del(KEY);

const setResult = await cache.set(KEY, VALUE);
check("set returns OK", setResult === "OK", `got: ${JSON.stringify(setResult)}`);

const got = await cache.get(KEY);
check("get returns the value that was set", got === VALUE, `got: ${JSON.stringify(got)}`);

const ttl = await cache.ttl(KEY);
check("key has no expiry (persistent)", ttl === -1, `ttl returned: ${ttl}`);

// Overwrite must replace, not append.
await cache.set(KEY, "shenodev-2");
const overwritten = await cache.get(KEY);
check("overwrite replaces the value", overwritten === "shenodev-2", `got: ${JSON.stringify(overwritten)}`);

// Cleanup: leave no state behind.
const deleted = await cache.del(KEY);
check("del removes the key", deleted === 1, `deleted count: ${deleted}`);

const gone = await cache.get(KEY);
check("key is absent after delete", gone === null, `got: ${JSON.stringify(gone)}`);

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.log(`RESULT: FAIL (${failures} failing)`);
  process.exit(1);
}
console.log("RESULT: PASS");