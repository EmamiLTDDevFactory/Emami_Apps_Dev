import type { Config } from 'tailwindcss';

// Mirrors the hub's own palette (see the main app's src/theme/tokens.ts) so this app doesn't look
// like a foreign product bolted onto Emami Apps — same colors fm-po-deviation/Timesheet already
// mirror, plus Timesheet's own glass layer (backdrop blur + translucent surfaces), reused here so
// this reads as Timesheet's sibling rather than a one-off.
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
        white: '#FFFFFF',
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
        glass: 'rgba(255,255,255,0.55)',
        glassRust: 'rgba(79,63,214,0.08)',
        glassBorder: 'rgba(230,227,245,0.6)',
      },
      fontFamily: {
        sans: ['var(--font-plex-sans)', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        serif: ['var(--font-plex-serif)', 'Georgia', 'serif'],
      },
      borderRadius: {
        sm: '8px',
        md: '10px',
        lg: '12px',
        xl: '14px',
        xl2: '16px',
        xl3: '18px',
      },
      backdropBlur: {
        glass: '12px',
        glassHeavy: '20px',
      },
      boxShadow: {
        xs: '0 1px 4px rgba(21,17,41,0.08)',
        card: '0 4px 10px rgba(21,17,41,0.10)',
        cardHover: '0 10px 24px rgba(21,17,41,0.14)',
        pop: '0 20px 50px rgba(21,17,41,0.35)',
        glow: '0 0 40px rgba(79,63,214,0.15)',
        glowLg: '0 0 60px rgba(79,63,214,0.20)',
        glassCard: '0 4px 10px rgba(21,17,41,0.10), 0 0 40px rgba(79,63,214,0.15)',
        glassCardHover: '0 10px 24px rgba(21,17,41,0.14), 0 0 50px rgba(79,63,214,0.20)',
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
