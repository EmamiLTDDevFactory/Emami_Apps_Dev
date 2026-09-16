import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Serif } from 'next/font/google';
import './globals.css';
import Shell from '../components/Shell';

// Self-hosted at build time via next/font/google — same actual font family the hub itself vendors
// through @expo-google-fonts (see src/theme/tokens.ts), matching Timesheet's own layout.tsx setup
// rather than fm-po-deviation's older Inter mismatch.
const plexSans = IBM_Plex_Sans({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-plex-sans',
  display: 'swap',
});
const plexSerif = IBM_Plex_Serif({
  weight: ['500', '600'],
  subsets: ['latin'],
  variable: '--font-plex-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Mediclaim & Term Policy — Emami Apps',
  description: 'Submit and manage your Mediclaim and Term Life insurance policy details.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexSerif.variable}`}>
      <body className="font-sans">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
