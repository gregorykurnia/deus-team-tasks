import { defineConfig, devices } from "@playwright/test";
import { leaveClockFile } from "./tests/support/leaveClock";

// Smoke tests run against the Firestore emulator, never live data.
// Playwright starts the emulator and one dev server, and stops both afterwards. Not a production build: lib/emulator.ts
// never connects a production build to the emulator, so such a run would reach the live projects.
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
    // Only the tests tagged @phone: the ones that check the phone layout (they take isMobile or a phone-only skip).
    {
      name: "phone",
      grep: /@phone/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    // The team's time zone (UTC+7), for what depends on which day it is: Plan, Today and the deadline pills.
    {
      name: "jakarta",
      testMatch: /[\\/](plan|today|tasks)\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Jakarta" },
    },
  ],
  webServer: [
    {
      command: "npx firebase emulators:start --only firestore,auth --project demo-deus",
      url: "http://127.0.0.1:8180",
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: "SIGINT", timeout: 15_000 },
      stdout: "ignore",
    },
    {
      command: `npx next dev --port ${PORT}`,
      url: `http://localhost:${PORT}`,
      env: {
        NEXT_PUBLIC_USE_EMULATOR: "1", CALENDAR_FAKE: "1", GOOGLE_EVENTS_CALENDAR_ID: "test-calendar",
        // Local-only connector credentials: chat-edit smoke tests use the same isolated dev server.
        MCP_SECRET: "mcp-smoke-emulator-only", MCP_TASK_EDITS_ENABLED: "1",
        CRON_SECRET: "morning-smoke-emulator-only", MORNING_TEST_DATE: "2026-11-17",
        LEAVE_TEST_DATE: process.env.LEAVE_TEST_DATE ?? "2027-02-10",
        LEAVE_TEST_DATE_FILE: leaveClockFile,
        NEXT_PUBLIC_LEAVE_ENABLED: process.env.LEAVE_SMOKE_OFF === "1" ? "0" : "1", LEAVE_ADMINS: "gregory.leave@deushcs.com",
        NEXT_PUBLIC_SIGN_IN_ENABLED: process.env.SIGN_IN_SMOKE_OFF === "1" ? "0" : "1", CODE_SECRET: "sign-in-smoke-emulator-only-secret-32-characters",
        // Public placeholder used only with the browser push stub; no real push service is contacted.
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: Buffer.from([4, ...Array<number>(64).fill(1)]).toString("base64url"),
      },
      reuseExistingServer: false,
      timeout: 180_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    },
  ],
});
