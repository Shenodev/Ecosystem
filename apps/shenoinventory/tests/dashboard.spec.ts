/**
 * ShenoInventory root route.
 *
 * getByRole('heading') rather than a text match: it asserts the dashboard
 * title is exposed as an accessible heading, not merely present as text.
 */
import { expect, test } from "@playwright/test";

test.describe("ShenoInventory root route", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders the ShenoInventory Dashboard heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "ShenoInventory Dashboard" }),
    ).toBeVisible();
  });

  test("dashboard heading is the page's top-level heading", async ({ page }) => {
    // A single h1 keeps the document outline unambiguous for screen readers.
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText("ShenoInventory Dashboard");
  });

  test("serves the app shell without a server error", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
  });
});