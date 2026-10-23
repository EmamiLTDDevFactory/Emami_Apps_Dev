'use client';
import { useState } from 'react';
import DataTable from '../DataTable';
import FileUpload from '../FileUpload';
import { Button, TabPanelHeader, Toolbar, errorStatus, type TabProps } from '../ui';
import { postAction } from '@/lib/api';
import { RATE_COLUMNS } from '@/lib/columns';
import { rowKey, type Row } from '@/lib/types';
import { useBusyAction } from '@/lib/useBusyAction';

/** Cascade Rate Upload: condition rates per selling country and material from Excel, saved with SAVE_RATES. */
export default function RateUpload({ busy, setStatus }: TabProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const run = useBusyAction({ setStatus });

  async function save() {
    if (!rows.length) { setStatus(errorStatus('Upload a rate file first.')); return; }
    await run(() => postAction({ action: 'SAVE_RATES', payload: { ROWS: rows } }), { reloadAfter: false });
  }

  return (
    <>
      <TabPanelHeader title="Cascade Rate Upload" hint="Upload the condition rates (.xlsx, header in row 1, dates as dd.mm.yyyy), check them, then save." count={rows.length} />
      <Toolbar>
        <FileUpload id="rate-file" label="Upload rate file" disabled={busy} kind="rate" onRows={(r) => { setRows(r); if (r.length) setStatus({ busy: false, message: `${r.length} rate row(s) ready to save.`, tone: 'info' }); }}
          onError={(m) => setStatus(errorStatus(m))} templateName="cascade-rate-template.xlsx" />
        <div className="ml-auto flex gap-2">
          <Button onClick={() => setRows([])} disabled={busy || !rows.length}>Clear</Button>
          <Button variant="success" onClick={() => void save()} disabled={busy || !rows.length}>Save Rates</Button>
        </div>
      </Toolbar>
      <div className="p-3">
        <DataTable label="Cascade rates" columns={RATE_COLUMNS} rows={rows} rowKeyOf={(r) => rowKey(r, 'RateRows')} emptyText="No rates loaded. Upload a rate file (Download template shows the layout)." />
      </div>
    </>
  );
}
