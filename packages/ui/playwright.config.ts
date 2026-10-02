import { defineConfig } from "@playwright/test";

/**
 * Component suite for @shenodev/ui.
 *
 * The gallery is a static page loaded over file://, so there is no dev server,
 * no bundler, and no per-framework gallery. The components are plain CSS, which
 * is the whole point: React, Svelte and Vue all consume the same stylesheet.
 *
 * Playwright >=1.63 only. The @playwright/experimental-ct-* packages were
 * removed and are no longer published.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    serviceWorkers: "block",
  },
});