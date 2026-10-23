import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cascade Pricing | Emami Apps',
  description: 'Export price cascade from RRP to CIF: rate upload, pricing simulation, approval and condition creation (ZMM_CASCADE_PRICING).',
  icons: { icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/emami-apps-logo.png` },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
