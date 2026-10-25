'use client';
import { useCallback, useState } from 'react';
import DataTable from '../DataTable';
import ExportButton from '../ExportButton';
import FileUpload from '../FileUpload';
import { Button, TabPanelHeader, Toolbar, type TabProps } from '../ui';
import { parseDataArray } from '@/lib/api';
import { RATE_COLS } from '@/lib/columns';
import { YMD } from '@/lib/format';
import { makeRowId, rowKey, type FailureItem, type RateRow, type Row } from '@/lib/types';
import { useBusyAction } from '@/lib/useBusyAction';
import { useSelection } from '@/lib/useSelection';

const withIds = (rows: Row[]): RateRow[] => rows.map((r) => ({ ...r, __id: makeRowId() }));
const dateErr = (key: string, v: unknown) => ((key === 'VFROM' || key === 'VTO') && !YMD.test(String(v ?? '')) ? 'YYYYMMDD required' : '');

/** Cascade Rate Upload: .xlsx -> ENRICH_RATES (descriptions from SAP) -> check / correct validity -> Save Rates (selected). */
export default function RateUpload({ busy, setBusy, showMessage, setFailures }: TabProps) {
  const [rows, setRows] = useState<RateRow[]>([]);
  const sel = useSelection(rows);
  const run = useBusyAction({ setBusy, showMessage });

  const onRows = useCallback(async (parsed: Row[]) => {
    const loaded = withIds(parsed);
    setRows(loaded);
    sel.clear();
    setFailures([]);
    showMessage(`${loaded.length} row(s) loaded from file`, 'info');
    const r = await run('ENRICH_RATES', { RATE_ROWS: loaded });
    if (r) {
      const enriched = parseDataArray(r);
      if (enriched.length) setRows(withIds(enriched));
    }
  }, [run, sel, setFailures, showMessage]);

  const onEdit = (row: Row, key: string, value: string) => {
    if (!/^\d{0,8}$/.test(value)) return;
    setRows((all) => all.map((r) => (r.__id === row.__id ? { ...r, [key]: value } : r)));
  };

  async function save() {
    const picked = sel.selectedRows;
    if (!picked.length) { showMessage('Select at least one row', 'error'); return; }
    const bad = picked.filter((r) => dateErr('VFROM', r.VFROM) || dateErr('VTO', r.VTO)).length;
    if (bad) { showMessage(`${bad} selected row(s) have an invalid Valid From / Valid To (YYYYMMDD).`, 'error'); return; }
    const r = await run('SAVE_RATES', { RATE_ROWS: picked });
    if (r) {
      setFailures(parseDataArray<FailureItem>(r));
      sel.clear();
    }
  }

  return (
    <>
      <TabPanelHeader title="Cascade Rate Upload" hint="Upload the condition rates (.xlsx, header in row 1). SAP adds the descriptions; correct Valid From / Valid To where red, select rows and save." count={rows.length} />
      <Toolbar>
        <FileUpload id="rate-file" label="Upload rate file" disabled={busy} kind="rate" onRows={(r) => void onRows(r)} onError={(m) => showMessage(m, 'error')} templateName="cascade-rate-template.xlsx" />
        <span className="text-xs text-sap-muted">{sel.selectedRows.length} selected</span>
        <div className="ml-auto flex gap-2">
          <ExportButton rows={rows} columns={RATE_COLS} tab="Cascade_Rate_Upload" disabled={busy} />
          <Button onClick={() => { setRows([]); sel.clear(); }} disabled={busy || !rows.length}>Clear</Button>
          <Button variant="success" onClick={() => void save()} disabled={busy || !rows.length}>Save Rates</Button>
        </div>
      </Toolbar>
      <div className="p-4">
        <DataTable label="Cascade rates" columns={RATE_COLS} rows={rows} rowKeyOf={(r) => rowKey(r)} selection={sel} onEdit={onEdit} validate={dateErr} disabled={busy} />
      </div>
    </>
  );
}
