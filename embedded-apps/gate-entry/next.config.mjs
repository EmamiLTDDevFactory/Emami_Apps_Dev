/**
 * Static export at /apps/gate-entry, merged into the hub's dist/ by scripts/build-embedded-apps.js like every
 * sibling embedded app. No server: the browser calls SAP (ZGATE_ENTRY_SRV) through the shared Azure gateway.
 *
 * @type {import('next').NextConfig}
 */
const basePath = '/apps/gate-entry';

export default {
  output: 'export',
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};
