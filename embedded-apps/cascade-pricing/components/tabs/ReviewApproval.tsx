'use client';
import { useMemo, useState } from 'react';
import ConfirmDialog from '../ConfirmDialog';
import DataTable from '../DataTable';
import ExportButton from '../ExportButton';
import HistoryPanel from '../HistoryPanel';
import { NOTIFICATIONS_CHANGED } from '../NotificationBell';
import RejectReasonDialog from '../RejectReasonDialog';
import { Button, TabPanelHeader, Toolbar, optionalDatesError, type TabProps, LoadError } from '../ui';
import { parseDataArray } from '@/lib/api';
import { CASCADE_COLS } from '@/lib/columns';
import { rowKey, statusLight, type Row } from '@/lib/types';
import { useBusyAction } from '@/lib/useBusyAction';
import { useSelection } from '@/lib/useSelection';
import { useSetData } from '@/lib/useSetData';

type Filter = 'all' | 'red' | 'green';

/** Review / Approval: cascades sent for approval (ApprovalSet). Red = pending or rejected, green = approved. */
export default function ReviewApproval({ active, busy, setBusy, showMessage, vfrom, vto }: TabProps) {
  const { rows, loading, reload, error } = useSetData('ApprovalSet', active, showMessage);
  const [filter, setFilter] = useState<Filter>('all');
  const shown = useMemo(() => (filter === 'all' ? rows : rows.filter((r) => statusLight(r) === (filter === 'red' ? '1' : '3'))), [rows, filter]);
  const sel = useSelection(shown);
  const [history, setHistory] = useState<Row[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** rows the reject dialog is open for (selected rows, or the one row); null = dialog closed */
  const [rejectRows, setRejectRows] = useState<Row[] | null>(null);
  const run = useBusyAction({ setBusy, showMessage });
  const red = rows.filter((r) => statusLight(r) === '1').length;
  const green = rows.filter((r) => statusLight(r) === '3').length;

  function picked(): Row[] | null {
    if (!sel.selectedRows.length) { showMessage('Select at least one row', 'error'); return null; }
    return sel.selectedRows;
  }

  async function write(action: 'APPROVE' | 'DELETE', rs: Row[]) {
    if (action === 'APPROVE') {
      const err = optionalDatesError(vfrom, vto);
      if (err) { showMessage(err, 'error'); return; }
    }
    const r = await run(action, { ROWS: rs }, action === 'APPROVE' ? vfrom : undefined, action === 'APPROVE' ? vto : undefined);
    if (r) { sel.clear(); await reload(); }
  }

  async function rejectWithReason(rs: Row[], reason: string) {
    const r = await run('REJECT_WITH_REASON', { ROWS: rs, REASON: reason });
    if (r) {
      sel.clear();
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
      await reload();
    }
  }

  async function compare() {
    const rs = picked();
    if (!rs) return;
    const r = await run('COMPARE', { ROWS: rs });
    if (r) setHistory(parseDataArray(r));
  }

  return (
    <>
      <TabPanelHeader title="Review / Approval" hint="Approve uses the top-bar validity (blank keeps the stored dates). Rejected rows stay red until they are deleted or approved." count={rows.length} />
      <Toolbar>
        <Button onClick={() => void reload()} disabled={busy || loading}>{loading ? 'Loading...' : 'Refresh'}</Button>
        <div className="flex gap-0.5 rounded-full bg-white/60 p-0.5 text-xs ring-1 ring-white" role="group" aria-label="Show rows">
          {([['all', `All (${rows.length})`], ['red', `Pending / rejected (${red})`], ['green', `Approved (${green})`]] as [Filter, string][]).map(([f, label]) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} disabled={busy} className={`rounded-full px-3 py-1 font-semibold transition ${filter === f ? 'btn-primary' : 'text-sap-muted hover:bg-white hover:text-sap-ink'}`}>{label}</button>
          ))}
        </div>
        <span className="text-xs text-sap-muted">{sel.selectedRows.length} selected</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <ExportButton rows={shown} columns={CASCADE_COLS} tab="Review_Approval" disabled={busy} />
          <Button onClick={() => void compare()} disabled={busy}>Version History / Compare</Button>
          <Button variant="danger" onClick={() => { if (picked()) setConfirmDelete(true); }} disabled={busy}>Delete Selected</Button>
          <Button variant="danger" onClick={() => { const rs = picked(); if (rs) setRejectRows(rs); }} disabled={busy}>Reject</Button>
          <Button variant="success" onClick={() => { const rs = picked(); if (rs) void write('APPROVE', rs); }} disabled={busy}>Approve</Button>
        </div>
      </Toolbar>
      <div className="p-4">
        <LoadError error={error} onRetry={() => void reload()} busy={loading} />
        <DataTable emptyText={error ? 'Nothing to show: SAP did not return the list (see above).' : undefined} label="Cascades for review" columns={CASCADE_COLS} rows={shown} rowKeyOf={(r) => rowKey(r)} selection={sel} showLight loading={loading} disabled={busy}
          rowAction={{ label: 'Reject', button: 'Reject', onClick: (row) => setRejectRows([row]) }} />
        {history && <HistoryPanel rows={history} onClose={() => setHistory(null)} />}
      </div>
      <ConfirmDialog open={confirmDelete} title="Delete records" message={`Delete ${sel.selectedRows.length} selected record(s) from ZMM_CASCADE?`}
        onCancel={() => setConfirmDelete(false)} onConfirm={() => { setConfirmDelete(false); void write('DELETE', sel.selectedRows); }} />
      {rejectRows && (
        <RejectReasonDialog count={rejectRows.length}
          onCancel={() => setRejectRows(null)}
          onSubmit={(reason) => { const rs = rejectRows; setRejectRows(null); void rejectWithReason(rs, reason); }} />
      )}
    </>
  );
}
