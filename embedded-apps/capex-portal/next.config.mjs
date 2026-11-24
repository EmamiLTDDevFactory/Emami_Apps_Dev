/** @type {import('next').NextConfig} */
// Static export merged into the hub's dist/ like every sibling app, served under /apps/capex-portal/. No Node server at runtime.
const basePath = '/apps/capex-portal';

// SAP is reached only through the Emami Apps backend (backend/capex.js -> ZCAPEX_PORTAL_SRV); the browser never calls SAP.
// CAPEX_API_BASE overrides the backend URL (default: audit-capa-api dev-api on dev / localhost, /api on www, + /me/capex).
const nextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_CAPEX_API_BASE: process.env.CAPEX_API_BASE ?? process.env.NEXT_PUBLIC_CAPEX_API_BASE ?? '',
  },
};
export default nextConfig;
