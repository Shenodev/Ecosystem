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

  test("brand token resolves to the documented hex through the Tailwind theme", async ({
    page,
  }) => {
    await expect(page.getByTestId("primary-action")).toHaveCSS(
      "background-color",
      "rgb(6, 182, 212)",
    );
  });

  test("ShenoFlow primary button is #06B6D4, not Electric Cyan", async ({ page }) => {
    // UI_UX_Brief.md §150 is a brand rule, so it is enforced as one. If someone
    // copies ShenoStore's button markup here, this fails.
    const background = await page
      .getByTestId("primary-action")
      .evaluate((el) => getComputedStyle(el).backgroundColor);

    expect(background).not.toBe("rgb(34, 211, 238)");
    expect(background).toBe("rgb(6, 182, 212)");
  });

  test("Out for Delivery chip keeps Electric Cyan for the delivery state", async ({
    page,
  }) => {
    // §150: cyan means the delivery state here, so it must stay #22d3ee and
    // must differ from the button beside it.
    await expect(page.getByTestId("status-out-for-delivery")).toHaveCSS(
      "background-color",
      "rgb(34, 211, 238)",
    );
  });

  test("status chip carries a text label, not colour alone", async ({ page }) => {
    // §5: every chip pairs colour with a text label and an icon.
    await expect(page.getByTestId("status-out-for-delivery")).toHaveText(
      /Out for Delivery/,
    );
  });
});