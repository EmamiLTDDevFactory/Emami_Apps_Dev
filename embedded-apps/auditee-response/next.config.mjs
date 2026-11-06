/** @type {import('next').NextConfig} */
// Static export merged into the hub's dist/ like every sibling app (repo root scripts/build-embedded-apps.js),
// served as plain files under /apps/auditee-response/. No Node server at runtime.
const basePath = '/apps/auditee-response';

// AUD_MODE unset (default): decided in the browser (src/lib/api.ts resolveMode): demo unless ?aud=live is used or the host is listed.
// AUD_MODE=demo: built-in sample data in the browser, no backend. AUD_MODE=live: every call goes to <api>/me/auditee (backend/auditeeResponse.js).
// AUD_API_BASE overrides the backend URL (default: <audit-capa-api>/dev-api/api on dev / localhost, /api on www, + /me/auditee).
const nextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_AUD_MODE: process.env.AUD_MODE ?? process.env.NEXT_PUBLIC_AUD_MODE ?? '',
    NEXT_PUBLIC_AUD_API_BASE: process.env.AUD_API_BASE ?? process.env.NEXT_PUBLIC_AUD_API_BASE ?? '',
  },
};

export default nextConfig;
