import type { Metadata } from 'next';
import './globals.css';
import Shell from '../components/Shell';

export const metadata: Metadata = {
  title: 'IBD Provision Tracking',
  description: 'Track every open service PO — provisions, approvals, SES and payments.',
  icons: { icon: '/apps/payment-tracking/emami-apps-logo.png' },
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
