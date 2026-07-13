import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const port = process.env.CI ? 3010 : 3000;
const host = process.env.CI ? "127.0.0.1" : "localhost";
const localChromium = join(process.env.HOME || "", ".cache/ms-playwright/chromium-1187/chrome-linux/chrome");

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://${host}:${port}`, trace: "retain-on-failure" },
  webServer: {
    command: `bun run dev --hostname 127.0.0.1 --port ${port}`,
    url: `http://${host}:${port}`,
    reuseExistingServer: !process.env.CI,
    env: { PINCHANA_API_URL: "http://127.0.0.1:9999", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "" },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], ...(existsSync(localChromium) ? { launchOptions: { executablePath: localChromium } } : {}) } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
