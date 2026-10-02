import { defineConfig, devices } from "@playwright/test";

/**
 * E2E suite for ShenoInventory (SvelteKit).
 *
 * Runs against the real dev server, so this is a true end-to-end check:
 * SvelteKit routing, SSR, and the rendered DOM all have to work.
 */
const PORT = 5174;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL,
    serviceWorkers: "block",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: baseURL,
    // False on purpose: a dev server already on this port may predate the code
    // under test, and reusing it turns a green run into a stale one.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});