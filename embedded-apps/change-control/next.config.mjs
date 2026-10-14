/**
 * Static export at /apps/change-control, merged into the hub's dist/ by scripts/build-embedded-apps.js like every
 * sibling embedded app. No server: the browser calls the hub backend's /change-control routes (backend/changeControl.js).
 *
 * @type {import('next').NextConfig}
 */
const basePath = '/apps/change-control';

export default {
  output: 'export',
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};
