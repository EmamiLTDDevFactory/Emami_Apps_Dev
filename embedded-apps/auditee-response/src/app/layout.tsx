import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Auditee Response | Emami Apps',
  description: 'Answer the internal audit and MIS observations assigned to you and submit them to the reviewer',
  icons: { icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/emami-apps-logo.png` },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Same fonts as the sibling apps (Inter text, Sora headings); the system fonts are the fallback. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
