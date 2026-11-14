'use client';
/**
 * Requirement tab: the plan's component requirement from the SAP BOM explosion (CostLineSet Mode P, the same run as
 * Breakup & cost), costed at MONTHLY budget rates (H1 = SAP budget rate, H2 = the revision entered here):
 *   Quantity & where used   component x month quantities, and the FGs that use each component
 *   Rate simulation         change a component's rate (slider / % / new rate) -> impact per FG and on the plan
 *   Budget rates H1 / H2    the H2 revision (all components %, or per component rate / %)
 *   Savings vs actual       interim estimate: budget vs actual rate on the planned quantity of elapsed months
 * Maths in lib/plan/budgetSim.ts. Simulated figures carry the "sim" tag; nothing is written to SAP.
 */
import { Fragment, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileSpreadsheet, Info, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { CostError, CostProgress, PlanQueryBar, tdCls, tdNum, thCls, thNum } from './common';
import { Button, Card, Empty, SimTag, Skeleton, Stat, cx, inputBase } from '../ui';
import type { PlanWorkspace } from '@/lib/plan/workspace';
import { type PlanCostQuery } from '@/lib/plan/requests';
import { FISCAL_MONTHS } from '@/lib/plan/fields';
import type { PlanLineWithOptions } from '@/lib/plan/sources';
import { planParams } from '@/lib/plan/export';
import {
  H2_START, actualSavings, budgetPlan, elapsedMonths, groupActual, groupSavings, isActive, isSimIdentity, loadBudget, saveBudget, savingsEstimate,
  type ActualBasis, type ActualGroup, type BudgetResult, type BudgetSettings, type ComponentQty, type RateChange, type RateContext, type SavingsGroup,
} from '@/lib/plan/budgetSim';
import { BUDGET_RATE_SET, PROD_ACTUAL_SET, actualsByFg, fetchBudgetRates, fetchProdActuals, rateLookup, type ActualCell, type BudgetRateRow, type Feed, type ProdActualRow } from '@/lib/plan/sapFeeds';
import { type RatesState } from '@/lib/rates/useRateOptions';
import { usePlanRateOptions } from '@/lib/plan/useRates';
import { attachRateOptions } from '@/lib/rates/options';
import { loadSapConfig } from '@/lib/sap/config';
import { exportTable, type XCol } from '@/lib/client/export';
import type { CostLine } from '@/lib/sap/fields';
import { ZERO, type Decimal } from '@/lib/cost/decimal';
import { fmtCompactInr, fmtNum, fmtRate, fmtSigned } from '@/lib/format';

type View = 'qty' | 'sim' | 'h2' | 'savings';
const VIEWS: { value: View; label: string }[] = [
  { value: 'qty', label: 'Quantity & where used' },
  { value: 'sim', label: 'Rate simulation' },
  { value: 'h2', label: 'Budget rates H1 / H2' },
  { value: 'savings', label: 'Savings vs actual' },
];
const ROW_CAP = 2000;
const signedPct = (d: Decimal | null) => (d === null ? '—' : `${d.gt(0) ? '+' : d.lt(0) ? '−' : ''}${d.abs().toFixed(2)}%`);
const tone = (d: Decimal | null | undefined) => (!d || d.isZero() ? '' : d.gt(0) ? 'text-bad' : 'text-good');
const inr = (d: Decimal) => fmtCompactInr(Number(d.toFixed(2)));
const q3 = (d: Decimal) => fmtNum(d, 3, 'X');
const n = (d: Decimal | null | undefined, dp = 2) => (d ? Number(d.toFixed(dp)) : null);

export default function RequirementTab({ ws }: { ws: PlanWorkspace }) {
  const { cost } = ws;
  const [view, setView] = useState<View>('qty');
  const [focus, setFocus] = useState('');
  const [s, setS] = useState<BudgetSettings>(() => loadBudget(ws.plan));
  useEffect(() => { setS(loadBudget(ws.plan)); }, [ws.plan]);
  useEffect(() => { saveBudget(ws.plan, s); }, [ws.plan, s]);
  const ds = useDeferredValue(s);

  const system = useMemo(() => { const c = loadSapConfig(); return c.ok ? c.config.system : ''; }, []);
  const rates = usePlanRateOptions(cost, system);
  const lines = useMemo(() => (rates.status === 'ready' && rates.rows ? attachRateOptions(cost.rows as unknown as CostLine[], rates.rows) : (cost.rows as unknown as CostLine[])) as unknown as PlanLineWithOptions[], [cost.rows, rates.status, rates.rows]);
  // SAP feeds: budget rates with validity, and FG production actuals (sapFeeds.ts); null while loading.
  const fyStart = useMemo(() => { const y = Number(cost.ranQuery?.budgetYr ?? ws.query.budgetYr); const now = new Date(); return y > 2000 ? y : now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; }, [cost.ranQuery?.budgetYr, ws.query.budgetYr]);
  const [rateFeed, setRateFeed] = useState<Feed<BudgetRateRow> | null>(null);
  const [actFeed, setActFeed] = useState<Feed<ProdActualRow> | null>(null);
  useEffect(() => {
    if (cost.status !== 'done' || !cost.rows.length) return;
    const plants = [...new Set(cost.rows.flatMap((l) => [l.Werks, l.Hwerks]).filter(Boolean))];
    const c = new AbortController();
    setRateFeed(null); setActFeed(null);
    fetchBudgetRates(plants, { signal: c.signal }).then(setRateFeed).catch(() => {});
    fetchProdActuals([...new Set(cost.rows.map((l) => l.Hwerks))], fyStart, { signal: c.signal }).then(setActFeed).catch(() => {});
    return () => c.abort();
  }, [cost.status, cost.at, cost.rows, fyStart]);
  const ctx: RateContext = useMemo(() => ({ rates: rateFeed?.status === 'ready' ? rateLookup(rateFeed.rows) : null, fyStart }), [rateFeed, fyStart]);
  const actuals = useMemo(() => (actFeed?.status === 'ready' ? actualsByFg(actFeed.rows, fyStart) : null), [actFeed, fyStart]);
  const r = useMemo(() => budgetPlan(lines, ds, ctx), [lines, ds, ctx]);
  const running = cost.status === 'running';
  const hasRows = cost.rows.length > 0;
  const simCount = Object.values(s.sim).filter(isActive).length;
  const setChange = (key: 'sim' | 'h2', id: string, c: RateChange | null) => setS((x) => { const m = { ...x[key] }; if (!c || !isActive(c)) delete m[id]; else m[id] = c; return { ...x, [key]: m }; });

  return (
    <div className="flex flex-col gap-3">
      <PlanQueryBar query={ws.query} onChange={ws.setQuery} onRun={(q: PlanCostQuery) => void ws.runCost({ ...q, inclBudget: true })} onCancel={ws.cancelCost} running={running} ms={cost.ms}
        runLabel={hasRows ? 'Reload requirement' : 'Load requirement'} />
      <CostProgress ws={ws} />
      <CostError error={cost.error} />
      {!hasRows && running ? <Card><Skeleton rows={8} /></Card> : !hasRows ? (
        <Card><Empty title="Requirement not loaded" icon="▦">Press <b>Load requirement</b>: SAP explodes the plan&apos;s BOMs (the same run as Breakup &amp; cost) and returns every component&apos;s monthly quantity and budget rate.</Empty></Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Components" value={r.components.length.toLocaleString('en-IN')} sub={`${r.fgs.length} FGs · ${new Set(r.components.map((c) => c.werks)).size} component plants`} />
            <Stat label="Plan cost at budget" value={inr(r.budget)} sub={`H1 ${inr(r.h1)} · H2 ${inr(r.h2)}${s.h2Pct || Object.keys(s.h2).length ? ' (revised)' : ''}`} />
            <Stat label="Simulated plan cost" sim value={inr(r.sim)} sub={isSimIdentity(s) ? 'no rate change entered' : `${simCount} component rate${simCount === 1 ? '' : 's'} changed`} />
            <Stat label="Overall impact" sim tone={r.delta.gt(0) ? 'bad' : r.delta.lt(0) ? 'good' : undefined} value={fmtSigned(r.delta, 0)} sub={`${signedPct(r.deltaPct)} · ${r.affected} of ${r.fgs.length} FGs affected`} />
          </div>
          <p className="flex flex-wrap items-start gap-1.5 text-xs text-muted"><Info size={13} className="mt-0.5 shrink-0" />
            {rateFeed === null ? <span>Checking SAP for budget rates with validity ({BUDGET_RATE_SET})…</span>
              : rateFeed.status === 'ready' ? <span><b className="text-ink">Budget rates from SAP {BUDGET_RATE_SET}</b> by validity (valid from / to) for {r.sapRateLines.toLocaleString('en-IN')} component lines; others use the budget rate on the cost line{s.h2Pct || Object.keys(s.h2).length ? ' and the H2 revision' : ''}.</span>
              : <span>{rateFeed.note} Using the budget rate on the cost line for every month{s.h2Pct || Object.keys(s.h2).length ? ', with the H2 revision entered here' : ''}.</span>}
            <span>· Amounts in INR (group currency) and the plant&apos;s local currency.</span>
          </p>
          {(r.noBudgetLines > 0 || r.fallbackLines > 0) && (
            <p className="flex flex-wrap items-start gap-1.5 text-xs text-muted"><Info size={13} className="mt-0.5 shrink-0" />
              {r.fallbackLines > 0 && <span>{r.fallbackLines} component line{r.fallbackLines === 1 ? ' has' : 's have'} no budget rate and use the selected SAP rate (marked *).</span>}
              {r.noBudgetLines > 0 && <span>{r.noBudgetLines} line{r.noBudgetLines === 1 ? ' has' : 's have'} no rate at all (counted at 0).</span>}
              <label className="inline-flex items-center gap-1"><input type="checkbox" checked={s.fallback} onChange={(e) => setS((x) => ({ ...x, fallback: e.target.checked }))} /> use the selected rate when there is no budget rate</label>
            </p>
          )}
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Requirement views">
            {VIEWS.map((v) => (
              <button key={v.value} type="button" role="tab" aria-selected={view === v.value} onClick={() => setView(v.value)}
                className={cx('rounded-lg border px-3 py-1.5 text-xs font-semibold', view === v.value ? 'border-accent bg-accent text-white' : 'border-line bg-panel text-muted hover:text-ink')}>{v.label}</button>
            ))}
          </div>
          {view === 'qty' && <QtyView comps={r.components} s={s} onSimulate={(c) => { setFocus(c.idnrk); setView('sim'); }} />}
          {view === 'sim' && <SimView r={r} s={s} initial={focus} onChange={(id, c) => setChange('sim', id, c)} onReset={() => setS((x) => ({ ...x, sim: {} }))} query={cost.ranQuery ?? ws.query} />}
          {view === 'h2' && <H2View r={r} s={s} sapRates={rateFeed?.status === 'ready'} onPct={(v) => setS((x) => ({ ...x, h2Pct: v }))} onChange={(id, c) => setChange('h2', id, c)} />}
          {view === 'savings' && <SavingsView lines={lines} s={ds} rates={rates} query={cost.ranQuery ?? ws.query} ctx={ctx} r={r} actuals={actuals} actFeed={actFeed} />}
        </>
      )}
    </div>
  );
}

/* ======================= Quantity & where used ======================= */

function QtyView({ comps, s, onSimulate }: { comps: ComponentQty[]; s: BudgetSettings; onSimulate: (c: ComponentQty) => void }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const t = search.trim().toLowerCase();
  const rows = comps.filter((c) => !t || `${c.idnrk} ${c.maktx} ${c.werks}`.toLowerCase().includes(t));

  const exportXlsx = () => {
    const flat = rows.flatMap((c) => c.fgs.map((f) => ({ c, f })));
    const cols: XCol[] = [
      { header: 'Component plant', get: (i) => flat[i].c.werks },
      { header: 'Component', get: (i) => flat[i].c.idnrk },
      { header: 'Description', width: 30, get: (i) => flat[i].c.maktx },
      { header: 'Unit', get: (i) => flat[i].c.meins },
      { header: 'FG', get: (i) => flat[i].f.headmat },
      { header: 'FG description', width: 28, get: (i) => flat[i].f.headtxt },
      { header: 'Plan country', get: (i) => flat[i].f.land1 },
      { header: 'FG plant', get: (i) => flat[i].f.hwerks },
      ...FISCAL_MONTHS.map((m, k): XCol => ({ header: m, dp: 3, get: (i) => n(flat[i].f.months[k], 3) })),
      { header: 'Total qty', dp: 3, get: (i) => n(flat[i].f.qty, 3) },
      { header: 'Budget cost INR', dp: 2, curr: 'INR', get: (i) => n(flat[i].f.budget) },
      { header: 'Local currency', get: (i) => flat[i].f.curr },
      { header: 'Budget cost local', dp: 2, get: (i) => n(flat[i].f.budgetLoc) },
    ];
    void exportTable({ fmt: 'xlsx', name: 'Component requirement where used', cols, count: flat.length, extraParams: [['Rates', 'Budget rate per month (H1 SAP budget, H2 revised in the app)']] });
  };

  return (
    <Card title="Component quantity summary" bodyClass="p-0" actions={
      <div className="flex items-center gap-2">
        <input aria-label="Filter components" className={cx(inputBase, 'h-8 w-56 text-xs')} placeholder="Filter component / plant…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button size="sm" variant="ghost" onClick={exportXlsx}><FileSpreadsheet size={14} /> Excel</Button>
      </div>
    }>
      <p className="border-b border-line px-3 py-1.5 text-2xs text-muted">Quantities in each component&apos;s unit, from SAP&apos;s BOM explosion of the plan. Click <b>Used in</b> to see the FGs and their monthly quantities.</p>
      <div className="scroll-thin max-h-[65vh] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-panel shadow-[0_1px_0_rgb(var(--line))]">
            <tr>
              <th className={thCls}>Plant</th><th className={thCls}>Component</th><th className={thNum}>Used in</th><th className={thCls}>Unit</th>
              {FISCAL_MONTHS.map((m) => <th key={m} className={thNum}>{m}</th>)}
              <th className={thNum}>Total qty</th><th className={thNum} title="Budget rate per unit (INR): first month / last month">Budget rate Apr / Mar</th><th className={thNum}>Budget cost INR</th><th className={thNum}>Budget cost local</th><th className={thCls} />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, ROW_CAP).map((c) => (
              <Fragment key={c.key}>
                <tr className={cx('border-t border-line/50', isActive(s.sim[c.idnrk]) && 'bg-sim/[0.05]')}>
                  <td className={cx(tdCls, 'font-mono')}>{c.werks}</td>
                  <td className={tdCls}><span className="font-mono font-semibold">{c.idnrk}</span> <span className="text-muted">{c.maktx}</span></td>
                  <td className={tdNum}>
                    <button type="button" className="inline-flex items-center gap-0.5 font-semibold text-accent hover:underline" onClick={() => setOpen(open === c.key ? null : c.key)} aria-expanded={open === c.key}>
                      {open === c.key ? <ChevronDown size={11} /> : <ChevronRight size={11} />}{c.fgs.length} FG{c.fgs.length === 1 ? '' : 's'}
                    </button>
                  </td>
                  <td className={tdCls}>{c.meins}</td>
                  {c.months.map((v, i) => <td key={i} className={tdNum}>{fmtNum(v, 0, 'X')}</td>)}
                  <td className={cx(tdNum, 'font-semibold')}>{q3(c.qty)}</td>
                  <td className={tdNum}>{c.h1Rate ? <>{fmtRate(c.h1Rate)}{c.h2Rate && !c.h2Rate.eq(c.h1Rate) ? <span className="text-warn"> / {fmtRate(c.h2Rate)}</span> : ''}</> : <span className="text-faint">no rate</span>}{c.rateSource === 'selected' && <span className="text-faint" title="No budget rate: selected SAP rate"> *</span>}{c.rateSource === 'sap' && <span className="text-faint" title={`SAP ${BUDGET_RATE_SET} by validity`}> ᵛ</span>}</td>
                  <td className={tdNum}>{fmtNum(c.budget, 2)}</td>
                  <td className={tdNum}>{c.budgetLoc ? <>{fmtNum(c.budgetLoc, 2)} <span className="text-faint">{c.curr}</span></> : '—'}</td>
                  <td className={tdCls}><button type="button" className="inline-flex items-center gap-1 whitespace-nowrap text-accent hover:underline" onClick={() => onSimulate(c)}><SlidersHorizontal size={11} /> Simulate</button></td>
                </tr>
                {open === c.key && (
                  <tr className="bg-sunken/50">
                    <td colSpan={21} className="px-3 py-2">
                      <div className="mb-1 text-2xs font-bold uppercase tracking-wide text-muted">{c.idnrk} is used in {c.fgs.length} FG{c.fgs.length === 1 ? '' : 's'}</div>
                      <table className="w-full text-2xs">
                        <thead><tr><th className={thCls}>FG</th><th className={thCls}>Country · Plant</th>{FISCAL_MONTHS.map((m) => <th key={m} className={thNum}>{m}</th>)}<th className={thNum}>Total qty</th><th className={thNum}>Share</th><th className={thNum}>Budget cost INR</th><th className={thNum}>Budget cost local</th></tr></thead>
                        <tbody>
                          {c.fgs.map((f) => (
                            <tr key={f.key} className="border-t border-line/40">
                              <td className={tdCls}><span className="font-mono font-semibold">{f.headmat}</span> <span className="text-muted">{f.headtxt}</span></td>
                              <td className={cx(tdCls, 'font-mono')}>{f.land1} · {f.hwerks}</td>
                              {f.months.map((v, i) => <td key={i} className={tdNum}>{fmtNum(v, 0, 'X')}</td>)}
                              <td className={cx(tdNum, 'font-semibold')}>{q3(f.qty)}</td>
                              <td className={tdNum}>{c.qty.gt(0) ? `${f.qty.div(c.qty).times(100).toFixed(1)}%` : '—'}</td>
                              <td className={tdNum}>{fmtNum(f.budget, 2)}</td>
                              <td className={tdNum}>{f.budgetLoc ? <>{fmtNum(f.budgetLoc, 2)} <span className="text-faint">{f.curr}</span></> : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {rows.length > ROW_CAP && <p className="px-3 py-2 text-xs text-warn">Showing {ROW_CAP.toLocaleString('en-IN')} of {rows.length.toLocaleString('en-IN')} components. Filter to narrow (the Excel has all).</p>}
        {!rows.length && <p className="px-3 py-3 text-xs text-muted">No component matches.</p>}
      </div>
    </Card>
  );
}

/* ======================= Rate simulation ======================= */

function SimView({ r, s, initial, onChange, onReset, query }: { r: BudgetResult; s: BudgetSettings; initial: string; onChange: (id: string, c: RateChange | null) => void; onReset: () => void; query: PlanCostQuery }) {
  const codes = useMemo(() => {
    const m = new Map<string, { idnrk: string; maktx: string; meins: string; rate: Decimal | null; qty: Decimal; budget: Decimal; fgs: number }>();
    for (const c of r.components) {
      const x = m.get(c.idnrk) ?? { idnrk: c.idnrk, maktx: c.maktx, meins: c.meins, rate: c.h1Rate, qty: ZERO, budget: ZERO, fgs: 0 };
      x.qty = x.qty.plus(c.qty); x.budget = x.budget.plus(c.budget); x.fgs += c.fgs.length;
      m.set(c.idnrk, x);
    }
    return [...m.values()].sort((a, b) => b.budget.cmp(a.budget));
  }, [r.components]);
  const [pick, setPick] = useState(() => (initial && codes.some((c) => c.idnrk === initial) ? initial : codes[0]?.idnrk ?? ''));
  const [onlyAffected, setOnlyAffected] = useState(true);
  const cur = codes.find((c) => c.idnrk === pick);
  const ch = s.sim[pick] ?? {};
  const pctVal = ch.pct ?? 0;
  const active = Object.entries(s.sim).filter(([, c]) => isActive(c));
  const fgs = onlyAffected && !isSimIdentity(s) ? r.fgs.filter((f) => !f.delta.isZero()) : r.fgs;
  const maxAbs = r.fgs.reduce((m, f) => (f.delta.abs().gt(m) ? f.delta.abs() : m), ZERO);

  const exportXlsx = () => {
    const F = r.fgs;
    const cols: XCol[] = [
      { header: 'Plan country', get: (i) => F[i].land1 }, { header: 'Plant', get: (i) => F[i].hwerks }, { header: 'FG', get: (i) => F[i].headmat },
      { header: 'Description', width: 30, get: (i) => F[i].headtxt }, { header: 'Plan qty', dp: 3, get: (i) => n(F[i].planQty, 3) },
      { header: 'Budget cost / pc', dp: 4, curr: 'INR', get: (i) => n(F[i].budgetPc, 4) }, { header: 'Simulated / pc', dp: 4, curr: 'INR', get: (i) => n(F[i].simPc, 4) },
      { header: 'Change / pc', dp: 4, curr: 'INR', get: (i) => n(F[i].deltaPc, 4) }, { header: 'Change %', dp: 2, get: (i) => n(F[i].deltaPct) },
      { header: 'Budget cost INR', dp: 2, curr: 'INR', get: (i) => n(F[i].budget) }, { header: 'Simulated INR', dp: 2, curr: 'INR', get: (i) => n(F[i].sim) }, { header: 'Impact INR', dp: 2, curr: 'INR', get: (i) => n(F[i].delta) },
      { header: 'Local currency', get: (i) => F[i].curr }, { header: 'Budget / pc local', dp: 4, get: (i) => n(F[i].budgetPcLoc, 4) }, { header: 'Simulated / pc local', dp: 4, get: (i) => n(F[i].simPcLoc, 4) },
      { header: 'Impact local', dp: 2, get: (i) => (F[i].simLoc && F[i].budgetLoc ? n(F[i].simLoc!.minus(F[i].budgetLoc!)) : null) },
    ];
    void exportTable({ fmt: 'xlsx', name: 'Component rate simulation', cols, count: F.length, extraParams: [...planParams(query), ['Rate changes', active.map(([id, c]) => `${id}: ${c.pc ? `rate ${c.pc}` : `${(c.pct ?? 0) > 0 ? '+' : ''}${c.pct}%`}`).join('; ') || 'none'], ['Overall impact INR', `${r.delta.toFixed(2)} (${signedPct(r.deltaPct)})`], ['Basis', 'Monthly budget rates (H1 SAP budget, H2 revised in the app)']] });
  };

  return (
    <div className="flex flex-col gap-3">
      <Card title={<span className="flex items-center gap-2">Change a component rate <SimTag /></span>} actions={
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" disabled={!active.length} onClick={onReset}><RotateCcw size={14} /> Reset all</Button>
          <Button size="sm" variant="ghost" onClick={exportXlsx}><FileSpreadsheet size={14} /> Excel</Button>
        </div>
      }>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">
          <label className="flex flex-col gap-1 text-2xs font-semibold uppercase tracking-wide text-muted">
            Component
            <select aria-label="Component to simulate" className={cx(inputBase, 'h-9 text-xs normal-case tracking-normal')} value={pick} onChange={(e) => setPick(e.target.value)}>
              {codes.map((c) => <option key={c.idnrk} value={c.idnrk}>{c.idnrk} — {c.maktx}{isActive(s.sim[c.idnrk]) ? ' •' : ''}</option>)}
            </select>
            {cur && <span className="normal-case tracking-normal text-muted">Budget rate {cur.rate ? `${fmtRate(cur.rate)} / ${cur.meins}` : '—'} · {q3(cur.qty)} {cur.meins} · in {cur.fgs} FG{cur.fgs === 1 ? '' : 's'} · {inr(cur.budget)}</span>}
          </label>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-24 text-2xs font-semibold uppercase tracking-wide text-muted">Change %</span>
              <input type="range" min={-50} max={50} step={0.5} aria-label="Rate change percent slider" value={pctVal} disabled={!!ch.pc} onChange={(e) => onChange(pick, { pct: Number(e.target.value) })} className="min-w-[160px] flex-1 accent-[rgb(var(--sim))]" />
              <input type="number" step="0.1" aria-label="Rate change percent" className={cx(inputBase, 'h-8 w-24 text-right text-xs', pctVal ? 'border-sim font-bold text-sim' : '')} value={pctVal || ''} placeholder="0" disabled={!!ch.pc} onChange={(e) => onChange(pick, e.target.value === '' ? null : { pct: Number(e.target.value) })} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-24 text-2xs font-semibold uppercase tracking-wide text-muted">New rate</span>
              <input type="number" step="0.0001" min="0" aria-label="New absolute rate per unit" className={cx(inputBase, 'h-8 w-40 text-right text-xs', ch.pc ? 'border-sim font-bold text-sim' : '')} value={ch.pc ?? ''} placeholder={cur?.rate ? cur.rate.toFixed(4) : 'INR / unit'} onChange={(e) => onChange(pick, e.target.value === '' ? null : { pc: e.target.value })} />
              <span className="text-xs text-muted">INR per {cur?.meins || 'unit'} for every month (replaces the % change)</span>
              {isActive(ch) && <button type="button" className="ml-auto text-xs font-semibold text-accent hover:underline" onClick={() => onChange(pick, null)}>Clear</button>}
            </div>
          </div>
        </div>
        {active.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-2xs font-semibold uppercase tracking-wide text-muted">Active changes</span>
            {active.map(([id, c]) => (
              <span key={id} className="inline-flex items-center gap-1 rounded-full border border-sim/40 bg-sim/10 px-2 py-0.5 font-semibold text-sim">
                <button type="button" onClick={() => setPick(id)}>{id} {c.pc ? `= ${c.pc}` : `${(c.pct ?? 0) > 0 ? '+' : ''}${c.pct}%`}</button>
                <button type="button" aria-label={`Remove ${id}`} onClick={() => onChange(id, null)}><X size={11} /></button>
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card title={<span className="flex items-center gap-2">Impact on product cost <SimTag /></span>} bodyClass="p-0" actions={
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={onlyAffected} onChange={(e) => setOnlyAffected(e.target.checked)} /> Only affected FGs</label>
      }>
        <div className="scroll-thin max-h-[60vh] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-panel shadow-[0_1px_0_rgb(var(--line))]">
              <tr><th className={thCls}>FG</th><th className={thCls}>Country · Plant</th><th className={thNum}>Plan qty</th><th className={thNum}>Budget / pc</th><th className={thNum}>Simulated / pc</th><th className={thNum}>Change / pc</th><th className={thNum}>Change %</th><th className={thNum}>Budget cost INR</th><th className={thNum}>Simulated INR</th><th className={thNum}>Impact INR</th><th className={thNum}>Budget / pc local</th><th className={thNum}>Impact local</th><th className={cx(thCls, 'w-32')}>Impact</th></tr>
            </thead>
            <tbody>
              {fgs.map((f) => (
                <tr key={f.key} className={cx('border-t border-line/60', !f.delta.isZero() && (f.delta.gt(0) ? 'bg-bad/[0.05] font-semibold' : 'bg-good/[0.06] font-semibold'))}>
                  <td className={tdCls}><span className="font-mono">{f.headmat}</span><div className="max-w-[240px] truncate font-normal text-muted">{f.headtxt}</div></td>
                  <td className={cx(tdCls, 'font-mono font-normal')}>{f.land1} · {f.hwerks}</td>
                  <td className={tdNum}>{q3(f.planQty)}</td>
                  <td className={tdNum}>{f.budgetPc ? fmtRate(f.budgetPc) : '—'}</td>
                  <td className={cx(tdNum, !f.delta.isZero() && 'sim-val')}>{f.simPc ? fmtRate(f.simPc) : '—'}</td>
                  <td className={cx(tdNum, tone(f.deltaPc))}>{f.deltaPc && !f.deltaPc.isZero() ? fmtSigned(f.deltaPc, 4) : '—'}</td>
                  <td className={cx(tdNum, tone(f.delta))}>{f.delta.isZero() ? '—' : signedPct(f.deltaPct)}</td>
                  <td className={tdNum}>{fmtNum(f.budget, 2)}</td>
                  <td className={cx(tdNum, !f.delta.isZero() && 'sim-val')}>{fmtNum(f.sim, 2)}</td>
                  <td className={cx(tdNum, tone(f.delta))}>{f.delta.isZero() ? '—' : fmtSigned(f.delta, 2)}</td>
                  <td className={tdNum}>{f.budgetPcLoc ? <>{fmtRate(f.budgetPcLoc)} <span className="text-faint">{f.curr}</span></> : '—'}</td>
                  <td className={cx(tdNum, tone(f.delta))}>{f.delta.isZero() || !f.simLoc || !f.budgetLoc ? '—' : <>{fmtSigned(f.simLoc.minus(f.budgetLoc), 2)} <span className="text-faint">{f.curr}</span></>}</td>
                  <td className={tdCls}>{!f.delta.isZero() && maxAbs.gt(0) && <div className="h-2 w-28 overflow-hidden rounded-full bg-sunken"><div className={cx('h-full rounded-full', f.delta.gt(0) ? 'bg-bad' : 'bg-good')} style={{ width: `${Math.max(3, Number(f.delta.abs().div(maxAbs).times(100).toFixed(0)))}%` }} /></div>}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-line bg-sunken/60 font-bold">
                <td className={tdCls} colSpan={7}>Overall plan</td>
                <td className={tdNum}>{fmtNum(r.budget, 2)}</td>
                <td className={cx(tdNum, !r.delta.isZero() && 'sim-val')}>{fmtNum(r.sim, 2)}</td>
                <td className={cx(tdNum, tone(r.delta))}>{r.delta.isZero() ? '—' : `${fmtSigned(r.delta, 2)} (${signedPct(r.deltaPct)})`}</td>
                <td className={tdCls} colSpan={3} />
              </tr>
            </tbody>
          </table>
          {!fgs.length && <p className="px-3 py-3 text-xs text-muted">No FG uses the components changed.</p>}
        </div>
      </Card>
    </div>
  );
}

/* ======================= Budget rates H1 / H2 ======================= */

function H2View({ r, s, sapRates, onPct, onChange }: { r: BudgetResult; s: BudgetSettings; sapRates: boolean; onPct: (v: number) => void; onChange: (id: string, c: RateChange | null) => void }) {
  const [search, setSearch] = useState('');
  const t = search.trim().toLowerCase();
  const codes = useMemo(() => {
    const m = new Map<string, { idnrk: string; maktx: string; h1: Decimal | null; h2: Decimal | null; h1Qty: Decimal; h2Qty: Decimal; source: string }>();
    for (const c of r.components) {
      const x = m.get(c.idnrk) ?? { idnrk: c.idnrk, maktx: c.maktx, h1: c.h1Rate, h2: c.h2Rate, h1Qty: ZERO, h2Qty: ZERO, source: c.rateSource };
      x.h1Qty = x.h1Qty.plus(c.months.slice(0, H2_START).reduce((a, v) => a.plus(v), ZERO));
      x.h2Qty = x.h2Qty.plus(c.months.slice(H2_START).reduce((a, v) => a.plus(v), ZERO));
      m.set(c.idnrk, x);
    }
    return [...m.values()].sort((a, b) => (b.h1 ?? ZERO).times(b.h1Qty.plus(b.h2Qty)).cmp((a.h1 ?? ZERO).times(a.h1Qty.plus(a.h2Qty))));
  }, [r.components]);
  const rows = codes.filter((c) => !t || `${c.idnrk} ${c.maktx}`.toLowerCase().includes(t));
  return (
    <div className="flex flex-col gap-3">
      <Card title="H2 budget revision">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-2xs font-semibold uppercase tracking-wide text-muted">
            All components, from October %
            <input type="number" step="0.1" aria-label="H2 revision percent for all components" className={cx(inputBase, 'h-8 w-32 text-right text-xs', s.h2Pct ? 'border-warn font-bold text-warn' : '')} value={s.h2Pct || ''} placeholder="0" onChange={(e) => onPct(e.target.value === '' ? 0 : Number(e.target.value))} />
          </label>
          <div className="grid min-w-[260px] flex-1 grid-cols-3 gap-2 text-xs">
            <div className="rounded-xl border border-line px-3 py-2"><div className="text-2xs font-semibold uppercase text-muted">H1 (Apr–Sep)</div><div className="num text-lg font-bold">{inr(r.h1)}</div></div>
            <div className="rounded-xl border border-line px-3 py-2"><div className="text-2xs font-semibold uppercase text-muted">H2 (Oct–Mar)</div><div className="num text-lg font-bold">{inr(r.h2)}</div></div>
            <div className="rounded-xl border border-line px-3 py-2"><div className="text-2xs font-semibold uppercase text-muted">Full year</div><div className="num text-lg font-bold">{inr(r.budget)}</div></div>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">{sapRates
          ? <>SAP sends budget rates with validity ({BUDGET_RATE_SET}); components SAP covers use the rate valid in each month (marked ᵛ) and the revision here does not apply to them. The revision below only applies to components without SAP validity rates.</>
          : <>The budget rate on the cost line applies from April; the revision here applies from October. A component&apos;s own H2 rate or % wins over the all-component %. Kept in your browser until SAP sends the budget rates with validity ({BUDGET_RATE_SET}).</>}</p>
      </Card>
      <Card title="Per component H2 rate" bodyClass="p-0" actions={<input aria-label="Filter components" className={cx(inputBase, 'h-8 w-52 text-xs')} placeholder="Component…" value={search} onChange={(e) => setSearch(e.target.value)} />}>
        <div className="scroll-thin max-h-[60vh] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-panel shadow-[0_1px_0_rgb(var(--line))]"><tr><th className={thCls}>Component</th><th className={thNum}>H1 qty</th><th className={thNum}>H2 qty</th><th className={thNum}>H1 rate (budget)</th><th className={thNum}>H2 %</th><th className={thNum}>H2 rate</th><th className={thNum}>H2 rate applied</th><th className={thCls} /></tr></thead>
            <tbody>
              {rows.slice(0, ROW_CAP).map((c) => {
                const own = s.h2[c.idnrk];
                return (
                  <tr key={c.idnrk} className={cx('border-t border-line/60', isActive(own) && 'bg-warn/[0.06]')}>
                    <td className={tdCls}><span className="font-mono font-semibold">{c.idnrk}</span> <span className="text-muted">{c.maktx}</span>{c.source === 'selected' && <span className="text-faint" title="No budget rate: selected SAP rate"> *</span>}{c.source === 'sap' && <span className="text-faint" title={`SAP ${BUDGET_RATE_SET} by validity`}> ᵛ</span>}</td>
                    <td className={tdNum}>{q3(c.h1Qty)}</td>
                    <td className={tdNum}>{q3(c.h2Qty)}</td>
                    <td className={tdNum}>{c.h1 ? fmtRate(c.h1) : '—'}</td>
                    <td className={tdNum}><input type="number" step="0.1" aria-label={`H2 percent for ${c.idnrk}`} title={c.source === 'sap' ? 'SAP validity rate applies' : undefined} className={cx(inputBase, 'h-7 w-20 px-2 text-right text-xs')} value={own?.pct ?? ''} placeholder={s.h2Pct ? String(s.h2Pct) : '0'} disabled={!!own?.pc} onChange={(e) => onChange(c.idnrk, e.target.value === '' ? null : { pct: Number(e.target.value) })} /></td>
                    <td className={tdNum}><input type="number" step="0.0001" min="0" aria-label={`H2 rate for ${c.idnrk}`} className={cx(inputBase, 'h-7 w-28 px-2 text-right text-xs')} value={own?.pc ?? ''} placeholder="—" onChange={(e) => onChange(c.idnrk, e.target.value === '' ? null : { pc: e.target.value })} /></td>
                    <td className={cx(tdNum, c.h2 && c.h1 && !c.h2.eq(c.h1) && 'font-semibold text-warn')}>{c.h2 ? fmtRate(c.h2) : '—'}</td>
                    <td className={tdCls}>{isActive(own) && <button type="button" className="text-accent hover:underline" onClick={() => onChange(c.idnrk, null)}>Reset</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ======================= Savings vs actual (estimate) ======================= */

const GROUP_LABEL: Record<SavingsGroup, string> = { component: 'By component', fg: 'By FG', plant: 'By plant', month: 'By month' };
const GROUP_COL: Record<SavingsGroup, string> = { component: 'Component', fg: 'FG', plant: 'Plant', month: 'Month' };
const AGROUP_LABEL: Record<ActualGroup, string> = { fg: 'By FG', plant: 'By plant', country: 'By plan country', month: 'By month' };
const AGROUP_COL: Record<ActualGroup, string> = { fg: 'FG (plan country · plant)', plant: 'Plant', country: 'Plan country', month: 'Month' };
type Mode = 'actual' | 'estimate';

function SavingsView({ lines, s, rates, query, ctx, r, actuals, actFeed }: { lines: PlanLineWithOptions[]; s: BudgetSettings; rates: RatesState; query: PlanCostQuery; ctx: RateContext; r: BudgetResult; actuals: Map<string, ActualCell[]> | null; actFeed: Feed<ProdActualRow> | null }) {
  const elapsed = elapsedMonths();
  const [upTo, setUpTo] = useState(() => Math.max(1, elapsed));
  const [mode, setMode] = useState<Mode>(actuals ? 'actual' : 'estimate');
  useEffect(() => { if (actuals) setMode('actual'); }, [actuals]);
  const months = useMemo(() => Array.from({ length: upTo }, (_, i) => i), [upTo]);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-2"><span className="text-2xs font-semibold uppercase tracking-wide text-muted">Months passed</span>
          <select aria-label="Up to month" className={cx(inputBase, 'h-8 text-xs')} value={upTo} onChange={(ev) => setUpTo(Number(ev.target.value))}>
            {FISCAL_MONTHS.map((m, i) => <option key={m} value={i + 1}>Apr – {m}{i + 1 === elapsed ? ' (passed)' : ''}</option>)}
          </select>
        </label>
        <span className="flex gap-1">
          <button type="button" disabled={!actuals} onClick={() => setMode('actual')} title={actuals ? undefined : actFeed?.note || 'Checking SAP…'} className={cx('rounded-full border px-2.5 py-0.5 font-semibold disabled:opacity-50', mode === 'actual' ? 'border-accent bg-accent text-white' : 'border-line text-muted')}>Actual production (SAP)</button>
          <button type="button" onClick={() => setMode('estimate')} className={cx('rounded-full border px-2.5 py-0.5 font-semibold', mode === 'estimate' ? 'border-accent bg-accent text-white' : 'border-line text-muted')}>Estimate</button>
        </span>
        {!actuals && <span className="text-muted">{actFeed === null ? `Checking SAP for ${PROD_ACTUAL_SET}…` : actFeed.note}</span>}
      </div>
      {mode === 'actual' && actuals ? <ActualSavingsView r={r} actuals={actuals} s={s} ctx={ctx} months={months} upTo={upTo} query={query} />
        : <EstimateView lines={lines} s={s} rates={rates} query={query} ctx={ctx} months={months} upTo={upTo} />}
    </div>
  );
}

/** Savings on actual FG production from SAP (ProdActualSet): budget cost of the output vs its production value. */
function ActualSavingsView({ r, actuals, s, ctx, months, upTo, query }: { r: BudgetResult; actuals: Map<string, ActualCell[]>; s: BudgetSettings; ctx: RateContext; months: number[]; upTo: number; query: PlanCostQuery }) {
  const [by, setBy] = useState<ActualGroup>('fg');
  const a = useMemo(() => actualSavings(r, actuals, s, months, ctx), [r, actuals, s, months, ctx]);
  const rows = useMemo(() => groupActual(a, by, FISCAL_MONTHS), [a, by]);
  const exportXlsx = () => {
    const R = a.rows;
    const cols: XCol[] = [
      { header: 'Plan country', get: (i) => R[i].land1 }, { header: 'Plant', get: (i) => R[i].hwerks }, { header: 'FG', get: (i) => R[i].headmat }, { header: 'Description', width: 28, get: (i) => R[i].headtxt },
      { header: 'Month', get: (i) => FISCAL_MONTHS[R[i].month] }, { header: 'Produced qty', dp: 3, get: (i) => n(R[i].qty, 3) },
      { header: 'Budget cost INR', dp: 2, curr: 'INR', get: (i) => n(R[i].budget) }, { header: 'Actual value INR', dp: 2, curr: 'INR', get: (i) => n(R[i].actual) }, { header: 'Saving INR', dp: 2, curr: 'INR', get: (i) => n(R[i].budget.minus(R[i].actual)) },
      { header: 'Local currency', get: (i) => R[i].curr }, { header: 'Budget cost local', dp: 2, get: (i) => n(R[i].budgetLoc) }, { header: 'Actual value local', dp: 2, get: (i) => n(R[i].actualLoc) },
      { header: 'Saving local', dp: 2, get: (i) => (R[i].budgetLoc && R[i].actualLoc ? n(R[i].budgetLoc!.minus(R[i].actualLoc!)) : null) },
    ];
    void exportTable({ fmt: 'xlsx', name: 'Savings vs budget (actual production)', cols, count: R.length, extraParams: [...planParams(query), ['Months', `${FISCAL_MONTHS[0]}–${FISCAL_MONTHS[upTo - 1]}`], ['Actual', `SAP ${PROD_ACTUAL_SET}: production quantity and value of the FG`], ['Budget cost', 'produced qty x budget cost per FG piece of the month (component qty per piece x monthly budget rate)'], ['Saving', 'budget cost - actual value; negative = overspend'], ['Several plan countries from one plant', 'the plant\u2019s production is shared by each country\u2019s planned quantity of the month']] });
  };
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">Saving = budget cost of the FG produced (qty × budget cost per piece of that month) − its actual production value from SAP.</span>
        <span className="ml-auto flex flex-wrap gap-1">
          {(Object.keys(AGROUP_LABEL) as ActualGroup[]).map((g) => <button key={g} type="button" onClick={() => setBy(g)} className={cx('rounded-full border px-2.5 py-0.5 font-semibold', by === g ? 'border-accent bg-accent text-white' : 'border-line text-muted')}>{AGROUP_LABEL[g]}</button>)}
        </span>
        <Button size="sm" variant="ghost" onClick={exportXlsx}><FileSpreadsheet size={14} /> Excel</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Budget cost of actual output" value={inr(a.budget)} sub={`Apr – ${FISCAL_MONTHS[upTo - 1]} · monthly budget rates`} />
        <Stat label="Actual production value" value={inr(a.actual)} sub={`SAP ${PROD_ACTUAL_SET}`} />
        <Stat label={a.saving.gte(0) ? 'Saving vs budget' : 'Overspend vs budget'} tone={a.saving.gt(0) ? 'good' : a.saving.lt(0) ? 'bad' : undefined} value={fmtSigned(a.saving, 0)} sub={`${signedPct(a.savingPct)} of budget · INR`} />
        <Stat label="FGs with production" value={`${a.fgsWithActual} / ${a.fgsWithActual + a.fgsWithout}`} sub={a.fgsWithout ? `${a.fgsWithout} planned FGs without production in SAP` : 'every planned FG produced'} tone={a.fgsWithout ? 'warn' : undefined} />
      </div>
      <Card title={`Savings ${AGROUP_LABEL[by].replace('By ', 'by ')}`} bodyClass="p-0">
        <div className="scroll-thin max-h-[60vh] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-panel shadow-[0_1px_0_rgb(var(--line))]"><tr><th className={thCls}>{AGROUP_COL[by]}</th>{by === 'fg' && <th className={thNum}>Produced qty</th>}<th className={thNum}>Budget INR</th><th className={thNum}>Actual INR</th><th className={thNum}>Saving INR</th><th className={thNum}>Saving %</th><th className={thNum}>Budget local</th><th className={thNum}>Actual local</th><th className={thNum}>Saving local</th></tr></thead>
            <tbody>
              {rows.slice(0, ROW_CAP).map((x) => {
                const sl = x.budgetLoc && x.actualLoc ? x.budgetLoc.minus(x.actualLoc) : null;
                return (
                  <tr key={x.key} className="border-t border-line/60">
                    <td className={tdCls}><span className="font-mono font-semibold">{x.label}</span> {x.sub && <span className="text-muted">{x.sub}</span>}</td>
                    {by === 'fg' && <td className={tdNum}>{x.qty ? q3(x.qty) : ''}</td>}
                    <td className={tdNum}>{fmtNum(x.budget, 2)}</td>
                    <td className={tdNum}>{fmtNum(x.actual, 2)}</td>
                    <td className={cx(tdNum, 'font-semibold', x.saving.gt(0) ? 'text-good' : x.saving.lt(0) ? 'text-bad' : '')}>{fmtSigned(x.saving, 2)}</td>
                    <td className={cx(tdNum, x.saving.gt(0) ? 'text-good' : x.saving.lt(0) ? 'text-bad' : '')}>{signedPct(x.savingPct)}</td>
                    <td className={tdNum}>{x.budgetLoc ? <>{fmtNum(x.budgetLoc, 2)} <span className="text-faint">{x.curr}</span></> : '—'}</td>
                    <td className={tdNum}>{x.actualLoc ? fmtNum(x.actualLoc, 2) : '—'}</td>
                    <td className={cx(tdNum, sl && (sl.gt(0) ? 'text-good' : sl.lt(0) ? 'text-bad' : ''))}>{sl ? fmtSigned(sl, 2) : '—'}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-line bg-sunken/60 font-bold">
                <td className={tdCls}>Total (INR)</td>{by === 'fg' && <td className={tdNum} />}
                <td className={tdNum}>{fmtNum(a.budget, 2)}</td><td className={tdNum}>{fmtNum(a.actual, 2)}</td>
                <td className={cx(tdNum, a.saving.gt(0) ? 'text-good' : a.saving.lt(0) ? 'text-bad' : '')}>{fmtSigned(a.saving, 2)}</td><td className={tdNum}>{signedPct(a.savingPct)}</td><td className={tdCls} colSpan={3} />
              </tr>
            </tbody>
          </table>
          {!rows.length && <Empty title="No production in these months" icon="▦">SAP reports no production of the plan&apos;s FGs for the months chosen.</Empty>}
        </div>
      </Card>
    </>
  );
}

/** Interim estimate: planned quantity of the months passed x (budget rate - average actual / consumption rate). */
function EstimateView({ lines, s, rates, query, ctx, months, upTo }: { lines: PlanLineWithOptions[]; s: BudgetSettings; rates: RatesState; query: PlanCostQuery; ctx: RateContext; months: number[]; upTo: number }) {
  const [basis, setBasis] = useState<ActualBasis>('ACTUAL');
  const [by, setBy] = useState<SavingsGroup>('component');
  const e = useMemo(() => savingsEstimate(lines, s, months, basis, ctx), [lines, s, months, basis, ctx]);
  const rows = useMemo(() => groupSavings(e, by, FISCAL_MONTHS), [e, by]);
  const { request } = rates;
  useEffect(() => { if (basis === 'CONSUMP') request(); }, [basis, request]);

  const exportXlsx = () => {
    const L = e.lines;
    const cols: XCol[] = [
      { header: 'Component plant', get: (i) => L[i].werks }, { header: 'Component', get: (i) => L[i].idnrk }, { header: 'Description', width: 28, get: (i) => L[i].maktx },
      { header: 'FG', get: (i) => L[i].headmat }, { header: 'Plan country', get: (i) => L[i].land1 }, { header: 'FG plant', get: (i) => L[i].hwerks },
      { header: 'Qty (planned, est.)', dp: 3, get: (i) => n(L[i].qty, 3) }, { header: 'Unit', get: (i) => L[i].meins },
      { header: 'Budget rate (avg)', dp: 4, curr: 'INR', get: (i) => n(L[i].budgetRate, 4) }, { header: 'Actual rate', dp: 4, curr: 'INR', get: (i) => n(L[i].actualRate, 4) },
      { header: 'Budget cost INR', dp: 2, curr: 'INR', get: (i) => n(L[i].budget) }, { header: 'Actual cost INR', dp: 2, curr: 'INR', get: (i) => n(L[i].actual) }, { header: 'Saving INR', dp: 2, curr: 'INR', get: (i) => n(L[i].saving) },
    ];
    void exportTable({ fmt: 'xlsx', name: 'Savings vs budget (estimate)', cols, count: L.length, extraParams: [...planParams(query), ['Months', `${FISCAL_MONTHS[0]}–${FISCAL_MONTHS[upTo - 1]}`], ['Actual rate', basis === 'ACTUAL' ? 'Average actual rate (ActRatePcInr)' : 'Consumption rate option'], ['ESTIMATE', 'Consumption quantity = planned quantity of these months'], ['Saving', '(budget rate - actual rate) x qty; negative = overspend']] });
  };

  return (
    <>
      <div className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/[0.07] px-3 py-2 text-xs">
        <Info size={14} className="mt-0.5 shrink-0 text-warn" />
        <span><b>Estimate.</b> The consumed quantity is the <b>planned</b> quantity of the months chosen, and the actual rate is {basis === 'ACTUAL' ? 'SAP\u2019s average actual rate' : 'the Consumption rate option'}. Saving = (budget rate − actual rate) × quantity; negative is an overspend. Switches to actual production once SAP sends {PROD_ACTUAL_SET}.</span>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-2"><span className="text-2xs font-semibold uppercase tracking-wide text-muted">Actual rate</span>
          <select aria-label="Actual rate basis" className={cx(inputBase, 'h-8 text-xs')} value={basis} onChange={(ev) => setBasis(ev.target.value as ActualBasis)}>
            <option value="ACTUAL">Average actual rate</option>
            <option value="CONSUMP">Consumption rate (rate options)</option>
          </select>
        </label>
        {basis === 'CONSUMP' && rates.status !== 'ready' && <span className="text-muted">{rates.status === 'loading' ? 'Loading rate options…' : rates.note}</span>}
        <span className="ml-auto flex flex-wrap gap-1">
          {(Object.keys(GROUP_LABEL) as SavingsGroup[]).map((g) => (
            <button key={g} type="button" onClick={() => setBy(g)} className={cx('rounded-full border px-2.5 py-0.5 font-semibold', by === g ? 'border-accent bg-accent text-white' : 'border-line text-muted')}>{GROUP_LABEL[g]}</button>
          ))}
        </span>
        <Button size="sm" variant="ghost" onClick={exportXlsx}><FileSpreadsheet size={14} /> Excel</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Budget cost" value={inr(e.budget)} sub={`Apr – ${FISCAL_MONTHS[upTo - 1]} · monthly budget rates`} />
        <Stat label="Actual cost (est.)" value={inr(e.actual)} sub={basis === 'ACTUAL' ? 'average actual rate' : 'consumption rate'} />
        <Stat label={e.saving.gte(0) ? 'Saving vs budget' : 'Overspend vs budget'} tone={e.saving.gt(0) ? 'good' : e.saving.lt(0) ? 'bad' : undefined} value={fmtSigned(e.saving, 0)} sub={`${signedPct(e.savingPct)} of budget`} />
        <Stat label="Coverage" value={`${e.lines.length.toLocaleString('en-IN')} lines`} sub={`${e.noActual} without an actual rate · ${e.noBudget} without a budget rate (excluded)`} tone={e.noActual + e.noBudget ? 'warn' : undefined} />
      </div>
      <Card title={`Savings ${GROUP_LABEL[by].replace('By ', 'by ')} (estimate)`} bodyClass="p-0">
        <div className="scroll-thin max-h-[60vh] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-panel shadow-[0_1px_0_rgb(var(--line))]"><tr><th className={thCls}>{GROUP_COL[by]}</th>{by === 'component' && <th className={thNum}>Qty (est.)</th>}<th className={thNum}>Budget cost INR</th><th className={thNum}>Actual cost INR</th><th className={thNum}>Saving INR</th><th className={thNum}>Saving %</th></tr></thead>
            <tbody>
              {rows.slice(0, ROW_CAP).map((x) => (
                <tr key={x.key} className="border-t border-line/60">
                  <td className={tdCls}><span className="font-mono font-semibold">{x.label}</span> {x.sub && <span className="text-muted">{x.sub}</span>}</td>
                  {by === 'component' && <td className={tdNum}>{x.qty ? `${q3(x.qty)} ${x.meins}` : ''}</td>}
                  <td className={tdNum}>{fmtNum(x.budget, 2)}</td>
                  <td className={tdNum}>{fmtNum(x.actual, 2)}</td>
                  <td className={cx(tdNum, 'font-semibold', x.saving.gt(0) ? 'text-good' : x.saving.lt(0) ? 'text-bad' : '')}>{fmtSigned(x.saving, 2)}</td>
                  <td className={cx(tdNum, x.saving.gt(0) ? 'text-good' : x.saving.lt(0) ? 'text-bad' : '')}>{signedPct(x.savingPct)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-line bg-sunken/60 font-bold">
                <td className={tdCls}>Total</td>{by === 'component' && <td className={tdNum} />}
                <td className={tdNum}>{fmtNum(e.budget, 2)}</td><td className={tdNum}>{fmtNum(e.actual, 2)}</td>
                <td className={cx(tdNum, e.saving.gt(0) ? 'text-good' : e.saving.lt(0) ? 'text-bad' : '')}>{fmtSigned(e.saving, 2)}</td><td className={tdNum}>{signedPct(e.savingPct)}</td>
              </tr>
            </tbody>
          </table>
          {!rows.length && <Empty title="Nothing to compare" icon="▦">No component has both a budget and an actual rate for these months.</Empty>}
        </div>
      </Card>
    </>
  );
}
