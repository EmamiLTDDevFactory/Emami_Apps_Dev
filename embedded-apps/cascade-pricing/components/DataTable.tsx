'use client';
import { useEffect, useRef } from 'react';
import { cellText } from '@/lib/format';
import { lightDerived, statusLight, type Column, type Row } from '@/lib/types';
import type { Selection } from '@/lib/useSelection';

export interface RowAction {
  label: string;
  /** Text on the button (e.g. "Reject"); the column header is label. */
  button: string;
  onClick: (row: Row) => void;
  disabled?: boolean;
}

export interface DataTableProps {
  label: string;
  columns: Column[];
  rows: Row[];
  rowKeyOf: (row: Row) => string;
  selection?: Selection;
  showLight?: boolean;
  loading?: boolean;
  emptyText?: string;
  /** Editable columns (column.editable): the new value for a row / key. */
  onEdit?: (row: Row, key: string, value: string) => void;
  /** '' when the cell value is fine, else the message shown under the table and as the cell's title (red border). */
  validate?: (key: string, value: unknown) => string;
  rowAction?: RowAction;
  /** Rows to shade light green (history: the latest version of each chain). */
  highlight?: (row: Row, index: number) => boolean;
  maxHeight?: string;
  disabled?: boolean;
}

const LIGHT_INFO: Record<string, { cls: string; text: string }> = {
  '1': { cls: 'bg-red-500 ring-red-200 shadow-[0_0_8px_rgba(239,68,68,0.6)]', text: 'Pending or rejected' },
  '2': { cls: 'bg-amber-400 ring-amber-200 shadow-[0_0_8px_rgba(251,191,36,0.6)]', text: 'In process' },
  '3': { cls: 'bg-emerald-500 ring-emerald-200 shadow-[0_0_8px_rgba(16,185,129,0.6)]', text: 'Approved' },
};

function StatusLight({ row }: { row: Row }) {
  const info = LIGHT_INFO[statusLight(row)];
  if (!info) return <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300 ring-2 ring-gray-100" title="No status from SAP" aria-label="No status" role="img" />;
  const text = lightDerived(row) ? `${info.text} (from SAP's approval flags)` : info.text;
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ring-2 ${info.cls}`} title={text} aria-label={text} role="img" />;
}

function rowLabel(row: Row): string {
  const parts = [row.MATNR && `material ${String(row.MATNR).replace(/^0+/, '')}`, row.KUNNR && `customer ${String(row.KUNNR).replace(/^0+/, '')}`, row.S_LAND1 ?? row.LLAND, row.ZVERSION !== undefined && `version ${String(row.ZVERSION).trim() || '01'}`];
  return parts.filter(Boolean).join(', ') || 'row';
}

export default function DataTable({ label, columns, rows, rowKeyOf, selection, showLight, loading, emptyText, onEdit, validate, rowAction, highlight, maxHeight = '70vh', disabled }: DataTableProps) {
  const allRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = !!selection?.someSelected;
  }, [selection?.someSelected]);

  const th = 'sticky top-0 z-10 whitespace-nowrap border-b border-plum/10 px-2.5 py-2 text-left text-2xs font-bold uppercase tracking-wider text-plum/70';
  const td = 'whitespace-nowrap border-b border-plum/[0.06] px-2.5 py-1.5';

  if (loading && !rows.length) {
    return (
      <div className="space-y-2 rounded-2xl bg-white/70 p-4 ring-1 ring-white/80" aria-busy="true" aria-label={`${label}: loading`}>
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-5 animate-pulse rounded-lg bg-gradient-to-r from-violet-100 via-white to-teal-50" style={{ animationDelay: `${i * 80}ms` }} />)}
        <p className="pt-1 text-xs text-sap-muted">Working...</p>
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-plum/20 bg-white/50 px-4 py-12 text-center text-sm text-sap-muted">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-violet-100 to-teal-50 text-lg text-plum ring-1 ring-white" aria-hidden="true">◇</span>
        {emptyText ?? 'No data for this tab. Use Load or upload a file.'}
      </div>
    );
  }

  return (
    <div className="scroll-glass overflow-auto rounded-2xl bg-white/85 shadow-[0_8px_30px_-16px_rgba(36,30,61,0.35)] ring-1 ring-white" style={{ maxHeight }} aria-busy={loading || undefined}>
      <table className="glass-table min-w-full border-separate border-spacing-0 text-xs text-sap-ink" aria-label={label}>
        <thead>
          <tr>
            {showLight && <th scope="col" className={`${th} w-8 text-center`}><span className="sr-only">Status</span></th>}
            {selection && (
              <th scope="col" className={`${th} w-8 text-center`}>
                <input ref={allRef} type="checkbox" className="h-3.5 w-3.5 accent-plum" checked={selection.allSelected} onChange={selection.toggleAll} disabled={disabled} aria-label={selection.allSelected ? 'Deselect all rows' : 'Select all rows'} />
              </th>
            )}
            {rowAction && <th scope="col" className={th}>{rowAction.label}</th>}
            {columns.map((c, i) => <th key={`${c.key}-${i}`} scope="col" className={`${th} ${c.editable ? 'editable-col' : ''}`}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const key = rowKeyOf(row);
            const sel = selection?.isSelected(row) ?? false;
            const shade = highlight?.(row, ri);
            return (
              <tr key={`${key}#${ri}`} className={sel ? 'bg-violet-100/70' : shade ? 'bg-emerald-50' : ri % 2 ? 'bg-violet-50/30' : 'bg-transparent'}>
                {showLight && <td className={`${td} text-center`}><StatusLight row={row} /></td>}
                {selection && (
                  <td className={`${td} text-center`}>
                    <input type="checkbox" className="h-3.5 w-3.5 accent-plum" checked={sel} onChange={() => selection.toggle(row)} disabled={disabled} aria-label={`Select row: ${rowLabel(row)}`} />
                  </td>
                )}
                {rowAction && (
                  <td className={td}>
                    <button type="button" onClick={() => rowAction.onClick(row)} disabled={rowAction.disabled || disabled} aria-label={`${rowAction.button}: ${rowLabel(row)}`}
                      className="rounded-full border border-red-200 bg-white/90 px-2.5 py-0.5 text-2xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50">{rowAction.button}</button>
                  </td>
                )}
                {columns.map((c, ci) => {
                  if (c.editable && onEdit) {
                    const v = row[c.key] ?? '';
                    const err = validate?.(c.key, v) ?? '';
                    return (
                      <td key={`${c.key}-${ci}`} className={`${td} p-0.5`}>
                        <input value={String(v)} onChange={(e) => onEdit(row, c.key, e.target.value.trim())} disabled={disabled} title={err || undefined} aria-invalid={!!err || undefined} aria-label={`${c.label}: ${rowLabel(row)}`}
                          className={`field !h-6 w-24 !rounded-lg !px-1.5 text-right font-mono ${err ? '!border-red-500 !bg-red-50' : ''}`} />
                      </td>
                    );
                  }
                  const { text, numeric } = cellText(c.key, row[c.key]);
                  return <td key={`${c.key}-${ci}`} className={`${td} ${numeric ? 'text-right tabular-nums' : 'text-left'}`}>{text}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
