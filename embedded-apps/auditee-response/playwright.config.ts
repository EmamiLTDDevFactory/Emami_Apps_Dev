import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';

/**
 * End-to-end and accessibility tests in DEMO mode (sample data in the browser: no SAP, no backend), against the production static
 * export (`next build`, out/ served under the real basePath by tests/e2e/serve.mjs). Demo state lives in each browser context's
 * sessionStorage, so tests are isolated and run in parallel.
 */
const APP_PORT = 3331;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : Math.max(2, Math.min(4, Math.floor(os.cpus().length / 2))),
  reporter: [['list']],
  use: { baseURL: `http://localhost:${APP_PORT}/apps/auditee-response/`, trace: 'retain-on-failure', reducedMotion: 'reduce', video: 'off', screenshot: 'off', ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
  webServer: {
    command: `npx next build && node tests/e2e/serve.mjs ${APP_PORT}`,
    url: `http://localhost:${APP_PORT}/apps/auditee-response/`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: { AUD_MODE: 'demo' },
  },
});
