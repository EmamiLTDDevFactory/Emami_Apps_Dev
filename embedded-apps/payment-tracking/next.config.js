/** @type {import('next').NextConfig} */
// Static export, merged into the hub's dist/ at /apps/payment-tracking/ like every sibling embedded
// app (see repo root scripts/build-embedded-apps.js). Same URL paths as the Expo Router version this
// replaced (/apps/payment-tracking/upcoming/, /pending-approval/, ...), so links and bookmarks keep
// working.
const nextConfig = {
  output: 'export',
  basePath: '/apps/payment-tracking',
  assetPrefix: '/apps/payment-tracking',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  webpack: (config) => {
    // pdfjs-dist's legacy build (invoice-attachment compression, src/lib/pdfAttachment.ts) has a
    // Node-only `require("canvas")` fallback a browser never takes — stub it out of the bundle.
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
};

module.exports = nextConfig;
