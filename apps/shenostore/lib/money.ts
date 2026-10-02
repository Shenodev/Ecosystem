/**
 * Money formatting.
 *
 * Currency is EGP. No document in docs/ specifies it — it was confirmed
 * directly — so this file is the single place that decision lives; a second
 * formatter in another app is how the storefront and the order summary end up
 * disagreeing about a price.
 *
 * The locale is pinned rather than inherited. An unpinned formatter resolves
 * against whatever ICU default the runtime happens to have, which differs
 * between the Vercel build and a contributor's laptop. That produces two
 * problems: prices that shift by locale, and a server/client mismatch that
 * breaks hydration the first time the two disagree.
 */
const PRICE = new Intl.NumberFormat("en-EG", {
  style: "currency",
  currency: "EGP",
});

/**
 * products.price is numeric(12,2) NOT NULL with a >= 0 check, so Postgres
 * cannot hand back a non-numeric value. Failing loudly here beats rendering
 * "EGP NaN" to a customer if that ever changes.
 *
 * The value arrives as a string on purpose: NUMERIC is read back as text to
 * preserve precision, and converting money to a binary float is the exact
 * rounding error schema §3 chose numeric to avoid.
 */
export function formatPrice(price: string): string {
  const amount = Number(price);
  if (!Number.isFinite(amount)) {
    throw new Error(`Unrenderable price: ${JSON.stringify(price)}`);
  }
  return PRICE.format(amount);
}