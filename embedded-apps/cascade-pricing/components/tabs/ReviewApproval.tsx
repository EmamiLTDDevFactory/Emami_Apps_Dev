'use client';
import { useMemo, useState } from 'react';
import ConfirmDialog from '../ConfirmDialog';
import DataTable from '../DataTable';
import HistoryPanel from '../HistoryPanel';
import { Button, TabPanelHeader, Toolbar, errorStatus, type TabProps } from '../ui';
import { parseRows, postAction } from '@/lib/api';
import { CASCADE_COLUMNS } from '@/lib/columns';
import { rowKey, type ActionName, type Row } from '@/lib/types';
import { useBusyAction } from '@/lib/useBusyAction';
import { useSelection } from '@/lib/useSelection';
import { useSetData } from '@/lib/useSetData';

type Filter = 'all' | 'red' | 'green';

/** Review / Approval: cascades sent for approval (ApprovalSet). Red = pending or rejected, green = approved. */
export default function ReviewApproval({ active, busy, setStatus, dates }: TabProps) {
  const { rows, loading, reload } = useSetData('ApprovalSet', active, setStatus);
  const [filter, setFilter] = useState<Filter>('all');
  const shown = useMemo(() => (filter === 'all' ? rows : rows.filter((r) => r.LIGHT === (filter === 'red' ? '1' : '3'))), [rows, filter]);
  const sel = useSelection(shown);
  const [history, setHistory] = useState<Row[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const run = useBusyAction({ setStatus, reload, clearSelection: sel.clear });
  const red = rows.filter((r) => r.LIGHT === '1').length;

  function picked(): Row[] | null {
    if (!sel.selectedRows.length) { setStatus(errorStatus('Select at least one row')); return null; }
    return sel.selectedRows;
  }

  async function write(action: Extract<ActionName, 'APPROVE' | 'REJECT' | 'DELETE'>) {
    const rs = picked();
    if (!rs) return;
    if (action === 'APPROVE' && dates.error) { setStatus(errorStatus(dates.error)); return; }
    await run(() => postAction({ action, ...(action === 'APPROVE' ? { vfrom: dates.vfrom, vto: dates.vto } : {}), payload: { ROWS: rs } }));
  }

  async function compare() {
    const rs = picked();
    if (!rs) return;
    const res = await run(() => postAction({ action: 'COMPARE', payload: { ROWS: rs } }), { reloadAfter: false, keepSelection: true });
    if (res) setHistory(parseRows(res));
  }

  return (
    <>
      <TabPanelHeader title="Review / Approval" hint="Approve sets the validity from the top bar. Rejected rows stay red until they are deleted or approved." count={rows.length} />
      <Toolbar>
        <Button onClick={() => void reload()} disabled={busy || loading}>{loading ? 'Loading...' : 'Load'}</Button>
        <div className="flex overflow-hidden rounded border border-sap-line text-xs" role="group" aria-label="Show rows">
          {([['all', `All (${rows.length})`], ['red', `Pending / rejected (${red})`], ['green', `Approved (${rows.length - red})`]] as [Filter, string][]).map(([f, label]) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => { setFilter(f); sel.clear(); }} className={`px-2.5 py-1 font-semibold ${filter === f ? 'bg-plum text-white' : 'bg-white text-sap-muted hover:bg-sap-head'}`}>{label}</button>
          ))}
        </div>
        <span className="text-xs text-sap-muted">{sel.selectedRows.length} selected</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button onClick={() => void compare()} disabled={busy}>Version History / Compare</Button>
          <Button variant="danger" onClick={() => { if (picked()) setConfirmDelete(true); }} disabled={busy}>Delete Selected</Button>
          <Button variant="danger" onClick={() => void write('REJECT')} disabled={busy}>Reject</Button>
          <Button variant="success" onClick={() => void write('APPROVE')} disabled={busy}>Approve</Button>
        </div>
      </Toolbar>
      <div className="p-3">
        <DataTable label="Cascades for review" columns={CASCADE_COLUMNS} rows={shown} rowKeyOf={(r) => rowKey(r)} selection={sel} showLight loading={loading} emptyText="No cascades waiting for review. Send simulated rows for approval from Pricing Simulation." />
        {history && <HistoryPanel rows={history} onClose={() => setHistory(null)} />}
      </div>
      <ConfirmDialog open={confirmDelete} title="Delete records" message={`Delete ${sel.selectedRows.length} selected record(s)?`}
        onCancel={() => setConfirmDelete(false)} onConfirm={() => { setConfirmDelete(false); void write('DELETE'); }} />
    </>
  );
}
