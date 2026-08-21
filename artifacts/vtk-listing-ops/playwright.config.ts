import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  webServer: process.env.PHASE2_E2E ? [
    { command: "pnpm --filter @workspace/api-server build && pnpm --filter @workspace/api-server start", url: "http://127.0.0.1:4174/api/readyz", reuseExistingServer: false, env: { PORT:"4174",APP_ENV:"staging",NODE_ENV:"test",PHASE2_E2E:"true",ALLOW_DEVELOPMENT_IDENTITY:"true",ALLOW_NONPRODUCTION_DATABASE:"true",ALLOW_NONPRODUCTION_STORAGE:"true",STAGING_TRUSTED_PARENT_PATH:process.env.STAGING_TRUSTED_PARENT_PATH??"",STAGING_FILE_ROOT:process.env.STAGING_FILE_ROOT??"",CORS_ALLOWED_ORIGINS:"http://127.0.0.1:4173" } },
    { command: "pnpm dev", url: "http://127.0.0.1:4173/employee", reuseExistingServer: false, env: { PORT:"4173",BASE_PATH:"/",VITE_API_BASE_URL:"http://127.0.0.1:4174/api" } },
  ] : { command: "pnpm dev", url: "http://127.0.0.1:4173/employee", reuseExistingServer: false, env: { PORT: "4173", BASE_PATH: "/" } },
  projects: [
    { name: "1920x1080", use: { viewport: { width: 1920, height: 1080 } } },
    { name: "1600x900", use: { viewport: { width: 1600, height: 900 } } },
    { name: "1366x768", use: { viewport: { width: 1366, height: 768 } } },
  ],
});
