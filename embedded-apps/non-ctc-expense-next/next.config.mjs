/** @type {import('next').NextConfig} */
// Static export, merged into the hub's dist/ at /apps/expense/ — SAME URL the current Expo Router
// version uses (hub-next/src/data/mockData.ts's EMBEDDED_APP_URLS.expense already maps here), so
// the hub's registry and every existing bookmark/link keep working unchanged. See repo root
// scripts/build-embedded-apps.js: a Next.js export with basePath has no dist/apps/ subfolder, so
// it auto-detects as "baseUrl-based" and gets nested under dist/apps/expense/ automatically.
const basePath = '/apps/expense';

const nextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  webpack: (config) => {
    // pdfjs-dist's legacy build (PDF attachment compression, src/lib/pdfAttachment.ts) has a
    // Node-only `require("canvas")` fallback a browser never takes — stub it out of the bundle.
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
};

export default nextConfig;
