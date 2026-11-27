import { Suspense } from 'react';
import PhMastersScreen from '@/components/admin/PhMastersScreen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PhMastersScreen />
    </Suspense>
  );
}
