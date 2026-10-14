'use client';
/**
 * Breakup & cost tab: CostLineSet Mode P as a tree Country > Plant > Plan material > components, with monthly
 * quantity / cost, BOM source, rates and the header roll-ups (cost per FG piece and per 1000, from leaf rows
 * only). Sub-views: the tree, charts, and Rate sources (lazy rate options, as on the costing screen).
 */
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import { CostError, PlanQueryBar, tdCls, tdNum, thCls, thNum } from './common';
import Warnings from '../Warnings';
import RateSources from '../rates/RateSources';
import { HBars, useChartTheme } from '../charts';
import { Card, Drawer, Empty, Pill, Segmented, Skeleton, SourceBadge, Stat, cx, inputBase } from '../ui';
import type { PlanWorkspace } from '@/lib/plan/workspace';
import { BOM_SOURCE_RULE, actVariancePct, bomSourceLabel, headerKey, headerRollups, monthlyCost, monthQty, planTotals, type PlanHeaderRollup } from '@/lib/plan/maths';
import { costFilter } from '@/lib/plan/requests';
import { FISCAL_MONTHS, type PlanCostLine } from '@/lib/plan/fields';
import { componentRate, fgSources, type FgSources, type PlanLineWithOptions } from '@/lib/plan/sources';
import FgPerPiece from './FgPerPiece';
import RateCoverage from '../rates/RateCoverage';
import { parsePrio, prioLabel } from '@/lib/rates/priority';
import { useRateOptionsByFilter } from '@/lib/rates/useRateOptions';
import { attachRateOptions } from '@/lib/rates/options';
import { defaultQuery } from '@/lib/query/schema';
import { loadSapConfig } from '@/lib/sap/config';
import { isLeafRow } from '@/lib/cost/tree';
import { D, ZERO, type Decimal } from '@/lib/cost/decimal';
import type { CostLine } from '@/lib/sap/fields';
import { fmtCompactInr, fmtDate, fmtNum, fmtPct, fmtQty, fmtRate } from '@/lib/format';

type View = 'tree' | 'fg' | 'charts' | 'rates' | 'coverage';
type Months = 'qty' | 'cost';
const ROW_CAP = 3000;

interface Group { key: string; kind: 'country' | 'plant' | 'header'; depth: number; label: string; sub: string; total: Decimal; months: Decimal[]; rollup?: PlanHeaderRollup; rows: number[]; stlal?: string }

function buildGroups(rows: PlanCostLine[], rollups: Map<string, PlanHeaderRollup>) {
  const countries = new Map<string, Map<string, Map<string, number[]>>>();
  rows.forEach((l, i) => {
    let c = countries.get(l.Land1);
    if (!c) countries.set(l.Land1, (c = new Map()));
    let p = c.get(l.Hwerks);
    if (!p) c.set(l.Hwerks, (p = new Map()));
    const h = p.get(l.Headmat);
    if (h) h.push(i);
    else p.set(l.Headmat, [i]);
  });
  const sumOf = (list: PlanHeaderRollup[]) => planTotals(list);
  const out: Group[] = [];
  for (const [land, plants] of countries) {
    const cRolls: PlanHeaderRollup[] = [];
    const cIdx = out.push({ key: `c|${land}`, kind: 'country', depth: 0, label: land || '—', sub: rows[[...[...plants.values()][0].values()][0][0]]?.Landx ?? '', total: ZERO, months: [], rows: [] }) - 1;
    for (const [plant, heads] of plants) {
      const pRolls: PlanHeaderRollup[] = [];
      const pIdx = out.push({ key: `p|${land}|${plant}`, kind: 'plant', depth: 1, label: plant, sub: '', total: ZERO, months: [], rows: [] }) - 1;
      for (const [head, idx] of heads) {
        const r = rollups.get(headerKey({ Land1: land, Hwerks: plant, Headmat: head }))!;
        pRolls.push(r);
        out.push({ key: `h|${land}|${plant}|${head}`, kind: 'header', depth: 2, label: head, sub: r.headtxt, total: r.total, months: r.months, rollup: r, rows: idx, stlal: idx.map((i) => rows[i].Stlal).find(Boolean) ?? '' });
      }
      const t = sumOf(pRolls);
      out[pIdx] = { ...out[pIdx], total: t.total, months: t.months, sub: `${heads.size} plan material${heads.size === 1 ? '' : 's'}` };
      cRolls.push(...pRolls);
    }
    const t = sumOf(cRolls);
    out[cIdx] = { ...out[cIdx], total: t.total, months: t.months };
  }
  return out;
}

export default function BreakupTab({ ws }: { ws: PlanWorkspace }) {
  const [view, setView] = useState<View>('tree');
  const [months, setMonths] = useState<Months>('qty');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [leafOnly, setLeafOnly] = useState(false);
  const [drawer, setDrawer] = useState<number | null>(null);
  const system = useMemo(() => { const c = loadSapConfig(); return c.ok ? c.config.system : ''; }, []);
  const { cost } = ws;

  const ranFilter = cost.status === 'done' && cost.ranQuery ? costFilter(cost.ranQuery) : null;
  const rates = useRateOptionsByFilter(ranFilter, system);
  const rows = cost.rows;
  const rollups = useMemo(() => headerRollups(rows), [rows]);
  const groups = useMemo(() => buildGroups(rows, rollups), [rows, rollups]);
  const totals = useMemo(() => planTotals(rollups.values()), [rollups]);
  const lastProd = useMemo(() => [...rollups.values()].filter((h) => h.bomSrc === 'LASTPROD'), [rollups]);
  // Plan-country segregation: summary per plan country (cost, plan materials, plants) and a country filter for the tree.
  const [country, setCountry] = useState('');
  const byCountry = useMemo(() => {
    const m = new Map<string, { land1: string; landx: string; heads: number; plants: Set<string>; total: Decimal; leaves: number; noRate: number }>();
    for (const h of rollups.values()) {
      const c = m.get(h.land1) ?? { land1: h.land1, landx: rows.find((l) => l.Land1 === h.land1)?.Landx ?? '', heads: 0, plants: new Set<string>(), total: ZERO, leaves: 0, noRate: 0 };
      c.heads++;
      c.plants.add(h.hwerks);
      c.total = c.total.plus(h.total);
      c.leaves += h.leaves;
      c.noRate += h.noRate;
      m.set(h.land1, c);
    }
    return [...m.values()];
  }, [rollups, rows]);
  const ranPrio = parsePrio(cost.ranQuery?.prio ?? ws.query.prio);
  const donorRows = useMemo(() => rows.filter((l) => isLeafRow(l) && !!l.Donor).length, [rows]);
  const withRates = useMemo(() => (rates.status === 'ready' && rates.rows ? attachRateOptions(rows as unknown as CostLine[], rates.rows) : (rows as unknown as CostLine[])), [rows, rates.status, rates.rows]);
  const lines = withRates as unknown as PlanLineWithOptions[];
  const fg = useMemo(() => fgSources(lines), [lines]);
  const fgByKey = useMemo(() => new Map(fg.map((f) => [f.key, f])), [fg]);
  const optionsLoaded = rates.status === 'ready';

  const t = search.trim().toLowerCase();
  const matches = (l: PlanCostLine) => (!t || `${l.Idnrk} ${l.Maktx} ${l.Headmat} ${l.Headtxt}`.toLowerCase().includes(t)) && (!leafOnly || isLeafRow(l));
  const isOpen = (g: Group) => (g.kind === 'header' ? open.has(g.key) || !!t : !closed.has(g.key));
  const toggle = (g: Group) => {
    if (g.kind === 'header') setOpen((s) => { const n = new Set(s); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; });
    else setClosed((s) => { const n = new Set(s); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; });
  };

  // Visible list: groups honour their parents' open state; header rows show their lines when open.
  const visible = useMemo(() => {
    const out: ({ g: Group } | { i: number })[] = [];
    let hideBelow = Infinity;
    let budget = ROW_CAP;
    for (const g of groups) {
      if (country && g.key.split('|')[1] !== country) continue;
      if (g.depth > hideBelow) continue;
      hideBelow = Infinity;
      if (g.kind === 'header' && t && !g.rows.some((i) => matches(rows[i]))) continue;
      out.push({ g });
      if (!isOpen(g)) { hideBelow = g.depth; continue; }
      if (g.kind === 'header') for (const i of g.rows) if (matches(rows[i]) && budget-- > 0) out.push({ i });
    }
    return { list: out, capped: budget < 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, open, closed, t, leafOnly, rows, country]);

  const running = cost.status === 'running';
  return (
    <div className="flex flex-col gap-3">
      <PlanQueryBar query={ws.query} onChange={ws.setQuery} onRun={(q) => void ws.runCost(q)} onCancel={ws.cancelCost} running={running} ms={cost.ms} />
      <CostError error={cost.error} />
      {cost.status === 'idle' && !cost.rows.length ? (
        <Card><Empty title="Nothing costed yet" icon="▦">Choose filters and press <b>Run in SAP</b>. SAP explodes every plan row (at most 30 per request; filter by plant or material for bigger plans) and prices the components.</Empty></Card>
      ) : running && !rows.length ? (
        <Card><Skeleton rows={10} /></Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Plan cost" value={fmtCompactInr(Number(totals.total.toFixed(2)))} sub={`${fmtNum(totals.total, 2)} INR`} />
            <Stat label="Plan materials" value={rollups.size} sub={`${new Set([...rollups.values()].map((h) => h.hwerks)).size} plants · ${byCountry.length} plan countr${byCountry.length === 1 ? 'y' : 'ies'}`} />
            <Stat label="Leaf components" value={totals.leaves.toLocaleString('en-IN')} sub={totals.noRate ? `${totals.noRate} without a rate (freight only)` : 'all priced'} tone={totals.noRate ? 'warn' : undefined} />
            <Stat label="BOM from another plant" value={lastProd.length} sub={lastProd.length ? lastProd.slice(0, 2).map((h) => `${h.headmat}@${h.hwerks}`).join(', ') : 'every plant has its own BOM'} title={BOM_SOURCE_RULE} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span title="Rate source priority SAP used for this result">Priority: <b className="text-ink">{prioLabel(ranPrio)}</b></span>
            <span>· Look-back {cost.ranQuery?.lookback || 'SAP default'}{cost.ranQuery?.lookback ? ' days' : ''}</span>
            {cost.ranQuery?.donorPlant && <span>· Donor plant {cost.ranQuery.donorPlant}</span>}
            {donorRows > 0 && <Pill tone="warn">{donorRows} leaf row{donorRows === 1 ? '' : 's'} from a donor plant</Pill>}
          </div>
          {byCountry.length > 0 && (
            <Card title="By plan country" bodyClass="p-0">
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr><th className={thCls}>Plan country</th><th className={thNum}>Plan materials</th><th className={thNum}>Plants</th><th className={thNum}>Plan cost INR</th><th className={thNum}>Share</th><th className={thNum}>Leaf components</th><th className={thCls} /></tr></thead>
                  <tbody>
                    {byCountry.map((c) => (
                      <tr key={c.land1} className={cx('cursor-pointer border-t border-line/60 hover:bg-sunken', country === c.land1 && 'bg-accent/[0.06] font-semibold')} onClick={() => setCountry(country === c.land1 ? '' : c.land1)}>
                        <td className={tdCls}><span className="font-mono font-semibold">{c.land1}</span> <span className="text-muted">{c.landx}</span></td>
                        <td className={tdNum}>{c.heads}</td>
                        <td className={tdNum}>{c.plants.size}</td>
                        <td className={tdNum}>{fmtNum(c.total, 2)}</td>
                        <td className={tdNum}>{totals.total.gt(0) ? `${c.total.div(totals.total).times(100).toFixed(1)}%` : '—'}</td>
                        <td className={tdNum}>{c.leaves}{c.noRate ? <span className="text-warn"> ({c.noRate} no rate)</span> : ''}</td>
                        <td className={cx(tdCls, 'text-right text-accent')}>{country === c.land1 ? 'Showing only this ✕' : 'Show only'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          <Warnings messages={cost.messages} />
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<View> size="sm" label="Breakup view" value={view} onChange={setView} options={[{ value: 'tree', label: 'Breakup' }, { value: 'fg', label: 'FG per pc' }, { value: 'charts', label: 'Charts' }, { value: 'rates', label: 'Rate sources' }, { value: 'coverage', label: 'Rate coverage' }]} />
            {country && <button type="button" onClick={() => setCountry('')} className="rounded-full border border-accent bg-accent px-2.5 py-0.5 text-xs font-semibold text-white">Plan country {country} ✕</button>}
            {view === 'tree' && (
              <>
                <div className="w-44"><Segmented<Months> size="sm" label="Monthly columns" value={months} onChange={setMonths} options={[{ value: 'qty', label: 'Qty / month' }, { value: 'cost', label: 'Cost / month' }]} /></div>
                <input aria-label="Filter components" className={cx(inputBase, 'h-8 w-56 text-xs')} placeholder="Filter material / component…" value={search} onChange={(e) => setSearch(e.target.value)} />
                <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={leafOnly} onChange={(e) => setLeafOnly(e.target.checked)} /> Leaf rows only</label>
                <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={() => setOpen(new Set(groups.filter((g) => g.kind === 'header').map((g) => g.key)))}>Expand all</button>
                <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={() => setOpen(new Set())}>Collapse</button>
              </>
            )}
            {cost.at ? <span className="ml-auto text-2xs text-faint">{rows.length.toLocaleString('en-IN')} rows · SAP figures</span> : null}
          </div>

          {view === 'tree' && (
            <Card bodyClass="p-0">
              <div className="scroll-thin max-h-[70vh] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-panel shadow-[0_1px_0_var(--line,#e5e7eb)]">
                    <tr>
                      <th className={cx(thCls, STICKY_COL, 'z-20 bg-panel')}>Structure</th>
                      <th className={thNum}>Lvl</th>
                      {FISCAL_MONTHS.map((m) => <th key={m} className={thNum}>{m}</th>)}
                      <th className={thNum}>Total qty</th>
                      <th className={thCls}>Source</th>
                      <th className={thNum} title="Rate SAP selected, INR per component unit (on plan-material rows: per FG piece incl. freight)">Selected/pc</th>
                      <th className={thNum}>Freight/pc</th>
                      <th className={thNum}>Total/pc</th>
                      <th className={thNum}>Total cost INR</th>
                      <th className={thNum} title="As per Budget: SAP budget landed rate (on plan-material rows: per FG piece)">Budget/pc</th>
                      <th className={thNum} title="As per MBEW (on plan-material rows: per FG piece)">MBEW/pc</th>
                      <th className={thNum} title="As per Consumption (on plan-material rows: per FG piece)">Consumption/pc</th>
                      <th className={thNum}>Actual rate/pc</th>
                      <th className={thNum}>Var %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.list.map((v) => ('g' in v ? <GroupRow key={v.g.key} g={v.g} open={isOpen(v.g)} onToggle={() => toggle(v.g)} months={months} fg={v.g.rollup ? fgByKey.get(v.g.rollup.key) : undefined} optionsLoaded={optionsLoaded} /> : <LineRow key={`${v.i}`} l={lines[v.i]} months={months} optionsLoaded={optionsLoaded} onOpen={() => setDrawer(v.i)} />))}
                  </tbody>
                </table>
                {visible.capped && <p className="px-3 py-2 text-xs text-warn">Showing the first {ROW_CAP.toLocaleString('en-IN')} component rows. Filter or collapse to see the rest (the export has every row).</p>}
              </div>
            </Card>
          )}
          {view === 'tree' && !optionsLoaded && (
            <p className="-mt-1 text-xs text-muted">
              MBEW and Consumption rates come from SAP&apos;s rate options, loaded on request.{' '}
              {rates.status === 'loading' ? 'Loading…' : rates.status === 'unavailable' || rates.status === 'error' ? <>{rates.note} <button type="button" className="font-semibold text-accent underline" onClick={rates.retest}>Test again</button></> : <button type="button" className="font-semibold text-accent underline" onClick={rates.request}>Load MBEW / Consumption rates</button>}
            </p>
          )}
          {view === 'fg' && <FgPerPiece rows={fg} rates={rates} query={cost.ranQuery ?? ws.query} lines={lines} />}
          {view === 'charts' && <PlanCharts rows={rows} />}
          {view === 'coverage' && (
            <Card bodyClass="p-0 h-[70vh]">
              <RateCoverage
                lines={withRates}
                rates={rates}
                prio={ranPrio}
                lookback={cost.ranQuery?.lookback ?? ws.query.lookback}
                onOpenRow={setDrawer}
                onLookback={(days) => { const q = { ...ws.query, lookback: days }; ws.setQuery(q); void ws.runCost(q); }}
                onAddDonor={() => { const el = document.querySelector<HTMLInputElement>('[data-field="plan-donor-plant"]'); el?.scrollIntoView({ block: 'center' }); el?.focus(); }}
              />
            </Card>
          )}
          {view === 'rates' && (
            <Card bodyClass="p-0 h-[70vh]">
              {rates.status === 'ready' ? (
                <RateSources rows={withRates} rates={rates} query={{ ...defaultQuery('B'), materials: cost.ranQuery?.materials ?? [], plants: cost.ranQuery?.plants ?? [] }} onOpenRow={setDrawer} prio={ranPrio} />
              ) : (
                <RatesPending status={rates.status} note={rates.note} request={rates.request} retest={rates.retest} />
              )}
            </Card>
          )}
        </>
      )}
      <LineDrawer line={drawer === null ? null : (withRates[drawer] as unknown as PlanCostLine & { RateOptions?: CostLine['RateOptions'] })} onClose={() => setDrawer(null)} />
    </div>
  );
}

function RatesPending({ status, note, request, retest }: { status: string; note: string; request: () => void; retest: () => void }) {
  useEffect(() => { if (status === 'idle') request(); }, [status, request]);
  return (
    <Empty title={status === 'loading' || status === 'idle' ? 'Loading rate options…' : status === 'unavailable' ? 'Rate options are not available' : 'Could not load rate options'} icon={status === 'loading' ? '…' : 'ℹ'}>
      {note}
      {(status === 'unavailable' || status === 'error') && <button type="button" className="ml-1 text-accent underline" onClick={retest}>Test again</button>}
    </Empty>
  );
}

/** Frozen Structure column: fixed width, opaque background (rows scrolled sideways must not show through)
 * and a divider on its right edge. */
const STICKY_COL = 'sticky left-0 w-[340px] min-w-[340px] max-w-[340px] shadow-[inset_-1px_0_0_rgb(var(--line))]';
/** Solid tints (a translucent class would let the month cells show through the frozen column). */
const GROUP_BG: Record<Group['kind'], string> = {
  country: 'color-mix(in srgb, rgb(var(--plum-deep)) 7%, rgb(var(--panel)))',
  plant: 'rgb(var(--sunken))',
  header: 'color-mix(in srgb, rgb(var(--accent)) 5%, rgb(var(--panel)))',
};

const pcCell = (f: FgSources | undefined, k: 'BUDGET' | 'MBEW' | 'CONSUMP', loaded = true) => {
  const x = f?.sources[k];
  if (!x || (!loaded && k !== 'BUDGET')) return '';
  if (!x.perPc) return <span className="text-faint">—</span>;
  return <span title={`${x.priced} of ${x.leaves} components priced`} className={cx(x.priced < x.leaves && 'text-warn')}>{fmtRate(x.perPc)}{x.priced < x.leaves ? '*' : ''}</span>;
};

function GroupRow({ g, open, onToggle, months, fg, optionsLoaded }: { g: Group; open: boolean; onToggle: () => void; months: Months; fg?: FgSources; optionsLoaded: boolean }) {
  const r = g.rollup;
  const Chevron = open ? ChevronDown : ChevronRight;
  const background = GROUP_BG[g.kind];
  return (
    <tr className="border-t border-line/70 font-semibold" style={{ background }}>
      <td className={cx('px-2 py-1 align-top', STICKY_COL, 'z-[5]')} style={{ paddingLeft: 8 + g.depth * 16, background }}>
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full min-w-0 items-center gap-1 text-left" title={`${g.label} ${g.sub}`.trim()}>
          <Chevron size={13} className="shrink-0" />
          <span className={cx('shrink-0', g.kind !== 'country' && 'font-mono')}>{g.label}</span>
          <span className="min-w-0 truncate font-normal text-muted">{g.sub}</span>
        </button>
        {r && (
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 pl-4 font-normal">
            {r.bomSrc === 'LASTPROD' ? <span title={BOM_SOURCE_RULE}><Pill tone="warn">{bomSourceLabel(r)}</Pill></span> : <span title={BOM_SOURCE_RULE}><Pill>OWN</Pill></span>}
            {g.stlal && <span title="Alternative BOM SAP used for this plan material"><Pill tone="accent">Alt BOM {g.stlal}</Pill></span>}
            <span className="text-2xs text-muted">Plan {fmtQty(r.planQty)} · {r.perPiece ? <>{fmtRate(r.perPiece)} /pc · {fmtNum(r.per1000, 2)} /1000</> : 'no plan qty'}</span>
          </div>
        )}
      </td>
      <td />
      {g.months.map((m, i) => <td key={i} className={cx(tdNum, months === 'qty' && 'text-faint')}>{months === 'cost' ? fmtCompactInr(Number(m.toFixed(2))) : ''}</td>)}
      <td className={tdNum}>{r ? fmtQty(r.planQty) : ''}</td>
      <td />
      <td className={tdNum}>{r?.perPiece ? fmtRate(r.perPiece) : ''}</td>
      <td />
      <td />
      <td className={tdNum}>{fmtNum(g.total, 2)}</td>
      <td className={tdNum}>{pcCell(fg, 'BUDGET')}</td>
      <td className={tdNum}>{pcCell(fg, 'MBEW', optionsLoaded)}</td>
      <td className={tdNum}>{pcCell(fg, 'CONSUMP', optionsLoaded)}</td>
      <td /><td />
    </tr>
  );
}

function LineRow({ l, months, onOpen, optionsLoaded }: { l: PlanLineWithOptions; months: Months; onOpen: () => void; optionsLoaded: boolean }) {
  const rate = (k: 'MBEW' | 'CONSUMP') => { const r = componentRate(l, k); return r ? fmtRate(r) : optionsLoaded ? <span className="text-faint">—</span> : ''; };
  const leaf = isLeafRow(l);
  const qty = monthQty(l);
  const cost = months === 'cost' ? monthlyCost(l) : null;
  const v = actVariancePct(l);
  return (
    <tr className={cx('group cursor-pointer border-t border-line/40 hover:bg-sunken', !leaf && 'text-muted')} onClick={onOpen}>
      <td className={cx('px-2 py-1', STICKY_COL, 'z-[5] bg-panel group-hover:bg-sunken')} style={{ paddingLeft: 40 + Math.max(0, l.Level - 1) * 14 }} title={`${l.Idnrk} ${l.Maktx} ${l.Mtart}`.trim()}>
        <div className="flex min-w-0 items-baseline gap-1">
          <span className="shrink-0 font-mono">{l.Idnrk}</span>
          <span className="min-w-0 truncate text-muted">{l.Maktx}</span>
          {l.Mtart && <span className="shrink-0 text-2xs text-faint">{l.Mtart}</span>}
          {l.Donor && <span className="shrink-0 rounded bg-warn/15 px-1 text-[10px] font-bold text-warn" title={`Rate taken from donor plant ${l.Donor}`}>Donor plant {l.Donor}</span>}
        </div>
      </td>
      <td className={tdNum}>{l.Level}</td>
      {(cost ?? qty).map((q, i) => <td key={i} className={tdNum}>{leaf || months === 'qty' ? (cost ? fmtNum(q, 0) : fmtNum(q, 2, 'X')) : ''}</td>)}
      <td className={tdNum}>{fmtQty(l.QtyTot)} <span className="text-faint">{l.Meins}</span></td>
      <td className={tdCls}>{leaf ? <SourceBadge source={l.SelSource} /> : null}</td>
      <td className={tdNum}>{leaf ? fmtRate(l.SelRatePcInr) : ''}</td>
      <td className={tdNum}>{leaf ? fmtRate(l.FrtPcInr) : ''}</td>
      <td className={tdNum}>{leaf ? fmtRate(l.TotCostPcInr) : ''}</td>
      <td className={cx(tdNum, leaf && 'font-semibold')}>{leaf ? fmtNum(l.TotCostInr, 2) : ''}</td>
      <td className={tdNum}>{leaf && D(l.BudLanded).gt(0) ? fmtRate(l.BudLanded) : ''}</td>
      <td className={tdNum}>{leaf ? rate('MBEW') : ''}</td>
      <td className={tdNum}>{leaf ? rate('CONSUMP') : ''}</td>
      <td className={tdNum}>{leaf && D(l.ActRatePcInr).gt(0) ? fmtRate(l.ActRatePcInr) : ''}</td>
      <td className={cx(tdNum, v && v.gt(0) && 'text-bad', v && v.lt(0) && 'text-good')}>{leaf && v ? fmtPct(v) : ''}</td>
    </tr>
  );
}

function LineDrawer({ line, onClose }: { line: (PlanCostLine & { RateOptions?: CostLine['RateOptions'] }) | null; onClose: () => void }) {
  if (!line) return <Drawer open={false} onClose={onClose} title="">{null}</Drawer>;
  const l = line;
  const facts: [string, ReactNode][] = [
    ['Plan material', `${l.Headmat} ${l.Headtxt}`],
    ['Plant', l.Hwerks],
    ['Country', `${l.Land1} ${l.Landx}`],
    ['BOM source', <span key="b" title={BOM_SOURCE_RULE}>{bomSourceLabel({ bomSrc: l.BomSrc, bomPlant: l.BomPlant, bomSrcDate: l.BomSrcDate })}</span>],
    ['Level / parent', `${l.Level} · ${l.Parent || '—'}`],
    ['Type / unit', `${l.Mtart} · ${l.Meins}`],
    ['Total quantity', fmtQty(l.QtyTot)],
    ['Rate source', <SourceBadge key="s" source={l.SelSource} />],
    ['Vendor', `${l.SelVendor} ${l.SelVname}`.trim() || '—'],
    ['Rate/pc INR', fmtRate(l.SelRatePcInr)],
    ['Freight/pc INR', `${fmtRate(l.FrtPcInr)} (${l.FrtSrc || '—'})`],
    ['Total/pc INR', fmtRate(l.TotCostPcInr)],
    ['Total cost INR', fmtNum(l.TotCostInr, 2)],
    ['Alt BOM (FG / item)', `${l.Stlal || '—'} / ${l.ItemStlal || '—'}`],
    ['As per Budget', D(l.BudLanded).gt(0) ? fmtRate(l.BudLanded) : '—'],
    ['As per MBEW', componentRate(l, 'MBEW') ? fmtRate(componentRate(l, 'MBEW')) : '—'],
    ['As per Consumption', componentRate(l, 'CONSUMP') ? fmtRate(componentRate(l, 'CONSUMP')) : '—'],
    ['Actual rate/pc INR', D(l.ActRatePcInr).gt(0) ? `${fmtRate(l.ActRatePcInr)} (${fmtPct(actVariancePct(l))} vs SAP rate)` : '—'],
    ['Delivered as of', fmtDate(l.DelvAsof) || '—'],
  ];
  const opts = l.RateOptions ?? [];
  return (
    <Drawer open onClose={onClose} width={760} title={<div><p className="font-mono text-sm font-bold">{l.Idnrk}</p><p className="text-xs text-muted">{l.Maktx}</p></div>}>
      <dl className="grid grid-cols-[160px_1fr] gap-x-3 gap-y-1.5 text-sm">
        {facts.map(([k, v]) => (<Fragment key={k}><dt className="text-muted">{k}</dt><dd className="num">{v}</dd></Fragment>))}
      </dl>
      <h4 className="mt-4 text-xs font-bold uppercase tracking-wide text-muted">Monthly</h4>
      <table className="mt-1 w-full text-xs">
        <thead><tr><th className={thCls} />{FISCAL_MONTHS.map((m) => <th key={m} className={thNum}>{m}</th>)}</tr></thead>
        <tbody>
          <tr><td className={tdCls}>Qty</td>{monthQty(l).map((q, i) => <td key={i} className={tdNum}>{fmtNum(q, 2, 'X')}</td>)}</tr>
          <tr><td className={tdCls}>Cost INR</td>{monthlyCost(l).map((q, i) => <td key={i} className={tdNum}>{fmtNum(q, 0)}</td>)}</tr>
        </tbody>
      </table>
      <h4 className="mt-4 text-xs font-bold uppercase tracking-wide text-muted">Rate options</h4>
      {opts.length ? (
        <table className="mt-1 w-full text-xs">
          <thead><tr><th className={thCls}>Source</th><th className={thCls}>Plant</th><th className={thCls}>Curr</th><th className={thNum}>Rate/pc INR</th><th className={thCls}>Valid from</th></tr></thead>
          <tbody>{opts.map((o, i) => <tr key={i} className={cx('border-t border-line/50', o.Source === l.SelSource && 'bg-good/10')}><td className={tdCls}><SourceBadge source={o.Source} /></td><td className={tdCls}>{o.Plant}</td><td className={tdCls}>{o.Curr}</td><td className={tdNum}>{fmtRate(o.RatePcInr)}</td><td className={tdCls}>{fmtDate(o.ValidFrom)}</td></tr>)}</tbody>
        </table>
      ) : <p className="mt-1 flex items-center gap-1 text-xs text-muted"><Info size={12} /> Open the Rate sources view to load the options SAP considered.</p>}
    </Drawer>
  );
}

const MTART_COLORS = ['#4F3FD6', '#0e9fb5', '#eda100', '#eb6834', '#008300', '#C2185B', '#8a8984', '#2a78d6'];

/** Monthly cost by rate source and by material type (leaf rows), and the top components. */
export function PlanCharts({ rows }: { rows: PlanCostLine[] }) {
  const t = useChartTheme();
  const { bySource, byType, sources, types, top } = useMemo(() => {
    const src = new Map<string, Decimal[]>();
    const typ = new Map<string, Decimal[]>();
    const comp = new Map<string, { label: string; v: Decimal }>();
    for (const l of rows) {
      if (!isLeafRow(l)) continue;
      const m = monthlyCost(l);
      const s = l.SelSource || 'NO RATE';
      const ty = l.Mtart || '—';
      src.set(s, (src.get(s) ?? Array(12).fill(ZERO)).map((v, i) => v.plus(m[i])));
      typ.set(ty, (typ.get(ty) ?? Array(12).fill(ZERO)).map((v, i) => v.plus(m[i])));
      const c = comp.get(l.Idnrk) ?? { label: `${l.Idnrk} ${l.Maktx}`.slice(0, 34), v: ZERO };
      c.v = c.v.plus(D(l.TotCostInr));
      comp.set(l.Idnrk, c);
    }
    const toData = (m: Map<string, Decimal[]>) => FISCAL_MONTHS.map((name, i) => ({ name, ...Object.fromEntries([...m].map(([k, v]) => [k, Number(v[i].toFixed(2))])) }));
    return {
      bySource: toData(src), byType: toData(typ), sources: [...src.keys()], types: [...typ.keys()],
      top: [...comp.entries()].sort((a, b) => b[1].v.cmp(a[1].v)).slice(0, 15).map(([k, c]) => ({ name: k, label: c.label, value: Number(c.v.toFixed(2)) })),
    };
  }, [rows]);
  const stack = (data: Record<string, unknown>[], keys: string[], color: (k: string, i: number) => string) => (
    <div className="h-72">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke={t.grid} />
          <XAxis dataKey="name" tick={{ fill: t.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={fmtCompactInr} tick={{ fill: t.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v: unknown) => `${fmtNum(String(v), 2)} INR`} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {keys.map((k, i) => <Bar key={k} dataKey={k} stackId="s" fill={color(k, i)} isAnimationActive={false} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
  if (!rows.length) return <Card><Empty title="No rows" /></Card>;
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <Card title="Monthly cost by rate source (INR)">{stack(bySource, sources, (k) => t.src[k] ?? t.neutral)}</Card>
      <Card title="Monthly cost by material type (INR)">{stack(byType, types, (_k, i) => MTART_COLORS[i % MTART_COLORS.length])}</Card>
      <Card title="Top components by plan cost (INR)" className="xl:col-span-2"><HBars data={top} /></Card>
    </div>
  );
}
