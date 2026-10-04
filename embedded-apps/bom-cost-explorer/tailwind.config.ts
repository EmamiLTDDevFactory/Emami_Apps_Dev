import type { Config } from 'tailwindcss';

// Colours are CSS variables (globals.css) so light/dark is one class flip on <html>.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'class',
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
        'accent-ink': v('accent-ink'),
        good: v('good'),
        warn: v('warn'),
        bad: v('bad'),
        sim: v('sim'),
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: { '2xs': ['0.6875rem', '1rem'] },
    },
  },
  plugins: [],
};
export default config;
