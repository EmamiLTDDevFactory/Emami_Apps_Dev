'use client';
import { useCallback, useState } from 'react';
import DataTable from '../DataTable';
import FileUpload from '../FileUpload';
import { Button, TabPanelHeader, TextField, Toolbar, errorStatus, type TabProps } from '../ui';
import { parseRows, postAction } from '@/lib/api';
import { CASCADE_COLUMNS, SIM_INPUT_COLUMNS } from '@/lib/columns';
import { isYmd } from '@/lib/format';
import { rowKey, type Row } from '@/lib/types';
import { useBusyAction } from '@/lib/useBusyAction';
import { useSelection } from '@/lib/useSelection';

const today = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };

/** Pricing Simulation: price uploaded customer x material rows in SAP, then send them for approval or approve them. */
export default function PricingSimulation({ busy, setStatus, dates }: TabProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [simulated, setSimulated] = useState(false);
  const [params, setParams] = useState({ BUKRS: '1100', KALSM: 'ZEXPRC', PDATE: today() });
  const sel = useSelection(rows, 'SimRows');
  const clear = sel.clear;
  const run = useBusyAction({ setStatus, clearSelection: clear });

  const pdateErr = isYmd(params.PDATE) ? '' : 'YYYYMMDD';

  async function simulate() {
    if (!rows.length) { setStatus(errorStatus('Upload a simulation file first.')); return; }
    if (!params.BUKRS || !params.KALSM || pdateErr) { setStatus(errorStatus('Enter Company code, Procedure and a Pricing date (YYYYMMDD).')); return; }
    const input = simulated ? rows.map((r) => Object.fromEntries(SIM_INPUT_COLUMNS.map((c) => [c.key, r[c.key] ?? '']))) : rows;
    const res = await run(() => postAction({ action: 'RUN_SIM', payload: { ROWS: input, PARAMS: params } }), { reloadAfter: false });
    if (res) {
      const out = parseRows(res);
      setRows(out);
      setSimulated(out.length > 0);
    }
  }

  const write = useCallback(async (action: 'SEND_APPROVAL' | 'APPROVE_SIM') => {
    if (!sel.selectedRows.length) { setStatus(errorStatus('Select at least one row')); return; }
    if (dates.error) { setStatus(errorStatus(dates.error)); return; }
    const picked = sel.selectedRows;
    const res = await run(() => postAction({ action, vfrom: dates.vfrom, vto: dates.vto, payload: { ROWS: picked } }), { reloadAfter: false });
    if (res && res.processed > 0) {
      const keys = new Set(picked.map((r) => rowKey(r, 'SimRows')));
      setRows((all) => all.map((r) => (keys.has(rowKey(r, 'SimRows')) ? { ...r, LIGHT: action === 'SEND_APPROVAL' ? '1' : '3', VALIDFROM: dates.vfrom, VALIDTO: dates.vto } : r)));
    }
  }, [sel.selectedRows, dates, run, setStatus]);

  return (
    <>
      <TabPanelHeader title="Pricing Simulation" hint={simulated ? 'Priced rows below. Select rows to send for approval or approve directly.' : 'Upload customer x material rows (.xlsx: VKORG, WERKS, KUNNR, MATNR, CHARG, L_WAERK, B_WAERK), then run the simulation.'} count={rows.length} />
      <Toolbar>
        <FileUpload id="sim-file" label="Upload simulation file" disabled={busy} kind="sim" onRows={(r) => { setRows(r); setSimulated(false); clear(); if (r.length) setStatus({ busy: false, message: `${r.length} row(s) ready to simulate.`, tone: 'info' }); }}
          onError={(m) => setStatus(errorStatus(m))} templateName="cascade-simulation-template.xlsx" />
      </Toolbar>
      <Toolbar>
        <TextField id="bukrs" label="Company code" value={params.BUKRS} onChange={(v) => setParams((p) => ({ ...p, BUKRS: v.toUpperCase() }))} width="w-16" disabled={busy} />
        <TextField id="kalsm" label="Procedure" value={params.KALSM} onChange={(v) => setParams((p) => ({ ...p, KALSM: v.toUpperCase() }))} width="w-20" disabled={busy} />
        <TextField id="pdate" label="Pricing date" value={params.PDATE} onChange={(v) => setParams((p) => ({ ...p, PDATE: v }))} placeholder="YYYYMMDD" error={pdateErr} width="w-24" disabled={busy} />
        <Button variant="primary" onClick={() => void simulate()} disabled={busy || !rows.length}>Run Simulation</Button>
        <div className="ml-auto flex gap-2">
          <Button onClick={() => void write('SEND_APPROVAL')} disabled={busy || !simulated}>Send for Approval</Button>
          <Button variant="success" onClick={() => void write('APPROVE_SIM')} disabled={busy || !simulated}>Approve Simulation</Button>
        </div>
      </Toolbar>
      <div className="p-3">
        {simulated ? (
          <DataTable label="Simulation result" columns={CASCADE_COLUMNS} rows={rows} rowKeyOf={(r) => rowKey(r, 'SimRows')} selection={sel} showLight />
        ) : (
          <DataTable label="Simulation input" columns={SIM_INPUT_COLUMNS} rows={rows} rowKeyOf={(r) => rowKey(r, 'SimRows')} emptyText="No simulation rows. Upload a simulation file (Download template shows the layout)." />
        )}
      </div>
    </>
  );
}
