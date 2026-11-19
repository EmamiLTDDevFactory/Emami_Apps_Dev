'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChangeStart } from '@/components/material/ChangeExtend';

// Static export: no dynamic segment, so the material travels as ?matnr=
function Inner() {
  return <ChangeStart matnr={useSearchParams().get('matnr') ?? ''} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
