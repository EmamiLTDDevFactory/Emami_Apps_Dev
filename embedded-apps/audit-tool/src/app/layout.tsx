import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Serif } from 'next/font/google';
import './globals.css';
import Shell from '../components/Shell';

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
  title: 'Audit Tool — Emami Apps',
  description: 'MSD internal audit — masters, checklist, scheduling, kickoff, observations and MIS reporting.',
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
