'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import RequestPage from '@/components/material/RequestPage';

// Static export (served by the hub under /apps/mm-mdm/) cannot have a dynamic [id] segment,
// so the request id travels as a query parameter: /master/material/requests/view/?id=<TransId>.
function RequestById() {
  const id = useSearchParams().get('id') ?? '';
  return <RequestPage key={id} transId={id} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RequestById />
    </Suspense>
  );
}
