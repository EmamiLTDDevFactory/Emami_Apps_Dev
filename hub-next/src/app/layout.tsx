import type { Metadata } from 'next';
import localFont from 'next/font/local';
import Providers from '../components/Providers';
import './globals.css';

// Montserrat everywhere (sans and the former serif tokens alike), matching the reference Emami
// Apps home screen's typeface. Self-hosted (variable font, latin, weights 100-900, OFL-1.1, from
// @fontsource-variable/montserrat 5.3.0) instead of next/font/google: the Google loader downloads
// the font CSS at BUILD time, and on Amplify that download failed ("An error occurred in next/font
// ... Cannot read properties of null (reading '1')"), failing the whole PRD build. Same CSS
// variable, same preload / fallback metrics, no network at build time.
const montserrat = localFont({
  src: './fonts/montserrat-latin-wght-normal.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--font-montserrat',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Emami Apps',
  description:
    "Emami Apps is the single sign-on portal for Emami Group's internal business applications — including Non CTC Expense, RC Portal, Dispatch Tracker, and MoldHealthCheck. Sign in with your Emami work account.",
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.png',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'Emami Apps',
  },
  openGraph: {
    title: 'Emami Apps – Emami Group Employee Portal',
    description: "Single sign-on portal for Emami Group's internal business applications.",
    url: 'https://www.emamiapps.in/',
    type: 'website',
    siteName: 'Emami Apps',
  },
  alternates: {
    canonical: 'https://www.emamiapps.in/',
  },
};

export const viewport = {
  themeColor: '#241E3D',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={montserrat.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
