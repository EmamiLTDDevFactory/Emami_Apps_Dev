import type { Metadata } from 'next';
import './globals.css';
import Shell from '../components/Shell';

export const metadata: Metadata = {
  title: 'SmarTruck TMS — Emami Apps',
  description: 'Transport management: orders, bidding, live tracking, ePOD, carrier invoicing and reports.',
  icons: { icon: '/apps/smartruck-tms/emami-apps-logo.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body><Shell>{children}</Shell></body></html>);
}
