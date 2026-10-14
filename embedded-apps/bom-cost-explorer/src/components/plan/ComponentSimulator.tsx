'use client';
/**
 * Breakup & cost > "Simulate": raise or lower component costs (by category, per component in %, or a new cost
 * per unit) and see the impact on every product's cost and on the whole plan. Browser-only on top of the SAP
 * result (lib/plan/componentSim.ts); every simulated figure carries the "sim" tag.
 */
import { Fragment, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileSpreadsheet, RotateCcw } from 'lucide-react';
import { tdCls, tdNum, thCls, thNum } from './common';
import { Button, Card, Empty, Pill, SimTag, Stat, cx, inputBase } from '../ui';
import { CATEGORIES, CATEGORY_LABEL, type CostCategory } from '@/lib/cost/categories';
import { emptyCompSim, isCompSimIdentity, lineChange, loadCompSim, saveCompSim, simLineCost, simulateComponents, type CompSimSettings, type ProductImpact } from '@/lib/plan/componentSim';
import { headerKey } from '@/lib/plan/maths';
import type { PlanCostLine } from '@/lib/plan/fields';
import type { PlanCostQuery } from '@/lib/plan/requests';
import { planParams } from '@/lib/plan/export';
import { exportTable, type XCol } from '@/lib/client/export';
import { isLeafRow } from '@/lib/cost/tree';
import { D, type Decimal } from '@/lib/cost/decimal';
import { fmtCompactInr, fmtNum, fmtQty, fmtRate, fmtSigned } from '@/lib/format';

const COMP_CAP = 300;
const n = (d: Decimal | null | undefined, dp = 4) => (d ? Number(d.toFixed(dp)) : null);
const signedPct = (d: Decimal | null) => (d === null ? '—' : `${d.gt(0) ? '+' : d.lt(0) ? '−' : ''}${d.abs().toFixed(2)}%`);
/** Cost up = bad (red), down = good (green). */
const tone = (d: Decimal | null | undefined) => (!d || d.isZero() ? '' : d.gt(0) ? 'text-bad' : 'text-good');
const rowTint = (d: Decimal) => (d.isZero() ? '' : d.gt(0) ? 'bg-bad/[0.05]' : 'bg-good/[0.06]');

export default function ComponentSimulator({ rows, query }: { rows: PlanCostLine[]; query: PlanCostQuery }) {
  const plan = query.plan;
  const [s, setS] = useState<CompSimSettings>(() => loadCompSim(plan));
  useEffect(() => { setS(loadCompSim(plan)); }, [plan]);
  useEffect(() => { saveCompSim(plan, s); }, [plan, s]);
  const ds = useDeferredValue(s);
  const r = useMemo(() => simulateComponents(rows, ds), [rows, ds]);
  const identity = isCompSimIdentity(s);

  const [onlyAffected, setOnlyAffected] = useState(false);
  const [openProd, setOpenProd] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<CostCategory | ''>('');
  const [onlyChanged, setOnlyChanged] = useState(false);

  const setCatPct = (c: CostCategory, v: string) => setS((x) => ({ ...x, catPct: { ...x.catPct, [c]: v === '' ? 0 : Number(v) } }));
  const setCompPct = (id: string, v: string) => setS((x) => { const compPct = { ...x.compPct }; if (v === '' || !Number(v)) delete compPct[id]; else compPct[id] = Number(v); return { ...x, compPct }; });
  const setCompPc = (id: string, v: string) => setS((x) => { const compPc = { ...x.compPc }; if (v === '') delete compPc[id]; else compPc[id] = v; return { ...x, compPc }; });
  const resetComp = (id: string) => setS((x) => { const compPct = { ...x.compPct }; const compPc = { ...x.compPc }; delete compPct[id]; delete compPc[id]; return { ...x, compPct, compPc }; });

  const products = onlyAffected ? r.products.filter((p) => !p.delta.isZero()) : r.products;
  const maxAbs = r.products.reduce((m, p) => (p.delta.abs().gt(m) ? p.delta.abs() : m), D(0));
  const t = q.trim().toLowerCase();
  const comps = r.components.filter((c) => (!t || `${c.idnrk} ${c.maktx}`.toLowerCase().includes(t)) && (!cat || c.cat === cat) && (!onlyChanged || !c.delta.isZero()));

  const exportXlsx = () => {
    const P = r.products;
    const C = r.components;
    const pCols: XCol[] = [
      { header: 'Plan country', get: (i) => P[i].land1 },
      { header: 'Plant', get: (i) => P[i].hwerks },
      { header: 'Plan material', get: (i) => P[i].headmat },
      { header: 'Description', width: 34, get: (i) => P[i].headtxt },
      { header: 'Plan qty', dp: 3, get: (i) => n(P[i].planQty, 3) },
      { header: 'SAP cost / FG pc', dp: 4, curr: 'INR', get: (i) => n(P[i].basePc) },
      { header: 'Simulated cost / FG pc', dp: 4, curr: 'INR', get: (i) => n(P[i].simPc) },
      { header: 'Change / FG pc', dp: 4, curr: 'INR', get: (i) => n(P[i].deltaPc) },
      { header: 'Change %', dp: 2, get: (i) => n(P[i].deltaPct, 2) },
      { header: 'SAP plan cost INR', dp: 2, curr: 'INR', get: (i) => n(P[i].base, 2) },
      { header: 'Simulated plan cost INR', dp: 2, curr: 'INR', get: (i) => n(P[i].sim, 2) },
      { header: 'Impact INR', dp: 2, curr: 'INR', get: (i) => n(P[i].delta, 2) },
      { header: 'Changed component lines', get: (i) => P[i].changedLines },
    ];
    const cCols: XCol[] = [
      { header: 'Component', get: (i) => C[i].idnrk },
      { header: 'Description', width: 34, get: (i) => C[i].maktx },
      { header: 'Category', get: (i) => CATEGORY_LABEL[C[i].cat] },
      { header: 'UoM', get: (i) => C[i].meins },
      { header: 'Plants', get: (i) => C[i].plants.join(', ') },
      { header: 'Products', get: (i) => C[i].products },
      { header: 'Plan qty', dp: 3, get: (i) => n(C[i].qty, 3) },
      { header: 'Change', get: (i) => changeText(s, C[i].idnrk, C[i].cat) },
      { header: 'SAP cost / unit', dp: 4, curr: 'INR', get: (i) => n(C[i].basePc) },
      { header: 'Simulated cost / unit', dp: 4, curr: 'INR', get: (i) => n(C[i].simPc) },
      { header: 'SAP cost INR', dp: 2, curr: 'INR', get: (i) => n(C[i].base, 2) },
      { header: 'Simulated cost INR', dp: 2, curr: 'INR', get: (i) => n(C[i].sim, 2) },
      { header: 'Impact INR', dp: 2, curr: 'INR', get: (i) => n(C[i].delta, 2) },
    ];
    void exportTable({
      fmt: 'xlsx', name: 'Plan cost simulation', cols: pCols, count: P.length,
      extraSheets: [{ name: 'Components', cols: cCols, count: C.length }],
      extraParams: [
        ...planParams(query),
        ['Simulation', 'Simulated in the browser on the SAP result - not an SAP figure'],
        ['Category changes', CATEGORIES.map((c) => `${CATEGORY_LABEL[c]} ${s.catPct[c] ? signedPct(D(s.catPct[c]!)) : '0%'}`).join(', ')],
        ['Component changes', `${Object.keys(s.compPct).length} by %, ${Object.keys(s.compPc).length} with a new cost per unit`],
        ['Overall: SAP plan cost INR', r.base.toFixed(2)],
        ['Overall: simulated plan cost INR', r.sim.toFixed(2)],
        ['Overall impact INR', `${r.delta.toFixed(2)} (${signedPct(r.deltaPct)})`],
        ['Rule', 'Component: new cost per unit wins, then component %, then category %. Cost per FG pc = product cost / plan qty (leaf rows).'],
      ],
    });
  };

  if (!rows.some(isLeafRow)) return <Card><Empty title="Nothing to simulate" icon="▦">Run the plan in SAP first; the simulation works on the exploded components.</Empty></Card>;

  return (
    <div className="flex flex-col gap-3">
      <Card title={<span className="flex items-center gap-2">Change component costs <SimTag /></span>} actions={
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" disabled={identity} onClick={() => setS(emptyCompSim())}><RotateCcw size={14} /> Reset all</Button>
          <Button size="sm" variant="ghost" onClick={exportXlsx}><FileSpreadsheet size={14} /> Excel</Button>
        </div>
      }>
        <div className="flex flex-wrap items-end gap-3">
          {CATEGORIES.map((c) => (
            <label key={c} className="flex flex-col gap-1 text-2xs font-semibold uppercase tracking-wide text-muted">
              {CATEGORY_LABEL[c]} %
              <input type="number" step="0.1" aria-label={`${CATEGORY_LABEL[c]} cost change %`} className={cx(inputBase, 'h-8 w-24 text-right text-xs normal-case', s.catPct[c] ? 'border-sim font-bold text-sim' : '')} placeholder="0" value={s.catPct[c] || ''} onChange={(e) => setCatPct(c, e.target.value)} />
            </label>
          ))}
          <p className="min-w-[220px] flex-1 text-xs text-muted">Enter + for an increase, − for a decrease. A component&apos;s own % or new cost per unit (table below) wins over its category %.</p>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="SAP plan cost" value={fmtCompactInr(Number(r.base.toFixed(2)))} sub={`${fmtNum(r.base, 2)} INR`} />
        <Stat label="Simulated plan cost" sim value={fmtCompactInr(Number(r.sim.toFixed(2)))} sub={`${fmtNum(r.sim, 2)} INR`} />
        <Stat label="Overall cost impact" sim tone={r.delta.gt(0) ? 'bad' : r.delta.lt(0) ? 'good' : undefined} value={`${fmtSigned(r.delta, 0)}`} sub={`${signedPct(r.deltaPct)} on the plan · INR`} />
        <Stat label="Products affected" value={`${r.affected} / ${r.products.length}`} sub={identity ? 'no change entered' : `${r.components.filter((c) => !c.delta.isZero()).length} components changed`} tone={r.affected ? 'warn' : undefined} />
      </div>

      {r.countries.length > 1 && (
        <Card title="Impact by plan country" bodyClass="p-0">
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr><th className={thCls}>Plan country</th><th className={thNum}>Products</th><th className={thNum}>Affected</th><th className={thNum}>SAP cost INR</th><th className={thNum}>Simulated INR</th><th className={thNum}>Impact INR</th><th className={thNum}>Impact %</th></tr></thead>
              <tbody>
                {r.countries.map((c) => (
                  <tr key={c.land1} className={cx('border-t border-line/60', rowTint(c.delta))}>
                    <td className={cx(tdCls, 'font-mono font-semibold')}>{c.land1 || '—'}</td>
                    <td className={tdNum}>{c.products}</td>
                    <td className={tdNum}>{c.affected}</td>
                    <td className={tdNum}>{fmtNum(c.base, 2)}</td>
                    <td className={cx(tdNum, 'sim-val')}>{fmtNum(c.sim, 2)}</td>
                    <td className={cx(tdNum, 'font-bold', tone(c.delta))}>{fmtSigned(c.delta, 2)}</td>
                    <td className={cx(tdNum, tone(c.delta))}>{signedPct(c.deltaPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title={<span className="flex items-center gap-2">Product costing impact <SimTag /></span>} bodyClass="p-0" actions={
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={onlyAffected} onChange={(e) => setOnlyAffected(e.target.checked)} /> Only affected products</label>
      }>
        <div className="scroll-thin max-h-[60vh] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-panel shadow-[0_1px_0_rgb(var(--line))]">
              <tr>
                <th className={thCls}>Plan material</th>
                <th className={thCls}>Country · Plant</th>
                <th className={thNum}>Plan qty</th>
                <th className={thNum}>SAP cost / pc</th>
                <th className={thNum}>Simulated / pc</th>
                <th className={thNum}>Change / pc</th>
                <th className={thNum}>Change %</th>
                <th className={thNum}>SAP cost INR</th>
                <th className={thNum}>Simulated INR</th>
                <th className={thNum}>Impact INR</th>
                <th className={cx(thCls, 'w-36')} title="Share of the largest product impact">Impact</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <Fragment key={p.key}>
                  <tr className={cx('cursor-pointer border-t border-line/60 hover:bg-sunken', rowTint(p.delta), !p.delta.isZero() && 'font-semibold')} onClick={() => setOpenProd(openProd === p.key ? null : p.key)}>
                    <td className={tdCls}>
                      <span className="inline-flex items-center gap-1">{openProd === p.key ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<span className="font-mono">{p.headmat}</span></span>
                      <div className="max-w-[260px] truncate pl-4 font-normal text-muted">{p.headtxt}</div>
                    </td>
                    <td className={cx(tdCls, 'font-mono font-normal')}>{p.land1} · {p.hwerks}</td>
                    <td className={tdNum}>{fmtQty(p.planQty)}</td>
                    <td className={tdNum}>{p.basePc ? fmtRate(p.basePc) : '—'}</td>
                    <td className={cx(tdNum, !p.delta.isZero() && 'sim-val')}>{p.simPc ? fmtRate(p.simPc) : '—'}</td>
                    <td className={cx(tdNum, tone(p.deltaPc))}>{p.deltaPc && !p.deltaPc.isZero() ? fmtSigned(p.deltaPc, 4) : '—'}</td>
                    <td className={cx(tdNum, tone(p.delta))}>{p.delta.isZero() ? '—' : signedPct(p.deltaPct)}</td>
                    <td className={tdNum}>{fmtNum(p.base, 2)}</td>
                    <td className={cx(tdNum, !p.delta.isZero() && 'sim-val')}>{fmtNum(p.sim, 2)}</td>
                    <td className={cx(tdNum, tone(p.delta))}>{p.delta.isZero() ? '—' : fmtSigned(p.delta, 2)}</td>
                    <td className={tdCls}><ImpactBar p={p} max={maxAbs} /></td>
                  </tr>
                  {openProd === p.key && <ProductLines rows={rows} pkey={p.key} s={ds} />}
                </Fragment>
              ))}
            </tbody>
          </table>
          {!products.length && <p className="px-3 py-3 text-xs text-muted">No product is affected by the changes entered.</p>}
        </div>
      </Card>

      <Card title="Components" bodyClass="p-0" actions={
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="Filter components" className={cx(inputBase, 'h-8 w-52 text-xs')} placeholder="Component / description…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select aria-label="Category" className={cx(inputBase, 'h-8 text-xs')} value={cat} onChange={(e) => setCat(e.target.value as CostCategory | '')}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} /> Only changed</label>
        </div>
      }>
        <div className="scroll-thin max-h-[60vh] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-panel shadow-[0_1px_0_rgb(var(--line))]">
              <tr>
                <th className={thCls}>Component</th>
                <th className={thCls}>Cat.</th>
                <th className={thNum}>Products</th>
                <th className={thNum}>Plan qty</th>
                <th className={thNum} title="Weighted landed cost per component unit (incl. freight), SAP">SAP cost / unit</th>
                <th className={thNum}>Change %</th>
                <th className={thNum} title="New landed cost per unit, INR - applies in every plant">New cost / unit</th>
                <th className={thNum}>Simulated / unit</th>
                <th className={thNum}>SAP cost INR</th>
                <th className={thNum}>Impact INR</th>
                <th className={thCls} />
              </tr>
            </thead>
            <tbody>
              {comps.slice(0, COMP_CAP).map((c) => {
                const own = s.compPct[c.idnrk] !== undefined || s.compPc[c.idnrk] !== undefined;
                const viaCat = !own && !!s.catPct[c.cat];
                return (
                  <tr key={c.idnrk} className={cx('border-t border-line/60', rowTint(c.delta))}>
                    <td className={tdCls}><span className="font-mono font-semibold">{c.idnrk}</span><div className="max-w-[260px] truncate text-muted">{c.maktx}</div></td>
                    <td className={tdCls}>{CATEGORY_LABEL[c.cat]}</td>
                    <td className={tdNum} title={c.plants.join(', ')}>{c.products}</td>
                    <td className={tdNum}>{fmtQty(c.qty)} <span className="text-faint">{c.meins}</span></td>
                    <td className={tdNum}>{c.basePc ? fmtRate(c.basePc) : '—'}</td>
                    <td className={tdNum}>
                      <input type="number" step="0.1" aria-label={`Change % for ${c.idnrk}`} className={cx(inputBase, 'h-7 w-20 px-2 text-right text-xs', s.compPct[c.idnrk] ? 'border-sim font-bold text-sim' : '')} placeholder={viaCat ? String(s.catPct[c.cat]) : '0'} value={s.compPct[c.idnrk] ?? ''} disabled={s.compPc[c.idnrk] !== undefined} onChange={(e) => setCompPct(c.idnrk, e.target.value)} />
                    </td>
                    <td className={tdNum}>
                      <input type="number" step="0.0001" min="0" aria-label={`New cost per unit for ${c.idnrk}`} className={cx(inputBase, 'h-7 w-24 px-2 text-right text-xs', s.compPc[c.idnrk] !== undefined ? 'border-sim font-bold text-sim' : '')} placeholder="—" value={s.compPc[c.idnrk] ?? ''} onChange={(e) => setCompPc(c.idnrk, e.target.value)} />
                    </td>
                    <td className={cx(tdNum, !c.delta.isZero() && 'sim-val')}>{c.simPc ? fmtRate(c.simPc) : '—'}</td>
                    <td className={tdNum}>{fmtNum(c.base, 2)}</td>
                    <td className={cx(tdNum, 'font-semibold', tone(c.delta))}>{c.delta.isZero() ? '—' : fmtSigned(c.delta, 2)}</td>
                    <td className={cx(tdCls, 'whitespace-nowrap')}>
                      {own ? <button type="button" className="text-accent hover:underline" onClick={() => resetComp(c.idnrk)}>Reset</button> : viaCat ? <Pill tone="sim" title="Changed by its category %">category</Pill> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {comps.length > COMP_CAP && <p className="px-3 py-2 text-xs text-warn">Showing the {COMP_CAP} costliest of {comps.length.toLocaleString('en-IN')} components. Filter to find others (the Excel has all).</p>}
          {!comps.length && <p className="px-3 py-3 text-xs text-muted">No component matches.</p>}
        </div>
      </Card>
    </div>
  );
}

function changeText(s: CompSimSettings, id: string, cat: CostCategory): string {
  if (s.compPc[id] !== undefined && s.compPc[id] !== '') return `New cost ${s.compPc[id]} / unit`;
  if (s.compPct[id]) return `${signedPct(D(s.compPct[id]))} (component)`;
  if (s.catPct[cat]) return `${signedPct(D(s.catPct[cat]!))} (category)`;
  return '';
}

function ImpactBar({ p, max }: { p: ProductImpact; max: Decimal }) {
  if (p.delta.isZero() || max.isZero()) return null;
  const w = Math.max(3, Number(p.delta.abs().div(max).times(100).toFixed(0)));
  return (
    <div className="h-2 w-32 overflow-hidden rounded-full bg-sunken" title={signedPct(p.deltaPct)}>
      <div className={cx('h-full rounded-full', p.delta.gt(0) ? 'bg-bad' : 'bg-good')} style={{ width: `${w}%` }} />
    </div>
  );
}

/** The changed component lines of one product (what drives its impact). */
function ProductLines({ rows, pkey, s }: { rows: PlanCostLine[]; pkey: string; s: CompSimSettings }) {
  const lines = rows.filter((l) => isLeafRow(l) && headerKey(l) === pkey && lineChange(l, s));
  return (
    <tr className="bg-sunken/50">
      <td colSpan={11} className="px-3 py-2">
        {!lines.length ? <p className="text-xs text-muted">No component of this product is changed.</p> : (
          <table className="w-full text-2xs">
            <thead><tr><th className={thCls}>Component</th><th className={thNum}>Qty</th><th className={thNum}>SAP cost / unit</th><th className={thNum}>Simulated / unit</th><th className={thNum}>SAP cost INR</th><th className={thNum}>Simulated INR</th><th className={thNum}>Impact INR</th></tr></thead>
            <tbody>
              {lines.map((l, i) => {
                const x = simLineCost(l, s);
                const d = x.total.minus(D(l.TotCostInr));
                return (
                  <tr key={i} className="border-t border-line/40">
                    <td className={tdCls}><span className="font-mono">{l.Idnrk}</span> <span className="text-muted">{l.Maktx}</span> <span className="text-faint">· {l.Werks}</span></td>
                    <td className={tdNum}>{fmtQty(D(l.QtyTot))} {l.Meins}</td>
                    <td className={tdNum}>{fmtRate(D(l.TotCostPcInr))}</td>
                    <td className={cx(tdNum, 'sim-val')}>{fmtRate(x.pc)}</td>
                    <td className={tdNum}>{fmtNum(D(l.TotCostInr), 2)}</td>
                    <td className={cx(tdNum, 'sim-val')}>{fmtNum(x.total, 2)}</td>
                    <td className={cx(tdNum, 'font-semibold', tone(d))}>{fmtSigned(d, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </td>
    </tr>
  );
}
