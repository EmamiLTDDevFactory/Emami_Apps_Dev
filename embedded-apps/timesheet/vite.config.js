import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Same reasoning as embedded-apps/rc-portal's vite.config.js: once merged into the EmamiApps
  // hub's own web build, this app is served same-origin at /apps/timesheet (see
  // scripts/build-embedded-apps.js + src/data/mockData.ts on the hub), so every asset/route
  // reference Vite emits needs this prefix baked in.
  base: '/apps/timesheet/',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
