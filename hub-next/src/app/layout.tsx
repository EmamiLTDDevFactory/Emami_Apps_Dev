import type { Metadata } from 'next';
import { Montserrat } from 'next/font/google';
import Providers from '../components/Providers';
import './globals.css';

// Montserrat everywhere (sans and the former serif tokens alike), matching the reference Emami
// Apps home screen's typeface.
const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
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
