'use client';
// Standard cost (CK13N): its own route, loaded on demand and only when NEXT_PUBLIC_CK_ENABLED is on. With the flag off the screen's code is never imported
// (the condition is replaced at build time), so no code of this page reaches any bundle.
import dynamic from 'next/dynamic';

const Screen = process.env.NEXT_PUBLIC_CK_ENABLED === 'true' ? dynamic(() => import('@/components/ck/StandardCost'), { ssr: false }) : null;

export default function Page() {
  if (!Screen) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg p-4">
        <div className="max-w-md rounded-2xl border border-line bg-panel p-7 text-center shadow-card">
          <h1 className="text-lg font-extrabold">Standard cost (CK13N) is not enabled</h1>
          <p className="mt-1 text-sm text-muted">This build was made without CK_ENABLED.</p>
        </div>
      </div>
    );
  }
  return <Screen />;
}
