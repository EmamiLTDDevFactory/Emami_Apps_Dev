import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke test against a mocked SAP: mock/server.ts speaks the ZMM_BOM_COST_SRV contract over HTTP
 * (Basic auth enforced), and the app talks to it through its REAL SAP client (MOCK_SAP=false).
 */
const MOCK_PORT = 4599;
const APP_PORT = 3212;
export const HUB_SECRET = 'e2e-hub-secret';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${APP_PORT}`, trace: 'retain-on-failure', ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
  webServer: [
    {
      command: 'npx tsx mock/server.ts',
      port: MOCK_PORT,
      env: { MOCK_SAP_PORT: String(MOCK_PORT), MOCK_SAP_USER: 'E2E', MOCK_SAP_PASSWORD: 'secret', MOCK_SAP_DELAY_MS: '600' },
      reuseExistingServer: false,
    },
    {
      command: `npx next dev -p ${APP_PORT}`,
      port: APP_PORT,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        MOCK_SAP: 'false',
        SAP_BASE_URL: `http://localhost:${MOCK_PORT}/sap/opu/odata/sap/ZMM_BOM_COST_SRV`,
        SAP_USER: 'E2E',
        SAP_PASSWORD: 'secret',
        SAP_CLIENT: '100',
        NEXTAUTH_SECRET: 'e2e-nextauth-secret',
        HUB_AUTH_JWT_SECRET: HUB_SECRET,
        HUB_ACCESS_API_BASE: '',
        PLANT_ACCESS: JSON.stringify({ '*': ['1000', '1100', '1200', 'BD10'] }),
        RATE_LIMIT_COST_PER_MIN: '100',
      },
    },
  ],
});
