'use client';
import { useState } from 'react';
import DataTable from '../DataTable';
import ExportButton from '../ExportButton';
import FileUpload from '../FileUpload';
import HistoryPanel from '../HistoryPanel';
import { Button, TabPanelHeader, TextField, Toolbar, optionalDatesError, requiredDatesError, type TabProps } from '../ui';
import { parseDataArray } from '@/lib/api';
import { SIM_COLS, SIM_FILE_KEYS, SIM_INPUT_COLS } from '@/lib/columns';
import { FACTOR_INPUT, YMD, factorError, factorNumber, todayYmd } from '@/lib/format';
import { makeRowId, rowKey, type Row, type SimRow } from '@/lib/types';
import { useBusyAction } from '@/lib/useBusyAction';
import { useSelection } from '@/lib/useSelection';

/** The simulation input of a row (uploaded or already simulated): file columns + the factor as a number (blank = 0). */
const toInput = (r: Row): Row => ({ ...Object.fromEntries(SIM_FILE_KEYS.map((k) => [k, r[k] ?? ''])), ZPRICE_IN: factorNumber(r.ZPRICE_IN) });
const validate = (key: string, v: unknown) => (key === 'ZPRICE_IN' ? factorError(v) : '');

/** Pricing Simulation: price uploaded customer x material rows in SAP with an optional Pricing Factor %, then send for approval, approve or compare. */
export default function PricingSimulation({ busy, setBusy, showMessage, setFailures, vfrom, vto }: TabProps) {
  const [rows, setRows] = useState<SimRow[]>([]);
  const [simulated, setSimulated] = useState(false);
  const [params, setParams] = useState({ BUKRS: '1100', KALSM: 'ZEXPRC', PDATE: todayYmd() });
  const [history, setHistory] = useState<Row[] | null>(null);
  const sel = useSelection(rows);
  const run = useBusyAction({ setBusy, showMessage });
  const pdateErr = YMD.test(params.PDATE) ? '' : 'YYYYMMDD';
  const factorProblems = rows.map((r) => factorError(r.ZPRICE_IN)).filter(Boolean);

  const onEdit = (row: Row, key: string, value: string) => {
    if (key !== 'ZPRICE_IN' || !FACTOR_INPUT.test(value)) return;
    setRows((all) => all.map((r) => (r.__id === row.__id ? { ...r, ZPRICE_IN: value } : r)));
  };

  async function simulate() {
    if (!rows.length) { showMessage('Upload a simulation file first.', 'error'); return; }
    if (!params.BUKRS || !params.KALSM || pdateErr) { showMessage('Enter Company code, Procedure and a Pricing date (YYYYMMDD).', 'error'); return; }
    if (factorProblems.length) { showMessage(factorProblems[0], 'error'); return; }
    const input = rows.map(toInput);
    const r = await run('RUN_SIM', { ROWS: input, PARAMS: params });
    if (!r) return;
    const out = parseDataArray(r);
    // Keep each row's factor: SAP's when it returns one, else the one that was sent (same order).
    setRows(out.map((o, i) => ({ ...o, ZPRICE_IN: o.ZPRICE_IN ?? input[i]?.ZPRICE_IN ?? 0, __id: makeRowId() })));
    setSimulated(out.length > 0);
    sel.clear();
    setHistory(null);
  }

  function picked(): Row[] | null {
    if (!sel.selectedRows.length) { showMessage('Select at least one row', 'error'); return null; }
    return sel.selectedRows;
  }

  async function write(action: 'SEND_APPROVAL' | 'APPROVE_SIM') {
    const rs = picked();
    if (!rs) return;
    const err = action === 'SEND_APPROVAL' ? requiredDatesError(vfrom, vto) : optionalDatesError(vfrom, vto);
    if (err) { showMessage(err, 'error'); return; }
    const r = await run(action, { ROWS: rs }, vfrom, vto);
    if (r) sel.clear();
  }

  async function compare() {
    const rs = picked();
    if (!rs) return;
    const r = await run('COMPARE', { ROWS: rs });
    if (r) setHistory(parseDataArray(r));
  }

  return (
    <>
      <TabPanelHeader title="Pricing Simulation" hint={simulated ? 'Priced rows below. Change a Pricing Factor % and run again, or select rows to send for approval, approve or compare.' : 'Upload customer x material rows (.xlsx: VKORG, WERKS, KUNNR, MATNR, CHARG, L_WAERK, B_WAERK), set factors if needed, then run the simulation.'} count={rows.length} />
      <Toolbar>
        <FileUpload id="sim-file" label="Upload simulation file" disabled={busy} kind="sim"
          onRows={(r) => { setRows(r.map((x) => ({ ...x, ZPRICE_IN: x.ZPRICE_IN ?? 0, __id: makeRowId() }))); setSimulated(false); sel.clear(); setHistory(null); setFailures([]); showMessage(`${r.length} row(s) loaded from file`, 'info'); }}
          onError={(m) => showMessage(m, 'error')} templateName="cascade-simulation-template.xlsx" />
        <div className="ml-auto"><ExportButton rows={rows} columns={simulated ? SIM_COLS : SIM_INPUT_COLS} tab="Pricing_Simulation" disabled={busy} /></div>
      </Toolbar>
      <Toolbar>
        <TextField id="bukrs" label="Company code" value={params.BUKRS} onChange={(v) => setParams((p) => ({ ...p, BUKRS: v.toUpperCase() }))} width="w-16" disabled={busy} />
        <TextField id="kalsm" label="Procedure" value={params.KALSM} onChange={(v) => setParams((p) => ({ ...p, KALSM: v.toUpperCase() }))} width="w-20" disabled={busy} />
        <TextField id="pdate" label="Pricing date" value={params.PDATE} onChange={(v) => setParams((p) => ({ ...p, PDATE: v }))} placeholder="YYYYMMDD" error={pdateErr} width="w-24" disabled={busy} />
        <Button variant="primary" onClick={() => void simulate()} disabled={busy || !rows.length}>Run Simulation</Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button onClick={() => void compare()} disabled={busy || !simulated}>Version History / Compare</Button>
          <Button onClick={() => void write('SEND_APPROVAL')} disabled={busy || !simulated}>Send for Approval</Button>
          <Button variant="success" onClick={() => void write('APPROVE_SIM')} disabled={busy || !simulated}>Approve Simulation</Button>
        </div>
      </Toolbar>
      <p className="px-3 pt-2 text-2xs text-sap-muted">Enter a Pricing Factor % to change RRP. Blank keeps the base price. Run Simulation always starts from the base price, so changing a factor and running again does not compound.</p>
      {factorProblems.length > 0 && <p className="px-3 pt-1 text-xs text-red-600" role="alert">{factorProblems[0]}</p>}
      <div className="p-3">
        <DataTable label={simulated ? 'Simulation result' : 'Simulation input'} columns={simulated ? SIM_COLS : SIM_INPUT_COLS} rows={rows} rowKeyOf={(r) => rowKey(r)}
          selection={simulated ? sel : undefined} showLight={simulated} onEdit={onEdit} validate={validate} disabled={busy} />
        {history && <HistoryPanel rows={history} onClose={() => setHistory(null)} />}
      </div>
    </>
  );
}
