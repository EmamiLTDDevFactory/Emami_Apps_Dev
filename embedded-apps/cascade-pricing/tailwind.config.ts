import type { Config } from 'tailwindcss';

// Hub palette (same values as the hub's src/theme/tokens.ts and every sibling app, e.g. Costing Cockpit), so this app looks
// like the rest of Emami Apps. The app's own names map onto it: plum = the hub accent (buttons, selection, active nav),
// sap-* = the hub's light lines / headers / ink; brand = the hub's plum bar.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        plum: { DEFAULT: '#4F3FD6', deep: '#3B2FB0', soft: '#EFECFC' },
        brand: { DEFAULT: '#241E3D', deep: '#151129' },
        sap: { head: '#F6F4FD', line: '#E6E3F5', row: '#FBFAFE', ink: '#1F1B33', muted: '#6B7280', bg: '#EEF0F4' },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Sora', 'Inter', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: { '2xs': ['10.5px', '14px'] },
      boxShadow: {
        card: '0 1px 3px rgba(31,27,51,0.06), 0 1px 2px rgba(31,27,51,0.04)',
        pop: '0 20px 50px rgba(21,17,41,0.35)',
      },
    },
  },
  plugins: [],
};
export default config;
