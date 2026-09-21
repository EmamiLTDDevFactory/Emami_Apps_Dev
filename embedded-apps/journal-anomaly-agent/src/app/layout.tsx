import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Journal Entry & GL Anomaly Agent — Emami Apps',
  description: 'AI journal entry and GL anomaly monitoring with SAP Gateway OData V2 integration.',
  icons: { icon: '/apps/journal-anomaly-agent/emami-apps-logo.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
