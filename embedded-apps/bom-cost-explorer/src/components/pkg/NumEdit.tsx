'use client';
import { useState } from 'react';
import { Undo2 } from 'lucide-react';
import { cx } from '../ui';
import { changed, parseValue, validateValue } from '@/lib/pkg/rules';
import type { EditLevel } from '@/lib/pkg/types';

/** What the grid shares with every editable cell: which cell is open, the Tab order, and the edit / revert calls. */
export interface CellApi {
  editable: boolean; busy: boolean; editKey: string | null; order: string[];
  setEditKey: (k: string | null) => void;
  onEdit: (p: { level: EditLevel; value: string; scopeMatnr: string; scopeIdnrk?: string }) => void;
  onRevert: (p: { level: EditLevel; scopeMatnr: string; scopeIdnrk?: string }) => void;
}

/** One numeric cell. Enter commits, Esc cancels, Tab commits and opens the next editable cell (Shift+Tab the previous). */
export function NumEdit({ cell, k, level, matnr, idnrk, value, sap, fmt, label }: {
  cell: CellApi; k: string; level: EditLevel; matnr: string; idnrk?: string; value: number; sap: number; fmt: (n: number) => string; label: string;
}) {
  const [err, setErr] = useState('');
  const over = changed(value, sap);
  const editing = cell.editable && cell.editKey === k;
  const i = cell.order.indexOf(k);

  function commit(raw: string, move: number) {
    const e = validateValue(raw, level);
    setErr(e);
    if (e) return;
    if (changed(parseValue(raw), value)) cell.onEdit({ level, value: String(parseValue(raw)), scopeMatnr: matnr, ...(idnrk ? { scopeIdnrk: idnrk } : {}) });
    cell.setEditKey(move && i >= 0 ? cell.order[i + move] ?? null : null);
  }

  if (editing) {
    return (
      <span className="inline-flex flex-col items-end">
        <input
          autoFocus aria-label={label} aria-invalid={!!err} defaultValue={String(value)} inputMode="decimal"
          className={cx('h-7 w-24 rounded-lg border bg-panel px-2 text-right text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/40', err ? 'border-bad' : 'border-accent')}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => { setErr(''); cell.setEditKey(null); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(e.currentTarget.value, 0); }
            else if (e.key === 'Escape') { e.preventDefault(); setErr(''); cell.setEditKey(null); }
            else if (e.key === 'Tab') { e.preventDefault(); commit(e.currentTarget.value, e.shiftKey ? -1 : 1); }
          }}
        />
        {err && <span role="alert" className="text-2xs text-bad">{err}</span>}
      </span>
    );
  }
  if (!cell.editable) return <span className={cx(over && 'font-semibold text-warn')}>{fmt(value)}</span>;
  return (
    <span className="inline-flex items-center justify-end gap-1">
      {over && (
        <button type="button" disabled={cell.busy} aria-label={`Revert ${label} to SAP`} title="Revert to SAP value" className="rounded p-0.5 text-warn hover:bg-warn/10 focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
          onClick={() => cell.onRevert({ level, scopeMatnr: matnr, ...(idnrk ? { scopeIdnrk: idnrk } : {}) })}><Undo2 size={12} /></button>
      )}
      <button
        type="button" disabled={cell.busy} aria-label={`Edit ${label}`} title={over ? `SAP: ${fmt(sap)}` : 'Click to edit'}
        className={cx('rounded-md px-1.5 py-0.5 tabular-nums ring-1 ring-transparent hover:ring-line focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60', over ? 'bg-warn/15 font-semibold text-warn' : 'bg-sunken/50')}
        onClick={() => cell.setEditKey(k)}
      >{fmt(value)}</button>
    </span>
  );
}
