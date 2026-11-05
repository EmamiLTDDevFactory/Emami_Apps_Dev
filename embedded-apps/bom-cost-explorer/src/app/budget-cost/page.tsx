'use client';
// Budget costing route: the screen is loaded with a dynamic import only when NEXT_PUBLIC_BUDGET_ENABLED is on (the condition is replaced at build time),
// so with the flag off no budget code reaches any bundle and no request is made.
import dynamic from 'next/dynamic';
import { BudgetDisabled } from '@/components/budget/BudgetDisabled';

const Screen = process.env.NEXT_PUBLIC_BUDGET_ENABLED === 'true' ? dynamic(() => import('@/components/budget/BudgetScreen'), { ssr: false }) : null;

export default function Page() {
  return Screen ? <Screen /> : <BudgetDisabled />;
}
