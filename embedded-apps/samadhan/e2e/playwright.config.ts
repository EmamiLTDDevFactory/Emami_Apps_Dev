import { defineConfig, devices } from '@playwright/test';

// End-to-end tests (docs/v7/TEST-PLAN.md B.5). Run by the gate (backend/samadhan/tests/gate.js), which starts a local
// backend on a throwaway database, builds the app against it and serves it on localhost:3250. Uses the Microsoft Edge
// installed on the machine (channel msedge), so no browser download is needed.
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 60_000,
  reporter: [['list']],
  outputDir: '../../../docs/v7/test-artifacts/e2e',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3250',
    channel: 'msedge',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Edge'], channel: 'msedge', viewport: { width: 1366, height: 768 } } },
    { name: 'mobile-360', use: { channel: 'msedge', viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true } },
  ],
});
