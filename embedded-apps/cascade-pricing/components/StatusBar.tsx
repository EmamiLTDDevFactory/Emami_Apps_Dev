'use client';
import type { StatusMessage } from '@/lib/types';

const TONE = {
  info: 'border-sap-line bg-sap-head text-sap-ink',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-red-200 bg-red-50 text-red-700',
} as const;

/** "Working..." while busy, else the last message; the last 20 messages (newest first) can be opened below. */
export default function StatusBar({ busy, messages }: { busy: boolean; messages: StatusMessage[] }) {
  const last = messages[0];
  const tone = busy ? 'info' : last?.tone ?? 'info';
  return (
    <div>
      <div role={tone === 'error' ? 'alert' : 'status'} aria-live="polite" className={`flex min-h-[30px] items-center gap-2 rounded border px-3 py-1 text-xs ${TONE[tone]}`}>
        {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-plum/30 border-t-plum" aria-hidden="true" />}
        <span className="flex-1">{busy ? 'Working...' : last?.text || 'Ready.'}</span>
        {!busy && last && <span className="text-2xs opacity-70">{last.at}</span>}
      </div>
      {messages.length > 1 && (
        <details className="mt-1 rounded border border-sap-line bg-white px-3 py-1 text-xs">
          <summary className="cursor-pointer text-sap-muted">Last {messages.length} messages</summary>
          <ul className="mt-1 max-h-40 space-y-0.5 overflow-auto">
            {messages.map((m) => (
              <li key={m.id} className={`flex gap-2 ${m.tone === 'error' ? 'text-red-700' : m.tone === 'success' ? 'text-emerald-800' : 'text-sap-ink'}`}>
                <span className="w-16 shrink-0 font-mono text-2xs text-sap-muted">{m.at}</span><span>{m.text}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
