/** @type {import('next').NextConfig} */
// Static export so this merges into the hub's dist/ the same way every other embedded app does
// (see repo root scripts/build-embedded-apps.js) — no Node server at runtime, served as plain
// static files under /apps/shelf-life-deviation/ by Amplify, same hosting model as every sibling
// app. basePath/assetPrefix make every internal link and asset resolve correctly at that path
// instead of the site root.
const nextConfig = {
  output: 'export',
  basePath: '/apps/shelf-life-deviation',
  assetPrefix: '/apps/shelf-life-deviation',
  trailingSlash: true,
  images: {
    // next/image's optimization API needs a server — unavailable on static export.
    unoptimized: true,
  },
  reactStrictMode: true,
};

module.exports = nextConfig;
