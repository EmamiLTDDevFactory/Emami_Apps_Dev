import type { Config } from 'tailwindcss';

// The hub's own palette shape (same structure as every sibling embedded app) with this app's own
// signature colors — taken directly from the current Expo app's styling (brand blue #005A9E, the
// status greens/reds/ambers/blues already used throughout every screen) so the Next.js port looks
// identical to the existing app, not like a reskin.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: '#005A9E',
        brandDeep: '#002E5D',
        brandLight: '#2563EB',
        ink: '#0F172A',
        inkSoft: '#475569',
        inkFaint: '#94A3B8',
        border: '#E2E8F0',
        line: '#F1F5F9',
        appBg: '#F8FAFC',
        cream: '#EFF6FF',
        green: '#059669',
        greenBg: '#D1FAE5',
        red: '#DC2626',
        redBg: '#FEE2E2',
        amber: '#D97706',
        amberBg: '#FEF3C7',
        blue: '#1D4ED8',
        blueBg: '#DBEAFE',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: { xl2: '16px' },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,0.05), 0 1px 1px rgba(15,23,42,0.03)',
        lift: '0 8px 20px -6px rgba(15,23,42,0.16)',
        pop: '0 24px 60px -12px rgba(15,23,42,0.40)',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        fadeIn: 'fadeIn 0.15s ease-out',
        slideUp: 'slideUp 0.2s ease-out',
      },
    },
  },
  plugins: [],
};
export default config;
