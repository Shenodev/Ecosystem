/**
 * Password hashing — Argon2id.
 *
 * Implementation_Plan Phase 2 names Argon2id explicitly. Parameters are left at
 * the @node-rs/argon2 defaults (m=19456 KiB, t=2, p=1), which are the
 * OWASP-recommended second-preference settings; pinning them here would need a
 * migration story for existing hashes, so the defaults stay until one exists.
 */
import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";

export function hashPassword(plain: string): Promise<string> {
  return argon2Hash(plain);
}

/**
 * `stored` is users.password_hash, which is NULL for Demo-mode and SSO-only
 * accounts (schema §3). Those accounts must not authenticate by password, and
 * the cheapest way to guarantee that is to never pass an empty value to argon2:
 * an empty string is a perfectly valid password to hash, so a truthiness slip
 * above this function would otherwise create an open door.
 *
 * A malformed hash throws out of argon2. That is treated as a failed verify, not
 * a 500: a corrupt stored hash should lock the account, not tell an attacker
 * which emails exist.
 */
export async function verifyPassword(stored: string | null | undefined, plain: string): Promise<boolean> {
  if (!stored) return false;
  try {
    return await argon2Verify(stored, plain);
  } catch {
    return false;
  }
}

/**
 * A valid Argon2id hash of a value nobody knows, used to spend the same CPU on a
 * login for an address that does not exist as on one that does. Without it the
 * "no such user" path returns in microseconds and the endpoint becomes a timing
 * oracle for account existence even though the status and body are identical.
 */
export const TIMING_EQUALISER_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$uifWFYJ3tr+XavzFzZaf1g$vnMndUbkgCgYEa1t454AClIYLvDB4C8OjuQBvbxInTY";