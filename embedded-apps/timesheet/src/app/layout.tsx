import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Serif } from 'next/font/google';
import './globals.css';
import Shell from '../components/Shell';
import { AppProvider } from '../context/AppContext';
import { ToastProvider } from '../context/ToastContext';

// The hub's own Expo app vendors these exact font files at build time via @expo-google-fonts
// (see src/theme/tokens.ts's `fonts` export + App.tsx's useFonts call) — next/font/google does
// the equivalent for this Next.js app: self-hosted at build time, no runtime request, same actual
// font family as the hub, not a stand-in (fm-po-deviation's own Next.js app mistakenly used Inter
// via an external @import instead — this fixes that for Timesheet).
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
  title: 'TimeSheet — Emami Apps',
  description: 'Log hours, track leave, and manage team approvals.',
  icons: { icon: '/apps/timesheet/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexSerif.variable}`}>
      <body className="font-sans">
        <ToastProvider>
          <AppProvider>
            <Shell>{children}</Shell>
          </AppProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
