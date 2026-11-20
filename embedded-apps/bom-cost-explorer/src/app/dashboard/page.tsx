'use client';
// Costing dashboard: its own route, loaded on demand and only when NEXT_PUBLIC_DASH_ENABLED is on.
import dynamic from 'next/dynamic';

const Screen = process.env.NEXT_PUBLIC_DASH_ENABLED === 'true' ? dynamic(() => import('@/components/dash/DashScreen'), { ssr: false }) : null;

export default function Page() {
  if (!Screen) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg p-4">
        <div className="max-w-md rounded-2xl border border-line bg-panel p-7 text-center shadow-card">
          <h1 className="text-lg font-extrabold">Costing dashboard is not enabled</h1>
          <p className="mt-1 text-sm text-muted">This build was made without DASH_ENABLED.</p>
        </div>
      </div>
    );
  }
  return <Screen />;
}
