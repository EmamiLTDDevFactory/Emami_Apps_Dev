'use client';
import dynamic from 'next/dynamic';
import { BudgetDisabled } from '@/components/budget/BudgetDisabled';

const Screen = process.env.NEXT_PUBLIC_BUDGET_ENABLED === 'true' ? dynamic(() => import('@/components/budget/BudgetApprovals'), { ssr: false }) : null;

export default function Page() {
  return Screen ? <Screen /> : <BudgetDisabled />;
}
