import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CashFlow Intelligence — Emami Apps',
  description: 'AI cash flow forecast dashboard with SAP Gateway OData V2 integration.',
  icons: { icon: '/apps/cashflow-forecast/emami-apps-logo.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
