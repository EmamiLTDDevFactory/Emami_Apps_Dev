import type { Config } from 'tailwindcss';

// The hub's own palette (same values as every sibling embedded app) plus this app's signature:
// a deep "ledger" teal used for money and status, and a mono face for PO/vendor/invoice numbers.
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
        inkFaint: '#9CA3AF',
        border: '#E6E3F5',
        line: '#EEECF7',
        appBg: '#EEF0F4',
        cream: '#F6F4FD',
        ledger: '#0F766E',
        ledgerBg: '#E5F5F3',
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
        sans: ['Inter', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['10.5px', '14px'],
        xs: ['11.5px', '16px'],
        sm: ['12.5px', '18px'],
        base: ['13.5px', '20px'],
      },
      borderRadius: { xl2: '16px' },
      boxShadow: {
        card: '0 1px 2px rgba(31,27,51,0.05), 0 1px 1px rgba(31,27,51,0.03)',
        lift: '0 8px 20px -6px rgba(31,27,51,0.16)',
        pop: '0 24px 60px -12px rgba(21,17,41,0.40)',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideIn: { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(0)' } },
      },
      animation: {
        fadeIn: 'fadeIn 0.15s ease-out',
        slideUp: 'slideUp 0.2s ease-out',
        slideIn: 'slideIn 0.22s cubic-bezier(.2,.8,.2,1)',
      },
    },
  },
  plugins: [],
};
export default config;
