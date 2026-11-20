import { Suspense } from 'react';
import RulesScreen from '@/components/admin/RulesScreen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RulesScreen />
    </Suspense>
  );
}
