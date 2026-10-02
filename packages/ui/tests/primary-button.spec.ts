/**
 * PrimaryButton brand-colour contract.
 *
 * These assertions are the executable form of docs/UI_UX_Brief.md §4. If the
 * brand primary ever drifts, this fails before a pixel ships wrong.
 */
import { expect, test } from "@playwright/test";
import { fileURLToPath, pathToFileURL } from "node:url";

const GALLERY = pathToFileURL(
  fileURLToPath(new URL("../playwright/gallery/index.html", import.meta.url)),
).href;

/** Electric Cyan. docs/UI_UX_Brief.md: `--sheno-primary` = #22d3ee. */
const ELECTRIC_CYAN = "rgb(34, 211, 238)";

test.beforeEach(async ({ page }) => {
  await page.goto(GALLERY);
});

test("PrimaryButton background is Electric Cyan exactly", async ({ page }) => {
  const button = page.getByRole("button", { name: "Add to cart" });

  await expect(button).toBeVisible();
  await expect(button).toHaveCSS("background-color", ELECTRIC_CYAN);
});

test("PrimaryButton colour matches the declared hex, not a near miss", async ({ page }) => {
  const button = page.getByRole("button", { name: "Add to cart" });

  // Read the custom property itself, so the stylesheet and the rendered
  // element cannot disagree about what the brand colour is.
  const declared = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--sheno-primary").trim(),
  );

  expect(declared.toLowerCase()).toBe("#22d3ee");

  const rendered = await button.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(rendered).toBe(ELECTRIC_CYAN);
});

test("PrimaryButton label is dark on cyan for contrast", async ({ page }) => {
  const button = page.getByRole("button", { name: "Add to cart" });

  // docs/UI_UX_Brief.md: white on cyan is 1.7:1 and fails. Dark text is 10.64:1.
  await expect(button).toHaveCSS("color", "rgb(8, 14, 30)");
});