/** @type {import('next').NextConfig} */
// Static export merged into the hub's dist/ like every sibling app (repo root scripts/build-embedded-apps.js),
// served as plain files under /apps/order-to-cash/. No Node server at runtime.
const basePath = '/apps/order-to-cash';

// SAP (RFC Z_SD_O2C_ACTION) and the PO-reading AI are reached only through the Emami Apps backend (backend/orderToCash.js);
// the browser never calls SAP and holds no key. O2C_API_BASE overrides the backend URL
// (default: <audit-capa-api>/dev-api/api on dev / localhost, /api on www, + /me/order-to-cash).
const nextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_O2C_API_BASE: process.env.O2C_API_BASE ?? process.env.NEXT_PUBLIC_O2C_API_BASE ?? '',
  },
};

export default nextConfig;
