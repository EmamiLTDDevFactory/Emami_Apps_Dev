import type { Metadata } from 'next';
import './globals.css';
import Shell from '../components/Shell';

export const metadata: Metadata = {
  title: 'Rate Auction — Emami Apps',
  description: 'Live reverse auction for material and freight rates, with anonymous vendor bidding.',
  icons: { icon: '/apps/rate-auction/emami-apps-logo.png' },
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
