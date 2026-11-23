/**
 * Static export at /apps/publicity-expenses, merged into the hub's dist/ by scripts/build-embedded-apps.js like every
 * sibling embedded app. No server: the browser calls the shared Emami Apps backend (backend/publicityExpenses/,
 * /api/me/publicity-expenses), which reads SAP.
 *
 * @type {import('next').NextConfig}
 */
const basePath = '/apps/publicity-expenses';

export default {
  output: 'export',
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};
