/** @type {import('next').NextConfig} */
// Static export merged into the hub's dist/ like every sibling app (repo root scripts/build-embedded-apps.js),
// served as plain files under /apps/mm-mdm/. No Node server at runtime; every screen reads and writes live SAP data through the hub backend (<api>/me/mm-mdm), nothing is stored in the browser.
const basePath = '/apps/mm-mdm';

const nextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
