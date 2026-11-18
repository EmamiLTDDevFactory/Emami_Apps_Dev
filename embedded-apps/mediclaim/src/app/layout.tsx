import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import Shell from '../components/Shell';

// Self-hosted IBM Plex (latin, OFL-1.1, from @fontsource 5.3.0) instead of next/font/google: the
// Google loader downloads font CSS at BUILD time and failed on Amplify ("An error occurred in
// next/font ... Cannot read properties of null (reading '1')"). Same CSS variables, no build network.
const plexSans = localFont({
  src: [
    { path: './fonts/ibm-plex-sans-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/ibm-plex-sans-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/ibm-plex-sans-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/ibm-plex-sans-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-plex-sans',
  display: 'swap',
});
const plexSerif = localFont({
  src: [
    { path: './fonts/ibm-plex-serif-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/ibm-plex-serif-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-plex-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Mediclaim — Emami Apps',
  description: 'Enrol in, view and manage the Emami Mediclaim policy.',
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
