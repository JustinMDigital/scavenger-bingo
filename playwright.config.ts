import { defineConfig, devices } from "@playwright/test";

const e2ePort = process.env.SCAVENGER_E2E_PORT?.trim() || "4175";
const e2ePortNumber = Number(e2ePort);
if (
  !/^\d{2,5}$/.test(e2ePort) ||
  !Number.isInteger(e2ePortNumber) ||
  e2ePortNumber < 1024 ||
  e2ePortNumber > 65535
) {
  throw new Error("SCAVENGER_E2E_PORT must be a valid TCP port number.");
}
const baseURL = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: process.env.CI ? [["github"], ["line"]] : "line",
  outputDir: "test-results",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 960 },
      },
    },
    {
      name: "phone-chromium",
      use: {
        ...devices["Pixel 7"],
      },
    },
  ],
  webServer: {
    command: `npm run dev:e2e -- --port ${e2ePort}`,
    env: {
      SCAVENGER_E2E: "1",
      VITE_SUPPORT_EMAIL: "release-test@example.com",
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: `${baseURL}/api/health`,
  },
});
