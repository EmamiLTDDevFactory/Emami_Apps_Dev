import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke test: the app (static app, served by `next dev` under its real basePath) calls a mock SAP
 * gateway DIRECTLY from the browser - mock/server.ts speaks the ZMM_BOM_COST_SRV contract on the
 * gateway-style path /api/NGD/ZMM_BOM_COST_SRV with CORS, exactly like the Azure gateway.
 */
const MOCK_PORT = 4599;
const APP_PORT = 3212;

export default defineConfig({
  testDir: 'tests/e2e',
  testIgnore: /zz-/,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${APP_PORT}/apps/bom-cost-explorer/`, trace: 'retain-on-failure', ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
  webServer: [
    {
      command: 'npx tsx mock/server.ts',
      port: MOCK_PORT,
      env: { MOCK_SAP_PORT: String(MOCK_PORT), MOCK_SAP_DELAY_MS: '600' },
      reuseExistingServer: false,
    },
    {
      command: `npx next dev -p ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}/apps/bom-cost-explorer/`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_SAP_GATEWAY_HOST: `http://localhost:${MOCK_PORT}`,
        NEXT_PUBLIC_SAP_SYSTEM: 'NGD',
        NEXT_PUBLIC_APP_ENV: 'development',
        NEXT_PUBLIC_ACCESS_API_URL: 'http://access.test/api',
      },
    },
  ],
});
