'use client';
import { useState } from 'react';
import DataTable from '../DataTable';
import ExportButton from '../ExportButton';
import HistoryPanel from '../HistoryPanel';
import { Button, TabPanelHeader, Toolbar, type TabProps, LoadError } from '../ui';
import { parseDataArray } from '@/lib/api';
import { CASCADE_COLS } from '@/lib/columns';
import { rowKey, type FailureItem, type Row } from '@/lib/types';
import { useBusyAction } from '@/lib/useBusyAction';
import { useSelection } from '@/lib/useSelection';
import { useSetData } from '@/lib/useSetData';

/** Condition Creation: approved price points waiting for their SAP condition records (ConditionPendingSet). */
export default function ConditionCreation({ active, busy, setBusy, showMessage, setFailures }: TabProps) {
  const { rows, loading, reload, error } = useSetData('ConditionPendingSet', active, showMessage);
  const sel = useSelection(rows);
  const [history, setHistory] = useState<Row[] | null>(null);
  const run = useBusyAction({ setBusy, showMessage });

  function picked(): Row[] | null {
    if (!sel.selectedRows.length) { showMessage('Select at least one row', 'error'); return null; }
    return sel.selectedRows;
  }

  async function createConditions() {
    const rs = picked();
    if (!rs) return;
    const r = await run('CREATE_COND', { ROWS: rs });
    if (r) {
      setFailures(parseDataArray<FailureItem>(r));
      sel.clear();
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
      <TabPanelHeader title="Condition Creation" hint="Approved cascades (green). Select rows and create their condition records in SAP." count={rows.length} />
      <Toolbar>
        <Button onClick={() => void reload()} disabled={busy || loading}>{loading ? 'Loading...' : 'Refresh'}</Button>
        <span className="text-xs text-sap-muted">{sel.selectedRows.length} selected</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <ExportButton rows={rows} columns={CASCADE_COLS} tab="Condition_Creation" disabled={busy} />
          <Button onClick={() => void compare()} disabled={busy}>Version History / Compare</Button>
          <Button variant="success" onClick={() => void createConditions()} disabled={busy}>Create Condition</Button>
        </div>
      </Toolbar>
      <div className="p-4">
        <LoadError error={error} onRetry={() => void reload()} busy={loading} />
        <DataTable emptyText={error ? 'Nothing to show: SAP did not return the list (see above).' : undefined} label="Approved cascades awaiting condition creation" columns={CASCADE_COLS} rows={rows} rowKeyOf={(r) => rowKey(r)} selection={sel} showLight loading={loading} disabled={busy} />
        {history && <HistoryPanel rows={history} onClose={() => setHistory(null)} />}
      </div>
    </>
  );
}
