import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Credit Risk Advisory — Emami Apps',
  description: 'Credit risk advisory command center with SAP Gateway OData V2 integration.',
  icons: { icon: '/apps/credit-risk-advisory/emami-apps-logo.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
