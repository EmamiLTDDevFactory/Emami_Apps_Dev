/**
 * Static export, merged into the hub's dist/ at /apps/bom-cost-explorer by the repo's
 * scripts/build-embedded-apps.js like every sibling embedded app. There is no server: the browser
 * calls the Azure SAP gateway directly (see src/lib/sap/config.ts).
 *
 * @type {import('next').NextConfig}
 */
const basePath = '/apps/bom-cost-explorer';

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
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
