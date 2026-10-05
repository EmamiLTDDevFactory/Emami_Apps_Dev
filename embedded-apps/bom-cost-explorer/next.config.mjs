/**
 * Static export, merged into the hub's dist/ at /apps/bom-cost-explorer by the repo's
 * scripts/build-embedded-apps.js like every sibling embedded app. There is no server: the browser
 * calls the Azure SAP gateway directly (see src/lib/sap/config.ts).
 *
 * @type {import('next').NextConfig}
 */
const basePath = '/apps/bom-cost-explorer';

// SAP system of the DEPLOYED app (Amplify runs `next build`): NWP = production SAP, which the config
// guard only allows with APP_ENV=production (header badge turns red). `next dev` and the tests are
// not affected (they stay on NGD / the mock). An explicit NEXT_PUBLIC_SAP_SYSTEM / NEXT_PUBLIC_APP_ENV
// still wins. To go back to the development system: set both to NGD / development here.
const isBuild = process.env.NODE_ENV === 'production';
const DEPLOYED_SAP_SYSTEM = 'NWP';
const DEPLOYED_APP_ENV = 'production';
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
  env: { NEXT_PUBLIC_BASE_PATH: basePath, ...sapEnv },
};

export default nextConfig;
