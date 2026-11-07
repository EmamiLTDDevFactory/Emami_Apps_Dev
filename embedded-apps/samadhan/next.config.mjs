/**
 * Static export at /apps/samadhan, merged into the hub's dist/ by scripts/build-embedded-apps.js like every
 * sibling embedded app. No server: the browser calls the shared Emami Apps backend (backend/samadhan/, /api/samadhan).
 *
 * @type {import('next').NextConfig}
 */
const basePath = '/apps/samadhan';

export default {
  output: 'export',
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};
