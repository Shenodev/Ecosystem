/**
 * Integration test for the centralised SSO login API.
 *
 * Exercises the real route over HTTP against the dev server, with a real user
 * row in the real database, because the things being asserted are wire-level
 * facts a unit test cannot see: the status code, and the exact shape of the
 * Set-Cookie header the browser will act on.
 *
 * PRD §3.1   one credential works across all *.shenodev.tech subdomains
 * TRD §7     JWT in an HTTP-only cookie; each app verifies locally
 * TRD §8     the session claim shape is a shared contract
 * Plan Ph2   Domain=.shenodev.tech, Secure, SameSite=Lax, Argon2id
 *
 * A stale dev server on this port would serve pre-change code, so the config
 * sets reuseExistingServer: false.
 */
import { randomUUID } from "node:crypto";

import { hash } from "@node-rs/argon2";
import { db, pool, tenants, users } from "@shenodev/db";
import { eq } from "drizzle-orm";
import { expect, test, type APIResponse } from "@playwright/test";

const PASSWORD = "correct horse battery staple";

/** Cookie attributes mandated by TRD §7 and Implementation_Plan Phase 2. */
const COOKIE_NAME = "sheno_session";
const COOKIE_DOMAIN = ".shenodev.tech";

let tenantId: string;
let otherTenantId: string;
let email: string;
let ambiguousEmail: string;

/** Pull every Set-Cookie header off a response, unmerged. */
function setCookies(response: APIResponse): string[] {
  return response
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value);
}

/** Parse one cookie header into name -> attribute map, ignoring its value. */
function attributes(header: string): Map<string, string> {
  const [, ...pairs] = header.split(";");
  const out = new Map<string, string>();
  for (const pair of pairs) {
    const [k, v] = pair.split("=");
    if (k) out.set(k.trim().toLowerCase(), (v ?? "").trim());
  }
  return out;
}

/** Decode a JWT payload without verifying — asserts the wire contract only. */
function decodeClaims(token: string): Record<string, unknown> {
  const payload = token.split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

function cookieValue(header: string): string {
  return header.split(";")[0].split("=").slice(1).join("=");
}

test.beforeAll(async () => {
  tenantId = randomUUID();
  otherTenantId = randomUUID();
  email = `sso-${tenantId.slice(0, 8)}@example.test`;
  ambiguousEmail = `shared-${tenantId.slice(0, 8)}@example.test`;

  const passwordHash = await hash(PASSWORD);

  await db.insert(tenants).values([
    { id: tenantId, name: "SSO Primary Tenant", domain: `sso-a-${tenantId.slice(0, 6)}.example.test` },
    { id: otherTenantId, name: "SSO Other Tenant", domain: `sso-b-${tenantId.slice(0, 6)}.example.test` },
  ]);

  await db.insert(users).values([
    { id: randomUUID(), tenantId, email, passwordHash, fullName: "SSO Tester" },
    // Same address in two tenants — schema §3 makes email unique per tenant,
    // not globally, so login must not silently pick one.
    { id: randomUUID(), tenantId, email: ambiguousEmail, passwordHash, fullName: "Tenant A User" },
    { id: randomUUID(), tenantId: otherTenantId, email: ambiguousEmail, passwordHash, fullName: "Tenant B User" },
  ]);
});

test.afterAll(async () => {
  // users reference tenants without ON DELETE CASCADE, so children go first.
  await db.delete(users).where(eq(users.tenantId, tenantId));
  await db.delete(users).where(eq(users.tenantId, otherTenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(tenants).where(eq(tenants.id, otherTenantId));
  await pool.end();
});

test.describe("POST /api/auth/login", () => {
  test("returns 200 and sets a .shenodev.tech session cookie", async ({ request }) => {
    const response = await request.post("/api/auth/login", {
      data: { email, password: PASSWORD },
    });

    expect(response.status(), await response.text()).toBe(200);

    const cookies = setCookies(response);
    const session = cookies.find((c) => c.startsWith(`${COOKIE_NAME}=`));
    expect(session, `no ${COOKIE_NAME} cookie in: ${cookies.join(" | ") || "(none)"}`).toBeTruthy();

    // The attribute that makes one login work on all three subdomains.
    expect(attributes(session!).get("domain")).toBe(COOKIE_DOMAIN);

    // TRD §7 and the Phase 2 exit criteria: the token must be unreachable from
    // client JS, and must not travel over plaintext or on a cross-site request.
    expect(attributes(session!).has("httponly")).toBe(true);
    expect(attributes(session!).has("secure")).toBe(true);
    // Compared case-insensitively on purpose: RFC 6265bis §5.6.7 matches the
    // SameSite value case-insensitively, and Next's serializer is a verbatim
    // passthrough of the lowercase string its own type only accepts. What is
    // being asserted here is the enforcement level, not how it is spelled.
    expect(attributes(session!).get("samesite")?.toLowerCase()).toBe("lax");
    expect(attributes(session!).get("path")).toBe("/");
  });

  test("mints a JWT carrying the shared claim shape", async ({ request }) => {
    const response = await request.post("/api/auth/login", {
      data: { email, password: PASSWORD },
    });
    expect(response.status()).toBe(200);

    const session = setCookies(response).find((c) => c.startsWith(`${COOKIE_NAME}=`))!;
    const claims = decodeClaims(cookieValue(session));

    expect(claims.sub).toBeTruthy();
    expect(claims.tenant_id).toBe(tenantId);
    expect(claims.email).toBe(email);
    expect(typeof claims.exp).toBe("number");
    expect(typeof claims.iat).toBe("number");
  });

  test("the response body never carries the token", async ({ request }) => {
    const response = await request.post("/api/auth/login", {
      data: { email, password: PASSWORD },
    });
    expect(response.status()).toBe(200);

    const body = await response.text();
    const session = setCookies(response).find((c) => c.startsWith(`${COOKIE_NAME}=`))!;
    // The cookie is the transport; the token must not also be in the payload.
    expect(body).not.toContain(cookieValue(session));
  });

  test("rejects a wrong password with 401 and sets no cookie", async ({ request }) => {
    const response = await request.post("/api/auth/login", {
      data: { email, password: "not the password" },
    });

    expect(response.status()).toBe(401);
    expect(setCookies(response)).toHaveLength(0);
  });

  test("does not reveal whether an email exists", async ({ request }) => {
    const wrongPassword = await request.post("/api/auth/login", {
      data: { email, password: "not the password" },
    });
    const unknownEmail = await request.post("/api/auth/login", {
      data: { email: `nobody-${tenantId}@example.test`, password: PASSWORD },
    });

    // Identical status and body, so the endpoint cannot be used to enumerate
    // which addresses hold accounts.
    expect(unknownEmail.status()).toBe(wrongPassword.status());
    expect(await unknownEmail.text()).toBe(await wrongPassword.text());
  });

  test("refuses an email that exists in two tenants rather than picking one", async ({ request }) => {
    const response = await request.post("/api/auth/login", {
      data: { email: ambiguousEmail, password: PASSWORD },
    });

    // schema §3 scopes email uniqueness per tenant, so this address is two
    // identities. Silently choosing one would let a login land in the wrong
    // tenant.
    expect(response.status()).toBe(409);
    expect(setCookies(response)).toHaveLength(0);
  });

  test("rejects a malformed body with 400", async ({ request }) => {
    const response = await request.post("/api/auth/login", { data: { email } });

    expect(response.status()).toBe(400);
    expect(setCookies(response)).toHaveLength(0);
  });
});
