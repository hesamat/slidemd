import { defineConfig, devices } from "@playwright/test";

// E2E uses a dedicated port range (defaults: Vite 8080, CLI 8081) so it never
// conflicts with a running dev session (8000/8001). Override via env vars if
// needed. When a server is already running on the e2e port, Playwright reuses
// it instead of spawning a new one — speeding up repeated runs.
const e2ePort = Number(process.env.WEBDECK_E2E_PORT) || 8080;
const e2eCliPort = Number(process.env.WEBDECK_E2E_CLI_PORT) || 8081;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}`,
    browserName: "chromium",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `WEBDECK_VITE_PORT=${e2ePort} WEBDECK_CLI_PORT=${e2eCliPort} node tools/dev.mjs docs/example/slides.md --no-open`,
    url: `http://127.0.0.1:${e2ePort}/index.html`,
    // Reuse a server already running on the e2e port (e.g. from a previous
    // failed run, or manually started). In CI, always start fresh.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
