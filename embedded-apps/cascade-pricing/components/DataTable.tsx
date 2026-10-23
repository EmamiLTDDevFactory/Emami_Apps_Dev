'use client';
import { useEffect, useRef } from 'react';
import { cellText } from '@/lib/format';
import type { Column, Row } from '@/lib/types';
import type { Selection } from '@/lib/useSelection';

export interface DataTableProps {
  label: string;
  columns: Column[];
  rows: Row[];
  rowKeyOf: (row: Row) => string;
  selection?: Selection;
  showLight?: boolean;
  loading?: boolean;
  emptyText?: string;
  maxHeight?: string;
}

const LIGHT_INFO: Record<string, { cls: string; text: string }> = {
  '1': { cls: 'bg-red-500 ring-red-200', text: 'Pending or rejected' },
  '3': { cls: 'bg-emerald-500 ring-emerald-200', text: 'Approved' },
};

function StatusLight({ value }: { value: unknown }) {
  const info = LIGHT_INFO[String(value ?? '')];
  if (!info) return <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300 ring-2 ring-gray-100" title="No status" aria-label="No status" role="img" />;
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ring-2 ${info.cls}`} title={info.text} aria-label={info.text} role="img" />;
}

function rowLabel(row: Row): string {
  const parts = [row.MATNR && `material ${String(row.MATNR).replace(/^0+/, '')}`, row.KUNNR && `customer ${String(row.KUNNR).replace(/^0+/, '')}`, row.S_LAND1 ?? row.LLAND, row.ZVERSION && `version ${row.ZVERSION}`];
  return parts.filter(Boolean).join(', ');
}

export default function DataTable({ label, columns, rows, rowKeyOf, selection, showLight, loading, emptyText, maxHeight = '62vh' }: DataTableProps) {
  const allRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = !!selection?.someSelected;
  }, [selection?.someSelected]);

  const th = 'sticky top-0 z-10 whitespace-nowrap border-b border-r border-sap-line bg-sap-head px-2 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-sap-muted';

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
                <input ref={allRef} type="checkbox" className="h-3.5 w-3.5 accent-plum" checked={selection.allSelected} onChange={selection.toggleAll} aria-label={selection.allSelected ? 'Deselect all rows' : 'Select all rows'} />
              </th>
            )}
            {columns.map((c, i) => <th key={`${c.key}-${i}`} scope="col" className={th}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const key = rowKeyOf(row);
            const sel = selection?.isSelected(row) ?? false;
            return (
              <tr key={`${key}#${ri}`} className={sel ? 'bg-plum-soft' : ri % 2 ? 'bg-sap-row' : 'bg-white'}>
                {showLight && <td className="border-b border-r border-sap-line px-2 py-1 text-center"><StatusLight value={row.LIGHT} /></td>}
                {selection && (
                  <td className="border-b border-r border-sap-line px-2 py-1 text-center">
                    <input type="checkbox" className="h-3.5 w-3.5 accent-plum" checked={sel} onChange={() => selection.toggle(row)} aria-label={`Select row: ${rowLabel(row)}`} />
                  </td>
                )}
                {columns.map((c, ci) => {
                  const { text, numeric } = cellText(c.key, row[c.key]);
                  return <td key={`${c.key}-${ci}`} className={`whitespace-nowrap border-b border-r border-sap-line px-2 py-1 ${numeric ? 'text-right tabular-nums' : 'text-left'}`}>{text}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
