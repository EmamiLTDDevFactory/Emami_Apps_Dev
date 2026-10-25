'use client';
import { useCallback, useEffect, useState } from 'react';
import DataTable from '../DataTable';
import ExportButton from '../ExportButton';
import HistoryPanel from '../HistoryPanel';
import { NOTIFICATIONS_CHANGED } from '../NotificationBell';
import { Button, TabPanelHeader, Toolbar, requiredDatesError, type TabProps } from '../ui';
import { parseDataArray, runAction } from '@/lib/api';
import { CASCADE_COLS } from '@/lib/columns';
import { rowKey, type Row } from '@/lib/types';
import { useBusyAction } from '@/lib/useBusyAction';
import { useSelection } from '@/lib/useSelection';

/**
 * Pending Correction: rejected price points (GET_PENDING_CORRECTION) with the rejection reason and who rejected them.
 * Loaded each time the tab is shown and after a resubmit; every row is red. Resubmit sends them for approval again
 * with the top-bar validity (both dates required).
 */
export default function PendingCorrection({ active, busy, setBusy, showMessage, vfrom, vto }: TabProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [history, setHistory] = useState<Row[] | null>(null);
  const sel = useSelection(rows);
  const run = useBusyAction({ setBusy, showMessage });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await runAction('GET_PENDING_CORRECTION', {});
      setRows(parseDataArray(r).map((row) => ({ ...row, LIGHT: '1', __light: '1' })));
      setLoadFailed(false);
    } catch (e) {
      setLoadFailed(true);
      showMessage(e instanceof Error ? e.message : 'Could not load the rows pending correction.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showMessage]);

  // Every time the tab is opened: a reject in Review / Approval may have added rows.
  useEffect(() => { if (active) void reload(); }, [active, reload]);

  function picked(): Row[] | null {
    if (!sel.selectedRows.length) { showMessage('Select at least one row', 'error'); return null; }
    return sel.selectedRows;
  }

  async function resubmit() {
    const rs = picked();
    if (!rs) return;
    const err = requiredDatesError(vfrom, vto);
    if (err) { showMessage(err.replace('Send for Approval', 'Resubmit for Approval'), 'error'); return; }
    const r = await run('RESUBMIT', { ROWS: rs }, vfrom, vto);
    if (r) {
      sel.clear();
      setHistory(null);
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

  const working = busy || loading;
  return (
    <>
      <TabPanelHeader title="Pending Correction" hint="Rejected price points with the reason. Correct them, then resubmit with Valid From and Valid To from the top bar." count={rows.length} />
      <Toolbar>
        <Button onClick={() => void reload()} disabled={working}>Refresh</Button>
        <span className="text-xs text-sap-muted">{sel.selectedRows.length} selected</span>
        {working && <span className="flex items-center gap-1.5 text-xs font-semibold text-plum" role="status"><span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-300 border-t-plum" aria-hidden="true" />Working...</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          <ExportButton rows={rows} columns={CASCADE_COLS} tab="pending_correction" disabled={working} />
          <Button onClick={() => void compare()} disabled={working}>Version History / Compare</Button>
          <Button variant="primary" onClick={() => void resubmit()} disabled={working}>Resubmit for Approval</Button>
        </div>
      </Toolbar>
      <div className="p-4">
        <DataTable label="Rows pending correction" columns={CASCADE_COLS} rows={rows} rowKeyOf={(r) => rowKey(r)} selection={sel} showLight loading={loading} disabled={busy} emptyText={loadFailed ? 'Nothing to show: SAP did not return the list (see the message above).' : 'No rows pending correction.'} />
        {history && <HistoryPanel rows={history} onClose={() => setHistory(null)} />}
      </div>
    </>
  );
}
