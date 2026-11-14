import type { Config } from 'tailwindcss';

// Hub palette (same values as every sibling embedded app's tailwind config / the hub's
// src/theme/tokens.ts), exposed as CSS variables in globals.css.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        panel: v('panel'),
        sunken: v('sunken'),
        line: v('line'),
        ink: v('ink'),
        muted: v('muted'),
        faint: v('faint'),
        accent: v('accent'),
        'accent-deep': v('accent-deep'),
        'accent-ink': v('accent-ink'),
        plum: v('plum'),
        'plum-deep': v('plum-deep'),
        good: v('good'),
        warn: v('warn'),
        bad: v('bad'),
        sim: v('sim'),
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: { '2xs': ['0.6875rem', '1rem'] },
      boxShadow: {
        card: '0 1px 3px rgba(31,27,51,0.06), 0 1px 2px rgba(31,27,51,0.04)',
        cardHover: '0 12px 24px rgba(31,27,51,0.12)',
        pop: '0 20px 50px rgba(21,17,41,0.35)',
        glow: '0 6px 20px rgba(79,63,214,0.28)',
        glowSim: '0 6px 20px rgba(194,24,91,0.25)',
      },
      keyframes: {
        slideUp: { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideIn: { '0%': { opacity: '0', transform: 'translateX(28px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        pageIn: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        slideUp: 'slideUp 0.2s ease-out',
        fadeIn: 'fadeIn 0.18s ease-out',
        slideIn: 'slideIn 0.22s cubic-bezier(0.16,1,0.3,1)',
        pageIn: 'pageIn 0.3s cubic-bezier(0.16,1,0.3,1)',
      },
    },
  },
  plugins: [],
};
export default config;
