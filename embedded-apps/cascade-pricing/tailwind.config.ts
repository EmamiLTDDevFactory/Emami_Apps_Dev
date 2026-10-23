import type { Config } from 'tailwindcss';

// SAP-style: light grey headers, small type, compact rows; Emami plum as the accent.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        plum: { DEFAULT: '#5B2A86', deep: '#3F1C5E', soft: '#F3EDF9' },
        sap: { head: '#EEF1F4', line: '#D9DEE3', row: '#F7F9FA', ink: '#1D2D3E', muted: '#5B6B7C' },
      },
      fontSize: { '2xs': ['10.5px', '14px'] },
    },
  },
  plugins: [],
};
export default config;
