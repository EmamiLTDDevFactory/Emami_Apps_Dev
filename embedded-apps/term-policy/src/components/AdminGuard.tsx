'use client';

import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';

/** HR administrators only (flag R in ZMEDI_AUTH_USERS). SAP enforces the same rule on every call; this only avoids showing a screen that cannot work. */
export default function AdminGuard({ maint, children }: { maint?: boolean; children: React.ReactNode }) {
  const { isAdmin, canMaintain, loading } = useApp();
  if (loading) {
    return <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-rust border-t-transparent" /></div>;
  }
  if (!(maint ? canMaintain : isAdmin)) {
    return (
      <div className="glass-card p-6 text-center">
        <ShieldCheck className="mx-auto mb-2 text-inkSoft" />
        <p className="text-[13px] font-bold text-ink">Not authorised</p>
        <p className="mt-1 text-[12px] text-inkSoft">Only HR administrators can use this tab. If you need access, ask HR to add you to the authorised users.</p>
        <Link href="/" className="btn btn-primary mt-3 inline-flex">Back to my policy</Link>
      </div>
    );
  }
  return <>{children}</>;
}
