import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Embedded in the Emami Apps hub. scripts/build-embedded-apps.js runs this
// app's own `npm run build` and merges the resulting dist/ into the hub's
// dist/ at dist/apps/timesheet/, so every asset, script and stylesheet
// reference has to be prefixed with that path — exactly what `base` does
// here, same as embedded-apps/rc-portal.
//
// The dev proxy below is untouched, so `npm run dev` in this folder still
// works standalone against a local API on :4000.
// https://vite.dev/config/
export default defineConfig({
  base: '/apps/timesheet/',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
