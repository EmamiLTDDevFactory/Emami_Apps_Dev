import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BOM Cost Explorer',
  description: 'Explore, compare and simulate SAP BOM costing',
};

// Sets the theme class before first paint (no light flash in dark mode).
const themeScript = `(function(){try{var t=localStorage.getItem('bce-theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark')}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
