'use client';
/**
 * Pop-up of one finished good of the Plant production summary: its cost summary for the period, the component-wise cost (SAP's live
 * costing of that finished good, WacCompSet) and the BOM costing breakup exactly as the BOM costing tab shows it (CostLineSet, mode B).
 * The two SAP reads start only when their tab is opened; no request has a time limit (closing the pop-up aborts them).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import BomCostingPanel from '../costline/BomCostingPanel';
import { Button, Spinner, Stat, Tabs } from '../ui';
import { fmtNum } from '@/lib/format';
import type { PlantRow } from '@/lib/sap/fields';
import { dec } from '@/lib/wac/view';
import { fmtVarPct } from '@/lib/wac/view';
import { useWacComponents } from '@/lib/wac/useWac';
import type { WacFilterInput } from '@/lib/wac/filter';
import type { WacCompRow } from '@/lib/wac/types';
import { COST_LABEL, fgComponentTotals, fgComponents, sharePct, type FgValue, type PlantTotals } from '@/lib/psum/view';

type Tab = 'summary' | 'comps' | 'bom';
const th = 'px-2.5 py-1.5 text-left text-2xs font-bold uppercase tracking-wide text-muted';
const thN = `${th} text-right`;
const td = 'px-2.5 py-1.5 align-top';
const tdN = `${td} num whitespace-nowrap text-right`;
const NA = <span className="text-faint" title="No value from SAP">n/a</span>;
const GRP: Record<string, string> = { RM: 'RM', PM: 'PM', PERF: 'Perfume' };
const MIX = { rm: '#4F3FD6', pm: '#0e9fb5', perf: '#C2185B', conv: '#eda100', other: '#8B8FA3' } as const;
const amt = (v: string, dp = 4) => (dec(v) === null ? NA : fmtNum(v, dp, 'INR'));

export default function FgDetail({ v, period, totals, plants, loadedComps, onClose }: {
  v: FgValue; period: { dateFrom: string; dateTo: string }; totals: PlantTotals; plants: PlantRow[]; loadedComps: WacCompRow[]; onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('summary');
  const r = v.row;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); prev?.focus?.(); };
  }, [onClose]);

  const plantName = plants.find((p) => p.Werks === r.Werks)?.Name1 ?? '';
  const perUnit = v.qty.isZero() ? null : v.landed.div(v.qty);
  const mix = (['rm', 'pm', 'perf', 'conv', 'other'] as const).map((k) => ({ k, value: v[k], pct: sharePct(v[k], v.landed) })).filter((m) => m.k !== 'other' || !m.value.abs().lt(v.landed.abs().times(0.005)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 no-print" role="dialog" aria-modal="true" aria-label={`Costing of ${r.Matnr}`}>
      <div className="absolute inset-0 bg-plum-deep/50 backdrop-blur-sm" onClick={onClose} />
      <div ref={ref} tabIndex={-1} className="relative flex h-[92vh] w-full max-w-7xl animate-slideUp flex-col rounded-2xl border border-line bg-panel shadow-pop outline-none">
        <div className="flex items-start gap-3 border-b border-line px-5 py-3">
          <div className="min-w-0">
            <div className="text-lg font-extrabold"><span className="font-mono">{r.Matnr}</span> <span className="font-semibold">{r.Maktx}</span></div>
            <div className="text-xs text-muted">Plant {r.Werks}{plantName ? ` · ${plantName}` : ''} · {period.dateFrom} to {period.dateTo}{r.Zbrand ? ` · brand ${r.Zbrand}` : ''}{r.Prodha ? ` · product ${r.Prodha}` : ''}</div>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} className="ml-auto shrink-0" aria-label="Close"><X size={15} /> Close</Button>
        </div>
        <div className="border-b border-line px-5 py-2">
          <Tabs<Tab> label="Finished good views" value={tab} onChange={setTab} tabs={[{ id: 'summary', label: 'Cost summary' }, { id: 'comps', label: 'Component-wise cost' }, { id: 'bom', label: 'BOM costing breakup' }]} />
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {tab === 'summary' && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Quantity produced" value={`${fmtNum(v.qty, 0, 'X')} ${r.Uom}`} sub={`${r.Docs} documents · ${r.Batches} batches`} />
                <Stat label="Actual cost / unit" value={perUnit ? <>{fmtNum(perUnit, 4, 'INR')} <span className="text-sm text-muted">INR</span></> : NA} sub="landed, SAP figure" />
                <Stat label="Total value" value={<>{fmtNum(v.landed, 0, 'INR')} <span className="text-sm text-muted">INR</span></>} sub="per unit x quantity, computed here" />
                <Stat label="Share of plant value" value={(() => { const p = sharePct(v.landed, totals.landed); return p ? `${p.toFixed(1)} %` : '—'; })()} sub={`plant total ${fmtNum(totals.landed, 0, 'INR')} INR`} />
              </div>
              <div>
                <div className="flex h-5 w-full overflow-hidden rounded-md bg-sunken" role="img" aria-label={mix.map((m) => `${COST_LABEL[m.k]} ${m.pct ? m.pct.toFixed(1) : 0}%`).join(', ')}>
                  {mix.map((m) => (m.pct && m.pct.gt(0) ? <div key={m.k} style={{ width: `${m.pct.toNumber()}%`, background: MIX[m.k] }} title={`${COST_LABEL[m.k]} ${m.pct.toFixed(1)} %`} /> : null))}
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-sunken"><tr><th className={th}>Cost part</th><th className={thN}>Per unit (SAP)</th><th className={thN}>Value for the quantity</th><th className={thN}>Share</th></tr></thead>
                  <tbody>
                    {([['rm', r.ActRm], ['pm', r.ActPm], ['perf', r.ActPerf], ['conv', r.ActConv]] as const).map(([k, unit]) => (
                      <tr key={k} className="border-t border-line/60"><td className={td}><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: MIX[k] }} aria-hidden />{COST_LABEL[k]}</td><td className={tdN}>{amt(unit)}</td><td className={tdN}>{fmtNum(v[k], 0, 'INR')}</td><td className={tdN}>{(sharePct(v[k], v.landed)?.toFixed(1) ?? '—')} %</td></tr>
                    ))}
                    <tr className="border-t-2 border-line bg-sunken font-bold"><td className={td}>Total (landed)</td><td className={tdN}>{amt(r.ActLanded)}</td><td className={tdN}>{fmtNum(v.landed, 0, 'INR')}</td><td className={tdN}>100 %</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted">Material (RM + PM + Perfume) per unit {amt(r.ActMat)} INR · reconciliation (landed − material − conversion) {amt(r.ActRecon)} INR. All INR per unit, as SAP sends them.</p>
            </div>
          )}
          {tab === 'comps' && <ComponentsTab v={v} period={period} loaded={loadedComps} />}
          {tab === 'bom' && <BomCostingPanel matnr={r.Matnr} werks={r.Werks} uom={r.Uom} defaultQty={v.qty} plants={plants} />}
        </div>
      </div>
    </div>
  );
}

/* ------------------------- component-wise cost ------------------------- */
function ComponentsTab({ v, period, loaded }: { v: FgValue; period: { dateFrom: string; dateTo: string }; loaded: WacCompRow[] }) {
  const r = v.row;
  const mine = useMemo(() => loaded.filter((c) => c.Matnr === r.Matnr && c.Werks === r.Werks), [loaded, r.Matnr, r.Werks]);
  const q: WacFilterInput = useMemo(() => ({ plants: [r.Werks], dateFrom: period.dateFrom, dateTo: period.dateTo, materials: [r.Matnr] }), [r.Werks, r.Matnr, period]);
  const have = mine.length > 0;
  const own = useWacComponents(q, !have, q); // already loaded in the page's batches: no new request
  const rows = have ? mine : ((own.entry?.status === 'done' ? own.entry.data : null) as WacCompRow[] | null);
  const sorted = useMemo(() => (rows ? fgComponents(rows) : []), [rows]);
  const grp = useMemo(() => fgComponentTotals(sorted, v.qty), [sorted, v.qty]);

  if (!rows) {
    const e = own.entry;
    if (e?.status === 'error') return <p role="alert" className="rounded-xl border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad">{e.error} <button className="font-semibold underline" onClick={own.retry}>Retry</button></p>;
    if (e?.status === 'cancelled') return <p className="text-sm text-muted">Cancelled. <button className="font-semibold text-accent underline" onClick={own.retry}>Load again</button></p>;
    return <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Costing this finished good in SAP… this can take a while (no time limit).</p>;
  }
  if (!rows.length) return <p className="text-sm text-muted">SAP returned no components for this finished good.</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {grp.map((g) => <span key={g.grp} className="rounded-full border border-line bg-panel px-3 py-1 text-xs"><b>{GRP[g.grp] ?? g.grp}</b> <span className="num text-muted">{fmtNum(g.perUnit, 4, 'INR')} INR / unit · {fmtNum(g.atQty, 0, 'INR')} INR for {fmtNum(v.qty, 0, 'X')} {r.Uom} · {g.items} items</span></span>)}
      </div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-sunken"><tr><th className={th}>Group</th><th className={th}>Component</th><th className={thN}>Qty / unit</th><th className={th}>Source</th><th className={thN}>Rate</th><th className={thN}>Cost / unit</th><th className={thN}>Cost for the quantity</th><th className={thN}>C-MAP</th><th className={thN}>Consumption</th><th className={thN}>Average</th></tr></thead>
          <tbody>
            {sorted.map((c) => {
              const cost = dec(c.CostSel);
              const cell = (cost: string, varp: string) => (dec(cost) === null ? NA : <>{fmtNum(cost, 4, 'INR')} <span className="text-2xs text-muted">{dec(varp) === null ? '' : fmtVarPct(varp)}</span></>);
              return (
                <tr key={`${c.Idnrk}|${c.Rowid}`} className="border-t border-line/60">
                  <td className={td}>{GRP[c.Grp] ?? c.Grp}</td>
                  <td className={td}><span className="font-mono font-bold">{c.Idnrk}</span> <span className="text-muted">{c.CompTxt}</span></td>
                  <td className={tdN}>{fmtNum(c.QtyPu, 4, 'X')} {c.Uom}</td><td className={td}>{c.SrcSel || NA}</td>
                  <td className={tdN}>{amt(c.RateSel)}</td><td className={tdN}>{amt(c.CostSel)}</td>
                  <td className={tdN}>{cost ? fmtNum(cost.times(v.qty), 0, 'INR') : NA}</td>
                  <td className={tdN}>{cell(c.CostCmap, c.VarpCmap)}</td><td className={tdN}>{cell(c.CostCon, c.VarpCon)}</td><td className={tdN}>{cell(c.CostAvg, c.VarpAvg)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Costs per unit are SAP&apos;s live costing at today&apos;s rates and the current BOM (selected source first, then C-MAP, consumption and average with the variance of the selected cost against each). &quot;Cost for the quantity&quot; = cost per unit x quantity produced, computed here.</p>
    </div>
  );
}
