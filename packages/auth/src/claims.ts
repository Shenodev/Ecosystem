/**
 * The session claim shape — a cross-app contract.
 *
 * TRD §8 assigns ownership of this shape to packages/auth and requires all three
 * apps to import it. A second copy redeclared in SvelteKit or Nuxt is the same
 * divergence bug as a second copy of the order-status enum, so the type is
 * exported from the one place and referenced everywhere else.
 *
 * tenant_id is the security-relevant claim. RULE 5 requires every tenant-scoped
 * query to filter on it, and it is read from the verified token — never from
 * request input, query parameters, or a client-supplied header.
 */

export interface SessionClaims {
  /** users.id */
  sub: string;
  /** tenants.id this session is scoped to. RULE 5 filters on this. */
  tenant_id: string;
  /** Display only — never used for authorisation. */
  email: string | null;
  /** roles.id, drives branch scoping for Admin/Staff (schema §3, §10). */
  role_id: string | null;
  /** branches.id, set for branch staff. */
  branch_id: string | null;
  /** True for the reserved Demo-mode session (TRD §7). */
  demo: boolean;
}

/** What a caller supplies to mint a token. iat/exp are added by the minter. */
export type SessionSubject = Omit<SessionClaims, "sub"> & { sub: string };