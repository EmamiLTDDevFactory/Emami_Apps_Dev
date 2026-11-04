import type { Metadata } from 'next';
import './globals.css';
import { MdmProvider } from '@/lib/store';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Master Data Governance',
  description: 'SAP master data governance – create, change and delete workflows',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <MdmProvider>
          <AppShell>{children}</AppShell>
        </MdmProvider>
      </body>
    </html>
  );
}
