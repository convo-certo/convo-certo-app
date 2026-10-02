import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 0,
  workers: 2,
  use: {
    baseURL: "http://localhost:5187",
    headless: true,
    locale: "ja-JP",
  },
  webServer: {
    command: "npm run dev -- --port 5187 --strictPort",
    port: 5187,
    reuseExistingServer: false,
    timeout: 30000,
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
