import type { CatalogueEntry } from "../lib/catalog";
import { formatPrice } from "../lib/money";

/**
 * One product tile.
 *
 * Styled entirely through the @shenodev/ui tokens — Deep Slate surfaces with
 * Electric Cyan for the price. No hex appears here, so re-theming the
 * primitives in theme.css restyles every app at once.
 *
 * Stays a server component: it takes plain props from lib/catalog.ts and has no
 * state or handler, so shipping it to the browser would add weight for nothing.
 */
export function ProductCard({ product }: { product: CatalogueEntry }) {
  return (
    <article
      data-testid="product-card"
      className="flex flex-col gap-2 rounded-xl border border-sheno-bg-elevated bg-sheno-bg-surface p-4 transition-colors hover:border-sheno-primary"
    >
      <h3 data-testid="product-title" className="text-base font-semibold text-sheno-text-primary">
        {product.title}
      </h3>

      {product.description ? (
        <p className="line-clamp-2 text-sm text-sheno-text-secondary">{product.description}</p>
      ) : null}

      <p
        data-testid="product-price"
        // tabular-nums per UI_UX_Brief.md §229, so a column of prices lines up
        // on the decimal instead of shifting as digits change width. Left
        // aligned rather than right: that half of the brief is for data grids,
        // and a right-aligned price under a left-aligned title reads as a
        // mistake on a card.
        className="mt-auto pt-2 font-semibold tabular-nums text-sheno-primary"
      >
        {formatPrice(product.price)}
      </p>

      <p className="text-xs text-sheno-text-secondary">{product.sku}</p>
    </article>
  );
}