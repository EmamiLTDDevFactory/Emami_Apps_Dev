'use client';
import { useState } from 'react';
import type { SapMessage } from '@/lib/sap/messages';
import { cx } from './ui';

/** Messages from SAP's sap-message header (skipped materials, missing BOMs, unauthorised
 * plants...) and BFF notices. Warnings/errors are expanded by default, info collapsed. */
export default function Warnings({ messages: all }: { messages: SapMessage[] }) {
  const [open, setOpen] = useState(true);
  // "RATEOPTIONSET_GET_ENTITYSET not implemented" is not a costing problem: the Rate sources tab
  // says it neutrally ("Rate options are not available from SAP for this system").
  const messages = all.filter((m) => !/RATEOPTIONSET/i.test(m.message));
  if (!messages.length) return null;
  const warn = messages.filter((m) => m.severity === 'warning' || m.severity === 'error');
  const info = messages.filter((m) => !(m.severity === 'warning' || m.severity === 'error'));
  const tone = warn.some((m) => m.severity === 'error') ? 'bad' : warn.length ? 'warn' : 'accent';
  return (
    <div role="status" className={cx('mx-3 mt-2 rounded-md border px-3 py-2 text-sm', tone === 'bad' ? 'border-bad/40 bg-bad/[0.06]' : tone === 'warn' ? 'border-warn/40 bg-warn/[0.07]' : 'border-line bg-sunken/50')}>
      <button type="button" className="flex w-full items-center gap-2 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span aria-hidden>{tone === 'accent' ? 'ℹ' : '⚠'}</span>
        <span className="font-medium">
          SAP messages: {warn.length} warning{warn.length === 1 ? '' : 's'}
          {info.length ? `, ${info.length} info` : ''}
        </span>
        <span className="ml-auto text-xs text-muted">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-auto text-xs">
          {[...warn, ...info].map((m, i) => (
            <li key={i} className="flex gap-2">
              <span className={cx('w-14 shrink-0 font-semibold uppercase', m.severity === 'error' ? 'text-bad' : m.severity === 'warning' ? 'text-warn' : 'text-muted')}>{m.severity}</span>
              {m.code && <span className="shrink-0 font-mono text-faint">{m.code}</span>}
              <span>{m.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
