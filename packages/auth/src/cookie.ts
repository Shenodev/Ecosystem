/**
 * The SSO session cookie — the transport for the JWT.
 *
 * PRD §3.1 and TRD §7: one credential, three apps. The mechanism is entirely in
 * the Domain attribute: scope the cookie to `.shenodev.tech` and the browser
 * presents it to shenostore, shenoinventory and shenoflow alike, so no per-app
 * login exists. Narrow it to a single host and the SSO premise breaks.
 *
 * The attribute set is expressed as framework-neutral data rather than a
 * NextResponse call so that SvelteKit and Nuxt consume the same object
 * instead of each re-deriving the domain and flags by hand.
 */

/**
 * In production. Note the leading dot, and that browsers ignore it on modern
 * hosts but accept it in the Domain attribute — without it the cookie is
 * host-only and never reaches the sibling subdomains.
 *
 * Local browsers will reject this value: a browser refuses a cookie whose Domain
 * is not a suffix of the host it was served from, so sign-in over
 * http://localhost will not persist a session. The API-level contract is still
 * correct and testable — it is the browser's domain check that fails, not the
 * header. Mapping the real subdomains is the Phase 6 deployment task.
 */
export const SESSION_COOKIE_DOMAIN = ".shenodev.tech";

export const SESSION_COOKIE_NAME = "sheno_session";

export interface SessionCookieOptions {
  /**
   * The token is the proof; keeping it out of client JS means an XSS bug cannot
   * read it. This is the reason the cookie exists in this shape (TRD §7).
   */
  httpOnly: true;
  /** Never send a session over plaintext. */
  secure: true;
  /**
   * Lax, not Strict: Strict would not be sent on a top-level cross-site
   * navigation, so arriving at shenoinventory from an external link would look
   * like a signed-out user. None would require Secure and widen CSRF exposure
   * to every origin.
   */
  sameSite: "lax";
  /** Every app reads the session on every path, so it cannot be narrower. */
  path: "/";
  domain: string;
  maxAge: number;
}

export function sessionCookie(ttlSeconds: number): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    domain: SESSION_COOKIE_DOMAIN,
    maxAge: ttlSeconds,
  };
}

/**
 * Clearing requires the same domain, path and Secure flag as the set, or the
 * browser matches a different cookie and the original survives logout.
 */
export function clearedSessionCookie(): SessionCookieOptions {
  return { ...sessionCookie(0), maxAge: 0 };
}