import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  webServer: { command: "pnpm dev", url: "http://127.0.0.1:4173/employee", reuseExistingServer: false, env: { PORT: "4173", BASE_PATH: "/" } },
  projects: [
    { name: "1920x1080", use: { viewport: { width: 1920, height: 1080 } } },
    { name: "1600x900", use: { viewport: { width: 1600, height: 900 } } },
    { name: "1366x768", use: { viewport: { width: 1366, height: 768 } } },
  ],
});
