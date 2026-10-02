/**
 * ShenoDev design-token contract.
 *
 * These assertions are the executable form of docs/UI_UX_Brief.md §3–§4. The
 * brand tokens now live in a Tailwind v4 @theme block (packages/ui/src/theme.css),
 * so these prove two things at once: the utilities Tailwind generates resolve
 * to the declared brand hex, and that hex has not drifted.
 */
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const GALLERY = pathToFileURL(
  fileURLToPath(new URL("../playwright/gallery/index.html", import.meta.url)),
).href;

const THEME_CSS = fileURLToPath(new URL("../src/theme.css", import.meta.url));

/** Electric Cyan. docs/UI_UX_Brief.md §4: primary action = #22d3ee. */
const ELECTRIC_CYAN = "rgb(34, 211, 238)";
/** Hover cyan #06B6D4, and per §150 the ShenoFlow primary-button colour. */
const HOVER_CYAN = "rgb(6, 182, 212)";
/** Base surface #080e1e. Also the legal button-text colour on cyan. */
const BASE_NAVY = "rgb(8, 14, 30)";

const themeSource = readFileSync(THEME_CSS, "utf8");

/** Comments legitimately name hex values; only real declarations are audited. */
const themeDeclarations = themeSource.replace(/\/\*[\s\S]*?\*\//g, "");

test.beforeEach(async ({ page }) => {
  await page.goto(GALLERY);
});

test("bg-sheno-primary utility renders Electric Cyan exactly", async ({ page }) => {
  const swatch = page.getByTestId("swatch-primary");
  await expect(swatch).toBeVisible();
  await expect(swatch).toHaveCSS("background-color", ELECTRIC_CYAN);
});

test("theme source declares #22d3ee, so the rendered colour is not a near miss", async ({ page }) => {
  // Guards the classic failure: utility renders cyan-ish but the declared hex
  // drifted to #22d3ef. Assert the source, then assert what shipped.
  expect(themeSource).toContain("--color-sheno-cyan-400: #22d3ee");
  expect(themeSource).toContain("--color-sheno-primary: var(--color-sheno-cyan-400)");

  const rendered = await page
    .getByTestId("swatch-primary")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(rendered).toBe(ELECTRIC_CYAN);
});

test("primitive layer exists so semantic tokens are re-themeable", () => {
  // docs/UI_UX_Brief.md:173 specifies primitive -> semantic -> component.
  // Without primitives the semantic layer hardcodes hex and cannot be swapped.
  for (const token of [
    "--color-sheno-slate-950",
    "--color-sheno-slate-900",
    "--color-sheno-slate-800",
    "--color-sheno-cyan-400",
    "--color-sheno-cyan-500",
    "--color-sheno-white",
    "--color-sheno-gray-300",
  ]) {
    expect(themeSource).toContain(`${token}:`);
  }
});

test("bg-sheno-primary-hover utility renders #06B6D4", async ({ page }) => {
  // §150: ShenoFlow shifts primary buttons to #06B6D4 so "click here" and
  // "Out for Delivery" never read as the same thing.
  const swatch = page.getByTestId("swatch-hover");
  await expect(swatch).toHaveCSS("background-color", HOVER_CYAN);
});

test("surface tokens render their documented hex", async ({ page }) => {
  await expect(page.getByTestId("swatch-surface")).toHaveCSS(
    "background-color",
    "rgb(15, 23, 42)",
  );
  await expect(page.getByTestId("swatch-elevated")).toHaveCSS(
    "background-color",
    "rgb(30, 41, 59)",
  );
});

test("primary action label is dark on cyan for contrast", async ({ page }) => {
  const button = page.getByRole("button", { name: "Add to cart" });
  // §4: white on cyan is 1.7:1 and fails. Dark on cyan is 10.64:1 (AAA).
  await expect(button).toHaveCSS("color", BASE_NAVY);
  await expect(button).toHaveCSS("background-color", ELECTRIC_CYAN);
});

test("no app-facing stylesheet reintroduces a hardcoded brand hex", () => {
  // §3.3: "component styles reference semantic tokens only. A component that
  // hardcodes #22d3ee cannot be re-themed and cannot be audited."
  const offenders = themeDeclarations
    .split("\n")
    .filter((line) => /#[0-9a-fA-F]{3,8}/.test(line))
    // Every raw hex must sit in the primitive layer only.
    .filter((line) => !/--color-sheno-(slate|cyan|white|gray)/.test(line));

  expect(offenders).toEqual([]);
});