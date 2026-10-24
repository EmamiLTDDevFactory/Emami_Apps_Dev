'use client';
import { useEffect, useRef } from 'react';
import { cellText } from '@/lib/format';
import type { Column, Row } from '@/lib/types';
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
  '1': { cls: 'bg-red-500 ring-red-200', text: 'Pending or rejected' },
  '3': { cls: 'bg-emerald-500 ring-emerald-200', text: 'Approved' },
};

function StatusLight({ value }: { value: unknown }) {
  const info = LIGHT_INFO[String(value ?? '').trim()];
  if (!info) return <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300 ring-2 ring-gray-100" title="No status" aria-label="No status" role="img" />;
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ring-2 ${info.cls}`} title={info.text} aria-label={info.text} role="img" />;
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

  const th = 'sticky top-0 z-10 whitespace-nowrap border-b border-r border-sap-line bg-sap-head px-2 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-sap-muted';
  const td = 'whitespace-nowrap border-b border-r border-sap-line px-2 py-1';

  if (loading && !rows.length) {
    return (
      <div className="space-y-1.5 rounded border border-sap-line bg-white p-3" aria-busy="true" aria-label={`${label}: loading`}>
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-5 animate-pulse rounded bg-sap-head" />)}
        <p className="pt-1 text-xs text-sap-muted">Working...</p>
      </div>
    );
  }
  if (!rows.length) {
    return <div className="rounded border border-dashed border-sap-line bg-white px-4 py-10 text-center text-sm text-sap-muted">{emptyText ?? 'No data for this tab. Use Load or upload a file.'}</div>;
  }

  return (
    <div className="overflow-auto rounded border border-sap-line bg-white" style={{ maxHeight }} aria-busy={loading || undefined}>
      <table className="min-w-full border-separate border-spacing-0 text-xs text-sap-ink" aria-label={label}>
        <thead>
          <tr>
            {showLight && <th scope="col" className={`${th} w-8 text-center`}><span className="sr-only">Status</span></th>}
            {selection && (
              <th scope="col" className={`${th} w-8 text-center`}>
                <input ref={allRef} type="checkbox" className="h-3.5 w-3.5 accent-plum" checked={selection.allSelected} onChange={selection.toggleAll} disabled={disabled} aria-label={selection.allSelected ? 'Deselect all rows' : 'Select all rows'} />
              </th>
            )}
            {rowAction && <th scope="col" className={th}>{rowAction.label}</th>}
            {columns.map((c, i) => <th key={`${c.key}-${i}`} scope="col" className={`${th} ${c.editable ? 'bg-amber-50' : ''}`}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const key = rowKeyOf(row);
            const sel = selection?.isSelected(row) ?? false;
            const shade = highlight?.(row, ri);
            return (
              <tr key={`${key}#${ri}`} className={sel ? 'bg-plum-soft' : shade ? 'bg-emerald-50' : ri % 2 ? 'bg-sap-row' : 'bg-white'}>
                {showLight && <td className={`${td} text-center`}><StatusLight value={row.LIGHT} /></td>}
                {selection && (
                  <td className={`${td} text-center`}>
                    <input type="checkbox" className="h-3.5 w-3.5 accent-plum" checked={sel} onChange={() => selection.toggle(row)} disabled={disabled} aria-label={`Select row: ${rowLabel(row)}`} />
                  </td>
                )}
                {rowAction && (
                  <td className={td}>
                    <button type="button" onClick={() => rowAction.onClick(row)} disabled={rowAction.disabled || disabled} aria-label={`${rowAction.button}: ${rowLabel(row)}`}
                      className="rounded border border-red-300 bg-white px-2 py-0.5 text-2xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50">{rowAction.button}</button>
                  </td>
                )}
                {columns.map((c, ci) => {
                  if (c.editable && onEdit) {
                    const v = row[c.key] ?? '';
                    const err = validate?.(c.key, v) ?? '';
                    return (
                      <td key={`${c.key}-${ci}`} className={`${td} p-0.5`}>
                        <input value={String(v)} onChange={(e) => onEdit(row, c.key, e.target.value.trim())} disabled={disabled} title={err || undefined} aria-invalid={!!err || undefined} aria-label={`${c.label}: ${rowLabel(row)}`}
                          className={`h-6 w-24 rounded border px-1.5 text-right font-mono text-xs focus:outline-none focus:ring-2 focus:ring-plum/25 ${err ? 'border-red-500 bg-red-50' : 'border-sap-line focus:border-plum'}`} />
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
