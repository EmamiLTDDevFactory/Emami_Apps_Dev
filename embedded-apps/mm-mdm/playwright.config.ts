import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';

/**
 * End-to-end and accessibility tests, in DEMO mode (the demo service runs in the browser: no SAP, no backend).
 * The app is tested as a production static export (`next build`, then out/ served under the real basePath by tests/e2e/serve.mjs):
 * no compile on first visit, like in the hub. Demo state lives in the sessionStorage of each browser context, so tests are
 * isolated and run in parallel. A server that is already running on the port is reused locally (not in CI).
 */
const APP_PORT = 3321;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : Math.max(2, Math.min(4, Math.floor(os.cpus().length / 2))),
  reporter: [['list']],
  use: { baseURL: `http://localhost:${APP_PORT}/apps/mm-mdm/`, trace: 'retain-on-failure', video: 'off', screenshot: 'off', ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
  webServer: {
    command: `npx next build && node tests/e2e/serve.mjs ${APP_PORT}`,
    url: `http://localhost:${APP_PORT}/apps/mm-mdm/`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: { MM_MODE: 'demo' },
  },
});
