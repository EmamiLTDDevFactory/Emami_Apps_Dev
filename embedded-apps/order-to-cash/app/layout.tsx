import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Order to Cash | Emami Apps',
  description: 'Customer PO to cash: AI PO capture, SAP validation and exceptions, sales order creation, fulfilment, invoices, cash application, deductions and disputes.',
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
