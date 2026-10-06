/**
 * Static export at /apps/sap-agent, merged into the hub's dist/ by scripts/build-embedded-apps.js like
 * every sibling embedded app. The agent itself runs in server/ (Python, PM2 on 172.17.2.21): it holds
 * the SAP and Anthropic credentials and is the only thing that talks to SAP.
 *
 * @type {import('next').NextConfig}
 */
const basePath = '/apps/sap-agent';

export default {
  output: 'export',
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};
