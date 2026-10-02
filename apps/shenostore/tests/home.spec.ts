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

  test("brand token resolves to Electric Cyan through the Tailwind theme", async ({
    page,
  }) => {
    // Proves @shenodev/ui is actually wired into the bundle and that the
    // generated utility resolves to the brand hex — a stronger check than
    // reading the CSS variable, because it exercises the utility Tailwind emits.
    await expect(page.getByTestId("primary-action")).toHaveCSS(
      "background-color",
      "rgb(34, 211, 238)",
    );
  });

  test("primary action label is dark on cyan", async ({ page }) => {
    // UI_UX_Brief.md §4: white on cyan is 1.7:1 and fails outright.
    await expect(page.getByTestId("primary-action")).toHaveCSS(
      "color",
      "rgb(8, 14, 30)",
    );
  });
});