import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { homedir } from "node:os";

const chromiumExecutable = join(homedir(), ".cache/ms-playwright/chromium-1187/chrome-linux/chrome");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 60000,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath: chromiumExecutable,
        },
      },
    },
  ],
  webServer: {
    command: "bun run dev",
    port: 3000,
    reuseExistingServer: true,
    timeout: 60000,
  },
});
