import { Suspense } from 'react';
import DashboardScreen from '@/components/admin/DashboardScreen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DashboardScreen />
    </Suspense>
  );
}
