/**
 * @shenodev/auth session test.
 *
 * The login integration test (apps/shenostore/tests/login.spec.mts) proves the
 * route mints a token and sets the right cookie. It cannot prove the other half
 * of the contract: that verifySession *refuses* tokens it should. Every one of
 * the three apps authenticates by calling verifySession locally (TRD §7), so a
 * verifySession that accepts a forged token is a total authentication bypass
 * that no status-code assertion anywhere would catch.
 *
 * Run: npm test -w @shenodev/auth
 */
import { SignJWT } from "jose";

import {
  SESSION_COOKIE_DOMAIN,
  SESSION_TTL_SECONDS,
  clearedSessionCookie,
  hashPassword,
  mintSession,
  sessionCookie,
  verifyPassword,
  verifySession,
} from "../src/index.ts";

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

console.log("@shenodev/auth session test\n");

const SECRET = process.env.JWT_SECRET;

// --------------------------------------------------------- 1. password hashing
console.log("password hashing (Argon2id)");

const PASSWORD = "correct horse battery staple";
const hash = await hashPassword(PASSWORD);

check("hash is argon2id", hash.startsWith("$argon2id$"), hash.slice(0, 12));
check("the plaintext is not recoverable from the hash", !hash.includes(PASSWORD));
check("the correct password verifies", await verifyPassword(hash, PASSWORD));
check("a wrong password does not verify", !(await verifyPassword(hash, "not the password")));

// The account types that must never authenticate with a password at all.
check("NULL password_hash is rejected", !(await verifyPassword(null, PASSWORD)));
check("NULL password_hash is rejected even by an empty password", !(await verifyPassword(null, "")));
check("undefined password_hash is rejected", !(await verifyPassword(undefined, PASSWORD)));
check("an empty string does not verify against a real hash", !(await verifyPassword(hash, "")));
// A corrupt stored hash must lock the account, not throw a 500 that tells an
// attacker which addresses exist.
check("a malformed hash fails closed instead of throwing", !(await verifyPassword("not-a-hash", PASSWORD)));

// ------------------------------------------------------------------ 2. minting
console.log("\nsession minting");

if (!check("JWT_SECRET is set", Boolean(SECRET), "expected it in the repo root .env")) {
  process.exit(1);
}

const subject = {
  sub: "11111111-1111-4111-8111-111111111111",
  tenant_id: "00000000-0000-4000-8000-000000000001",
  email: "demo@shenodev.tech",
  role_id: null,
  branch_id: null,
  demo: true,
};

const token = await mintSession(subject);
check("token has three segments", token.split(".").length === 3);
check("alg is HS256", JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8")).alg === "HS256");

const claims = await verifySession(token);
check("verifySession accepts a freshly minted token", claims !== null);
check("sub round-trips", claims?.sub === subject.sub);
check("tenant_id round-trips", claims?.tenant_id === subject.tenant_id);
check("email round-trips", claims?.email === subject.email);
check("role_id stays null rather than becoming undefined", claims?.role_id === null);
check("branch_id stays null rather than becoming undefined", claims?.branch_id === null);
check("demo flag round-trips", claims?.demo === true);

const nonDemo = await verifySession(await mintSession({ ...subject, demo: false }));
check("demo:false does not read as true", nonDemo?.demo === false);

// ------------------------------------------------------------ 3. refusals
console.log("\nverifySession must refuse");

check("an empty token is refused", (await verifySession("")) === null);
check("a non-JWT string is refused", (await verifySession("not.a.token")) === null);

// Signed with the right key but tampered afterwards: flipping a character in the
// payload invalidates the signature.
const [head, , sig] = token.split(".");
const swappedPayload = Buffer.from(
  JSON.stringify({ ...claims, tenant_id: "99999999-9999-4999-8999-999999999999" }),
).toString("base64url");
check(
  "a token whose payload was edited is refused",
  (await verifySession(`${head}.${swappedPayload}.${sig}`)) === null,
);

// Signed by someone who holds a different key.
const foreignSecret = new TextEncoder().encode("x".repeat(48));
const forged = await new SignJWT({ tenant_id: subject.tenant_id, demo: false })
  .setProtectedHeader({ alg: "HS256", typ: "JWT" })
  .setSubject("22222222-2222-4222-8222-222222222222")
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(foreignSecret);
check("a token signed with a different secret is refused", (await verifySession(forged)) === null);

// alg:none is the classic JWT downgrade — a token with no signature at all.
const unsigned = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
check(
  "an alg:none token is refused",
  (await verifySession(`${unsigned}.${swappedPayload}.`)) === null,
);

// A valid signature with the wrong issuer/audience must not be accepted either.
const wrongIssuer = await new SignJWT({ tenant_id: subject.tenant_id, demo: false })
  .setProtectedHeader({ alg: "HS256", typ: "JWT" })
  .setSubject(subject.sub)
  .setIssuedAt()
  .setExpirationTime("1h")
  .setIssuer("somebody-else")
  .setAudience("shenodev")
  .sign(new TextEncoder().encode(SECRET!));
check("a token from another issuer is refused", (await verifySession(wrongIssuer)) === null);

// Expired. Minted with a negative TTL so it is already past at verification.
const expired = await mintSession(subject, -60);
check("an expired token is refused", (await verifySession(expired)) === null);

// Signed by us, but missing the claim that RULE 5 filters every query on. A
// session without tenant_id is not a usable session.
const noTenant = await new SignJWT({ email: subject.email, demo: false })
  .setProtectedHeader({ alg: "HS256", typ: "JWT" })
  .setSubject(subject.sub)
  .setIssuedAt()
  .setExpirationTime("1h")
  .setIssuer("shenodev")
  .setAudience("shenodev")
  .sign(new TextEncoder().encode(SECRET!));
check("a signed token missing tenant_id is refused", (await verifySession(noTenant)) === null);

// ------------------------------------------------------------- 4. cookie shape
console.log("\ncookie attributes");

const cookie = sessionCookie(SESSION_TTL_SECONDS);
check("domain is .shenodev.tech", cookie.domain === SESSION_COOKIE_DOMAIN, cookie.domain);
check("httpOnly is set", cookie.httpOnly === true);
check("secure is set", cookie.secure === true);
check("sameSite is lax", cookie.sameSite === "lax");
check("path is /", cookie.path === "/");
check("maxAge matches the TTL", cookie.maxAge === SESSION_TTL_SECONDS);

// Clearing must target the same cookie, or logout leaves the original in place.
const cleared = clearedSessionCookie();
check("clearing uses the same domain", cleared.domain === cookie.domain);
check("clearing uses the same path", cleared.path === cookie.path);
check("clearing expires immediately", cleared.maxAge === 0);

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);