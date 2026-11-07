'use client';
// Budget rate management: its own route, loaded on demand and only when NEXT_PUBLIC_BUDGET_RATE_MGMT_ENABLED is on.
import dynamic from 'next/dynamic';

const Screen = process.env.NEXT_PUBLIC_BUDGET_RATE_MGMT_ENABLED === 'true' ? dynamic(() => import('@/components/budget-mgmt/MgmtScreen'), { ssr: false }) : null;

export default function Page() {
  if (!Screen) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg p-4">
        <div className="max-w-md rounded-2xl border border-line bg-panel p-7 text-center shadow-card">
          <h1 className="text-lg font-extrabold">Budget rate management is not enabled</h1>
          <p className="mt-1 text-sm text-muted">This build was made without BUDGET_RATE_MGMT_ENABLED.</p>
        </div>
      </div>
    );
  }
  return <Screen />;
}
