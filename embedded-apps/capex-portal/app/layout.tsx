import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import Shell from '@/components/Shell';

export const metadata: Metadata = {
  title: 'CAPEX Portal | Emami Apps',
  description: 'Capital expenditure: budget, CPE, DOA approval, CWIP / PO, installation certificate and capitalization (SAP ZCAPEX_PORTAL_SRV).',
  icons: { icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/emami-apps-logo.png` },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased"><Shell>{children}</Shell></body>
    </html>
  );
}
