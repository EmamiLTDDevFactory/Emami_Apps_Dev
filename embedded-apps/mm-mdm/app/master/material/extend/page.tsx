'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ExtensionStart } from '@/components/material/ChangeExtend';

function Inner() {
  return <ExtensionStart matnr={useSearchParams().get('matnr') ?? ''} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
