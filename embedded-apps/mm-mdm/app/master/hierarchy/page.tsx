import { Suspense } from 'react';
import HierarchyCrs from '@/components/setup/HierarchyCrs';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <HierarchyCrs />
    </Suspense>
  );
}
