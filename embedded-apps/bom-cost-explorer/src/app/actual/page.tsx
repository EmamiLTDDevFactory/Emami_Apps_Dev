'use client';
// Actual vs rate sources: its own route, loaded on demand and only when NEXT_PUBLIC_WAC_ENABLED is on. With the flag off the
// screen's code is never imported (the condition is replaced at build time), so no WAC code reaches any bundle.
import dynamic from 'next/dynamic';

// The check is written out here (not imported) so the build replaces it with a constant and drops the import() entirely when off.
const Screen = process.env.NEXT_PUBLIC_WAC_ENABLED === 'true' ? dynamic(() => import('@/components/wac/ActualVsSources'), { ssr: false }) : null;

export default function Page() {
  if (!Screen) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg p-4">
        <div className="max-w-md rounded-2xl border border-line bg-panel p-7 text-center shadow-card">
          <h1 className="text-lg font-extrabold">Actual vs rate sources is not enabled</h1>
          <p className="mt-1 text-sm text-muted">This build was made without WAC_ENABLED.</p>
        </div>
      </div>
    );
  }
  return <Screen />;
}
