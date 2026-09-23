import type { Config } from 'tailwindcss';

// Mirrors the hub's own palette (see the main app's src/theme/tokens.ts and every sibling embedded
// app's copy of it) so this app doesn't look like a foreign product bolted onto Emami Apps.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        rust: '#4F3FD6',
        rustDeep: '#3B2FB0',
        rustLight: '#6D5BF5',
        plum: '#241E3D',
        plumDeep: '#151129',
        ink: '#1F1B33',
        inkSoft: '#6B7280',
        border: '#E6E3F5',
        appBg: '#EEF0F4',
        cream: '#F6F4FD',
        green: '#1F7A4D',
        greenBg: '#E7F5EC',
        red: '#C0392B',
        redBg: '#FBEAE8',
        amber: '#B45309',
        amberBg: '#FDF3E3',
        blue: '#1D6FA5',
        blueBg: '#E7F1F8',
        teal: '#0F766E',
        tealBg: '#E5F5F3',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        xl2: '18px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(31,27,51,0.06), 0 1px 2px rgba(31,27,51,0.04)',
        cardHover: '0 12px 24px rgba(31,27,51,0.12)',
        pop: '0 20px 50px rgba(21,17,41,0.35)',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        fadeIn: 'fadeIn 0.2s ease-out',
        slideUp: 'slideUp 0.25s ease-out',
      },
    },
  },
  plugins: [],
};
export default config;
