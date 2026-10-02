/**
 * JWT mint and verify.
 *
 * TRD §7: the token is the proof, the cookie is only the transport. Every app
 * verifies the signature locally — no app calls another app to ask whether a
 * session is valid, because that turns every request into a cross-region round
 * trip and puts a third service on the path of every page render.
 *
 * This means all three apps must share JWT_SECRET. A secret that is not shared
 * is not a typo to fix per app; it is a split-brain where ShenoStore issues
 * tokens the other two silently reject.
 */
import { SignJWT, jwtVerify } from "jose";

import type { SessionClaims, SessionSubject } from "./claims.ts";
import { jwtSecret } from "./env.ts";

/** A working day. Long enough to be usable, short enough to limit exposure. */
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

const ISSUER = "shenodev";
const ALGORITHM = "HS256";

export async function mintSession(
  subject: SessionSubject,
  ttlSeconds: number = SESSION_TTL_SECONDS,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    tenant_id: subject.tenant_id,
    email: subject.email,
    role_id: subject.role_id,
    branch_id: subject.branch_id,
    demo: subject.demo,
  })
    .setProtectedHeader({ alg: ALGORITHM, typ: "JWT" })
    .setSubject(subject.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .setIssuer(ISSUER)
    .setAudience(ISSUER)
    .sign(jwtSecret());
}

/**
 * Returns null for any token that is not currently valid — bad signature,
 * expired, wrong issuer, or missing a required claim. Callers get one shape to
 * handle and no way to accidentally treat "expired" as "logged in".
 *
 * A signature that verifies is not enough on its own: the claim shape is the
 * cross-app contract, so a token signed by us but missing tenant_id is not a
 * usable session. It gets checked here rather than at every call site.
 */
export async function verifySession(token: string): Promise<SessionClaims | null> {
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, jwtSecret(), {
      issuer: ISSUER,
      audience: ISSUER,
      algorithms: [ALGORITHM],
    }));
  } catch {
    return null;
  }

  const { sub, tenant_id, email, role_id, branch_id, demo } = payload;
  if (typeof sub !== "string" || typeof tenant_id !== "string") return null;

  return {
    sub,
    tenant_id,
    email: typeof email === "string" ? email : null,
    role_id: typeof role_id === "string" ? role_id : null,
    branch_id: typeof branch_id === "string" ? branch_id : null,
    demo: demo === true,
  };
}