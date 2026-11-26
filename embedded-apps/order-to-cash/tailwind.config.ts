import type { Config } from 'tailwindcss';

// Hub palette (same values as the hub's src/theme/tokens.ts and every sibling app, e.g. Costing Cockpit), so this app looks
// like the rest of Emami Apps. The app's own names map onto it: plum = the hub accent (buttons, selection, active nav),
// sap-* = the hub's light lines / headers / ink; brand = the hub's plum bar.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Costing Cockpit palette: indigo accent, navy table headers / banner, orange call-to-action.
        plum: { DEFAULT: '#4338CA', deep: '#312E81', soft: '#EEF0FB' },
        brand: { DEFAULT: '#1E2470', deep: '#12164A' },
        navy: '#2D2B78',
        orange: '#F97316',
        sap: { head: '#F4F6FC', line: '#E2E7F3', row: '#F8F9FD', ink: '#161B3A', muted: '#646C86', bg: '#F3F5FB' },
      },
      fontFamily: {
        sans: ['Manrope', 'Inter', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Manrope', 'Inter', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: { '2xs': ['10.5px', '14px'] },
      boxShadow: {
        card: '0 1px 2px rgba(22,27,58,0.05), 0 4px 14px rgba(22,27,58,0.05)',
        pop: '0 20px 50px rgba(21,17,41,0.35)',
        glow: '0 6px 18px rgba(67,56,202,0.30)',
      },
    },
  },
  plugins: [],
};
export default config;
