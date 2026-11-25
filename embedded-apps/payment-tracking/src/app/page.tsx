'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePaymentTrackingAuth } from '../context/PaymentTrackingAuthContext';
import { LoadingBlock } from '../components/ui';
import { navItemsFor } from '../components/Shell';

/** The app root isn't a screen for any role — it sends each role to its own first nav item, same as
 * the Expo version: Admin → Dashboard, Finance → Pending Approval, User → Upcoming Provision. */
export default function ProvisionHome() {
  const router = useRouter();
  const { role, tiles, roleLoading } = usePaymentTrackingAuth();
  useEffect(() => {
    if (roleLoading) return;
    // The role's own first screen, or the first one the person's screen limit leaves.
    const first = role === 'Admin' || role === 'Super Admin' ? '/dashboard/' : role === 'Finance' ? '/pending-approval/' : '/upcoming/';
    const open = navItemsFor(role, tiles);
    router.replace(open.some((i) => i.href === first) || open.length === 0 ? first : open[0].href);
  }, [role, tiles, roleLoading, router]);
  return <LoadingBlock />;
}
