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
      },
    },
  },
  server: {
    port: 8081,
  },
});
