'use client';
import type { StatusMessage } from '@/lib/types';

const TONE = {
  info: 'glass text-sap-ink',
  success: 'glass !border-emerald-200/80 text-emerald-800',
  error: 'glass !border-red-200/80 text-red-700',
} as const;
const DOT = { info: 'bg-plum/60', success: 'bg-emerald-500', error: 'bg-red-500' } as const;

/** "Working..." while busy, else the last message; the last 20 messages (newest first) can be opened below. */
export default function StatusBar({ busy, messages }: { busy: boolean; messages: StatusMessage[] }) {
  const last = messages[0];
  const tone = busy ? 'info' : last?.tone ?? 'info';
  return (
    <div>
      <div role={tone === 'error' ? 'alert' : 'status'} aria-live="polite" className={`flex min-h-[36px] items-center gap-2.5 rounded-2xl px-4 py-1.5 text-xs ${TONE[tone]}`}>
        {busy ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-300 border-t-plum" aria-hidden="true" /> : <span className={`h-2 w-2 rounded-full ${DOT[tone]}`} aria-hidden="true" />}
        <span className="flex-1">{busy ? 'Working...' : last?.text || 'Ready.'}</span>
        {!busy && last && <span className="text-2xs opacity-70">{last.at}</span>}
      </div>
      {messages.length > 1 && (
        <details className="glass mt-1.5 rounded-2xl px-4 py-1.5 text-xs">
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
