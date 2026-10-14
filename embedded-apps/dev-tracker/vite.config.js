import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Dev Tracker is one of several "embedded apps" served under /apps/dev-tracker/
// by the Emami Apps hub (see repo root scripts/build-embedded-apps.js). The hub
// expects a folder-based static build at dist/apps/dev-tracker/ with each page
// as its own index.html (dashboard/index.html, admin/index.html,
// resource-utilization/index.html) — this config reproduces that exact shape,
// just with each entry now being a small React app instead of hand-written JS.
export default defineConfig({
  plugins: [react()],
  base: '/apps/dev-tracker/',
  // The old vanilla-JS app's leftover public/*.html (admin.html, dashboard.html,
  // resource-utilization.html) are unused by this React build, but Vite copies the
  // whole public/ dir into outDir by default — landing those flat files right next
  // to the new admin/index.html etc. The hub's build-embedded-apps.js then "helpfully"
  // renames any stray flat name.html into name/index.html, silently overwriting the
  // real React page with the old one (fs.renameSync clobbers an existing destination).
  // Disabling publicDir avoids that collision entirely; nothing here references a
  // public/ asset (no favicon, no static image) so there's nothing to lose.
  publicDir: false,
  build: {
    outDir: 'dist/apps/dev-tracker',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        dashboard: resolve(__dirname, 'dashboard/index.html'),
        admin: resolve(__dirname, 'admin/index.html'),
        resourceUtilization: resolve(__dirname, 'resource-utilization/index.html'),
        qaSupport: resolve(__dirname, 'qa-support/index.html'),
        changeLog: resolve(__dirname, 'change-log/index.html'),
        importCenter: resolve(__dirname, 'import-center/index.html'),
        settings: resolve(__dirname, 'settings/index.html'),
        ccbOverview: resolve(__dirname, 'ccb/index.html'),
        ccbRequests: resolve(__dirname, 'ccb/requests/index.html'),
        ccbMeetings: resolve(__dirname, 'ccb/meetings/index.html'),
        ccbGovernance: resolve(__dirname, 'ccb/governance/index.html'),
      },
    },
  },
  server: {
    port: 8081,
    // The API's CORS allowlist only covers the real hub origin, not a local `npm run dev`
    // origin — every fetch would otherwise fail with a CORS error and pages would render
    // their "couldn't load data" empty state. Proxying same-origin here sidesteps that: the
    // browser sees a same-origin request, and this Node-side proxy hop isn't subject to CORS.
    proxy: {
      '/api': {
        target: 'https://audit-capa-api.emamiapps.in',
        changeOrigin: true,
      },
    },
  },
});
