import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./.short-it/playwright-results",
  timeout: 30_000,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:3213",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      "node --import tsx server/index.ts --workspace .short-it/ui-test-projects",
    env: { SHORT_IT_PORT: "3213" },
    url: "http://127.0.0.1:3213/api/projects",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
