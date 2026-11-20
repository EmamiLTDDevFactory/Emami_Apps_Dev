import { Suspense } from 'react';
import WorklistScreen from '@/components/admin/WorklistScreen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <WorklistScreen />
    </Suspense>
  );
}
