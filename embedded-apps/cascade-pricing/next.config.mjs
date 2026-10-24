/** @type {import('next').NextConfig} */
// Static export merged into the hub's dist/ like every sibling app (repo root scripts/build-embedded-apps.js),
// served as plain files under /apps/cascade-pricing/. No Node server at runtime.
const basePath = '/apps/cascade-pricing';

// SAP is reached only through the Emami Apps backend (backend/cascadePricing.js -> ZMM_CASCADE_SRV_SRV); the browser never
// calls SAP. Deployed builds use it (live); local development uses the mock (lib/mock.ts). CASCADE_MOCK=true|false wins.
// CASCADE_API_BASE overrides the backend URL (default: <audit-capa-api>/dev-api/api or /api + /me/cascade-pricing).
const isBuild = process.argv.includes('build');
const nextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_CASCADE_MOCK: process.env.CASCADE_MOCK ?? process.env.NEXT_PUBLIC_CASCADE_MOCK ?? (isBuild ? 'false' : 'true'),
    NEXT_PUBLIC_CASCADE_API_BASE: process.env.CASCADE_API_BASE ?? process.env.NEXT_PUBLIC_CASCADE_API_BASE ?? '',
  },
};

export default nextConfig;
