'use client';

import Link from 'next/link';
import { useApp } from '../context/AppContext';

/** Admin screens: IsAuthUser or IsHrAdmin from ContextSet; `hrOnly` screens need IsHrAdmin (SAP enforces it again on every call). */
export default function AdminGuard({ hrOnly, maint, children }: { hrOnly?: boolean; maint?: boolean; children: React.ReactNode }) {
  const { canAdmin, isHrAdmin, canMaintain } = useApp();
  if (maint ? canMaintain : hrOnly ? isHrAdmin : canAdmin) return <>{children}</>;
  return (
    <div className="glass-card mx-auto max-w-sm p-4 text-center">
      <p className="text-[13px] font-semibold text-ink">{hrOnly ? 'HR admins only' : 'Authorised users only'}</p>
      <p className="mt-1 text-[12px] text-inkSoft">
        {hrOnly ? 'This screen is for HR administrators.' : 'You are not an authorised Mediclaim user.'} Contact the HR team if you need access.
      </p>
      <Link href="/" className="btn-primary mt-3 !px-3 !py-1.5 text-[12.5px]">Back to My Mediclaim</Link>
    </div>
  );
}
