/**
 * Static export at /apps/access-tracker, merged into the hub's dist/ by scripts/build-embedded-apps.js like every
 * sibling embedded app. No server: the browser reads the hub backend's admin endpoints directly.
 *
 * @type {import('next').NextConfig}
 */
const basePath = '/apps/access-tracker';

export default {
  output: 'export',
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};
