import type { Metadata } from 'next';
import React from 'react';
import { AuthProvider } from '../context/AuthContext';
import { ClaimProvider } from '../context/ClaimContext';
import { Shell } from '../components/Shell';
import './globals.css';

export const metadata: Metadata = {
  title: 'Non CTC Expense',
  // Next's basePath-aware asset prefixing means this resolves correctly under /apps/expense/
  // automatically — no custom favicon workaround needed (unlike the Expo version's +html.tsx
  // override), per the research into how Next.js handles this.
  icons: { icon: '/favicon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <ClaimProvider>
            <Shell>{children}</Shell>
          </ClaimProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
