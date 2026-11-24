'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import BudgetApproval from '@/components/approvals/BudgetApproval';
import CpeApproval from '@/components/approvals/CpeApproval';
import { Card, PageHeader, Spinner } from '@/components/ui';

/** /approvals/detail/?type=CPE|BUD&id=... (Fiori: ApprovalDetail for CPE, BudgetApprovalDetail for BUD). */
function Inner() {
  const p = useSearchParams();
  const id = (p.get('id') || '').trim();
  const type = (p.get('type') || 'CPE').toUpperCase();
  if (!id) return <><PageHeader title="Approval" back={{ href: '/approvals/', label: 'My Approvals' }} /><Card><p className="text-[12px] text-sap-muted">No document selected. Open one from My Approvals.</p></Card></>;
  return type === 'BUD' ? <BudgetApproval key={id} id={id} /> : <CpeApproval key={id} id={id} />;
}
export default function Page() { return <Suspense fallback={<Spinner />}><Inner /></Suspense>; }
