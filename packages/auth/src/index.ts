/**
 * @shenodev/auth — the session contract shared by all three apps.
 *
 * ShenoStore mints; ShenoInventory and ShenoFlow verify. Nothing here talks to
 * another app (TRD §7). The claim shape in ./claims.ts is a cross-app contract
 * (TRD §8) and must be imported from here rather than redeclared per framework.
 */
export type { SessionClaims, SessionSubject } from "./claims.ts";
export {
  SESSION_COOKIE_DOMAIN,
  SESSION_COOKIE_NAME,
  clearedSessionCookie,
  sessionCookie,
  type SessionCookieOptions,
} from "./cookie.ts";
export { SESSION_TTL_SECONDS, mintSession, verifySession } from "./jwt.ts";
export { TIMING_EQUALISER_HASH, hashPassword, verifyPassword } from "./password.ts";