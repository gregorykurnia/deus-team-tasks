import { defineConfig, devices } from "@playwright/test";

// Smoke tests run against the Firestore emulator, never live data.
// Playwright starts the emulator and one dev server, and stops both afterwards.
const PORT = 3100;

export default defineConfig({
  testDir: "tests/smoke",
  globalSetup: "./tests/smoke/global-setup.ts",
  fullyParallel: false,
  workers: 1, // one shared emulator, cleared before every test
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    {
      name: "phone",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: [
    {
      command: "npx firebase emulators:start --only firestore --project demo-deus",
      url: "http://127.0.0.1:8080",
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: "SIGINT", timeout: 15_000 },
      stdout: "ignore",
    },
    {
      command: `npx next dev --port ${PORT}`,
      url: `http://localhost:${PORT}`,
      env: { NEXT_PUBLIC_USE_EMULATOR: "1" },
      reuseExistingServer: false,
      timeout: 180_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    },
  ],
});
