/** @type {import('next').NextConfig} */
// Static export, same hosting model this repo already uses for every embedded app (see
// embedded-apps/*/next.config.js) — no Node server at runtime. Unlike an embedded app this one
// has no basePath: it serves from the site root, replacing today's Expo web export in dist/ (see
// root scripts/build-embedded-apps.js and amplify.yml) once the cutover happens. Until then this
// builds independently into hub-next/out/ and isn't wired into that pipeline yet.
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    // next/image's optimization API needs a server — unavailable on static export.
    unoptimized: true,
  },
  reactStrictMode: true,
};

module.exports = nextConfig;
