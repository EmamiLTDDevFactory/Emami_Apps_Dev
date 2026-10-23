'use client';
// Daily cost watch: loaded only when AI_ENABLED and WATCH_ENABLED (no code, no requests otherwise).
import dynamic from 'next/dynamic';
import { AI_ENABLED } from '@/lib/ai/config';
import { WATCH_ENABLED } from '@/lib/watch/api';
import { BASE_PATH } from '@/lib/client/session';

const Screen = AI_ENABLED && WATCH_ENABLED ? dynamic(() => import('@/components/watch/WatchPage'), { ssr: false }) : null;

export default function Page() {
  if (Screen) return <Screen />;
  return (
    <div className="grid min-h-screen place-items-center bg-bg p-4">
      <div className="max-w-md rounded-2xl border border-line bg-panel p-7 text-center shadow-card">
        <h1 className="text-lg font-extrabold">Cost watch is not enabled</h1>
        <p className="mt-1 text-sm text-muted">This build was made without AI_ENABLED and WATCH_ENABLED.</p>
        <a href={`${BASE_PATH}/`} className="mt-5 inline-flex rounded-xl bg-gradient-to-br from-accent to-accent-deep px-5 py-2 text-sm font-bold text-white">Back to BOM costing</a>
      </div>
    </div>
  );
}
