import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/components/AppShell';
import { I18nProvider } from '@/i18n';

export const metadata: Metadata = { title: 'Material master requests', description: 'Create and approve material master requests' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <I18nProvider>
          <AppShell>{children}</AppShell>
        </I18nProvider>
      </body>
    </html>
  );
}
