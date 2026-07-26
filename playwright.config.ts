import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // Keep local dev-server compilation/hydration stable on modest machines;
  // CI remains serialized for deterministic checkout-cookie tests.
  workers: process.env.CI ? 1 : 4,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"] },
    },
  ],
  webServer: {
    command: "node node_modules/next/dist/bin/next dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer:
      process.env.FITORA_E2E_PRESTARTED === "1" || !process.env.CI,
    timeout: 120_000,
  },
});
