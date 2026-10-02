/**
 * POST /api/auth/login — the central SSO login route.
 *
 * Lives on ShenoStore because it owns the account lifecycle (TRD §4); the other
 * two apps never call it to check a session, they verify the cookie locally
 * (TRD §7).
 *
 * The only thing this endpoint guarantees that a local verify cannot is the
 * proof of the password. Everything downstream reads claims off the token.
 */
import { DEMO_TENANT_ID, db, users } from "@shenodev/db";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  TIMING_EQUALISER_HASH,
  mintSession,
  sessionCookie,
  verifyPassword,
} from "@shenodev/auth";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

// node-postgres and the argon2 native binding both require Node. Declared
// explicitly so a future default-runtime change cannot move this to the edge and
// fail only at runtime.
export const runtime = "nodejs";

/**
 * One response for every failed credential, whether the address holds an
 * account or the password was simply wrong. Any difference here — status, body,
 * or how long it took — turns the endpoint into a tool for discovering which
 * emails are registered.
 */
const INVALID_CREDENTIALS = { error: "invalid_credentials" };

function failure(status: number, payload: object): NextResponse {
  return NextResponse.json(payload, { status });
}

/**
 * Addresses are matched lowercased, which only works if they are also *stored*
 * lowercased — schema §3 scopes uniqueness per tenant rather than requiring a
 * case-insensitive type. The register route is what has to normalise on write;
 * until it exists this is the single place that decides the convention.
 */
function normaliseEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure(400, { error: "invalid_body" });
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const email = normaliseEmail(payload.email);
  const password = typeof payload.password === "string" ? payload.password : "";

  if (!email || !password) {
    return failure(400, { error: "invalid_body" });
  }

  // Limited to two rows: one match is a login, two is the ambiguity case below,
  // and the answer to "how many" stops mattering after that.
  const matches = await db.select().from(users).where(eq(users.email, email)).limit(2);

  if (matches.length === 0) {
    // Burn comparable CPU so this path is not distinguishable by response time.
    await verifyPassword(TIMING_EQUALISER_HASH, password);
    return failure(401, INVALID_CREDENTIALS);
  }

  if (matches.length > 1) {
    // schema §3 makes email unique per tenant, so this address is two distinct
    // identities. Choosing one would let a correct password sign the caller
    // into the wrong tenant (RULE 5), so the caller has to name the tenant.
    return failure(409, { error: "tenant_required" });
  }

  const user = matches[0]!;

  // Demo-mode and SSO-only accounts have a NULL password_hash and must not be
  // able to authenticate with a password — verifyPassword treats that as a miss.
  if (!(await verifyPassword(user.passwordHash, password))) {
    return failure(401, INVALID_CREDENTIALS);
  }

  const token = await mintSession({
    sub: user.id,
    tenant_id: user.tenantId,
    email: user.email,
    role_id: user.roleId,
    branch_id: user.branchId,
    demo: user.tenantId === DEMO_TENANT_ID,
  });

  const response = NextResponse.json(
    {
      user: {
        id: user.id,
        email: user.email,
        tenantId: user.tenantId,
        roleId: user.roleId,
        branchId: user.branchId,
      },
      expiresIn: SESSION_TTL_SECONDS,
    },
    // This response carries a Set-Cookie. A shared cache storing it would
    // hand one user's session to the next.
    { headers: { "cache-control": "no-store" } },
  );

  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookie(SESSION_TTL_SECONDS));
  return response;
}