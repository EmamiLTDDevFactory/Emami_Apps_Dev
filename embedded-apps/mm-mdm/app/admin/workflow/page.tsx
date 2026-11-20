import { Suspense } from 'react';
import WorkflowAdminScreen from '@/components/admin/WorkflowAdminScreen';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <WorkflowAdminScreen />
    </Suspense>
  );
}
