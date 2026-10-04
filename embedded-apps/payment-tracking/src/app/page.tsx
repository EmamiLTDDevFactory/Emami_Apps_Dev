'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePaymentTrackingAuth } from '../context/PaymentTrackingAuthContext';
import { LoadingBlock } from '../components/ui';

/** The app root isn't a screen for any role — it sends each role to its own first nav item, same as
 * the Expo version: Admin → Dashboard, Finance → Pending Approval, User → Upcoming Provision. */
export default function ProvisionHome() {
  const router = useRouter();
  const { role, roleLoading } = usePaymentTrackingAuth();
  useEffect(() => {
    if (roleLoading) return;
    router.replace(role === 'Admin' ? '/dashboard/' : role === 'Finance' ? '/pending-approval/' : '/upcoming/');
  }, [role, roleLoading, router]);
  return <LoadingBlock />;
}
