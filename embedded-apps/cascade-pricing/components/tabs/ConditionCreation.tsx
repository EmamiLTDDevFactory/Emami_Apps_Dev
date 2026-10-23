'use client';
import { useState } from 'react';
import DataTable from '../DataTable';
import HistoryPanel from '../HistoryPanel';
import { Button, TabPanelHeader, Toolbar, errorStatus, type TabProps } from '../ui';
import { parseRows, postAction } from '@/lib/api';
import { CASCADE_COLUMNS } from '@/lib/columns';
import { rowKey, type Row } from '@/lib/types';
import { useBusyAction } from '@/lib/useBusyAction';
import { useSelection } from '@/lib/useSelection';
import { useSetData } from '@/lib/useSetData';

/** Condition Creation: approved price points waiting for their SAP condition records (ConditionPendingSet). */
export default function ConditionCreation({ active, busy, setStatus }: TabProps) {
  const { rows, loading, reload } = useSetData('ConditionPendingSet', active, setStatus);
  const sel = useSelection(rows);
  const [history, setHistory] = useState<Row[] | null>(null);
  const run = useBusyAction({ setStatus, reload, clearSelection: sel.clear });

  async function createConditions() {
    if (!sel.selectedRows.length) { setStatus(errorStatus('Select at least one row')); return; }
    const picked = sel.selectedRows;
    await run(() => postAction({ action: 'CREATE_COND', payload: { ROWS: picked } }));
  }

  async function compare() {
    if (!sel.selectedRows.length) { setStatus(errorStatus('Select at least one row')); return; }
    const picked = sel.selectedRows;
    const res = await run(() => postAction({ action: 'COMPARE', payload: { ROWS: picked } }), { reloadAfter: false, keepSelection: true });
    if (res) setHistory(parseRows(res));
  }

  return (
    <>
      <TabPanelHeader title="Condition Creation" hint="Approved cascades (green). Select rows and create their condition records in SAP." count={rows.length} />
      <Toolbar>
        <Button onClick={() => void reload()} disabled={busy || loading}>{loading ? 'Loading...' : 'Load'}</Button>
        <span className="text-xs text-sap-muted">{sel.selectedRows.length} selected</span>
        <div className="ml-auto flex gap-2">
          <Button onClick={() => void compare()} disabled={busy}>Version History / Compare</Button>
          <Button variant="success" onClick={() => void createConditions()} disabled={busy}>Create Condition</Button>
        </div>
      </Toolbar>
      <div className="p-3">
        <DataTable label="Approved cascades awaiting condition creation" columns={CASCADE_COLUMNS} rows={rows} rowKeyOf={(r) => rowKey(r)} selection={sel} showLight loading={loading} emptyText="Nothing waiting for condition creation. Approve rows in Review / Approval first." />
        {history && <HistoryPanel rows={history} onClose={() => setHistory(null)} />}
      </div>
    </>
  );
}
