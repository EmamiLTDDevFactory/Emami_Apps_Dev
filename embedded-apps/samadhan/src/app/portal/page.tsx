import type { Metadata } from 'next';
import Portal from '@/components/Portal';

export const metadata: Metadata = {
  title: 'Emami Service Desk',
  description: 'Raise a support ticket with the Emami Service Desk, or check the status of one you raised',
};

export default function PortalPage() {
  return <Portal />;
}
