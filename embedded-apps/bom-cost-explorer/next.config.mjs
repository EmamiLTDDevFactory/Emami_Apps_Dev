/**
 * One codebase, two builds:
 *
 *  - `npm run build` (BUILD_TARGET=static) - what the repo's scripts/build-embedded-apps.js runs on
 *    Amplify: a static export of the UI at /apps/bom-cost-explorer, merged into the hub's dist/
 *    like every sibling embedded app (and shown as a hub tile). pageExtensions ['tsx'] leaves the
 *    `.ts` Route Handlers (src/app/api/**\/route.ts) and middleware.ts out of this build.
 *
 *  - `npm run build:server` - the BFF: the same app with its Route Handlers, as a standalone Node
 *    server for the 172.17.2.21 PM2 box. SAP is only ever called from here, never the browser.
 *
 * @type {import('next').NextConfig}
 */
const STATIC = process.env.BUILD_TARGET === 'static';
const basePath = STATIC ? '/apps/bom-cost-explorer' : process.env.BASE_PATH || '';

const nextConfig = STATIC
  ? {
      output: 'export',
      basePath,
      assetPrefix: basePath,
      trailingSlash: true,
      pageExtensions: ['tsx', 'jsx'], // two entries: Next 14's app loader breaks on a one-element list
      images: { unoptimized: true },
      reactStrictMode: true,
      env: { NEXT_PUBLIC_BASE_PATH: basePath, NEXT_PUBLIC_BUILD_TARGET: 'static' },
    }
  : {
      output: 'standalone',
      basePath,
      pageExtensions: ['tsx', 'ts'],
      reactStrictMode: true,
      poweredByHeader: false,
      env: { NEXT_PUBLIC_BASE_PATH: basePath, NEXT_PUBLIC_BUILD_TARGET: 'server' },
    };

export default nextConfig;
