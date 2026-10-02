/**
 * ShenoFlow root route.
 *
 * getByRole('heading') rather than a text match: it asserts the title is
 * exposed as an accessible heading, not merely present as text.
 */
import { expect, test } from "@playwright/test";

test.describe("ShenoFlow root route", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders the ShenoFlow Logistics heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "ShenoFlow Logistics" }),
    ).toBeVisible();
  });

  test("dashboard heading is the page's top-level heading", async ({ page }) => {
    // A single h1 keeps the document outline unambiguous for screen readers.
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText("ShenoFlow Logistics");
  });

  test("serves the app shell without a server error", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
  });

  test("brand token stylesheet is loaded", async ({ page }) => {
    // Proves @shenodev/ui resolves through nuxt.config css. Without this, a
    // silently ignored import would still pass the heading assertions above.
    const primary = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--sheno-primary")
        .trim(),
    );
    expect(primary).toBe("#22d3ee");
  });
});