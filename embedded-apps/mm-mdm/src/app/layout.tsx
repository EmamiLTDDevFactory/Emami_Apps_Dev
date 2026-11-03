import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/components/AppShell';
import { I18nProvider } from '@/i18n';

export const metadata: Metadata = {
  title: 'Material Master | Emami Apps',
  description: 'Create, review and approve material master requests',
  icons: { icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/emami-apps-logo.png` },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Same fonts as the sibling apps (Inter text, Sora headings), loaded by the browser like they do; the system fonts are the fallback. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <I18nProvider>
          <AppShell>{children}</AppShell>
        </I18nProvider>
      </body>
    </html>
  );
}
