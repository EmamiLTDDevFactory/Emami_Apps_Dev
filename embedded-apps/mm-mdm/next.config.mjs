/** @type {import('next').NextConfig} */
// Static export merged into the hub's dist/ like every sibling app (repo root scripts/build-embedded-apps.js),
// served as plain files under /apps/mm-mdm/. No Node server at runtime.
const basePath = '/apps/mm-mdm';

// MM_MODE unset (default): decided in the browser (src/lib/api.ts resolveMode): the dev host runs live, everything else the demo.
// MM_MODE=demo: built-in demo data and rules run in the browser, no SAP needed.
// MM_MODE=live: every call goes to the Emami Apps backend (backend/mmMdm.js, <api>/me/mm-mdm), which holds the SAP connection.
// MM_API_BASE overrides the backend URL (default: <audit-capa-api>/dev-api/api on dev / localhost, /api on www, + /me/mm-mdm).
const nextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_MM_MODE: process.env.MM_MODE ?? process.env.NEXT_PUBLIC_MM_MODE ?? '',
    NEXT_PUBLIC_MM_API_BASE: process.env.MM_API_BASE ?? process.env.NEXT_PUBLIC_MM_API_BASE ?? '',
    NEXT_PUBLIC_HD_MEANS_SHOWN: process.env.NEXT_PUBLIC_HD_MEANS_SHOWN ?? 'true',
  },
};

export default nextConfig;
