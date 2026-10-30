'use client';
import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Info } from 'lucide-react';
import type { SapMessage } from '@/lib/sap/messages';

/** Every SAP message in a collapsible banner: warning style (amber), never red unless the call itself failed (then `error`). */
export default function WacMessages({ messages, error, derived }: { messages: SapMessage[]; error?: string | null; derived?: string[] }) {
  const [open, setOpen] = useState(true);
  const all = [...(derived ?? []).map((m) => ({ code: '', message: m, severity: 'warning' as const })), ...messages];
  const uniq = all.filter((m, i) => all.findIndex((x) => x.message === m.message) === i);
  if (!uniq.length && !error) return null;
  return (
    <div className="flex flex-col gap-2">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/[0.06] px-3 py-2 text-sm">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-bad" aria-hidden /><span className="min-w-0 break-words"><b>SAP could not complete this call.</b> {error}</span>
        </div>
      )}
      {uniq.length > 0 && (
        <div className="rounded-xl border border-warn/40 bg-warn/[0.07] text-sm">
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left font-semibold">
            {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
            <Info size={14} className="text-warn" aria-hidden /> {uniq.length} message{uniq.length === 1 ? '' : 's'} from SAP
          </button>
          {open && (
            <ul className="flex flex-col gap-1 px-3 pb-2.5 pl-9">
              {uniq.map((m, i) => <li key={i} className="break-words text-muted">{m.code ? <span className="font-mono text-xs text-faint">{m.code} </span> : null}{m.message}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
