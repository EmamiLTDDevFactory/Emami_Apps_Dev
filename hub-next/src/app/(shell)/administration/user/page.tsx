'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/** The per-user Administration page is now Admin Center's person drawer — this keeps old
 * /administration/user?email=… links working by opening that drawer instead. */
function Redirect() {
  const router = useRouter();
  const email = useSearchParams().get('email');
  useEffect(() => {
    router.replace(email ? `/manage-access/?tab=people&user=${encodeURIComponent(email)}` : '/manage-access/?tab=people');
  }, [router, email]);
  return null;
}

export default function AdminUserRedirect() {
  return (
    <Suspense fallback={null}>
      <Redirect />
    </Suspense>
  );
}
