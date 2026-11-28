'use client';
import React, { useRef, useState } from 'react';
import { applyForecast, parseCsvText, parseForecast, xlsx, type DpDataset, type ForecastParsed } from '../../lib/dp';
import { liveApi, type ForecastRow, type PlanningStatus } from '../../lib/liveApi';
import { Card } from '../ui';
import { f0, small } from './common';

type Parsed = ForecastParsed;
interface Props { D: DpDataset; live: boolean; canRun: boolean; status: PlanningStatus | null; toast: (m: string, kind?: 'ok' | 'err') => void; onLocal: (D2: DpDataset) => void; onSaved: () => void }

/* Forecast is the one input that is not in SAP: one sheet, parsed in the browser, sent to the server (live) and/or tried locally. */
export function Forecast({ D, live, canRun, status, toast, onLocal, onSaved }: Props) {
  const [book, setBook] = useState<{ file: string; sheets: { name: string; rows: unknown[][] }[] } | null>(null);
  const [sheet, setSheet] = useState(0);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const parsed: Parsed | null = book ? parseForecast(book.sheets[sheet]?.rows ?? []) : null;

  const load = async (f: File) => {
    try {
      let sheets: { name: string; rows: unknown[][] }[];
      if (/\.(xlsx|xlsm)$/i.test(f.name)) sheets = (await xlsx.readXlsx(await f.arrayBuffer())).sheets;
      else sheets = [{ name: f.name, rows: parseCsvText(await f.text()) }];
      const best = sheets.findIndex((s) => /fcast|forecast/i.test(s.name));
      setBook({ file: f.name, sheets }); setSheet(best >= 0 ? best : 0);
    } catch (e) { toast('Could not read the file: ' + (e as Error).message, 'err'); }
  };
  const tot = parsed ? parsed.rows.reduce((a, r) => ({ m0: a.m0 + r.m0, m1: a.m1 + r.m1, add: a.add + r.additional }), { m0: 0, m1: 0, add: 0 }) : null;
  const plants = parsed ? new Set(parsed.rows.map((r) => r.plant)).size : 0, mats = parsed ? new Set(parsed.rows.map((r) => r.material)).size : 0;
  const local = parsed ? applyForecast(D, parsed.rows) : null;

  const save = async () => {
    if (!parsed?.rows.length) return;
    setBusy(true);
    try { const r = await liveApi.planningForecast(parsed.rows as ForecastRow[]); toast(`Forecast saved on the server: ${f0(r.rows)} rows. Refresh from SAP to rebuild the snapshot.`); onSaved(); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <Card title="Forecast (not in SAP)">
        <div className="hint mb-3">Forecast, additional requirement and the production plan come from supply planning, not from SAP. Upload one .xlsx or .csv with the columns <b>Material, Plant, Channel, M0, M1, Additional</b>; the CCD / HCD console <b>Fcast</b> column names are accepted too.</div>
        {status?.forecast && <div className="mb-3 rounded-xl bg-cream p-3 text-sm">On the server: <b>{f0(status.forecast.rows)}</b> rows, uploaded {new Date(status.forecast.uploadedAt).toLocaleString('en-IN')} by {status.forecast.by}. The dataset currently has {f0(D.fc.length)} forecast and {f0(D.afc.length)} additional lines.</div>}
        <div className="flex flex-wrap items-center gap-3">
          <input ref={input} type="file" accept=".xlsx,.xlsm,.csv,.txt" className="text-sm" data-testid="forecast-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); }} />
          {book && book.sheets.length > 1 && <label className="text-xs font-bold text-inkSoft">Sheet <select className={small} value={sheet} onChange={(e) => setSheet(+e.target.value)}>{book.sheets.map((s, i) => <option key={i} value={i}>{s.name}</option>)}</select></label>}
        </div>
      </Card>
      {parsed && (
        <Card title={`Preview · ${book?.file}`}>
          {parsed.warnings.map((w, i) => <div key={i} className="mb-2 rounded-lg bg-amberBg p-2 text-sm text-amber">{w}</div>)}
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
            <div><div className="hint">Format</div><b>{parsed.format || '-'}</b></div><div><div className="hint">Rows (material × plant × channel)</div><b>{f0(parsed.rows.length)}</b></div>
            <div><div className="hint">Materials · plants</div><b>{f0(mats)} · {f0(plants)}</b></div><div><div className="hint">M0 / M1 / Additional (pcs)</div><b>{tot ? `${f0(tot.m0)} / ${f0(tot.m1)} / ${f0(tot.add)}` : ''}</b></div>
            <div><div className="hint">Skipped rows</div><b>{f0(parsed.skipped)}</b></div>
          </div>
          {local && (local.missing.materials.length > 0 || local.missing.plants.length > 0) && <div className="mt-3 text-xs text-inkSoft">Not in this dataset (ignored here): {local.missing.materials.length} materials{local.missing.materials.length ? ` (${local.missing.materials.slice(0, 6).join(', ')}${local.missing.materials.length > 6 ? '…' : ''})` : ''}, {local.missing.plants.length} plants{local.missing.plants.length ? ` (${local.missing.plants.join(', ')})` : ''}.</div>}
          <table className="mt-3 w-full border-collapse text-[13px]"><thead><tr>{['Material', 'Plant', 'Channel', 'M0', 'M1', 'Additional'].map((h) => <th key={h} className="border-b border-border px-2 py-1 text-left text-[11px] font-bold uppercase text-inkSoft">{h}</th>)}</tr></thead><tbody>
            {parsed.rows.slice(0, 10).map((r, i) => <tr key={i}><td className="px-2 py-1">{r.material}</td><td className="px-2 py-1">{r.plant}</td><td className="px-2 py-1">{r.channel}</td><td className="px-2 py-1 text-right">{f0(r.m0)}</td><td className="px-2 py-1 text-right">{f0(r.m1)}</td><td className="px-2 py-1 text-right">{f0(r.additional)}</td></tr>)}
          </tbody></table>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-ghost" disabled={!parsed.rows.length} data-testid="forecast-local" onClick={() => { if (local) { onLocal(local.D); toast('Forecast applied to this session and the plan was rebuilt (not saved on the server).'); } }}>Try it in this session</button>
            {live && <button className="btn-primary" disabled={!parsed.rows.length || !canRun || busy} data-testid="forecast-save" onClick={() => void save()}>{busy ? 'Saving…' : 'Save on the server'}</button>}
            {live && !canRun && <span className="hint self-center">Saving needs the Distribution Planner role (plan.run).</span>}
          </div>
        </Card>
      )}
    </div>
  );
}
