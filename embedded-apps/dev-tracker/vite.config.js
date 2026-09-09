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
