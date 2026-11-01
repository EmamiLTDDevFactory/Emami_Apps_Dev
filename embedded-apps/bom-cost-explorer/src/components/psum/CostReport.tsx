'use client';
/**
 * Cost and margin report (Admin of this app only): Brand / Product / SKU (or WIP) and look-back days, then per finished good (or WIP) and sales area the
 * plant's actual cost per piece (RM, PM, Perfume, Overheads, COGM), the latest MRP and selling price, a simulated COGM and the margin ratios. The variance
 * cell opens the reasons (components that pushed the cost up or down). Read-only; nothing loads until Run; no request has a time limit (Stop ends a run).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Lock, Play, RefreshCw, Square } from 'lucide-react';
import PlanFrame from '../plan/PlanFrame';
import ReasonsModal from './ReasonsModal';
import { PlantPicker } from '../Pickers';
import type { PlantsState } from '../FilterPanel';
import { Button, Empty, Field, Spinner, Stat, cx, inputCls } from '../ui';
import { api } from '@/lib/client/api';
import { fetchIsAdmin } from '@/lib/client/hubAccess';
import { useHubSession } from '@/lib/client/session';
import { loadSapConfig } from '@/lib/sap/config';
import type { PlantRow } from '@/lib/sap/fields';
import { fmtMs, fmtNum } from '@/lib/format';
import { intersectPlants, dec } from '@/lib/wac/view';
import { parseWacUrl, wacSearch } from '@/lib/wac/url';
import { buildReport, filterReportRows, lookbackRange, optionsOf, ratioText, simulationOn, type ReportKind, type ReportRow } from '@/lib/psum/report';
import { downloadReport, reportSheet } from '@/lib/psum/reportExport';
import { useReport } from '@/lib/psum/useReport';

const th = 'px-2 py-1.5 text-left text-2xs font-bold uppercase tracking-wide text-muted align-bottom';
const thN = `${th} text-right`;
const td = 'px-2 py-1.5 align-top';
const tdN = `${td} num whitespace-nowrap text-right`;
const NA = <span className="text-faint" title="No value from SAP">n/a</span>;
const money = (v: string | null | undefined, dp = 4) => (dec(v ?? '') === null ? NA : fmtNum(v!, dp, 'INR'));

function Screen() {
  const hub = useHubSession();
  const email = hub && hub !== 'checking' ? hub.email : '';
  const [admin, setAdmin] = useState<'checking' | 'yes' | 'no'>('checking');
  useEffect(() => { if (email) void fetchIsAdmin(email).then((a) => setAdmin(a ? 'yes' : 'no')); }, [email]);
  const system = useMemo(() => { if (typeof window === 'undefined') return ''; const c = loadSapConfig(); return c.ok ? c.config.system : ''; }, []);

  const [form, setForm] = useState(() => {
    const url = typeof window === 'undefined' ? {} : parseWacUrl(window.location.search);
    return { plants: url.plants ?? [], days: 180, kind: 'fg' as ReportKind, brand: '', prodha: '', matnr: '', search: '', pct: '', abs: '' };
  });
  const patch = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));
  useEffect(() => { const s = wacSearch({ plants: form.plants, from: '', to: '', mat: [], prodha: [], cmp: false }); if (s !== window.location.search) window.history.replaceState(null, '', `${window.location.pathname}${s}`); }, [form.plants]);

  const [plants, setPlants] = useState<PlantRow[]>([]);
  const [pl, setPl] = useState(false);
  const [plErr, setPlErr] = useState('');
  const loadPlants = useCallback(() => { setPl(true); setPlErr(''); api.plants().then((r) => setPlants(r.plants)).catch((e) => setPlErr(e.message)).finally(() => setPl(false)); }, []);
  useEffect(() => { if (admin === 'yes') loadPlants(); }, [admin, loadPlants]);
  const plantsState: PlantsState = useMemo(() => ({ plants, loading: pl, error: plErr, reload: loadPlants }), [plants, pl, plErr, loadPlants]);

  const rep = useReport();
  const [errors, setErrors] = useState<{ plants?: string; days?: string }>({});
  const [ranKind, setRanKind] = useState<ReportKind>('fg');
  const [open, setOpen] = useState<ReportRow | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => { if (!rep.running) return; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, [rep.running]);

  const run = () => {
    const e: typeof errors = {};
    if (!form.plants.length) e.plants = 'Pick at least one plant.';
    const allowed = plants.length ? intersectPlants(form.plants, plants.map((p) => p.Werks)) : form.plants;
    if (form.plants.length && !allowed.length) e.plants = 'None of these plants is available to you in SAP.';
    if (!Number.isInteger(form.days) || form.days < 1) e.days = 'Days must be a whole number of at least 1.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setRanKind(form.kind);
    patch({ brand: '', prodha: '', matnr: '', search: '' });
    rep.run({ plants: allowed, days: form.days, kind: form.kind });
  };

  const range = rep.q ? lookbackRange(rep.q.days) : null;
  const opts = useMemo(() => (rep.rows ? optionsOf(rep.rows, ranKind, form) : { brands: [], products: [], skus: [] }), [rep.rows, ranKind, form.brand, form.prodha]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => (rep.rows ? filterReportRows(rep.rows, { kind: ranKind, brand: form.brand, prodha: form.prodha, matnr: form.matnr, search: form.search }) : []), [rep.rows, ranKind, form.brand, form.prodha, form.matnr, form.search]);
  const sim = useMemo(() => ({ pct: form.pct, abs: form.abs }), [form.pct, form.abs]);
  const table = useMemo(() => buildReport(shown, rep.prices ?? [], sim), [shown, rep.prices, sim]);
  const simOn = simulationOn(sim);
  const wip = ranKind === 'wip';
  const messages = Array.from(new Set([...(rep.rowsEntry?.messages ?? []), ...(rep.priceEntry?.messages ?? [])].map((m) => m.message)));
  const failed = [rep.rowsEntry, rep.priceEntry].find((e) => e?.status === 'error');
  const stopped = [rep.rowsEntry, rep.priceEntry].some((e) => e?.status === 'cancelled');
  const elapsed = rep.running ? now - (rep.rowsEntry?.status === 'loading' ? rep.rowsEntry.startedAt : rep.priceEntry?.startedAt ?? now) : 0;

  const doExport = async () => {
    if (!rep.q || !range) return;
    await downloadReport(reportSheet(table, ranKind, simOn), [
      ['Report', wip ? 'Cost and margin report, WIP (RM and Perfume only)' : 'Cost and margin report'], ['SAP system', system], ['Plants', rep.q.plants.join(', ')], ['Look-back', `${rep.q.days} days (${range.from} to ${range.to})`],
      ['Brand / Product / SKU', [form.brand, form.prodha, form.matnr].filter(Boolean).join(' / ') || 'all'],
      ['Cost', "SAP's actual cost per piece of the look-back period (goods-receipt documents); Overheads = conversion"], ['Prices', "SAP's latest sales order with a selling price within the look-back days, per sales organisation and channel"],
      ['Computed here', 'Simulated COGM (COGM x (1 + %) + amount), the variance against COGM and the ratios (price divided by COGM, only when the price is in INR)'],
      ['Simulation', simOn ? `${form.pct || 0} % and ${form.abs || 0} INR` : 'none'],
    ]);
  };

  if (admin === 'checking') return <div className="grid min-h-[40vh] place-items-center"><Spinner className="h-7 w-7" /></div>;
  if (admin === 'no') {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-line bg-panel p-7 text-center shadow-card">
        <Lock size={24} className="mx-auto text-warn" aria-hidden />
        <h1 className="mt-2 text-lg font-extrabold">Cost and margin report is for Admins</h1>
        <p className="mt-1 text-sm text-muted">Ask a BOM Simulator Admin for access (Manage Access in the Emami Apps Admin Center).</p>
      </div>
    );
  }

  const sel = (id: string, value: string, onChange: (v: string) => void, options: { value: string; label: string }[], all: string) => (
    <select id={id} className={cx(inputCls, 'w-56')} value={value} onChange={(e) => onChange(e.target.value)} disabled={!rep.rows}>
      <option value="">{all}</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold">Cost and margin report</h1>
          <p className="text-xs text-muted">Actual cost per piece (RM, PM, Perfume, Overheads, COGM) against the latest MRP and selling price, with a simulated COGM and the margin ratios. Click a variance for the reasons.</p>
        </div>
        <div className="num text-right text-2xs text-muted">SAP system <span className="font-mono font-bold text-ink">{system || '—'}</span></div>
      </div>

      <div className="rounded-2xl border border-line bg-panel px-4 py-3 shadow-card">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <fieldset className="flex flex-col gap-1"><legend className="text-2xs font-bold uppercase tracking-wide text-muted">Report on</legend>
            <div className="flex gap-1.5" role="radiogroup" aria-label="Report on">
              {([['fg', 'Finished goods (SKU)'], ['wip', 'WIP (RM and Perfume only)']] as const).map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={form.kind === k} onClick={() => patch({ kind: k })} className={cx('rounded-full border px-3 py-1 text-xs font-bold', form.kind === k ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:text-ink')}>{l}</button>
              ))}
            </div>
          </fieldset>
          <Field label="Plants" hint="Required, for example UB01." error={errors.plants}>{(id) => <PlantPicker id={id} values={form.plants} onChange={(p) => patch({ plants: p })} state={plantsState} invalid={!!errors.plants} />}</Field>
          <Field label="Look back days" error={errors.days}>{(id) => <input id={id} inputMode="numeric" className={cx(inputCls, 'w-28')} value={form.days} onChange={(e) => patch({ days: Number(e.target.value.replace(/\D/g, '')) || 0 })} />}</Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {rep.running ? <Button type="button" variant="ghost" onClick={rep.stop}><Square size={14} /> Stop ({fmtMs(elapsed)})</Button> : <Button type="button" variant="primary" onClick={run}><Play size={14} /> Run</Button>}
          <Button type="button" onClick={rep.refresh} disabled={!rep.q || rep.running}><RefreshCw size={14} /> Refresh</Button>
          {stopped && !rep.running && <Button type="button" onClick={rep.resume}>Continue</Button>}
          <span className="text-xs text-faint">Nothing loads until you press Run. There is no time limit; Stop ends a run.</span>
        </div>
      </div>

      {rep.running && <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> {rep.rowsEntry?.status === 'loading' ? 'Reading the production of the period…' : 'Reading the latest sales prices…'} {fmtMs(elapsed)}</p>}
      {failed && <p role="alert" className="rounded-xl border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">{failed.error}</p>}
      {messages.length > 0 && <ul className="rounded-xl border border-warn/30 bg-warn/5 px-3 py-2 text-sm text-warn">{messages.map((m) => <li key={m}>{m}</li>)}</ul>}

      {rep.rows && (
        <>
          <div className="flex flex-wrap items-end gap-x-5 gap-y-2 rounded-2xl border border-line bg-panel px-4 py-3 shadow-card">
            <Field label="Select Brand">{(id) => sel(id, form.brand, (v) => patch({ brand: v, prodha: '', matnr: '' }), opts.brands, 'All brands')}</Field>
            <Field label="Select Product">{(id) => sel(id, form.prodha, (v) => patch({ prodha: v, matnr: '' }), opts.products, 'All products')}</Field>
            <Field label={wip ? 'Select WIP' : 'Select SKU'}>{(id) => sel(id, form.matnr, (v) => patch({ matnr: v }), opts.skus, wip ? 'All WIP codes' : 'All SKUs')}</Field>
            <Field label="Search">{(id) => <input id={id} className={cx(inputCls, 'w-48')} placeholder="code, description…" value={form.search} onChange={(e) => patch({ search: e.target.value })} />}</Field>
            <Field label="Simulate COGM: change %" hint="Computed here.">{(id) => <input id={id} inputMode="decimal" className={cx(inputCls, 'w-24')} placeholder="e.g. 5" value={form.pct} onChange={(e) => patch({ pct: e.target.value.replace(',', '.') })} />}</Field>
            <Field label="and amount / pc (INR)">{(id) => <input id={id} inputMode="decimal" className={cx(inputCls, 'w-24')} placeholder="e.g. -0.5" value={form.abs} onChange={(e) => patch({ abs: e.target.value.replace(',', '.') })} />}</Field>
            <Button size="sm" onClick={() => void doExport()} disabled={!table.length}><FileSpreadsheet size={14} /> Excel</Button>
          </div>

          {table.length === 0 ? (
            <Empty title={wip ? 'No WIP production found' : 'No finished-good production found'}>{wip ? 'SAP returned no WIP (type HALB) goods receipts for these plants and days, or the filters hide them.' : 'Nothing was produced in these plants within the look-back days, or the filters hide it.'}</Empty>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label={wip ? 'WIP codes' : 'SKUs'} value={new Set(table.map((r) => r.fg.Matnr)).size} sub={range ? `${range.from} to ${range.to}` : undefined} />
                <Stat label="Rows" value={table.length} sub="material x sales area" />
                <Stat label="Without a price" value={table.filter((r) => !r.price).length} sub="no sales order with a selling price" />
                <Stat label="Currency differs" value={table.filter((r) => r.price && !r.sameCurrency).length} sub="ratios not shown" />
              </div>
              <div className="overflow-x-auto rounded-2xl border border-line bg-panel shadow-card">
                <table className="w-full text-sm">
                  <thead className="bg-sunken">
                    <tr>
                      <th className={th}>Material code</th><th className={th}>Description</th><th className={th}>Plant</th><th className={thN}>Qty</th>
                      <th className={thN}>RM</th>{!wip && <th className={thN}>PM</th>}<th className={thN}>Perfume</th><th className={thN}>Overheads</th><th className={thN}>COGM<br />per pc</th>
                      <th className={thN}>Last MRP<br />per pc</th><th className={thN}>Last selling price<br />per pc</th><th className={thN}>Simulated COGM<br />per pc</th><th className={thN} title="Click for the reasons">Variance</th>
                      <th className={th}>Sale org</th><th className={th}>Channel</th><th className={thN}>Margin ratio<br />MRP : COGM</th><th className={thN}>Margin ratio<br />Selling price : COGM</th><th className={thN}>Margin ratio<br />Simulated COGM : COGM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.map((r) => (
                      <tr key={r.key} className="border-t border-line/60">
                        <td className={cx(td, 'font-mono font-bold')}>{r.fg.Matnr}</td><td className={td}>{r.fg.Maktx}</td><td className={td}>{r.fg.Werks}</td>
                        <td className={tdN}>{fmtNum(r.fg.Qty, 0, 'X')} {r.fg.Uom}</td>
                        <td className={tdN}>{money(r.fg.ActRm)}</td>{!wip && <td className={tdN}>{money(r.fg.ActPm)}</td>}<td className={tdN}>{money(r.fg.ActPerf)}</td><td className={tdN}>{money(r.fg.ActConv)}</td>
                        <td className={cx(tdN, 'font-bold')}>{money(r.cogm)}</td>
                        <td className={tdN}>{r.price && dec(r.price.Mrp) && !dec(r.price.Mrp)!.isZero() ? <>{fmtNum(r.price.Mrp, 2, r.price.Curr)} <span className="text-2xs text-muted">{r.price.Curr}</span></> : NA}</td>
                        <td className={tdN} title={r.price ? `Order ${r.price.Vbeln} / ${r.price.Posnr}, ${r.price.Audat ?? ''}` : 'No sales order with a selling price in the look-back days'}>{r.price ? <>{fmtNum(r.price.Sp, 2, r.price.Curr)} <span className="text-2xs text-muted">{r.price.Curr}</span></> : NA}</td>
                        <td className={tdN}>{r.sim ? fmtNum(r.sim, 4, 'INR') : <span className="text-faint" title="Enter a % or an amount above">—</span>}</td>
                        <td className={tdN}>
                          <button type="button" onClick={() => setOpen(r)} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-xs font-semibold text-accent hover:bg-sunken" aria-label={`Reasons of the variance of ${r.fg.Matnr}`}>
                            {r.variance ? <>{r.variance.gt(0) ? '▲ ' : r.variance.lt(0) ? '▼ ' : ''}{r.variance.gt(0) ? '+' : ''}{fmtNum(r.variance, 4, 'INR')}</> : 'Reasons ▸'}
                          </button>
                        </td>
                        <td className={td}>{r.price?.Vkorg || NA}</td><td className={td}>{r.price?.Vtweg || NA}</td>
                        <td className={tdN}>{r.price && !r.sameCurrency ? <span className="text-2xs text-warn" title="The price is not in INR like the cost: no ratio">currency differs</span> : ratioText(r.rMrp)}</td>
                        <td className={tdN}>{r.price && !r.sameCurrency ? <span className="text-2xs text-warn">currency differs</span> : ratioText(r.rSp)}</td>
                        <td className={tdN}>{r.price && !r.sameCurrency ? <span className="text-2xs text-warn">currency differs</span> : simOn ? ratioText(r.rSim) : <span className="text-faint">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted">Cost per piece is SAP&apos;s actual cost of the look-back period (goods receipts; Overheads = conversion). MRP and selling price are the latest sales order within the look-back days. Simulated COGM, the variance and the ratios are computed here (price divided by COGM, only when the price is in INR).{wip ? ' WIP: RM and Perfume only; WIP codes normally have no sales price.' : ''}</p>
            </>
          )}
        </>
      )}
      {!rep.q && <Empty title="Nothing loaded yet">Pick the plant and the look-back days, choose Finished goods or WIP, then press Run. Brand, Product and SKU filters appear once the data is loaded.</Empty>}
      {open && range && <ReasonsModal row={open} period={{ dateFrom: range.from, dateTo: range.to }} onClose={() => setOpen(null)} />}
    </>
  );
}

export default function CostReport() {
  return (
    <PlanFrame active="psum-report">
      <Screen />
    </PlanFrame>
  );
}
