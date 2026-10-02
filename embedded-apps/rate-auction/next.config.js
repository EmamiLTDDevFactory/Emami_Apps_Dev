/** @type {import('next').NextConfig} */
// Static export, merged into the hub's dist/ at /apps/rate-auction/ like every sibling embedded app
// (see repo root scripts/build-embedded-apps.js). The live auction itself is NOT in this build: it
// runs in server/ (Express, one process per environment), which this frontend calls - see
// src/lib/api.ts.
const nextConfig = {
  output: 'export',
  basePath: '/apps/rate-auction',
  assetPrefix: '/apps/rate-auction',
  trailingSlash: true,
  images: {
    // next/image's optimization API needs a server — unavailable on static export.
    unoptimized: true,
  },
  reactStrictMode: true,
};

module.exports = nextConfig;
