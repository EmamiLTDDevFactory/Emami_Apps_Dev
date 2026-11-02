import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import Shell from '../components/Shell';
import { AppProvider } from '../context/AppContext';
import { ToastProvider } from '../context/ToastContext';

// The hub's own Expo app vendors these exact font files at build time via @expo-google-fonts
// (see src/theme/tokens.ts's `fonts` export + App.tsx's useFonts call) — next/font/google does
// the equivalent for this Next.js app: self-hosted at build time, no runtime request, same actual
// font family as the hub, not a stand-in (fm-po-deviation's own Next.js app mistakenly used Inter
// via an external @import instead — this fixes that for Timesheet).
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
  title: 'TimeSheet — Emami Apps',
  description: 'Log hours, track leave, and manage team approvals.',
  icons: { icon: '/apps/timesheet/favicon.png' },
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
