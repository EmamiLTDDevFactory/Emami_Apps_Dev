/**
 * Static export, merged into the hub's dist/ at /apps/bom-cost-explorer by the repo's
 * scripts/build-embedded-apps.js like every sibling embedded app. There is no server: the browser
 * calls the Azure SAP gateway directly (see src/lib/sap/config.ts).
 *
 * @type {import('next').NextConfig}
 */
const basePath = '/apps/bom-cost-explorer';

// SAP system of the DEPLOYED app (Amplify runs `next build`). This repo (DEV, dev.emamiapps.in) uses
// NGQ / qa; the PRD copy in Emami_Apps_New sets NWP / production (the config guard only allows NWP with
// APP_ENV=production, and the header badge turns red). `next dev` and the tests are not affected (they
// stay on NGD / the mock). An explicit NEXT_PUBLIC_SAP_SYSTEM / NEXT_PUBLIC_APP_ENV still wins.
const isBuild = process.env.NODE_ENV === 'production';
const DEPLOYED_SAP_SYSTEM = 'NGQ';
const DEPLOYED_APP_ENV = 'qa';
// Production Plan module: ON for the deployed DEV build (user's request, 2026-10-13). The PRD copy keeps it
// off. `next dev` and the tests stay off unless PLAN_MODULE_ENABLED is set.
const DEPLOYED_PLAN_MODULE = 'true';
const sapEnv = isBuild
  ? {
      NEXT_PUBLIC_SAP_SYSTEM: process.env.NEXT_PUBLIC_SAP_SYSTEM || DEPLOYED_SAP_SYSTEM,
      NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV || DEPLOYED_APP_ENV,
    }
  : {};

const nextConfig = {
  // The built-in mock SAP only exists in local mock builds (npm run dev:mock / tests).
  webpack(config, { webpack }) {
    if (process.env.NEXT_PUBLIC_MOCK_SAP !== 'true') {
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(/[\\/]mock[\\/]sap$/, (r) => { r.request = r.request.replace(/sap$/, 'stub'); }));
    }
    return config;
  },
  output: 'export',
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  // Production Plan module: PLAN_MODULE_ENABLED / NEXT_PUBLIC_PLAN_MODULE_ENABLED win; else on for deployed DEV builds.
  env: { NEXT_PUBLIC_BASE_PATH: basePath, ...sapEnv, NEXT_PUBLIC_PLAN_MODULE_ENABLED: process.env.NEXT_PUBLIC_PLAN_MODULE_ENABLED || process.env.PLAN_MODULE_ENABLED || (isBuild ? DEPLOYED_PLAN_MODULE : 'false') },
};

export default nextConfig;
