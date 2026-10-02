/**
 * ShenoStore root route.
 *
 * The title assertion uses the browser tab name because that is what a user
 * sees; a page can render correct markup while still carrying a scaffold
 * title in its <head>.
 */
import { expect, test } from "@playwright/test";

test.describe("ShenoStore root route", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("page title contains ShenoStore", async ({ page }) => {
    await expect(page).toHaveTitle(/ShenoStore/);
  });

  test("page title is exactly the brand name", async ({ page }) => {
    await expect(page).toHaveTitle("ShenoStore");
  });

  test("serves the app shell without a server error", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
  });

  test("brand token stylesheet is loaded", async ({ page }) => {
    // Proves @shenodev/ui is actually wired into the bundle, not just
    // installed. Without this, a broken import would still pass the title
    // assertions above.
    const primary = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--sheno-primary")
        .trim(),
    );
    expect(primary).toBe("#22d3ee");
  });
});