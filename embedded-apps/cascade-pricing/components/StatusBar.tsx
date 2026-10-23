'use client';
import type { Status } from '@/lib/types';

const TONE: Record<Status['tone'], string> = {
  info: 'border-sap-line bg-sap-head text-sap-ink',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-red-200 bg-red-50 text-red-700',
};

export default function StatusBar({ status }: { status: Status }) {
  const text = status.busy ? 'Working...' : status.message;
  return (
    <div role={status.tone === 'error' ? 'alert' : 'status'} aria-live="polite" className={`flex min-h-[30px] items-center gap-2 rounded border px-3 py-1 text-xs ${TONE[status.busy ? 'info' : status.tone]}`}>
      {status.busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-plum/30 border-t-plum" aria-hidden="true" />}
      <span>{text || 'Ready.'}</span>
    </div>
  );
}
