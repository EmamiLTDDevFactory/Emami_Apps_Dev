'use client';
// Production Plan route: the screen is loaded with a dynamic import only when PLAN_MODULE_ENABLED, so the
// plan code never lands in the costing bundles and a disabled build makes no plan requests.
import dynamic from 'next/dynamic';
import { PLAN_MODULE_ENABLED } from '@/lib/plan/flag';
import { PlanDisabled } from '@/components/plan/PlanFrame';

const Screen = PLAN_MODULE_ENABLED ? dynamic(() => import('@/components/plan/PlansPage'), { ssr: false }) : null;

export default function Page() {
  return Screen ? <Screen /> : <PlanDisabled />;
}
