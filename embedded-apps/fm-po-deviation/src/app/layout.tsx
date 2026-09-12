import type { Metadata } from 'next';
import './globals.css';
import Shell from '../components/Shell';

export const metadata: Metadata = {
  title: 'PO Deviation Approval — Emami Apps',
  description: 'Review, approve, or reject purchase order deviations.',
  icons: { icon: '/apps/fm-po-deviation/emami-apps-logo.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
