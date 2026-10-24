'use client';
import { useMemo } from 'react';
import DataTable from './DataTable';
import ExportButton from './ExportButton';
import { CASCADE_COLS } from '@/lib/columns';
import { priceKey, rowKey, type Row } from '@/lib/types';

const ver = (r: Row) => Number(String(r.ZVERSION ?? '').trim() || '1') || 0;

/** COMPARE result: every version of the chosen price points, latest first; the latest of each chain is shaded green. */
export default function HistoryPanel({ rows, onClose }: { rows: Row[]; onClose: () => void }) {
  const sorted = useMemo(() => [...rows].sort((a, b) => priceKey(a).localeCompare(priceKey(b)) || ver(b) - ver(a)), [rows]);
  const firstOfChain = useMemo(() => new Set(sorted.map((r, i) => (i === 0 || priceKey(sorted[i - 1]) !== priceKey(r) ? i : -1)).filter((i) => i >= 0)), [sorted]);
  return (
    <section className="mt-3 rounded border border-plum/30 bg-white" aria-labelledby="history-title">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sap-line bg-plum-soft px-3 py-1.5">
        <h3 id="history-title" className="text-xs font-semibold text-plum-deep">Version history (latest first) <span className="font-normal text-sap-muted">· {rows.length} version(s)</span></h3>
        <div className="flex gap-2">
          <ExportButton rows={sorted} columns={CASCADE_COLS} tab="Version_history" />
          <button type="button" onClick={onClose} className="rounded px-2 py-0.5 text-xs font-semibold text-sap-muted hover:bg-white hover:text-sap-ink" aria-label="Close version history">Close</button>
        </div>
      </div>
      <div className="p-2">
        <DataTable label="Version history" columns={CASCADE_COLS} rows={sorted} rowKeyOf={(r) => rowKey(r)} showLight maxHeight="40vh" highlight={(_, i) => firstOfChain.has(i)} emptyText="No versions returned for the selected rows." />
      </div>
    </section>
  );
}
