/**
 * Static export at /apps/setu, merged into the hub's dist/ by scripts/build-embedded-apps.js like every
 * sibling embedded app. No server: the browser calls the shared Emami Apps backend (backend/setu.js, /api/setu).
 *
 * @type {import('next').NextConfig}
 */
const basePath = '/apps/setu';

export default {
  output: 'export',
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};
