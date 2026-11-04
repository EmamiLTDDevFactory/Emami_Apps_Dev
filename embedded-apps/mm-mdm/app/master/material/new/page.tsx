import { Suspense } from 'react';
import NewRequest from '@/components/material/NewRequest';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <NewRequest />
    </Suspense>
  );
}
