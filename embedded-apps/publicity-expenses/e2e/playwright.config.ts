import { defineConfig, devices } from '@playwright/test';

// End-to-end tests against the local mock backend (e2e/mock-server.js, port 4195) and the app on localhost:3260
// (`NEXT_PUBLIC_PUBEXP_API_URL=http://127.0.0.1:4195/api/me/publicity-expenses npm run dev`). E2E_TOKEN = the token
// mock-server.js prints. Uses the Microsoft Edge installed on the machine (channel msedge): no browser download.
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 90_000,
  reporter: [['list']],
  outputDir: './test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3260',
    channel: 'msedge',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Edge'], channel: 'msedge', viewport: { width: 1366, height: 800 } } },
    { name: 'mobile-360', use: { channel: 'msedge', viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true } },
  ],
});
