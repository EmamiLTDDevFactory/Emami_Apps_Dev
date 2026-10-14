'use client';
/**
 * Breakup & cost > Simulate, analytics views (lib/plan/costInsights.ts):
 *   PlantDrill   plant -> FG -> component roll-up, SAP vs simulated, cost mix and freight per plant
 *   SavingsView  savings opportunities vs Budget / actual / MBEW / Consumption / cheapest SAP option, and the
 *                price-increase exposure (latest actual above the selected rate)
 *   KpiView      product-costing KPIs, ABC (Pareto) classes, +-10 % sensitivity, saved scenarios compared
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileSpreadsheet, Save, Trash2 } from 'lucide-react';
import { tdCls, tdNum, thCls, thNum } from './common';
import { Button, Card, Empty, Pill, SimTag, Stat, cx, inputBase } from '../ui';
import { CATEGORIES, CATEGORY_LABEL, costCategory } from '@/lib/cost/categories';
import { BENCHMARKS, BENCHMARK_LABEL, NEEDS_OPTIONS, abc, planKpis, plantSummary, savings, type Benchmark } from '@/lib/plan/costInsights';
import { isCompSimIdentity, simulateComponents, type CompSimResult, type CompSimSettings } from '@/lib/plan/componentSim';
import { headerKey } from '@/lib/plan/maths';
import { planParams } from '@/lib/plan/export';
import type { PlanCostLine } from '@/lib/plan/fields';
import type { PlanCostQuery } from '@/lib/plan/requests';
import type { PlanLineWithOptions } from '@/lib/plan/sources';
import type { RatesState } from '@/lib/rates/useRateOptions';
import { exportTable, type XCol } from '@/lib/client/export';
import { ls } from '@/lib/client/storage';
import { isLeafRow } from '@/lib/cost/tree';
import { D, ZERO, type Decimal } from '@/lib/cost/decimal';
import { fmtCompactInr, fmtNum, fmtQty, fmtRate, fmtSigned } from '@/lib/format';

const signedPct = (d: Decimal | null) => (d === null ? '—' : `${d.gt(0) ? '+' : d.lt(0) ? '−' : ''}${d.abs().toFixed(2)}%`);
const tone = (d: Decimal | null | undefined) => (!d || d.isZero() ? '' : d.gt(0) ? 'text-bad' : 'text-good');
const share = (d: Decimal | null) => (d === null ? '—' : `${d.toFixed(1)}%`);
const inr = (d: Decimal) => fmtCompactInr(Number(d.toFixed(2)));
const n = (d: Decimal | null | undefined, dp = 2) => (d ? Number(d.toFixed(dp)) : null);
const CAT_COLOR: Record<string, string> = { RM: 'bg-accent', PERFUME: 'bg-sim', PM: 'bg-warn', OTHER: 'bg-faint' };

/* ======================= Plant drill-down ======================= */

export function PlantDrill({ rows, r }: { rows: PlanCostLine[]; r: CompSimResult }) {
  const plants = useMemo(() => plantSummary(rows, r), [rows, r]);
  const [openPlant, setOpenPlant] = useState<string | null>(plants[0]?.hwerks ?? null);
  const [openFg, setOpenFg] = useState<string | null>(null);
  const total = plants.reduce((a, p) => a.plus(p.base), ZERO);
  return (
    <Card title={<span className="flex items-center gap-2">Plant-wise summary <SimTag /></span>} bodyClass="p-0">
      <div className="scroll-thin max-h-[70vh] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-panel shadow-[0_1px_0_rgb(var(--line))]">
            <tr>
              <th className={thCls}>Plant › FG › component</th><th className={thNum}>FGs</th><th className={thNum}>Components</th><th className={thCls}>Cost mix (RM · Perfume · PM · Other)</th>
              <th className={thNum}>Freight</th><th className={thNum}>Share</th><th className={thNum}>SAP cost INR</th><th className={thNum}>Simulated INR</th><th className={thNum}>Impact INR</th><th className={thNum}>Impact %</th>
            </tr>
          </thead>
          <tbody>
            {plants.map((p) => (
              <Fragment key={p.hwerks}>
                <tr className="cursor-pointer border-t border-line/60 bg-sunken/60 font-semibold hover:bg-sunken" onClick={() => setOpenPlant(openPlant === p.hwerks ? null : p.hwerks)}>
                  <td className={tdCls}><span className="inline-flex items-center gap-1">{openPlant === p.hwerks ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<span className="font-mono">{p.hwerks}</span></span> <span className="font-normal text-muted">{p.countries.join(', ')}</span></td>
                  <td className={tdNum}>{p.fgs}</td>
                  <td className={tdNum}>{p.components}</td>
                  <td className={tdCls}><MixBar mix={p.mix} /></td>
                  <td className={tdNum}>{p.base.gt(0) ? share(p.freight.div(p.base).times(100)) : '—'}</td>
                  <td className={tdNum}>{total.gt(0) ? share(p.base.div(total).times(100)) : '—'}</td>
                  <td className={tdNum}>{fmtNum(p.base, 2)}</td>
                  <td className={cx(tdNum, !p.delta.isZero() && 'sim-val')}>{fmtNum(p.sim, 2)}</td>
                  <td className={cx(tdNum, tone(p.delta))}>{p.delta.isZero() ? '—' : fmtSigned(p.delta, 2)}</td>
                  <td className={cx(tdNum, tone(p.delta))}>{p.delta.isZero() ? '—' : signedPct(p.deltaPct)}</td>
                </tr>
                {openPlant === p.hwerks && p.products.map((f) => (
                  <Fragment key={f.key}>
                    <tr className="cursor-pointer border-t border-line/40 hover:bg-sunken/50" onClick={() => setOpenFg(openFg === f.key ? null : f.key)}>
                      <td className={cx(tdCls, 'pl-7')}><span className="inline-flex items-center gap-1">{openFg === f.key ? <ChevronDown size={11} /> : <ChevronRight size={11} />}<span className="font-mono">{f.headmat}</span></span> <span className="text-muted">{f.headtxt}</span> <span className="text-faint">· {f.land1}</span></td>
                      <td className={tdNum} colSpan={2}>{f.basePc ? `${fmtRate(f.basePc)} / pc` : '—'}{f.simPc && f.deltaPc && !f.deltaPc.isZero() ? <span className="sim-val"> → {fmtRate(f.simPc)}</span> : null}</td>
                      <td className={tdCls}><FgMix rows={rows} fgKey={f.key} /></td>
                      <td className={tdNum} />
                      <td className={tdNum}>{p.base.gt(0) ? share(f.base.div(p.base).times(100)) : '—'}</td>
                      <td className={tdNum}>{fmtNum(f.base, 2)}</td>
                      <td className={cx(tdNum, !f.delta.isZero() && 'sim-val')}>{fmtNum(f.sim, 2)}</td>
                      <td className={cx(tdNum, tone(f.delta))}>{f.delta.isZero() ? '—' : fmtSigned(f.delta, 2)}</td>
                      <td className={cx(tdNum, tone(f.delta))}>{f.delta.isZero() ? '—' : signedPct(f.deltaPct)}</td>
                    </tr>
                    {openFg === f.key && <FgComponents rows={rows} fgKey={f.key} fgTotal={f.base} />}
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function MixBar({ mix }: { mix: Record<string, Decimal> }) {
  const total = Object.values(mix).reduce((a, v) => a.plus(v), ZERO);
  if (!total.gt(0)) return <span className="text-faint">—</span>;
  return (
    <div className="flex h-2.5 w-44 overflow-hidden rounded-full bg-sunken" title={CATEGORIES.map((c) => `${CATEGORY_LABEL[c]} ${mix[c].div(total).times(100).toFixed(1)}%`).join(' · ')}>
      {CATEGORIES.map((c) => <span key={c} className={CAT_COLOR[c]} style={{ width: `${Number(mix[c].div(total).times(100).toFixed(2))}%` }} />)}
    </div>
  );
}

function FgMix({ rows, fgKey }: { rows: PlanCostLine[]; fgKey: string }) {
  const mix = useMemo(() => {
    const m: Record<string, Decimal> = { RM: ZERO, PERFUME: ZERO, PM: ZERO, OTHER: ZERO };
    for (const l of rows) if (isLeafRow(l) && headerKey(l) === fgKey) { const c = catOf(l); m[c] = m[c].plus(D(l.TotCostInr)); }
    return m;
  }, [rows, fgKey]);
  return <MixBar mix={mix} />;
}
const catOf = (l: PlanCostLine) => costCategory(l as unknown as { Mtart: string; Matkl: string });

function FgComponents({ rows, fgKey, fgTotal }: { rows: PlanCostLine[]; fgKey: string; fgTotal: Decimal }) {
  const comps = useMemo(() => {
    const m = new Map<string, { idnrk: string; maktx: string; meins: string; qty: Decimal; cost: Decimal; werks: Set<string> }>();
    for (const l of rows) {
      if (!isLeafRow(l) || headerKey(l) !== fgKey) continue;
      const c = m.get(l.Idnrk) ?? { idnrk: l.Idnrk, maktx: l.Maktx, meins: l.Meins, qty: ZERO, cost: ZERO, werks: new Set<string>() };
      c.qty = c.qty.plus(D(l.QtyTot));
      c.cost = c.cost.plus(D(l.TotCostInr));
      c.werks.add(l.Werks);
      m.set(l.Idnrk, c);
    }
    return [...m.values()].sort((a, b) => b.cost.cmp(a.cost));
  }, [rows, fgKey]);
  return (
    <>
      {comps.map((c) => (
        <tr key={c.idnrk} className="border-t border-line/30 text-2xs">
          <td className={cx(tdCls, 'pl-12')}><span className="font-mono">{c.idnrk}</span> <span className="text-muted">{c.maktx}</span> <span className="text-faint">· {[...c.werks].join(', ')}</span></td>
          <td className={tdNum} colSpan={2}>{fmtQty(c.qty)} {c.meins}</td>
          <td className={tdCls}>{c.qty.gt(0) ? `${fmtRate(c.cost.div(c.qty))} / ${c.meins}` : ''}</td>
          <td className={tdNum} />
          <td className={tdNum}>{fgTotal.gt(0) ? share(c.cost.div(fgTotal).times(100)) : '—'}</td>
          <td className={tdNum}>{fmtNum(c.cost, 2)}</td>
          <td className={tdNum} colSpan={3} />
        </tr>
      ))}
    </>
  );
}

/* ======================= Savings & exposure ======================= */

export function SavingsView({ lines, rates, query }: { lines: PlanLineWithOptions[]; rates?: RatesState; query: PlanCostQuery }) {
  const res = useMemo(() => savings(lines), [lines]);
  const optionsReady = rates?.status === 'ready';
  const [bench, setBench] = useState<Benchmark | 'BEST'>('BEST');
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const rows = res.rows.filter((r) => (!t || `${r.idnrk} ${r.maktx}`.toLowerCase().includes(t)) && (bench === 'BEST' ? r.best : r.byBenchmark[bench]));
  const exposure = res.rows.filter((r) => r.exposure.gt(0)).sort((a, b) => b.exposure.cmp(a.exposure));

  const exportXlsx = () => {
    const R = res.rows;
    const cols: XCol[] = [
      { header: 'Component', get: (i) => R[i].idnrk },
      { header: 'Description', width: 34, get: (i) => R[i].maktx },
      { header: 'Category', get: (i) => CATEGORY_LABEL[R[i].cat] },
      { header: 'Used in FGs', get: (i) => R[i].fgs },
      { header: 'Plan qty', dp: 3, get: (i) => n(R[i].qty, 3) },
      { header: 'Selected rate / unit', dp: 4, curr: 'INR', get: (i) => n(R[i].selPc, 4) },
      { header: 'Material cost at selected INR', dp: 2, curr: 'INR', get: (i) => n(R[i].selCost) },
      ...BENCHMARKS.map((b): XCol => ({ header: `Saving vs ${BENCHMARK_LABEL[b]} INR`, dp: 2, curr: 'INR', get: (i) => n(R[i].byBenchmark[b]?.saving) })),
      { header: 'Best benchmark', get: (i) => (R[i].best ? BENCHMARK_LABEL[R[i].best!.benchmark] : '') },
      { header: 'Best saving INR', dp: 2, curr: 'INR', get: (i) => n(R[i].best?.saving) },
      { header: 'Price-increase exposure INR', dp: 2, curr: 'INR', get: (i) => n(R[i].exposure) },
    ];
    void exportTable({ fmt: 'xlsx', name: 'Plan savings', cols, count: R.length, extraParams: [...planParams(query), ['Saving', '(selected rate - benchmark rate) x plan qty, where the benchmark is lower'], ['Exposure', '(latest actual - selected rate) x plan qty, where the actual is higher'], ['Rate options', optionsReady ? 'loaded' : 'not loaded - MBEW / Consumption / cheapest option empty']] });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Material cost (selected rates)" value={inr(res.totalSel)} sub={`${fmtNum(res.totalSel, 2)} INR · excl. freight`} />
        <Stat label="Savings potential" tone="good" value={inr(res.potential)} sub={`${share(res.potentialPct)} of material cost · best benchmark per component`} />
        <Stat label="Price-increase exposure" tone={res.exposure.gt(0) ? 'bad' : undefined} value={inr(res.exposure)} sub={`${res.exposureComponents} components where the latest actual is above the selected rate`} />
        <Stat label="Components with a saving" value={res.rows.filter((r) => r.best).length} sub={`of ${res.rows.length} components`} />
      </div>
      {!optionsReady && rates && (
        <p className="text-xs text-muted">MBEW, Consumption and the cheapest SAP option need SAP&apos;s rate options.{' '}
          {rates.status === 'loading' ? 'Loading…' : rates.status === 'unavailable' || rates.status === 'error' ? <>{rates.note} <button type="button" className="font-semibold text-accent underline" onClick={rates.retest}>Test again</button></> : <button type="button" className="font-semibold text-accent underline" onClick={rates.request}>Load rate options</button>}
        </p>
      )}
      <Card title="Savings by benchmark" bodyClass="p-0">
        <table className="w-full text-xs">
          <thead><tr><th className={thCls}>Benchmark</th><th className={thNum}>Components cheaper</th><th className={thNum}>Components priced</th><th className={thNum}>Saving INR</th><th className={thNum}>% of material cost</th></tr></thead>
          <tbody>
            {BENCHMARKS.map((b) => {
              const x = res.byBenchmark[b];
              const off = NEEDS_OPTIONS.includes(b) && !optionsReady;
              return (
                <tr key={b} className={cx('cursor-pointer border-t border-line/60 hover:bg-sunken', bench === b && 'bg-accent/[0.06] font-semibold')} onClick={() => setBench(bench === b ? 'BEST' : b)}>
                  <td className={tdCls}>{BENCHMARK_LABEL[b]} {off && <span className="text-faint">(needs rate options)</span>}</td>
                  <td className={tdNum}>{off ? '—' : x.components}</td>
                  <td className={tdNum}>{off ? '—' : x.priced}</td>
                  <td className={cx(tdNum, 'text-good')}>{off ? '—' : fmtNum(x.saving, 2)}</td>
                  <td className={tdNum}>{off || !res.totalSel.gt(0) ? '—' : share(x.saving.div(res.totalSel).times(100))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <Card title={`Savings opportunities${bench === 'BEST' ? ' · best benchmark per component' : ` · vs ${BENCHMARK_LABEL[bench]}`}`} bodyClass="p-0" actions={
        <div className="flex items-center gap-2">
          <input aria-label="Filter savings" className={cx(inputBase, 'h-8 w-48 text-xs')} placeholder="Component…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button size="sm" variant="ghost" onClick={exportXlsx}><FileSpreadsheet size={14} /> Excel</Button>
        </div>
      }>
        <div className="scroll-thin max-h-[55vh] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-panel shadow-[0_1px_0_rgb(var(--line))]"><tr><th className={thCls}>Component</th><th className={thCls}>Cat.</th><th className={thNum}>FGs</th><th className={thNum}>Plan qty</th><th className={thNum}>Selected / unit</th><th className={thCls}>Benchmark</th><th className={thNum}>Benchmark / unit</th><th className={thNum}>Saving INR</th><th className={thNum}>Saving %</th></tr></thead>
            <tbody>
              {rows.slice(0, 300).map((r) => {
                const x = bench === 'BEST' ? r.best : r.byBenchmark[bench] ? { benchmark: bench, ...r.byBenchmark[bench]! } : null;
                if (!x) return null;
                return (
                  <tr key={r.idnrk} className="border-t border-line/60">
                    <td className={tdCls}><span className="font-mono font-semibold">{r.idnrk}</span><div className="max-w-[240px] truncate text-muted">{r.maktx}</div></td>
                    <td className={tdCls}>{CATEGORY_LABEL[r.cat]}</td>
                    <td className={tdNum}>{r.fgs}</td>
                    <td className={tdNum}>{fmtQty(r.qty)} <span className="text-faint">{r.meins}</span></td>
                    <td className={tdNum}>{r.selPc ? fmtRate(r.selPc) : '—'}</td>
                    <td className={tdCls}><Pill tone="good">{BENCHMARK_LABEL[x.benchmark]}</Pill></td>
                    <td className={tdNum}>{fmtRate(x.rate)}</td>
                    <td className={cx(tdNum, 'font-semibold text-good')}>{fmtNum(x.saving, 2)}</td>
                    <td className={tdNum}>{r.selCost.gt(0) ? share(x.saving.div(r.selCost).times(100)) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && <p className="px-3 py-3 text-xs text-muted">No component is cheaper on this benchmark.</p>}
        </div>
      </Card>
      <Card title="Cost-increase exposure · latest actual above the selected rate" bodyClass="p-0">
        {exposure.length === 0 ? <p className="px-3 py-3 text-xs text-muted">No component has a latest actual rate above the rate SAP selected.</p> : (
          <div className="scroll-thin max-h-[45vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-panel shadow-[0_1px_0_rgb(var(--line))]"><tr><th className={thCls}>Component</th><th className={thCls}>Cat.</th><th className={thNum}>FGs</th><th className={thNum}>Plan qty</th><th className={thNum}>Selected / unit</th><th className={thNum}>Exposure INR</th><th className={thNum}>% of its cost</th></tr></thead>
              <tbody>
                {exposure.slice(0, 200).map((r) => (
                  <tr key={r.idnrk} className="border-t border-line/60">
                    <td className={tdCls}><span className="font-mono font-semibold">{r.idnrk}</span> <span className="text-muted">{r.maktx}</span></td>
                    <td className={tdCls}>{CATEGORY_LABEL[r.cat]}</td>
                    <td className={tdNum}>{r.fgs}</td>
                    <td className={tdNum}>{fmtQty(r.qty)} {r.meins}</td>
                    <td className={tdNum}>{r.selPc ? fmtRate(r.selPc) : '—'}</td>
                    <td className={cx(tdNum, 'font-semibold text-bad')}>{fmtNum(r.exposure, 2)}</td>
                    <td className={tdNum}>{r.selCost.gt(0) ? share(r.exposure.div(r.selCost).times(100)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ======================= KPIs, sensitivity & scenarios ======================= */

interface SavedScenario { id: string; name: string; settings: CompSimSettings; at: string }
const SCN_KEY = 'plan:compsim:saved';
const loadSaved = (plan: string): SavedScenario[] => { const all = ls.get<Record<string, SavedScenario[]>>(SCN_KEY, {}); return Array.isArray(all[plan]) ? all[plan] : []; };
const storeSaved = (plan: string, list: SavedScenario[]) => { const all = ls.get<Record<string, SavedScenario[]>>(SCN_KEY, {}); all[plan] = list; ls.set(SCN_KEY, all); };

export function KpiView({ rows, r, s, plan, onApply }: { rows: PlanCostLine[]; r: CompSimResult; s: CompSimSettings; plan: string; onApply: (s: CompSimSettings) => void }) {
  const k = useMemo(() => planKpis(rows, r), [rows, r]);
  const a = useMemo(() => abc(r), [r]);
  const [saved, setSaved] = useState<SavedScenario[]>(() => loadSaved(plan));
  useEffect(() => setSaved(loadSaved(plan)), [plan]);
  const [name, setName] = useState('');
  const compare = useMemo(() => saved.map((x) => ({ x, res: simulateComponents(rows, { ...x.settings, fgPct: x.settings.fgPct ?? {}, fgPc: x.settings.fgPc ?? {} }) })), [saved, rows]);
  const save = () => {
    const list = [...saved, { id: `s${Date.now().toString(36)}`, name: name.trim() || `Scenario ${saved.length + 1}`, settings: s, at: new Date().toISOString() }].slice(-12);
    setSaved(list); storeSaved(plan, list); setName('');
  };
  const remove = (id: string) => { const list = saved.filter((x) => x.id !== id); setSaved(list); storeSaved(plan, list); };
  const tornado = a.rows.slice(0, 12);
  const maxT = tornado[0]?.impactPer10 ?? ZERO;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Avg landed cost / FG pc" value={k.avgPerPc ? fmtRate(k.avgPerPc) : '—'} sub={`plan-qty weighted · ${k.per1000 ? `${fmtNum(k.per1000, 2)} / 1000 pcs` : ''}`} />
        <Stat label="Material vs freight" value={share(k.freightShare)} sub={`freight share · material ${inr(k.material)} · freight ${inr(k.freight)}`} />
        <Stat label="BOM complexity" value={`${k.avgComponentsPerFg}`} sub={`avg components per FG · ${k.components} distinct · ${k.fgs} FGs`} />
        <Stat label="Selected vs latest actual" tone={k.actualVariance.gt(0) ? 'warn' : k.actualVariance.lt(0) ? 'bad' : undefined} value={fmtSigned(k.actualVariance, 0)} sub={k.actualVariance.gt(0) ? 'selected rates above actual: costing is conservative' : k.actualVariance.lt(0) ? 'selected rates below actual: cost may be understated' : 'INR'} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Cost mix (landed)">
          <MixBar mix={k.mix} />
          <table className="mt-3 w-full text-xs">
            <tbody>
              {CATEGORIES.map((c) => (
                <tr key={c} className="border-t border-line/60"><td className={tdCls}><span className={cx('mr-2 inline-block h-2.5 w-2.5 rounded-sm', CAT_COLOR[c])} />{CATEGORY_LABEL[c]}</td><td className={tdNum}>{fmtNum(k.mix[c], 2)}</td><td className={tdNum}>{share(k.mixShare[c])}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-2xs text-muted">{k.noRate ? `${k.noRate} leaf lines have no rate (freight only). ` : ''}{k.donorLines ? `${k.donorLines} lines priced from a donor plant.` : ''}</p>
        </Card>
        <Card title="ABC classification (Pareto of component cost)">
          <div className="grid grid-cols-3 gap-2 text-center">
            {(['A', 'B', 'C'] as const).map((c) => (
              <div key={c} className="rounded-xl border border-line px-2 py-2">
                <div className="text-2xl font-extrabold">{a.counts[c]}</div>
                <div className="text-2xs font-semibold uppercase text-muted">Class {c} components</div>
                <div className="text-xs">{a.shares[c].toFixed(1)}% of cost</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-2xs text-muted">A: the components making up the first 80 % of plan cost — focus negotiation and value engineering here. B: next 15 %. C: the long tail.</p>
        </Card>
      </div>
      <Card title={<span className="flex items-center gap-2">Sensitivity · plan impact of ±10 % on each top component <SimTag /></span>}>
        {tornado.length === 0 ? <Empty title="No components" icon="▦" /> : (
          <div className="flex flex-col gap-1.5">
            {tornado.map((t) => (
              <div key={t.idnrk} className="grid grid-cols-[minmax(0,220px)_1fr_auto] items-center gap-2 text-xs">
                <span className="truncate"><span className="font-mono font-semibold">{t.idnrk}</span> <span className="text-muted">{t.maktx}</span> <Pill tone={t.cls === 'A' ? 'accent' : 'neutral'}>{t.cls}</Pill></span>
                <span className="flex h-3">
                  <span className="flex flex-1 justify-end"><span className="h-full rounded-l bg-good/70" style={{ width: `${maxT.gt(0) ? Number(t.impactPer10.div(maxT).times(100).toFixed(1)) : 0}%` }} /></span>
                  <span className="w-px bg-line" />
                  <span className="flex flex-1"><span className="h-full rounded-r bg-bad/70" style={{ width: `${maxT.gt(0) ? Number(t.impactPer10.div(maxT).times(100).toFixed(1)) : 0}%` }} /></span>
                </span>
                <span className="num whitespace-nowrap text-muted">±{fmtNum(t.impactPer10, 0)} · {t.share.toFixed(1)}% of cost · {t.fgs} FG{t.fgs === 1 ? '' : 's'}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Saved scenarios · compare" actions={
        <div className="flex items-center gap-2">
          <input aria-label="Scenario name" className={cx(inputBase, 'h-8 w-48 text-xs')} placeholder="Name this scenario…" value={name} onChange={(e) => setName(e.target.value)} />
          <Button size="sm" variant="primary" disabled={isCompSimIdentity(s)} onClick={save} title={isCompSimIdentity(s) ? 'Enter a change first' : 'Save the current changes as a scenario'}><Save size={14} /> Save current</Button>
        </div>
      } bodyClass="p-0">
        {compare.length === 0 ? <p className="px-3 py-3 text-xs text-muted">Save the current changes (category, component or FG level) to compare scenarios side by side — e.g. &quot;RM +5%&quot; vs &quot;Savings drive&quot;.</p> : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr><th className={thCls}>Scenario</th><th className={thNum}>Plan cost INR</th><th className={thNum}>Impact INR</th><th className={thNum}>Impact %</th><th className={thNum}>FGs affected</th><th className={thCls}>Most affected FG</th><th className={thCls} /></tr></thead>
              <tbody>
                <tr className="border-t border-line/60 text-muted"><td className={tdCls}>SAP baseline</td><td className={tdNum}>{fmtNum(r.base, 2)}</td><td className={tdNum}>—</td><td className={tdNum}>—</td><td className={tdNum}>—</td><td className={tdCls} /><td className={tdCls} /></tr>
                {compare.map(({ x, res }) => {
                  const top = res.products[0];
                  return (
                    <tr key={x.id} className="border-t border-line/60">
                      <td className={tdCls}><b>{x.name}</b><div className="text-2xs text-faint">{new Date(x.at).toLocaleString('en-IN')}</div></td>
                      <td className={cx(tdNum, 'sim-val')}>{fmtNum(res.sim, 2)}</td>
                      <td className={cx(tdNum, 'font-semibold', tone(res.delta))}>{fmtSigned(res.delta, 2)}</td>
                      <td className={cx(tdNum, tone(res.delta))}>{signedPct(res.deltaPct)}</td>
                      <td className={tdNum}>{res.affected} / {res.products.length}</td>
                      <td className={tdCls}>{top && !top.delta.isZero() ? <><span className="font-mono">{top.headmat}</span> <span className={tone(top.delta)}>{signedPct(top.deltaPct)}</span></> : '—'}</td>
                      <td className={cx(tdCls, 'whitespace-nowrap text-right')}>
                        <button type="button" className="mr-3 font-semibold text-accent hover:underline" onClick={() => onApply({ ...x.settings, fgPct: x.settings.fgPct ?? {}, fgPc: x.settings.fgPc ?? {} })}>Apply</button>
                        <button type="button" className="text-muted hover:text-bad" aria-label={`Delete ${x.name}`} onClick={() => remove(x.id)}><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
