/**
 * E2E test for the ShenoStore product catalogue grid.
 *
 * Navigates the real homepage against the real database. The things being
 * asserted are the ones a unit test cannot see: that a Server Component
 * reaches Postgres, that the tenant filter actually holds at render time, and
 * that the price the database returned survives formatting intact.
 *
 * RULE 5  every tenant-scoped query filters tenant_id, so a product belonging
 *         to another tenant must never reach the page.
 * UI_UX   numeric columns are tabular-nums and right-aligned, or a grid of
 *         prices does not scan.
 *
 * A stale dev server on this port would serve pre-change code, so the config
 * sets reuseExistingServer: false.
 */
import { randomUUID } from "node:crypto";

import { DEMO_TENANT_ID, db, pool, products, tenants } from "@shenodev/db";
import { eq, like } from "drizzle-orm";
import { expect, test } from "@playwright/test";

/**
 * Only rows carrying this prefix are removed in teardown. The demo tenant is
 * the reserved row shared by the whole ecosystem, so a blanket delete would
 * take out whatever permanent demo data §11 eventually seeds into it.
 */
const SKU_PREFIX = `e2e-cat-${randomUUID().slice(0, 8)}`;

const CATALOGUE = [
  { sku: `${SKU_PREFIX}-1`, title: "Cedar Standing Desk", price: "1299.00" },
  { sku: `${SKU_PREFIX}-2`, title: "Brass Desk Lamp", price: "249.50" },
  { sku: `${SKU_PREFIX}-3`, title: "Walnut Monitor Riser", price: "89.99" },
  { sku: `${SKU_PREFIX}-4`, title: "Wool Throw Blanket", price: "145.00" },
];

const FOREIGN_TITLE = "FOREIGN TENANT PRODUCT — must never render";

let otherTenantId: string;

test.beforeAll(async () => {
  otherTenantId = randomUUID();

  await db.insert(tenants).values({
    id: otherTenantId,
    name: "Catalogue Isolation Tenant",
    domain: `e2e-cat-${randomUUID().slice(0, 8)}.example.test`,
  });

  // The reserved demo tenant is what the storefront falls back to when the
  // request host matches no tenants.domain, which is every local request.
  await db.insert(products).values([
    ...CATALOGUE.map((p) => ({
      tenantId: DEMO_TENANT_ID,
      sku: p.sku,
      title: p.title,
      price: p.price,
    })),
    {
      tenantId: otherTenantId,
      sku: `${SKU_PREFIX}-foreign`,
      title: FOREIGN_TITLE,
      price: "9999.00",
    },
  ]);
});

test.afterAll(async () => {
  // Scoped to this run's SKUs, not to the tenant. The demo tenant is the
  // reserved row shared by the whole ecosystem, so a blanket delete would take
  // out whatever permanent demo data §11 eventually seeds into it.
  await db.delete(products).where(eq(products.tenantId, otherTenantId));
  await db.delete(products).where(like(products.sku, `${SKU_PREFIX}%`));
  await db.delete(tenants).where(eq(tenants.id, otherTenantId));
  await pool.end();
});

test.describe("ShenoStore catalogue grid", () => {
  // Serial is load-bearing, not a preference. This suite seeds the *shared*
  // demo tenant, and under fullyParallel Playwright runs beforeAll/afterAll once
  // per worker — so whichever worker's teardown landed first deleted the rows
  // the other workers were still about to load, and two tests failed for a
  // reason that had nothing to do with the code.
  //
  // The login spec gets away with parallelism because each worker gives itself
  // its own tenant, so their teardowns cannot collide. This one cannot: the
  // storefront resolves to the demo tenant by design, and a test-only override
  // to point it elsewhere would be a backdoor into the tenant filter.
  test.describe.configure({ mode: "serial" });

  test("renders at least three product cards", async ({ page }) => {
    await page.goto("/");

    const cards = page.getByTestId("product-card");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(3);
  });

  test("every card carries a title and a price", async ({ page }) => {
    await page.goto("/");

    const cards = page.getByTestId("product-card");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(3);

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);

      const title = card.getByTestId("product-title");
      await expect(title).toBeVisible();
      expect((await title.innerText()).trim()).not.toBe("");

      const price = card.getByTestId("product-price");
      await expect(price).toBeVisible();
      // A price element that rendered empty, or rendered a placeholder, would
      // still satisfy a "has a price element" check.
      expect((await price.innerText()).trim()).toMatch(/^EGP\s[\d,]+\.\d{2}$/);
    }
  });

  test("shows every seeded product, priced from the database", async ({ page }) => {
    await page.goto("/");

    for (const product of CATALOGUE) {
      await expect(page.getByTestId("product-title").filter({ hasText: product.title })).toBeVisible();
    }

    // Pinned literal rather than recomputing the formatter, so a change to the
    // currency or locale shows up as a test failure instead of agreeing with
    // itself.
    const priced = page.getByTestId("product-price");
    await expect(priced.filter({ hasText: "EGP 1,299.00" })).toHaveCount(1);
    await expect(priced.filter({ hasText: "EGP 249.50" })).toHaveCount(1);
    await expect(priced.filter({ hasText: "EGP 89.99" })).toHaveCount(1);
  });

  test("does not render products belonging to another tenant", async ({ page }) => {
    await page.goto("/");

    // Positive control first. This test asserts an absence, so without it the
    // whole thing goes green on an empty page — which is exactly what happened
    // when this was first written against an unimplemented grid.
    await expect(page.getByTestId("product-title").filter({ hasText: CATALOGUE[0].title })).toBeVisible();

    // RULE 5. The other tenant's product is in the same table, priced higher,
    // and would be indistinguishable from real catalogue data if the query
    // forgot its tenant filter.
    await expect(page.getByText(FOREIGN_TITLE)).toHaveCount(0);
    await expect(page.getByTestId("product-price").filter({ hasText: "EGP 9,999.00" })).toHaveCount(0);
  });
});