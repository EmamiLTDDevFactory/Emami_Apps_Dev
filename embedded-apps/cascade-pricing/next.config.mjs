/** @type {import('next').NextConfig} */
// Static export merged into the hub's dist/ like every sibling app (repo root scripts/build-embedded-apps.js),
// served as plain files under /apps/cascade-pricing/. No Node server at runtime.
const basePath = '/apps/cascade-pricing';

// SAP service (ZMM_CASCADE_PRICING) is not available yet: mock data is on unless CASCADE_MOCK=false at build time.
// CASCADE_API_BASE points at the service that fronts SAP (GET <base>/cascade/<set>, POST <base>/action).
const nextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_CASCADE_MOCK: process.env.CASCADE_MOCK ?? process.env.NEXT_PUBLIC_CASCADE_MOCK ?? 'true',
    NEXT_PUBLIC_CASCADE_API_BASE: process.env.CASCADE_API_BASE ?? process.env.NEXT_PUBLIC_CASCADE_API_BASE ?? '',
  },
};

export default nextConfig;
