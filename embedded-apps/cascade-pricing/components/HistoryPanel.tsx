'use client';
import DataTable from './DataTable';
import { CASCADE_COLUMNS } from '@/lib/columns';
import { rowKey, type Row } from '@/lib/types';

export interface HistoryPanelProps {
  rows: Row[];
  onClose: () => void;
}

/** COMPARE result below the table: every version of the selected price points, latest first. */
export default function HistoryPanel({ rows, onClose }: HistoryPanelProps) {
  return (
    <section className="mt-3 rounded border border-plum/30 bg-white" aria-labelledby="history-title">
      <div className="flex items-center justify-between border-b border-sap-line bg-plum-soft px-3 py-1.5">
        <h3 id="history-title" className="text-xs font-semibold text-plum-deep">Version history (latest first) <span className="font-normal text-sap-muted">· {rows.length} version(s)</span></h3>
        <button type="button" onClick={onClose} className="rounded px-2 py-0.5 text-xs font-semibold text-sap-muted hover:bg-white hover:text-sap-ink" aria-label="Close version history">Close</button>
      </div>
      <div className="p-2">
        <DataTable label="Version history" columns={CASCADE_COLUMNS} rows={rows} rowKeyOf={(r) => rowKey(r)} showLight maxHeight="40vh" emptyText="No earlier versions for the selected rows." />
      </div>
    </section>
  );
}
