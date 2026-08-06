import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  use: {
    baseURL: process.env.AQUA_WEB_URL ?? "http://127.0.0.1:5173",
    trace: "retain-on-failure"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-360", use: { viewport: { width: 360, height: 740 } } }
  ]
});
