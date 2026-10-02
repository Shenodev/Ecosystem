/**
 * Catalogue reads for the storefront.
 *
 * SERVER ONLY. Every export here touches the Postgres pool; importing this from
 * a client component would pull `pg` into the browser bundle.
 *
 * RULE 5: a tenant-scoped read must filter tenant_id. The filter is not an
 * option a caller passes — `listCatalogue` takes the tenant id as its only
 * argument and builds the predicate itself, so there is no signature that can be
 * called without one.
 */
import { DEMO_TENANT_ID, db, products, tenants } from "@shenodev/db";
import { asc, eq } from "drizzle-orm";

/** Enough to fill the grid; the catalogue is not paginated yet. */
const CATALOGUE_LIMIT = 24;

/**
 * Strips the port and case. `Host` is client-controlled, so nothing downstream
 * may assume it is already normalised.
 */
function normaliseHost(host: string | null): string | null {
  if (!host) return null;
  const hostname = host.trim().toLowerCase().replace(/:\d+$/, "");
  return hostname.length > 0 ? hostname : null;
}

/**
 * Which tenant's catalogue this request is for.
 *
 * A storefront's tenant is resolved from the host, which is what tenants.domain
 * exists for: an anonymous visitor has no session yet, and reading tenant_id
 * from a query parameter would hand every caller the ability to browse another
 * tenant's catalogue by editing the URL.
 *
 * Falls back to the reserved Demo-mode tenant so local development works before
 * any domain is mapped. On every real host the mapping exists and this fallback
 * is unreachable.
 *
 * Open risk, not addressed here: tenants.domain is tenant-supplied, so a tenant
 * who registers `shenostore.shenodev.tech` would own the platform's own
 * storefront host. Guarding it needs the list of platform hosts, and that list
 * belongs with the deployment config from Implementation_Plan Phase 6 —
 * declaring a second copy here would break RULE 7.
 */
export async function resolveTenantId(host: string | null): Promise<string> {
  const hostname = normaliseHost(host);

  if (hostname) {
    const match = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.domain, hostname))
      .limit(1);

    if (match[0]) return match[0].id;
  }

  return DEMO_TENANT_ID;
}

export interface CatalogueEntry {
  id: string;
  sku: string;
  title: string;
  description: string | null;
  /** Raw NUMERIC text. Formatted by lib/money.ts at render time. */
  price: string;
}

export async function listCatalogue(tenantId: string): Promise<CatalogueEntry[]> {
  return db
    .select({
      id: products.id,
      sku: products.sku,
      title: products.title,
      description: products.description,
      price: products.price,
    })
    .from(products)
    .where(eq(products.tenantId, tenantId))
    .orderBy(asc(products.title))
    .limit(CATALOGUE_LIMIT);
}