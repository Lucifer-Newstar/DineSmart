import { defineConfig, devices } from "@playwright/test";
import { E2E_MONGODB_URI } from "./e2e/fixtures/demo";

/**
 * End-to-end tests for Andhrímnir. Playwright boots the API and the built
 * frontend, and global-setup seeds the Saffron & Co. demo data into a separate
 * MongoDB database, so a run never touches the development database.
 *
 *   npm run build      # once, the suite serves the production build
 *   npm run e2e        # starts both servers, seeds, runs every spec
 */
const API_PORT = Number(process.env.E2E_API_PORT ?? 3001);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3000);
const webOrigin = `http://localhost:${WEB_PORT}`;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  // The specs share one seeded restaurant, so they run one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: webOrigin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      name: "api",
      command: "npx tsx src/server.ts",
      cwd: "../backend",
      url: `http://127.0.0.1:${API_PORT}/health`,
      reuseExistingServer: !isCI,
      timeout: 60_000,
      env: {
        NODE_ENV: "test",
        PORT: String(API_PORT),
        MONGODB_URI: E2E_MONGODB_URI,
        // Test-only signing key; it never leaves the local run.
        JWT_SECRET: process.env.E2E_JWT_SECRET ?? "e2e-only-signing-key-not-for-real-use-000000",
        WEB_ORIGIN: webOrigin,
        EMAIL_PROVIDER: "mock",
        E2E_DISABLE_RATE_LIMITS: "1",
        GEMINI_API_KEY: "",
      },
    },
    {
      name: "web",
      command: `npm run start -- --port ${WEB_PORT}`,
      url: webOrigin,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: {
        API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}`,
      },
    },
  ],
});
