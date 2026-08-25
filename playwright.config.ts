import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a real dev server with the seeded database.
 * They exercise the workflows a dropshipper actually performs, not the UI's
 * internals — if these pass, the product works.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3210",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    // Signs in once per role and stores the sessions, so the suite exercises
    // the sign-in form deliberately rather than incidentally on every test.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],

  /**
   * Runs against a production build rather than the dev server: it is several
   * times faster, it does not recompile routes mid-test, and it is what
   * actually ships. Point E2E_BASE_URL at a running server to skip this.
   */
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run build && npx next start -p 3210",
        url: "http://localhost:3210/sign-in",
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      },
});
