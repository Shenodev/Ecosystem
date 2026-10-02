import { headers } from "next/headers";

import { ProductCard } from "../components/ProductCard";
import { listCatalogue, resolveTenantId } from "../lib/catalog";

/**
 * ShenoStore storefront.
 *
 * Reads the catalogue for the tenant that owns the requested host. Server
 * component rather than a client fetch: the prices are in Postgres, and
 * shipping them to the browser first would show an empty grid and then repaint
 * it — while putting the tenant predicate somewhere a client could change.
 */
export default async function Home() {
  // cookies()/headers() are async in Next 15+. This also opts the route into
  // dynamic rendering, which is required: a statically prerendered storefront
  // would freeze one tenant's catalogue for every host.
  const requestHeaders = await headers();
  const tenantId = await resolveTenantId(requestHeaders.get("host"));
  const catalogue = await listCatalogue(tenantId);

  return (
    <main className="min-h-screen bg-sheno-bg-base p-8 text-sheno-text-primary">
      <h1 className="text-3xl font-semibold">ShenoStore</h1>
      <p className="text-sheno-text-secondary">Storefront for ShenoDev tenants.</p>
      {/* Primary action: solid cyan fill with dark text, per UI_UX_Brief.md §4.
          ShenoStore keeps the #22d3ee primary — the #06B6D4 shift is ShenoFlow
          only, so a primary button never reads as an "Out for Delivery" chip. */}
      <button
        type="button"
        data-testid="primary-action"
        className="mt-6 rounded-lg border border-transparent bg-sheno-primary px-5 py-2.5 font-semibold text-sheno-bg-base hover:bg-sheno-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sheno-focus-ring"
      >
        Browse catalogue
      </button>

      <section aria-labelledby="catalogue-heading" className="mt-12">
        <h2 id="catalogue-heading" className="text-xl font-semibold">
          Catalogue
        </h2>

        {catalogue.length === 0 ? (
          <p className="mt-4 text-sheno-text-secondary">
            No products listed yet.
          </p>
        ) : (
          <ul
            data-testid="product-grid"
            className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {catalogue.map((product) => (
              <li key={product.id}>
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}