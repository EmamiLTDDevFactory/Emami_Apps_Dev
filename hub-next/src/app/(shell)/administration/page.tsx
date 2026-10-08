'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Administration now lives inside Admin Center (/manage-access) — kept only so old links and
 * bookmarks land on its Overview tab. */
export default function AdministrationRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/manage-access/?tab=overview');
  }, [router]);
  return null;
}
