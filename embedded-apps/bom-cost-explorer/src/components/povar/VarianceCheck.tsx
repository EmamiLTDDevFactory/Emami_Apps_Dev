'use client';
/**
 * Variance check (Admin of this app only): the daily ZMM_PCOST + ZMM_COST routine in one screen, against BOTH standards.
 *  1. Orders: every process-order receipt of the selection with its cost per piece against the MBEW price (ZMM_PCOST's own comparison) and against the
 *     CK13N current standard estimate. Orders beyond the threshold (4 % by default, either way, on MBEW or CK13N) on top.
 *  2. Click an order (or "Find the causes" for all flagged orders): ZMM_COST of that order - each consumed component against CK13N (rate / quantity
 *     variance, from the costing structure of the released estimate, every level) and against its MBEW price.
 *  3. Causes: the components of every checked order added up - which material drives the day's variance.
 * SAP computes the order figures, the MBEW and CK13N values (PoVarSet, CkHeaderSet / CkItemSet / CkListSet); this screen filters, sorts, scales the
 * CK13N structure to the pieces produced and adds up variances. Read-only; nothing loads before Run.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronRight, FileSpreadsheet, Lock, Play, Search, Square } from 'lucide-react';
import Decimal from 'decimal.js';
import PlanFrame from '../plan/PlanFrame';
import { PlantPicker, splitList } from '../Pickers';
import type { PlantsState } from '../FilterPanel';
import { Button, Drawer, Empty, Field, Segmented, Spinner, Stat, Tabs, cx, inputCls } from '../ui';
import { api } from '@/lib/client/api';
import { fetchIsAdmin } from '@/lib/client/hubAccess';
import { useHubSession } from '@/lib/client/session';
import { loadSapConfig } from '@/lib/sap/config';
import type { PlantRow } from '@/lib/sap/fields';
import { fmtDate, fmtMs, fmtNum } from '@/lib/format';
import { intersectPlants } from '@/lib/wac/view';
import { downloadWacWorkbook } from '@/lib/wac/export';
import { DEFAULT_VAR_PCT } from '@/lib/povar/flag';
import type { PoVarRow } from '@/lib/povar/fields';
import { buildOrdersFilter, fetchBreakup, fetchOrders, type DateType, type OrdersQuery } from '@/lib/povar/service';
import { loadCkStd } from '@/lib/povar/ck';
import { BASIS_LABEL, CAT_LABEL, DIRECTION_LABEL, PRICE_CONTROL, breakupOf, causes, ckCompare, crosses, dec, hasCk, hasStd, orderStats, shareOf, sortReceipts, splitRows, strip, yesterday, type Basis, type CkCompare, type Direction } from '@/lib/povar/view';
import { causesSheet, ckSheet, componentsSheet, ordersSheet } from '@/lib/povar/export';

const th = 'px-2.5 py-1.5 text-left text-2xs font-bold uppercase tracking-wide text-muted';
const thN = `${th} text-right`;
const td = 'px-2.5 py-1.5 align-top';
const tdN = `${td} num whitespace-nowrap text-right`;
const NA = <span className="text-faint" title="No value from SAP">n/a</span>;
const PARALLEL = 2;

const money = (v: string | Decimal | null | undefined, dp = 2) => { if (v === null || v === undefined || v === '') return NA; return <>{fmtNum(v as string, dp, 'INR')}</>; };
function Diff({ v, pct }: { v: string | Decimal | null; pct: number }) {
  const d = typeof v === 'string' ? dec(v) : v;
  if (!d) return NA;
  const over = d.abs().gte(pct);
  return <span className={cx('font-bold', over && (d.isNegative() ? 'text-bad' : 'text-good'))} title={d.isNegative() ? 'Costlier than standard' : 'Cheaper than standard'}>{d.isPositive() ? '+' : ''}{d.toFixed(2)} %</span>;
}
/** A variance value (actual - standard): positive = costlier, shown red. */
function Var({ v, dp = 0 }: { v: Decimal | string | null | undefined; dp?: number }) {
  const d = typeof v === 'string' ? dec(v) : v ?? null;
  if (!d) return NA;
  return <span className={cx(!d.isZero() && (d.isPositive() ? 'text-bad' : 'text-good'))}>{fmtNum(d, dp, 'INR')}</span>;
}
const FLAG_TEXT: Record<string, string> = { NOSTD: 'No MBEW price', NOCOST: 'No cost', UOM: 'Unit differs' };

type BState = { status: 'loading' } | { status: 'done'; rows: PoVarRow[]; ms: number } | { status: 'error'; error: string };
type KState = { status: 'loading' } | { status: 'done'; cmp: CkCompare; kadky: string | null; klvar: string; status2: string; none: boolean } | { status: 'error'; error: string };
type Tab = 'orders' | 'causes';

function Screen() {
  const hub = useHubSession();
  const email = hub && hub !== 'checking' ? hub.email : '';
  const [admin, setAdmin] = useState<'checking' | 'yes' | 'no'>('checking');
  useEffect(() => { if (email) void fetchIsAdmin(email).then((a) => setAdmin(a ? 'yes' : 'no')); }, [email]);
  const system = useMemo(() => { if (typeof window === 'undefined') return ''; const c = loadSapConfig(); return c.ok ? c.config.system : ''; }, []);

  const [plants, setPlants] = useState<PlantRow[]>([]);
  const [plantsLoading, setPlantsLoading] = useState(false);
  const [plantsErr, setPlantsErr] = useState('');
  const loadPlants = useCallback(() => { setPlantsLoading(true); setPlantsErr(''); api.plants().then((r) => setPlants(r.plants)).catch((e) => setPlantsErr(e.message)).finally(() => setPlantsLoading(false)); }, []);
  useEffect(() => { if (admin === 'yes') loadPlants(); }, [admin, loadPlants]);
  const plantsState: PlantsState = useMemo(() => ({ plants, loading: plantsLoading, error: plantsErr, reload: loadPlants }), [plants, plantsLoading, plantsErr, loadPlants]);

  const y = useMemo(() => yesterday(), []);
  const [form, setForm] = useState({ plants: [] as string[], from: y, to: y, dateType: 'C' as DateType, mats: '', orders: '' });
  const [pct, setPct] = useState(DEFAULT_VAR_PCT);
  const [dir, setDir] = useState<Direction>('both');
  const [basis, setBasis] = useState<Basis>('either');
  const [onlyFlagged, setOnlyFlagged] = useState(true);
  const [error, setError] = useState('');
  const [run, setRun] = useState<{ q: OrdersQuery; status: 'loading' | 'done' | 'error'; rows: PoVarRow[]; ms: number; error?: string; at: Date } | null>(null);
  const [breakups, setBreakups] = useState<Map<string, BState>>(new Map());
  const [cks, setCks] = useState<Map<string, KState>>(new Map());
  const [open, setOpen] = useState<PoVarRow | null>(null);
  const [tab, setTab] = useState<Tab>('orders');
  const [busyAll, setBusyAll] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (run?.status !== 'loading' && !busyAll) return; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, [run?.status, busyAll]);

  const start = () => {
    setError('');
    const allowed = plants.length ? intersectPlants(form.plants, plants.map((p) => p.Werks)) : form.plants;
    if (form.plants.length && !allowed.length) { setError('None of these plants is available to you in SAP.'); return; }
    const q: OrdersQuery = { plants: allowed, dateFrom: form.from, dateTo: form.to, dateType: form.dateType, materials: splitList(form.mats), orders: splitList(form.orders) };
    try { buildOrdersFilter(q); } catch (e) { setError((e as Error).message); return; }
    ctl.current?.abort();
    const c = new AbortController(); ctl.current = c;
    setBreakups(new Map()); setCks(new Map()); setTab('orders');
    setRun({ q, status: 'loading', rows: [], ms: 0, at: new Date() });
    fetchOrders(q, c.signal)
      .then((r) => setRun({ q, status: 'done', rows: r.rows, ms: r.ms, at: new Date() }))
      .catch((e: Error) => { if (c.signal.aborted) return; setRun({ q, status: 'error', rows: [], ms: 0, error: e.message, at: new Date() }); });
  };
  const stop = () => { ctl.current?.abort(); setBusyAll(false); setRun((r) => (r && r.status === 'loading' ? { ...r, status: 'error', error: 'Stopped.' } : r)); };

  /** ZMM_COST of one order (SAP), then the CK13N structure of its finished good, compared component by component. */
  const check = useCallback(async (order: PoVarRow, force = false, signal?: AbortSignal) => {
    const aufnr = order.Aufnr;
    let rows: PoVarRow[] | null = null;
    let skip = false;
    setBreakups((m) => { const cur = m.get(aufnr); if (!force && cur && cur.status !== 'error') { skip = true; if (cur.status === 'done') rows = cur.rows; return m; } const n = new Map(m); n.set(aufnr, { status: 'loading' }); return n; });
    if (!skip) {
      try {
        const r = await fetchBreakup(aufnr, signal);
        rows = r.rows;
        setBreakups((m) => new Map(m).set(aufnr, { status: 'done', rows: r.rows, ms: r.ms }));
      } catch (e) {
        setBreakups((m) => new Map(m).set(aufnr, { status: 'error', error: signal?.aborted ? 'Stopped.' : (e as Error).message }));
        return;
      }
    }
    if (!rows) return;
    let ckSkip = false;
    setCks((m) => { const cur = m.get(aufnr); if (!force && cur && cur.status !== 'error') { ckSkip = true; return m; } return new Map(m).set(aufnr, { status: 'loading' }); });
    if (ckSkip) return;
    try {
      const std = await loadCkStd(order.Matnr, order.Werks);
      const b = breakupOf(rows);
      setCks((m) => new Map(m).set(aufnr, { status: 'done', cmp: ckCompare(rows!, std.exp, b.fgQty), kadky: std.head?.Kadky ?? null, klvar: std.head?.Klvar ?? '', status2: std.head?.Status ?? '', none: !std.head }));
    } catch (e) {
      setCks((m) => new Map(m).set(aufnr, { status: 'error', error: (e as Error).message }));
    }
  }, []);

  const split = useMemo(() => splitRows(run?.rows ?? []), [run?.rows]);
  const sorted = useMemo(() => sortReceipts(split.receipts, basis), [split.receipts, basis]);
  const flagged = useCallback((r: PoVarRow) => crosses(r, pct, dir, basis), [pct, dir, basis]);
  const shown = useMemo(() => (onlyFlagged ? sorted.filter(flagged) : sorted), [sorted, flagged, onlyFlagged]);
  const stats = useMemo(() => orderStats(split.receipts, pct, dir, basis), [split.receipts, pct, dir, basis]);
  const flaggedOrders = useMemo(() => { const seen = new Map<string, PoVarRow>(); for (const r of sorted.filter(flagged)) if (!seen.has(r.Aufnr)) seen.set(r.Aufnr, r); return [...seen.values()]; }, [sorted, flagged]);
  const doneBreakups = useMemo(() => { const m = new Map<string, PoVarRow[]>(); for (const [k, v] of breakups) if (v.status === 'done') m.set(k, v.rows); return m; }, [breakups]);
  const doneCk = useMemo(() => { const m = new Map<string, CkCompare>(); for (const [k, v] of cks) if (v.status === 'done') m.set(k, v.cmp); return m; }, [cks]);
  const causeRows = useMemo(() => causes(doneBreakups, doneCk), [doneBreakups, doneCk]);

  const findCauses = async () => {
    const c = new AbortController(); ctl.current = c;
    setBusyAll(true); setTab('causes');
    const queue = flaggedOrders.filter((o) => breakups.get(o.Aufnr)?.status !== 'done' || cks.get(o.Aufnr)?.status !== 'done');
    const worker = async () => { while (queue.length && !c.signal.aborted) { const o = queue.shift()!; await check(o, false, c.signal); } };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    setBusyAll(false);
  };

  const exportXlsx = () => {
    if (!run) return;
    const q = run.q;
    void downloadWacWorkbook([ordersSheet(sorted, flagged), ckSheet(doneCk), componentsSheet(doneBreakups), causesSheet(causeRows)], [
      ['Report', 'Variance check: process orders vs standard (ZMM_PCOST) and components (ZMM_COST), against MBEW and CK13N'], ['SAP system', system], ['Run at', run.at.toLocaleString('en-IN')],
      ['Plants', q.plants.join(', ') || 'all authorised'], ['Dates', `${q.dateFrom} to ${q.dateTo} (${q.dateType === 'P' ? 'posting date' : 'created / changed on, as ZMM_PCOST'})`],
      ['Materials', (q.materials ?? []).join(', ')], ['Process orders', (q.orders ?? []).join(', ')],
      ['Threshold', `${pct} % (${DIRECTION_LABEL[dir]}, on ${BASIS_LABEL[basis]})`], ['Diff %', '(standard - actual) / standard x 100: negative = costlier than standard (ZMM_PCOST formula)'],
      ['MBEW standard', 'MBEW price of the batch valuation type, divided by the price unit: STPRS when price control S, VERPR when V'],
      ['CK13N standard', 'Current standard estimate of the finished good (as the Standard cost screen); components from its costing structure, every level, released values, x pieces produced'],
    ], 'variance-check');
  };

  if (admin === 'checking') return <div className="grid min-h-[40vh] place-items-center"><Spinner className="h-7 w-7" /></div>;
  if (admin === 'no') {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-line bg-panel p-7 text-center shadow-card">
        <Lock size={24} className="mx-auto text-warn" aria-hidden />
        <h1 className="mt-2 text-lg font-extrabold">Variance check is for Admins</h1>
        <p className="mt-1 text-sm text-muted">Ask a Costing Cockpit Admin for access (Manage Access in the Emami Apps Admin Center).</p>
      </div>
    );
  }
  const loading = run?.status === 'loading';
  const checked = flaggedOrders.filter((o) => breakups.get(o.Aufnr)?.status === 'done' && cks.get(o.Aufnr)?.status && cks.get(o.Aufnr)?.status !== 'loading').length;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold">Process order variance</h1>
          <p className="text-xs text-muted">ZMM_PCOST and ZMM_COST in one place: process orders whose cost per piece is more than {pct} % away from standard (MBEW and CK13N), and the components behind it.</p>
        </div>
        <div className="num text-right text-2xs text-muted">SAP system <span className="font-mono font-bold text-ink">{system || '—'}</span>{run?.status === 'done' && <div>Run {run.at.toLocaleTimeString('en-IN')} · {fmtMs(run.ms)} in SAP</div>}</div>
      </div>

      <div className="rounded-2xl border border-line bg-panel px-4 py-3 shadow-card">
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Plants" hint="For example UB01. Leave empty only when you give materials or process orders.">
            {(id) => <PlantPicker id={id} values={form.plants} onChange={(p) => setForm({ ...form, plants: p })} state={plantsState} />}
          </Field>
          <Field label="Dates" hint={form.dateType === 'C' ? 'Receipt record created or changed on (ZMM_PCOST "Date"). Default: yesterday.' : 'Posting date of the goods receipt.'}>
            {(id) => (
              <div className="flex flex-col gap-2">
                <Segmented size="sm" label="Date means" value={form.dateType} onChange={(dateType) => setForm({ ...form, dateType })} options={[{ value: 'C', label: 'Created / changed (as ZMM_PCOST)' }, { value: 'P', label: 'Posting date' }]} />
                <div className="flex flex-wrap items-center gap-2">
                  <input id={id} type="date" aria-label="From date" className={cx(inputCls, 'w-40')} value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
                  <span className="text-xs text-muted">to</span>
                  <input type="date" aria-label="To date" className={cx(inputCls, 'w-40')} value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
                  <button type="button" className="text-xs font-bold text-accent hover:underline" onClick={() => setForm({ ...form, from: y, to: y })}>Yesterday</button>
                </div>
              </div>
            )}
          </Field>
          <Field label="Materials (optional)" hint="Finished goods, separated by comma or space.">
            {(id) => <input id={id} className={inputCls} value={form.mats} onChange={(e) => setForm({ ...form, mats: e.target.value })} placeholder="e.g. 400016966" />}
          </Field>
          <Field label="Process orders (optional)" hint="Separated by comma or space.">
            {(id) => <input id={id} className={inputCls} value={form.orders} onChange={(e) => setForm({ ...form, orders: e.target.value })} placeholder="e.g. 200088101" />}
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {loading || busyAll ? <Button type="button" variant="ghost" onClick={stop}><Square size={14} /> Stop ({fmtMs(now - (run?.at.getTime() ?? now))})</Button> : <Button type="button" variant="primary" onClick={start}><Play size={14} /> Run</Button>}
          <span className="text-xs text-faint">Nothing loads until you press Run. Only plants you are authorised for in SAP are read.</span>
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
      </div>

      {run?.status === 'error' && <p role="alert" className="flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/5 px-3 py-2 text-sm"><AlertTriangle size={14} className="mt-0.5 text-bad" aria-hidden />{run.error}</p>}
      {loading && <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Reading the process order receipts (ZMM_PCOST) and their CK13N standard…</p>}
      {split.messages.length > 0 && (
        <ul className="rounded-xl border border-warn/40 bg-warn/5 px-3 py-2 text-sm">{split.messages.map((m) => <li key={`${m.Flag}|${m.Msg}`}>{m.Msg}</li>)}</ul>
      )}

      {run?.status === 'done' && split.receipts.length > 0 && (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-panel px-4 py-3 shadow-card">
            <Field label="Threshold %" hint="Your rule: 4 %.">
              {(id) => <input id={id} type="number" min={0} step={0.5} className={cx(inputCls, 'w-24')} value={pct} onChange={(e) => setPct(Math.max(0, Number(e.target.value) || 0))} />}
            </Field>
            <Field label="Against">
              {() => <Segmented size="sm" label="Standard" value={basis} onChange={setBasis} options={(['either', 'mbew', 'ck'] as Basis[]).map((b) => ({ value: b, label: BASIS_LABEL[b] }))} />}
            </Field>
            <Field label="Direction">
              {() => <Segmented size="sm" label="Direction" value={dir} onChange={setDir} options={(['both', 'costlier', 'cheaper'] as Direction[]).map((d) => ({ value: d, label: DIRECTION_LABEL[d] }))} />}
            </Field>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button type="button" variant="cta" onClick={() => void findCauses()} disabled={busyAll || !flaggedOrders.length} title="Run ZMM_COST and the CK13N structure for every order over the threshold and add up the components">
                {busyAll ? <Spinner className="h-4 w-4" /> : <Search size={14} />} Find the causes ({checked}/{flaggedOrders.length} orders)
              </Button>
              <Button type="button" onClick={exportXlsx}><FileSpreadsheet size={14} /> Excel</Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Receipts" value={fmtNum(stats.receipts, 0, 'X')} sub={`${fmtNum(stats.orders, 0, 'X')} process orders`} />
            <Stat label={`Over ${pct} %`} value={fmtNum(stats.flagged, 0, 'X')} tone={stats.flagged ? 'warn' : 'good'} sub={`${BASIS_LABEL[basis]} · ${DIRECTION_LABEL[dir]}`} />
            <Stat label="Costlier" value={fmtNum(stats.costlier, 0, 'X')} tone={stats.costlier ? 'bad' : undefined} sub="actual above standard" />
            <Stat label="Variance (flagged)" value={<>₹ {fmtNum(stats.varFlagged, 0, 'INR')}</>} tone={stats.varFlagged.isPositive() ? 'bad' : 'good'} sub="actual − standard, value" />
            <Stat label="No standard" value={fmtNum(stats.noStd, 0, 'X')} sub={basis === 'ck' ? 'no CK13N estimate or no cost' : basis === 'mbew' ? 'no MBEW price or no cost' : 'neither MBEW nor CK13N'} />
          </div>

          <Tabs label="Variance check views" value={tab} onChange={setTab} tabs={[{ id: 'orders', label: 'Process orders (ZMM_PCOST)' }, { id: 'causes', label: 'Causes across orders (ZMM_COST)', badge: causeRows.length ? <span className="text-2xs">{causeRows.length}</span> : undefined }]} />

          {tab === 'orders' && (
            <div className="rounded-2xl border border-line bg-panel shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <Segmented size="sm" label="Rows" value={onlyFlagged} onChange={setOnlyFlagged} options={[{ value: true, label: `Over ${pct} % (${stats.flagged})` }, { value: false, label: `All receipts (${stats.receipts})` }]} />
                <span className="text-2xs text-muted">Click a row for its component breakup (ZMM_COST) against CK13N and MBEW.</span>
              </div>
              {shown.length === 0 ? <div className="p-4"><Empty title="No order beyond the threshold">Every receipt with a standard is within {pct} %.</Empty></div> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-sunken">
                      <tr><th className={th} colSpan={6} /><th className={cx(thN, 'border-l border-line')} colSpan={3}>MBEW (as ZMM_PCOST)</th><th className={cx(thN, 'border-l border-line')} colSpan={3}>CK13N current standard</th><th className={th} /></tr>
                      <tr>
                        <th className={th}>Process order</th><th className={th}>Plant</th><th className={th}>Material</th><th className={th}>Batch</th><th className={thN}>Quantity</th><th className={thN}>Actual / pc</th>
                        <th className={cx(thN, 'border-l border-line')}>Std / pc</th><th className={thN}>Diff %</th><th className={thN}>Variance</th>
                        <th className={cx(thN, 'border-l border-line')}>CK13N / pc</th><th className={thN}>Diff %</th><th className={thN}>Variance</th><th className={th}>Breakup</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((r) => {
                        const b = breakups.get(r.Aufnr);
                        return (
                          <tr key={r.Rowid} className={cx('cursor-pointer border-t border-line/60 hover:bg-accent/5', flagged(r) && 'bg-warn/[0.04]')} onClick={() => { setOpen(r); void check(r); }}>
                            <td className={cx(td, 'font-mono font-bold')}>{strip(r.Aufnr)}</td><td className={td}>{r.Werks}</td>
                            <td className={td}><span className="font-mono">{strip(r.Matnr)}</span><div className="max-w-[20rem] truncate text-2xs text-muted">{r.Maktx}</div></td>
                            <td className={cx(td, 'font-mono')}>{r.Charg}</td><td className={tdN}>{fmtNum(r.Menge, 0, 'X')} <span className="text-2xs text-muted">{r.Meins}</span></td>
                            <td className={cx(tdN, 'font-bold')}>{money(r.ActPc, 2)}</td>
                            <td className={cx(tdN, 'border-l border-line/60')} title={PRICE_CONTROL[r.Vprsv] ?? ''}>{hasStd(r) ? money(r.StdPc, 2) : <span className="text-2xs text-warn">{FLAG_TEXT[r.Flag] ?? 'n/a'}</span>}</td>
                            <td className={tdN}><Diff v={hasStd(r) ? r.DiffPct : null} pct={pct} /></td><td className={tdN}>{hasStd(r) ? <Var v={r.VarVal} /> : NA}</td>
                            <td className={cx(tdN, 'border-l border-line/60')} title={r.CkKadky ? `Costing date ${fmtDate(r.CkKadky)} · ${r.CkKlvar} · status ${r.CkStatus}` : 'No CK13N estimate'}>{hasCk(r) ? money(r.CkPc, 2) : <span className="text-2xs text-warn">No estimate</span>}</td>
                            <td className={tdN}><Diff v={hasCk(r) ? r.CkDiffPct : null} pct={pct} /></td><td className={tdN}>{hasCk(r) ? <Var v={r.CkVarVal} /> : NA}</td>
                            <td className={td}>{b?.status === 'loading' ? <Spinner className="h-3.5 w-3.5" /> : b?.status === 'done' ? <span className="text-2xs font-bold text-good">checked</span> : b?.status === 'error' ? <span className="text-2xs text-bad">failed</span> : <ChevronRight size={14} className="text-muted" />}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'causes' && (
            <div className="rounded-2xl border border-line bg-panel shadow-card">
              <p className="px-3 py-2 text-xs text-muted">Components of the {checked} checked order(s) over the threshold, added up per material and plant. CK13N: actual value against the CK13N structure × pieces produced (rate + quantity). MBEW: actual value against MBEW price × actual quantity (rate only). Biggest variance first.
                {checked < flaggedOrders.length && !busyAll && <> Press <b>Find the causes</b> to check the remaining {flaggedOrders.length - checked}.</>}</p>
              {busyAll && <p className="flex items-center gap-2 px-3 pb-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Running ZMM_COST and CK13N for each order ({checked}/{flaggedOrders.length})…</p>}
              {causeRows.length === 0 ? <div className="p-4"><Empty title="No components yet">Check the flagged orders first.</Empty></div> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-sunken">
                      <tr><th className={th} colSpan={5} /><th className={cx(thN, 'border-l border-line')} colSpan={3}>vs CK13N</th><th className={cx(thN, 'border-l border-line')} colSpan={4}>vs MBEW</th></tr>
                      <tr>
                        <th className={th}>Component</th><th className={th}>Category</th><th className={th}>Plant</th><th className={thN}>Orders</th><th className={thN}>Actual qty</th>
                        <th className={cx(thN, 'border-l border-line')}>Rate var.</th><th className={thN}>Qty var.</th><th className={thN}>Total</th>
                        <th className={cx(thN, 'border-l border-line')}>Actual rate</th><th className={thN}>MBEW rate</th><th className={thN}>Diff %</th><th className={thN}>Variance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {causeRows.map((c) => (
                        <tr key={`${c.werks}|${c.matnr}`} className="border-t border-line/60">
                          <td className={td}><span className="font-mono">{c.matnr}</span><div className="max-w-[20rem] truncate text-2xs text-muted">{c.maktx}</div>{c.flags.length > 0 && <div className="text-2xs text-warn">{c.flags.map((f) => FLAG_TEXT[f] ?? f).join(', ')}</div>}</td>
                          <td className={td}>{CAT_LABEL[c.cat] ?? c.cat}</td><td className={td}>{c.werks}</td>
                          <td className={tdN} title={c.orders.map(strip).join(', ')}>{c.orders.length}</td><td className={tdN}>{c.qty.isZero() ? '—' : <>{fmtNum(c.qty, 3, 'X')} <span className="text-2xs text-muted">{c.meins}</span></>}</td>
                          <td className={cx(tdN, 'border-l border-line/60')}>{c.ckOrders ? <Var v={c.ckRateVar} /> : NA}</td><td className={tdN}>{c.ckOrders ? <Var v={c.ckQtyVar} /> : NA}</td><td className={cx(tdN, 'font-bold')}>{c.ckOrders ? <Var v={c.ckTotVar} /> : NA}</td>
                          <td className={cx(tdN, 'border-l border-line/60')}>{money(c.actRate, 4)}</td><td className={tdN}>{money(c.stdRate, 4)}</td><td className={tdN}><Diff v={c.diffPct} pct={pct} /></td><td className={tdN}>{c.stdRate ? <Var v={c.varVal} /> : NA}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {run?.status === 'done' && split.receipts.length === 0 && split.messages.length === 0 && <Empty title="No receipts">SAP found no process order receipts for this selection.</Empty>}
      {!run && <Empty title="Nothing loaded yet">Pick the plant and press Run. The dates default to yesterday, the way ZMM_PCOST is run every morning.</Empty>}

      <Drawer open={!!open} onClose={() => setOpen(null)} width={1240} title={open ? <>Process order <span className="font-mono">{strip(open.Aufnr)}</span> · {strip(open.Matnr)} {open.Maktx}</> : ''}>
        {open && <OrderBreakup row={open} state={breakups.get(open.Aufnr)} ck={cks.get(open.Aufnr)} pct={pct} onRetry={() => void check(open, true)} />}
      </Drawer>
    </>
  );
}

function OrderBreakup({ row, state, ck, pct, onRetry }: { row: PoVarRow; state: BState | undefined; ck: KState | undefined; pct: number; onRetry: () => void }) {
  const b = useMemo(() => (state?.status === 'done' ? breakupOf(state.rows) : null), [state]);
  const [view, setView] = useState<'ck' | 'mbew'>('ck');
  const [all, setAll] = useState(false);
  const cmp = ck?.status === 'done' ? ck.cmp : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Actual / pc (ZMM_PCOST)" value={<>₹ {fmtNum(row.ActPc, 2, 'INR')}</>} sub={`${fmtNum(row.Menge, 0, 'X')} ${row.Meins} · batch ${row.Charg}`} />
        <Stat label="MBEW / pc" value={hasStd(row) ? <>₹ {fmtNum(row.StdPc, 2, 'INR')}</> : 'n/a'} sub={PRICE_CONTROL[row.Vprsv] ?? 'no MBEW price'} />
        <Stat label="Diff % vs MBEW" value={<Diff v={hasStd(row) ? row.DiffPct : null} pct={pct} />} sub={hasStd(row) ? <>₹ {fmtNum(row.VarVal, 0, 'INR')} variance</> : '—'} />
        <Stat label="CK13N / pc" value={hasCk(row) ? <>₹ {fmtNum(row.CkPc, 2, 'INR')}</> : 'n/a'} sub={row.CkKadky ? `${fmtDate(row.CkKadky)} · ${row.CkKlvar} · ${row.CkStatus}` : 'no current estimate'} />
        <Stat label="Diff % vs CK13N" value={<Diff v={hasCk(row) ? row.CkDiffPct : null} pct={pct} />} sub={hasCk(row) ? <>₹ {fmtNum(row.CkVarVal, 0, 'INR')} variance</> : '—'} />
      </div>
      <p className="text-xs text-muted">Cost split in ZMB31_POUTILITY: RM ₹ {fmtNum(row.Rm, 0, 'INR')} · PM ₹ {fmtNum(row.Pm, 0, 'INR')} · Perfume ₹ {fmtNum(row.Perf, 0, 'INR')} · Conversion ₹ {fmtNum(row.Conv, 0, 'INR')}{dec(row.Oth)?.isZero() === false && <> · Other ₹ {fmtNum(row.Oth, 0, 'INR')}</>}{dec(row.Cons)?.isZero() === false && <> · Consumer scheme ₹ {fmtNum(row.Cons, 0, 'INR')}</>}{dec(row.Trd)?.isZero() === false && <> · Trade scheme ₹ {fmtNum(row.Trd, 0, 'INR')}</>}</p>

      {(!state || state.status === 'loading') && <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Running ZMM_COST for this order…</p>}
      {state?.status === 'error' && <p role="alert" className="flex items-start gap-2 text-sm"><AlertTriangle size={14} className="mt-0.5 text-bad" aria-hidden />{state.error} <Button size="sm" onClick={onRetry}>Retry</Button></p>}
      {b && (
        <>
          {b.messages.map((m) => <p key={m.Msg} className="rounded-xl border border-warn/40 bg-warn/5 px-3 py-2 text-sm">{m.Msg}</p>)}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented size="sm" label="Compare components with" value={view} onChange={setView} options={[{ value: 'ck', label: 'CK13N (rate + quantity)' }, { value: 'mbew', label: 'MBEW price (rate)' }]} />
            <Segmented size="sm" label="Components shown" value={all} onChange={setAll} options={[{ value: false, label: 'With a variance' }, { value: true, label: 'All' }]} />
          </div>

          {view === 'ck' && (
            <>
              {(!ck || ck.status === 'loading') && <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Reading the CK13N costing structure (every level)…</p>}
              {ck?.status === 'error' && <p role="alert" className="flex items-start gap-2 text-sm"><AlertTriangle size={14} className="mt-0.5 text-bad" aria-hidden />CK13N: {ck.error} <Button size="sm" onClick={onRetry}>Retry</Button></p>}
              {ck?.status === 'done' && ck.none && <p className="rounded-xl border border-warn/40 bg-warn/5 px-3 py-2 text-sm">No current CK13N estimate for {strip(row.Matnr)} in plant {row.Werks}: compare with MBEW instead.</p>}
              {cmp && ck?.status === 'done' && !ck.none && (
                <>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <Stat label="Rate variance" value={<Var v={cmp.rateVar} />} sub="paid more / less per unit than CK13N" />
                    <Stat label="Quantity variance" value={<Var v={cmp.qtyVar} />} sub="used more / less than CK13N" />
                    <Stat label="Materials total" value={<Var v={cmp.totVar} />} sub={!cmp.fgQty.isZero() ? <>₹ {fmtNum(cmp.totVar.div(cmp.fgQty), 4, 'INR')} per piece</> : '—'} />
                    <Stat label="CK13N estimate" value={ck.kadky ? fmtDate(ck.kadky) : '—'} sub={`${ck.klvar} · status ${ck.status2} · ${fmtNum(cmp.fgQty, 0, 'X')} pcs`} />
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-line">
                    <table className="w-full text-sm">
                      <thead className="bg-sunken">
                        <tr><th className={th} colSpan={2} /><th className={cx(thN, 'border-l border-line')} colSpan={3}>Actual (ZMM_COST)</th><th className={cx(thN, 'border-l border-line')} colSpan={3}>CK13N × pieces produced</th><th className={cx(thN, 'border-l border-line')} colSpan={5}>Variance (actual − CK13N)</th></tr>
                        <tr>
                          <th className={th}>Component</th><th className={th}>Category</th>
                          <th className={cx(thN, 'border-l border-line')}>Qty</th><th className={thN}>Rate</th><th className={thN}>Value</th>
                          <th className={cx(thN, 'border-l border-line')}>Qty</th><th className={thN}>Rate</th><th className={thN}>Value</th>
                          <th className={cx(thN, 'border-l border-line')}>Rate Δ %</th><th className={thN}>Qty Δ %</th><th className={thN}>Rate var.</th><th className={thN}>Qty var.</th><th className={thN}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cmp.lines.filter((l) => all || !l.totVar.abs().lt(1)).map((l) => (
                          <tr key={l.matnr} className={cx('border-t border-line/60', l.diffPct && l.diffPct.abs().gte(pct) && 'bg-warn/[0.05]')}>
                            <td className={td}><span className="font-mono">{l.matnr}</span><div className="max-w-[16rem] truncate text-2xs text-muted">{l.maktx}</div>
                              {l.status !== 'both' && <div className="text-2xs text-warn">{l.status === 'ck-only' ? 'In CK13N, not consumed' : 'Consumed, not in CK13N'}</div>}
                              {l.status === 'both' && l.actUom.toUpperCase() !== l.ckUom.toUpperCase() && <div className="text-2xs text-warn">Units differ ({l.actUom} / {l.ckUom}): total only</div>}
                              {l.via && <div className="text-2xs text-faint">via {l.via}</div>}</td>
                            <td className={td}>{CAT_LABEL[l.cat] ?? l.cat}</td>
                            <td className={cx(tdN, 'border-l border-line/60')}>{l.actQty ? <>{fmtNum(l.actQty, 3, 'X')} <span className="text-2xs text-muted">{l.actUom}</span></> : NA}</td><td className={tdN}>{money(l.actRate, 4)}</td><td className={tdN}>{money(l.actVal, 0)}</td>
                            <td className={cx(tdN, 'border-l border-line/60')}>{l.ckQty ? <>{fmtNum(l.ckQty, 3, 'X')} <span className="text-2xs text-muted">{l.ckUom}</span></> : NA}</td><td className={tdN}>{money(l.ckRate, 4)}</td><td className={tdN}>{money(l.ckVal, 0)}</td>
                            <td className={cx(tdN, 'border-l border-line/60')}><Diff v={l.diffPct} pct={pct} /></td><td className={tdN}>{l.qtyPct ? `${l.qtyPct.isPositive() ? '+' : ''}${l.qtyPct.toFixed(1)} %` : NA}</td>
                            <td className={tdN}><Var v={l.rateVar} /></td><td className={tdN}><Var v={l.qtyVar} /></td><td className={cx(tdN, 'font-bold')}><Var v={l.totVar} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-2xs text-faint">CK13N = costing structure of the current standard estimate (as the Standard cost screen: released values, bulk / WIP opened to the last level) × {fmtNum(cmp.fgQty, 0, 'X')} pieces produced. Rate variance = actual value − CK13N rate × actual quantity; quantity variance = (actual − CK13N quantity) × CK13N rate. Conversion (CK13N ₹ {fmtNum(cmp.convCk, 0, 'INR')}) is not part of the component lines.</p>
                </>
              )}
            </>
          )}

          {view === 'mbew' && (
            <>
              <p className="text-sm">Components against MBEW price: variance <b><Var v={b.compVar} /></b> on {fmtNum(b.fgQty, 0, 'X')} pieces
                {!b.fgQty.isZero() && <> = <b>₹ {fmtNum(b.compVar.div(b.fgQty), 4, 'INR')}</b> per piece</>}{b.noStd > 0 && <span className="text-warn"> · {b.noStd} without an MBEW price</span>}.</p>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-sunken"><tr>
                    <th className={th}>Component</th><th className={th}>Category</th><th className={th}>Via</th><th className={thN}>Quantity</th><th className={thN}>Actual value</th>
                    <th className={thN}>Actual rate</th><th className={thN}>MBEW rate</th><th className={thN}>Diff %</th><th className={thN}>Variance</th><th className={thN}>Per FG pc</th><th className={thN}>Share</th>
                  </tr></thead>
                  <tbody>
                    {b.comps.filter((r) => all || crosses(r, pct, 'both')).map((r) => {
                      const share = shareOf(r, b.compVar);
                      return (
                        <tr key={r.Rowid} className={cx('border-t border-line/60', crosses(r, pct, 'both') && 'bg-warn/[0.05]')}>
                          <td className={td}><span className="font-mono">{strip(r.Matnr)}</span><div className="max-w-[18rem] truncate text-2xs text-muted">{r.Maktx}</div>{r.Flag && <div className="text-2xs text-warn" title={r.Msg}>{FLAG_TEXT[r.Flag] ?? r.Flag}</div>}</td>
                          <td className={td}>{CAT_LABEL[r.Cat] ?? r.Cat}</td><td className={cx(td, 'text-2xs')}>{r.Level > 1 ? <>L{r.Level} · {strip(r.Parent)}</> : 'direct'}</td>
                          <td className={tdN}>{fmtNum(r.Menge, 3, 'X')} <span className="text-2xs text-muted">{r.Meins}</span></td><td className={tdN}>{money(r.Total, 0)}</td>
                          <td className={tdN}>{money(r.ActPc, 4)}</td><td className={tdN} title={`${PRICE_CONTROL[r.Vprsv] ?? ''}${r.Bwtar ? ` · valuation type ${r.Bwtar}` : ''}`}>{hasStd(r) ? money(r.StdPc, 4) : NA}</td>
                          <td className={tdN}><Diff v={hasStd(r) ? r.DiffPct : null} pct={pct} /></td><td className={tdN}>{hasStd(r) ? <Var v={r.VarVal} /> : NA}</td>
                          <td className={tdN}>{hasStd(r) ? money(r.VarFgPc, 4) : NA}</td><td className={tdN}>{share ? `${share.toFixed(0)} %` : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-2xs text-faint">MBEW rate = price of the component batch&apos;s valuation type ÷ price unit (STPRS for price control S, VERPR for V). Variance = actual value − MBEW rate × actual quantity (rate effect only).</p>
            </>
          )}

          {b.wip.length > 0 && (
            <details className="text-sm"><summary className="cursor-pointer text-xs font-bold text-muted">WIP / bulk lines ({b.wip.length}) - opened into their components</summary>
              <ul className="mt-1 text-xs">{b.wip.map((w) => <li key={w.Rowid}><span className="font-mono">{strip(w.Matnr)}</span> {w.Maktx} · L{w.Level} · {fmtNum(w.Menge, 3, 'X')} {w.Meins} · ₹ {fmtNum(w.Total, 0, 'INR')}</li>)}</ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

export default function VarianceCheck() {
  return (
    <PlanFrame active="povar">
      <Screen />
    </PlanFrame>
  );
}
