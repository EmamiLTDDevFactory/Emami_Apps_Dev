'use client';
/**
 * Plant production summary (Admin of this app only): the finished goods a plant produced over a period (last 6 months by default),
 * their actual cost split into RM / PM / Perfume / Conversion, the components behind them and a month-by-month trend. Everything
 * comes from the WAC sets of ZMM_BOM_COST_SRV; the plant figures are SAP's per-unit values x the quantity produced, added up here
 * (said on screen). Read-only. Nothing loads until Run; no request has a time limit (Stop ends a run).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FileSpreadsheet, Lock, Play, RefreshCw, Square } from 'lucide-react';
import PlanFrame from '../plan/PlanFrame';
import FgDetail from './FgDetail';
import { PlantPicker } from '../Pickers';
import type { PlantsState } from '../FilterPanel';
import { useChartTheme } from '../charts';
import { Button, Empty, Field, Spinner, Stat, Toggle, cx, inputCls } from '../ui';
import { api } from '@/lib/client/api';
import { fetchIsAdmin } from '@/lib/client/hubAccess';
import { useHubSession } from '@/lib/client/session';
import { loadSapConfig } from '@/lib/sap/config';
import type { PlantRow } from '@/lib/sap/fields';
import { fmtMs, fmtNum } from '@/lib/format';
import { PSUM_PRESET_LABEL, monthSlices, psumRange, type PsumPreset } from '@/lib/psum/dates';
import { COMP_BATCH, usePsum, type PsumQuery } from '@/lib/psum/useSummary';
import { COST_LABEL, GROUP_CODE, GROUP_KEYS, GROUP_NAME, aggregateComponents, costMix, fgKey, fgValues, groupSummary, groupTotals, monthPoint, plantTotals, sharePct, type FgValue, type GroupKey } from '@/lib/psum/view';
import { componentSheet, downloadPsum, fgSheet, groupSheet, mixSheet, trendSheet } from '@/lib/psum/export';
import { intersectPlants } from '@/lib/wac/view';
import { buildWacFilter } from '@/lib/wac/filter';
import { parseWacUrl, wacSearch } from '@/lib/wac/url';
import type { WacCompRow, WacRow } from '@/lib/wac/types';
import type Decimal from 'decimal.js';
import { useHierNames } from '@/lib/client/useHierNames';

const PRESETS: PsumPreset[] = ['full6', 'full3', 'full12', 'td6', 'custom'];
const MIX_COLOR: Record<string, string> = { rm: '#4338CA', pm: '#0e9fb5', perf: '#C2185B', conv: '#eda100', other: '#8B8FA3' };
const th = 'px-2.5 py-1.5 text-left text-2xs font-bold uppercase tracking-wide text-muted';
const thN = `${th} text-right`;
const td = 'px-2.5 py-1.5 align-top';
const tdN = `${td} num whitespace-nowrap text-right`;
const NA = <span className="text-faint" title="No value from SAP">n/a</span>;
const inr = (v: Decimal | null, dp = 0) => (v === null ? NA : <>{fmtNum(v, dp, 'INR')} <span className="text-muted">INR</span></>);
const pct = (v: Decimal | null) => (v === null ? '—' : `${v.toFixed(1)} %`);
type Tab = 'fg' | 'rmpm' | 'comp' | 'trend';

function Screen() {
  const hn = useHierNames();
  const hub = useHubSession();
  const email = hub && hub !== 'checking' ? hub.email : '';
  const [admin, setAdmin] = useState<'checking' | 'yes' | 'no'>('checking');
  useEffect(() => { if (email) void fetchIsAdmin(email).then((a) => setAdmin(a ? 'yes' : 'no')); }, [email]);
  const system = useMemo(() => { if (typeof window === 'undefined') return ''; const c = loadSapConfig(); return c.ok ? c.config.system : ''; }, []);

  const [form, setForm] = useState(() => {
    const url = typeof window === 'undefined' ? {} : parseWacUrl(window.location.search);
    const r = psumRange('full6')!;
    return { plants: url.plants ?? [], preset: (url.from || url.to ? 'custom' : 'full6') as PsumPreset, from: url.from ?? r.from, to: url.to ?? r.to, comp: true, compTop: 25, trend: true };
  });
  const patch = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));
  useEffect(() => { // the URL mirrors the selection; it never starts a run
    const s = wacSearch({ plants: form.plants, from: form.from, to: form.to, mat: [], prodha: [], cmp: false });
    if (s !== window.location.search) window.history.replaceState(null, '', `${window.location.pathname}${s}`);
  }, [form.plants, form.from, form.to]);

  const [plants, setPlants] = useState<PlantRow[]>([]);
  const [plantsLoading, setPlantsLoading] = useState(false);
  const [plantsErr, setPlantsErr] = useState('');
  const loadPlants = useCallback(() => { setPlantsLoading(true); setPlantsErr(''); api.plants().then((r) => setPlants(r.plants)).catch((e) => setPlantsErr(e.message)).finally(() => setPlantsLoading(false)); }, []);
  useEffect(() => { if (admin === 'yes') loadPlants(); }, [admin, loadPlants]);
  const plantsState: PlantsState = useMemo(() => ({ plants, loading: plantsLoading, error: plantsErr, reload: loadPlants }), [plants, plantsLoading, plantsErr, loadPlants]);

  const { q, state, start, halt, resume, refresh } = usePsum();
  const [errors, setErrors] = useState<{ plants?: string; dates?: string }>({});
  const [runAt, setRunAt] = useState<Date | null>(null);
  const [tab, setTab] = useState<Tab>('fg');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<FgValue | null>(null);
  const [grpTab, setGrpTab] = useState<GroupKey>('rm');

  const run = () => {
    const e: typeof errors = {};
    if (!form.plants.length) e.plants = 'Pick at least one manufacturing unit.';
    const allowed = plants.length ? intersectPlants(form.plants, plants.map((p) => p.Werks)) : form.plants;
    if (form.plants.length && !allowed.length) e.plants = 'None of these plants is available to you in SAP.';
    if (!form.from || !form.to) e.dates = 'Both dates are required.'; else if (form.from > form.to) e.dates = 'The "from" date is after the "to" date.';
    setErrors(e);
    if (Object.keys(e).length) return;
    const query: PsumQuery = { plants: allowed, dateFrom: form.from, dateTo: form.to, compTop: form.compTop, withComponents: form.comp, withTrend: form.trend };
    try { buildWacFilter(query); } catch (err) { setErrors({ dates: (err as Error).message }); return; }
    setRunAt(new Date());
    start(query);
  };

  const [now, setNow] = useState(0);
  useEffect(() => { if (!state.running) return; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, [state.running]);

  const rows = (state.main?.status === 'done' ? state.main.data : null) as WacRow[] | null;
  const vals = useMemo(() => (rows ? fgValues(rows) : []), [rows]);
  const totals = useMemo(() => plantTotals(vals), [vals]);
  const mix = useMemo(() => costMix(totals), [totals]);
  const qtyOf = useMemo(() => new Map(vals.map((v) => [fgKey(v.row), v.qty])), [vals]);
  const comps = useMemo(() => state.batches.flatMap((b) => (b.entry?.status === 'done' ? (b.entry.data as WacCompRow[]) : [])), [state.batches]);
  const compAgg = useMemo(() => aggregateComponents(comps, qtyOf), [comps, qtyOf]);
  const grpAgg = useMemo(() => groupTotals(compAgg), [compAgg]);
  const trend = useMemo(() => state.months.filter((m) => m.entry?.status === 'done').map((m) => monthPoint(m.slice.key, m.slice.label, m.entry!.data as WacRow[])), [state.months]);
  const batchesDone = state.batches.filter((b) => b.entry?.status === 'done').length;
  const monthsDone = state.months.filter((m) => m.entry?.status === 'done').length;
  const stopped = [state.main, ...state.months.map((m) => m.entry), ...state.batches.map((b) => b.entry)].some((e) => e?.status === 'cancelled');
  const failed = [state.main, ...state.months.map((m) => m.entry), ...state.batches.map((b) => b.entry)].filter((e) => e?.status === 'error');
  const loadedSet = new Set(state.batches.filter((b) => b.entry?.status === 'done').flatMap((b) => b.mats));
  const coverage = sharePct(vals.filter((v) => loadedSet.has(v.row.Matnr)).reduce((a, v) => a.plus(v.landed), totals.landed.minus(totals.landed)), totals.landed);
  const loadedFgs = new Set(state.batches.filter((b) => b.entry?.status === 'done').flatMap((b) => b.mats)).size;

  const fgRows = useMemo(() => { const s = search.trim().toLowerCase(); return s ? vals.filter((v) => `${v.row.Matnr} ${v.row.Maktx} ${v.row.Zbrand} ${v.row.Prodha}`.toLowerCase().includes(s)) : vals; }, [vals, search]);
  const grpSums = useMemo(() => GROUP_KEYS.map((k) => groupSummary(vals, k, totals)), [vals, totals]);
  const ct = useChartTheme();

  const doExport = async () => {
    if (!q) return;
    const sheets = [fgSheet(vals, totals), mixSheet(mix), groupSheet(grpSums, compAgg), ...(compAgg.length ? [componentSheet(compAgg)] : []), ...(trend.length ? [trendSheet(trend)] : [])];
    await downloadPsum(sheets, [
      ['Report', 'Plant production summary: finished goods produced, actual cost and component breakup'], ['SAP system', system], ['Run at', runAt?.toLocaleString('en-IN') ?? ''],
      ['Plants', q.plants.join(', ')], ['Period', `${q.dateFrom} to ${q.dateTo}`],
      ['Method', 'Values = SAP per-unit actual cost x quantity produced, added up here. Component cost = SAP cost at the selected rate x quantity produced.'],
      ['Components loaded for', q.withComponents ? `${loadedFgs} of ${vals.length} finished goods (ranked by value)` : 'not requested'],
    ]);
  };

  if (admin === 'checking') return <div className="grid min-h-[40vh] place-items-center"><Spinner className="h-7 w-7" /></div>;
  if (admin === 'no') {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-line bg-panel p-7 text-center shadow-card">
        <Lock size={24} className="mx-auto text-warn" aria-hidden />
        <h1 className="mt-2 text-lg font-extrabold">Plant production summary is for Admins</h1>
        <p className="mt-1 text-sm text-muted">Ask a Costing Cockpit Admin for access (Manage Access in the Emami Apps Admin Center).</p>
      </div>
    );
  }
  const loadingMain = state.main?.status === 'loading';
  const elapsed = state.main?.status === 'loading' ? now - state.main.startedAt : 0;
  const messages = [state.main, ...state.batches.map((b) => b.entry)].flatMap((e) => e?.messages ?? []);
  const uniqMsg = Array.from(new Set(messages.map((m) => m.message)));

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold">Plant production summary</h1>
          <p className="text-xs text-muted">What a plant produced over a period: finished goods, actual cost split into RM / PM / Perfume / Conversion, the components behind it and the month-wise trend. From SAP&apos;s goods-receipt based actual cost.</p>
        </div>
        <div className="num text-right text-2xs text-muted">SAP system <span className="font-mono font-bold text-ink">{system || '—'}</span>{runAt && state.main?.status === 'done' && <div>Run {runAt.toLocaleTimeString('en-IN')} · {fmtMs(state.main.ms)} in SAP</div>}</div>
      </div>

      <div className="rounded-2xl border border-line bg-panel px-4 py-3 shadow-card">
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Manufacturing units (plants)" hint="Required, for example UB01. Only plants SAP lists for you can be used." error={errors.plants}>
            {(id) => <PlantPicker id={id} values={form.plants} onChange={(p) => patch({ plants: p })} state={plantsState} invalid={!!errors.plants} />}
          </Field>
          <Field label="Period" error={errors.dates} hint="Both dates are required.">
            {(id) => (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Period preset">
                  {PRESETS.map((p) => (
                    <button key={p} type="button" role="radio" aria-checked={form.preset === p} onClick={() => { const r = psumRange(p); patch(r ? { preset: p, from: r.from, to: r.to } : { preset: p }); }}
                      className={cx('rounded-full border px-3 py-1 text-xs font-bold', form.preset === p ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:text-ink')}>{PSUM_PRESET_LABEL[p]}</button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input id={id} type="date" aria-label="From date" className={cx(inputCls, 'w-40')} value={form.from} onChange={(e) => patch({ from: e.target.value, preset: 'custom' })} />
                  <span className="text-xs text-muted">to</span>
                  <input type="date" aria-label="To date" className={cx(inputCls, 'w-40')} value={form.to} onChange={(e) => patch({ to: e.target.value, preset: 'custom' })} />
                </div>
              </div>
            )}
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
          <Toggle checked={form.trend} onChange={(trend) => patch({ trend })} label="Monthly trend" />
          <div className="flex flex-col gap-1">
            <Toggle checked={form.comp} onChange={(comp) => patch({ comp })} label="Component breakup" />
            {form.comp && <p className="max-w-md text-xs text-warn">Live costing in batches of {COMP_BATCH} finished goods, about 10-15 s per batch.</p>}
          </div>
          {form.comp && (
            <Field label="Components for" hint="Finished goods ranked by total value.">
              {(id) => (
                <select id={id} className={cx(inputCls, 'w-56')} value={form.compTop} onChange={(e) => patch({ compTop: Number(e.target.value) })}>
                  <option value={25}>Top 25 finished goods</option><option value={50}>Top 50 finished goods</option><option value={100}>Top 100 finished goods</option><option value={0}>Every finished good (can take long)</option>
                </select>
              )}
            </Field>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {state.running ? <Button type="button" variant="ghost" onClick={halt}><Square size={14} /> Stop ({fmtMs(elapsed || (state.main ? now - state.main.startedAt : 0))})</Button> : <Button type="button" variant="primary" onClick={run}><Play size={14} /> Run</Button>}
          <Button type="button" onClick={refresh} disabled={!q || state.running} title="Fetch the same selection again from SAP (a result is kept until you refresh)"><RefreshCw size={14} /> Refresh</Button>
          {(stopped || failed.length > 0) && !state.running && <Button type="button" onClick={resume}>Continue the remaining steps</Button>}
          <span className="text-xs text-faint">Nothing loads until you press Run. There is no time limit; Stop ends a run.</span>
        </div>
      </div>

      {q && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-live="polite">
          {state.running && <Spinner className="h-3.5 w-3.5" />}
          <span>Finished goods: <b>{state.main?.status === 'done' ? 'done' : state.main?.status === 'loading' ? 'reading from SAP…' : state.main?.status ?? '—'}</b></span>
          {q.withTrend && <span>Months: <b>{monthsDone} of {state.months.length}</b></span>}
          {q.withComponents && <span>Component batches: <b>{batchesDone} of {state.batches.length}</b></span>}
        </p>
      )}
      {stopped && !state.running && <p className="text-sm text-muted">The run was stopped. What was loaded is shown; &quot;Continue&quot; fetches the rest.</p>}
      {failed.map((e, i) => <p key={i} role="alert" className="rounded-xl border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">{e!.error}</p>)}
      {uniqMsg.length > 0 && <ul className="rounded-xl border border-warn/30 bg-warn/5 px-3 py-2 text-sm text-warn">{uniqMsg.map((m) => <li key={m}>{m}</li>)}</ul>}
      {loadingMain && !rows && <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Reading from SAP… {fmtMs(elapsed)}</p>}

      {rows && state.main?.status === 'done' && (vals.length === 0 ? (
        <Empty title="No production in this period">SAP found no goods-receipt documents with a quantity for these plants and dates. Try a wider period.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Finished goods produced" value={totals.fgs} sub={`${totals.docs} documents · ${totals.batches} batches`} />
            <Stat label="Quantity produced" value={totals.qtyByUom.length === 1 ? `${fmtNum(totals.qtyByUom[0].qty, 0, 'X')} ${totals.qtyByUom[0].uom}` : `${totals.qtyByUom.length} units`} sub={totals.qtyByUom.length > 1 ? totals.qtyByUom.slice(0, 3).map((u) => `${fmtNum(u.qty, 0, 'X')} ${u.uom}`).join(' · ') : undefined} />
            <Stat label="Total actual value" value={inr(totals.landed)} sub="landed, summed here from SAP per-unit values" />
            <Stat label="Material share" value={pct(sharePct(totals.rm.plus(totals.pm).plus(totals.perf), totals.landed))} sub="RM + PM + Perfume of the total" />
          </div>

          <section aria-label="Cost mix" className="rounded-2xl border border-line bg-panel px-4 py-3 shadow-card">
            <h2 className="text-sm font-extrabold">Where the cost goes</h2>
            <div className="mt-2 flex h-5 w-full overflow-hidden rounded-md bg-sunken" role="img" aria-label={mix.map((m) => `${m.label} ${pct(m.pct)}`).join(', ')}>
              {mix.map((m) => (m.pct && m.pct.gt(0) ? <div key={m.key} style={{ width: `${m.pct.toNumber()}%`, background: MIX_COLOR[m.key] }} title={`${m.label} ${pct(m.pct)}`} /> : null))}
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
              {mix.map((m) => <li key={m.key} className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: MIX_COLOR[m.key] }} aria-hidden /><span className="font-semibold">{m.label}</span><span className="num text-muted">{inr(m.value)} · {pct(m.pct)}</span></li>)}
            </ul>
          </section>

          <div role="tablist" aria-label="Summary views" className="flex gap-1 border-b border-line">
            {([['fg', `Finished goods (${vals.length})`], ['rmpm', 'RM · PM · Perfume'], ['comp', `Component breakup${q?.withComponents ? ` (${compAgg.length})` : ''}`], ['trend', `Monthly trend${q?.withTrend ? ` (${monthsDone}/${state.months.length})` : ''}`]] as [Tab, string][]).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx('-mb-px border-b-2 px-3 py-2 text-sm font-bold', tab === k ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink')}>{label}</button>
            ))}
            <div className="ml-auto pb-1"><Button size="sm" onClick={() => void doExport()} title="Excel: Finished goods, Cost mix, Components, Monthly trend, Parameters (only what is loaded)"><FileSpreadsheet size={14} /> Excel</Button></div>
          </div>

          {tab === 'fg' && (
            <section role="tabpanel" aria-label="Finished goods" className="flex flex-col gap-3">
              <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
                <div className="rounded-2xl border border-line bg-panel px-4 py-3 shadow-card">
                  <h2 className="text-sm font-extrabold">Top 10 by total value</h2>
                  <div className="mt-2 h-72">
                    <ResponsiveContainer>
                      <BarChart data={vals.slice(0, 10).map((v) => ({ name: v.row.Matnr, rm: v.rm.toNumber(), pm: v.pm.toNumber(), perf: v.perf.toNumber(), conv: v.conv.toNumber() }))} layout="vertical" margin={{ left: 10, right: 10 }}>
                        <CartesianGrid stroke={ct.grid} horizontal={false} />
                        <XAxis type="number" tick={{ fill: ct.axis, fontSize: 11 }} tickFormatter={(x) => fmtNum(x, 0, 'INR')} />
                        <YAxis type="category" dataKey="name" width={86} tick={{ fill: ct.axis, fontSize: 11 }} />
                        <Tooltip formatter={(x, n) => [`${fmtNum(Number(x), 0, 'INR')} INR`, COST_LABEL[String(n) as 'rm']]} />
                        <Legend formatter={(n) => COST_LABEL[n as 'rm']} />
                        {(['rm', 'pm', 'perf', 'conv'] as const).map((k) => <Bar key={k} dataKey={k} stackId="a" fill={MIX_COLOR[k]} isAnimationActive={false} />)}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="rounded-2xl border border-line bg-panel px-4 py-3 shadow-card">
                  <h2 className="text-sm font-extrabold">How to read this</h2>
                  <ul className="mt-1 list-disc pl-4 text-xs text-muted">
                    <li>Value = SAP&apos;s actual cost per unit x the quantity produced, added up here (the only arithmetic on this page).</li>
                    <li><b>Click a finished good</b> (or press Enter) for its full costing: summary, component-wise cost and the BOM costing breakup.</li>
                    <li>Finished goods are ranked by total value; the share column is of the plant total.</li>
                    <li>&quot;Other&quot; is landed cost minus RM, PM, Perfume and Conversion (a reconciliation gap from SAP), shown only when it is above 0.5 %.</li>
                  </ul>
                </div>
              </div>
              <input className={cx(inputCls, 'w-72')} placeholder="Search finished good, brand or product…" aria-label="Search finished goods" value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="overflow-x-auto rounded-2xl border border-line bg-panel shadow-card">
                <table className="w-full text-sm">
                  <thead className="bg-sunken"><tr><th className={th}>Finished good</th><th className={th}>Brand</th><th className={thN}>Quantity</th><th className={thN}>Actual / unit</th><th className={thN}>RM</th><th className={thN}>PM</th><th className={thN}>Perfume</th><th className={thN}>Conversion</th><th className={thN}>Total value</th><th className={thN}>Share</th></tr></thead>
                  <tbody>
                    {fgRows.map((v) => (
                      <tr key={v.key} className="cursor-pointer border-t border-line/60 hover:bg-sunken focus:bg-sunken focus:outline-none" tabIndex={0} role="button" aria-label={`Open costing of ${v.row.Matnr}`} onClick={() => setOpen(v)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(v); } }}>
                        <td className={td}><span className="font-mono font-bold">{v.row.Matnr}</span> <span className="text-muted">{v.row.Maktx}</span></td>
                        <td className={td}>{v.row.Zbrand ? hn.brand(v.row.Zbrand) : NA}</td>
                        <td className={tdN}>{fmtNum(v.qty, 0, 'X')} {v.row.Uom}</td>
                        <td className={tdN}>{fmtNum(v.landed.div(v.qty), 4, 'INR')}</td>
                        <td className={tdN}>{fmtNum(v.rm, 0, 'INR')}</td><td className={tdN}>{fmtNum(v.pm, 0, 'INR')}</td><td className={tdN}>{fmtNum(v.perf, 0, 'INR')}</td><td className={tdN}>{fmtNum(v.conv, 0, 'INR')}</td>
                        <td className={cx(tdN, 'font-bold')}>{fmtNum(v.landed, 0, 'INR')}</td><td className={tdN}>{pct(sharePct(v.landed, totals.landed))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="border-t-2 border-line bg-sunken font-bold"><td className={td} colSpan={4}>Plant total (INR)</td><td className={tdN}>{fmtNum(totals.rm, 0, 'INR')}</td><td className={tdN}>{fmtNum(totals.pm, 0, 'INR')}</td><td className={tdN}>{fmtNum(totals.perf, 0, 'INR')}</td><td className={tdN}>{fmtNum(totals.conv, 0, 'INR')}</td><td className={tdN}>{fmtNum(totals.landed, 0, 'INR')}</td><td className={tdN}>100 %</td></tr></tfoot>
                </table>
              </div>
            </section>
          )}

          {tab === 'rmpm' && (
            <section role="tabpanel" aria-label="RM, PM and Perfume" className="flex flex-col gap-3">
              <div className="grid gap-3 md:grid-cols-3">
                {grpSums.map((g) => (
                  <button key={g.key} type="button" onClick={() => setGrpTab(g.key)} aria-pressed={grpTab === g.key}
                    className={cx('rounded-2xl border bg-panel px-4 py-3 text-left shadow-card', grpTab === g.key ? 'border-accent ring-1 ring-accent' : 'border-line hover:border-accent/50')}>
                    <div className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wide text-muted"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: MIX_COLOR[g.key] }} aria-hidden />{g.name}</div>
                    <div className="num mt-1 text-2xl font-extrabold">{fmtNum(g.value, 0, 'INR')} <span className="text-sm font-semibold text-muted">INR</span></div>
                    <div className="num text-2xs text-muted">{pct(g.pctOfTotal)} of the plant value · in {g.fgs} finished goods</div>
                  </button>
                ))}
              </div>
              {(() => {
                const g = grpSums.find((x) => x.key === grpTab)!;
                const code = GROUP_CODE[grpTab];
                const cr = compAgg.filter((c) => c.grp === code);
                const crTotal = cr.reduce((a, c) => a.plus(c.cost), totals.landed.minus(totals.landed));
                return (
                  <>
                    <h2 className="text-sm font-extrabold">{GROUP_NAME[grpTab]}: finished goods that carry most of it</h2>
                    <div className="overflow-x-auto rounded-2xl border border-line bg-panel shadow-card">
                      <table className="w-full text-sm">
                        <thead className="bg-sunken"><tr><th className={th}>Finished good</th><th className={thN}>Quantity</th><th className={thN}>{GROUP_NAME[grpTab]} / unit</th><th className={thN}>Value</th><th className={thN}>Share of {grpTab.toUpperCase()}</th></tr></thead>
                        <tbody>
                          {g.top.map((x) => (
                            <tr key={x.v.key} className="cursor-pointer border-t border-line/60 hover:bg-sunken" onClick={() => setOpen(x.v)}>
                              <td className={td}><span className="font-mono font-bold">{x.v.row.Matnr}</span> <span className="text-muted">{x.v.row.Maktx}</span></td>
                              <td className={tdN}>{fmtNum(x.v.qty, 0, 'X')} {x.v.row.Uom}</td>
                              <td className={tdN}>{fmtNum(x.value.div(x.v.qty), 4, 'INR')}</td><td className={tdN}>{fmtNum(x.value, 0, 'INR')}</td><td className={tdN}>{pct(x.pctOfGroup)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <h2 className="text-sm font-extrabold">{GROUP_NAME[grpTab]}: components (what is consumed)</h2>
                    {!q?.withComponents ? <p className="text-sm text-muted">Switch on &quot;Component breakup&quot; and press Run to see the {grpTab.toUpperCase()} components.</p> : cr.length === 0 ? (
                      <p className="flex items-center gap-2 text-sm text-muted">{state.running ? <><Spinner className="h-4 w-4" /> Costing the first batch of {COMP_BATCH} finished goods…</> : 'No component of this group from SAP for the loaded finished goods.'}</p>
                    ) : (
                      <>
                        <p className="text-xs text-muted">From the components loaded for {loadedFgs} of {vals.length} finished goods ({fmtNum(coverage, 0, 'X')} % of the plant value). Cost at the selected rate x quantity produced, added up here.</p>
                        <div className="overflow-x-auto rounded-2xl border border-line bg-panel shadow-card">
                          <table className="w-full text-sm">
                            <thead className="bg-sunken"><tr><th className={th}>Component</th><th className={thN}>Quantity</th><th className={thN}>Cost at selected rate</th><th className={thN}>Average rate</th><th className={thN}>Used in</th><th className={thN}>Share of {grpTab.toUpperCase()}</th></tr></thead>
                            <tbody>
                              {cr.slice(0, 100).map((c) => (
                                <tr key={`${c.idnrk}|${c.uom}`} className="border-t border-line/60">
                                  <td className={td}><span className="font-mono font-bold">{c.idnrk}</span> <span className="text-muted">{c.text}</span></td>
                                  <td className={tdN}>{fmtNum(c.qty, 1, 'X')} {c.uom}</td><td className={tdN}>{c.cost.isZero() && c.noCostFgs ? NA : fmtNum(c.cost, 0, 'INR')}</td>
                                  <td className={tdN}>{c.avgRate ? fmtNum(c.avgRate, 4, 'INR') : NA}</td><td className={tdN}>{c.fgs} FG</td><td className={tdN}>{pct(sharePct(c.cost, crTotal))}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {cr.length > 100 && <p className="text-xs text-muted">Showing the 100 largest of {cr.length}; the Excel has all of them.</p>}
                      </>
                    )}
                  </>
                );
              })()}
            </section>
          )}

          {tab === 'comp' && (
            <section role="tabpanel" aria-label="Component breakup" className="flex flex-col gap-3">
              {!q?.withComponents ? <Empty title="Component breakup was not requested">Switch on &quot;Component breakup&quot; and press Run.</Empty> : compAgg.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted">{state.running ? <><Spinner className="h-4 w-4" /> Costing the first batch of {COMP_BATCH} finished goods…</> : 'No component data from SAP for this selection.'}</p>
              ) : (
                <>
                  <p className="text-xs text-muted">Components of <b>{loadedFgs}</b> of {vals.length} finished goods ({fmtNum(coverage, 0, 'X')} % of the plant value, ranked by value). Quantity = quantity per unit x quantity produced; cost = SAP cost at the selected rate x quantity produced; both added up here.</p>
                  <div className="flex flex-wrap gap-2">{grpAgg.map((g) => <span key={g.grp} className="rounded-full border border-line bg-panel px-3 py-1 text-xs"><b>{g.grp}</b> <span className="num text-muted">{inr(g.cost)} · {pct(g.pct)} · {g.comps} items</span></span>)}</div>
                  <div className="overflow-x-auto rounded-2xl border border-line bg-panel shadow-card">
                    <table className="w-full text-sm">
                      <thead className="bg-sunken"><tr><th className={th}>Component</th><th className={th}>Group</th><th className={thN}>Quantity</th><th className={thN}>Cost at selected rate</th><th className={thN}>Average rate</th><th className={thN}>Used in</th><th className={thN}>Share</th></tr></thead>
                      <tbody>
                        {compAgg.map((c) => (
                          <tr key={`${c.idnrk}|${c.uom}`} className="border-t border-line/60">
                            <td className={td}><span className="font-mono font-bold">{c.idnrk}</span> <span className="text-muted">{c.text}</span></td><td className={td}>{c.grp}</td>
                            <td className={tdN}>{fmtNum(c.qty, 1, 'X')} {c.uom}</td>
                            <td className={tdN}>{c.cost.isZero() && c.noCostFgs ? NA : fmtNum(c.cost, 0, 'INR')}{c.noCostFgs > 0 && <span className="ml-1 text-2xs text-warn" title="Some finished goods have no cost for this component from SAP">({c.noCostFgs} no cost)</span>}</td>
                            <td className={tdN}>{c.avgRate ? fmtNum(c.avgRate, 4, 'INR') : NA}</td><td className={tdN}>{c.fgs} FG</td><td className={tdN}>{pct(c.sharePct)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          )}

          {tab === 'trend' && (
            <section role="tabpanel" aria-label="Monthly trend" className="flex flex-col gap-3">
              {!q?.withTrend ? <Empty title="Monthly trend was not requested">Switch on &quot;Monthly trend&quot; and press Run.</Empty> : trend.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted">{state.running ? <><Spinner className="h-4 w-4" /> Reading the months…</> : 'No month loaded.'}</p>
              ) : (
                <>
                  <div className="rounded-2xl border border-line bg-panel px-4 py-3 shadow-card">
                    <div className="h-72">
                      <ResponsiveContainer>
                        <BarChart data={trend.map((p) => ({ name: p.label, rm: p.rm.toNumber(), pm: p.pm.toNumber(), perf: p.perf.toNumber(), conv: p.conv.toNumber() }))}>
                          <CartesianGrid stroke={ct.grid} vertical={false} />
                          <XAxis dataKey="name" tick={{ fill: ct.axis, fontSize: 11 }} />
                          <YAxis tick={{ fill: ct.axis, fontSize: 11 }} tickFormatter={(x) => fmtNum(x, 0, 'INR')} width={90} />
                          <Tooltip formatter={(x, n) => [`${fmtNum(Number(x), 0, 'INR')} INR`, COST_LABEL[String(n) as 'rm']]} />
                          <Legend formatter={(n) => COST_LABEL[n as 'rm']} />
                          {(['rm', 'pm', 'perf', 'conv'] as const).map((k) => <Bar key={k} dataKey={k} stackId="a" fill={MIX_COLOR[k]} isAnimationActive={false} />)}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-line bg-panel shadow-card">
                    <table className="w-full text-sm">
                      <thead className="bg-sunken"><tr><th className={th}>Month</th><th className={thN}>Finished goods</th><th className={th}>Quantity</th><th className={thN}>RM</th><th className={thN}>PM</th><th className={thN}>Perfume</th><th className={thN}>Conversion</th><th className={thN}>Total value</th></tr></thead>
                      <tbody>
                        {trend.map((p) => (
                          <tr key={p.key} className="border-t border-line/60"><td className={cx(td, 'font-bold')}>{p.label}</td><td className={tdN}>{p.fgs}</td><td className={td}>{p.qtyByUom.slice(0, 3).map((u) => `${fmtNum(u.qty, 0, 'X')} ${u.uom}`).join(' · ') || '—'}</td>
                            <td className={tdN}>{fmtNum(p.rm, 0, 'INR')}</td><td className={tdN}>{fmtNum(p.pm, 0, 'INR')}</td><td className={tdN}>{fmtNum(p.perf, 0, 'INR')}</td><td className={tdN}>{fmtNum(p.conv, 0, 'INR')}</td><td className={cx(tdN, 'font-bold')}>{fmtNum(p.landed, 0, 'INR')}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {monthSlices(q.dateFrom, q.dateTo).length > trend.length && !state.running && <p className="text-xs text-warn">Some months are not loaded (stopped or failed). &quot;Continue the remaining steps&quot; fetches them.</p>}
                </>
              )}
            </section>
          )}
        </>
      ))}
      {open && q && <FgDetail v={open} period={{ dateFrom: q.dateFrom, dateTo: q.dateTo }} totals={totals} plants={plants} loadedComps={comps} onClose={() => setOpen(null)} />}
      {!q && <Empty title="Nothing loaded yet">Pick the plant (for example UB01) and the period (default: last 6 full months), then press Run.</Empty>}
    </>
  );
}

export default function PlantSummary() {
  return (
    <PlanFrame active="psum">
      <Screen />
    </PlanFrame>
  );
}
