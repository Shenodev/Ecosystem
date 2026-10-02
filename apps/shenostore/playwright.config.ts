import { defineConfig, devices } from "@playwright/test";

/**
 * E2E suite for ShenoStore (Next.js).
 *
 * Runs against the real dev server, so this exercises Next.js routing, SSR, and
 * the rendered DOM — not a component in isolation.
 */
// 3001 is occupied by an unrelated local service on this host, which made
// reuseExistingServer silently serve someone else's app. Verified free.
const PORT = 3411;
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
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});