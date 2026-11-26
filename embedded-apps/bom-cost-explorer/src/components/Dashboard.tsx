'use client';
import { useMemo, useState } from 'react';
import type { CostLine } from '@/lib/sap/fields';
import { analyse } from '@/lib/cost/analytics';
import { baseSimRow, type SimRow } from '@/lib/cost/simulate';
import { fmtNum, fmtPct, fmtSigned } from '@/lib/format';
import { Card, cx, inputBase, inputCls, SimTag, Stat } from './ui';
import { DivergingBars, HBars, SourceDonut } from './charts';
import { perPiece } from '@/lib/cost/perPiece';
import { BreakupTable } from './Breakup';

export default function Dashboard({
  rows, vals, simOn, plantNames, onOpenRow, coverDays, setCoverDays, groupCurr, compare, explQty = '1', qtyMult = 1,
}: {
  rows: CostLine[]; vals: SimRow[]; simOn: boolean; plantNames: Record<string, string>; onOpenRow: (i: number) => void;
  coverDays: number; setCoverDays: (n: number) => void; groupCurr: string; compare?: boolean;
  explQty?: string; qtyMult?: number;
}) {
  const [useSim, setUseSim] = useState(true);
  const sim = simOn && useSim;
  const base = useMemo(() => analyse(rows, sim ? vals : vals.map((v, i) => (v.changed ? baseSimRow(rows[i]) : v)), { coverDays }), [rows, vals, sim, coverDays]);
  const k = base.kpis;
  const pieces = useMemo(
    () => perPiece(rows, sim ? vals : vals.map((v, i) => (v.changed ? baseSimRow(rows[i]) : v)), explQty, sim ? qtyMult : 1),
    [rows, vals, sim, explQty, qtyMult],
  );
  const n = (d: { toString(): string }) => Number(d.toString());

  return (
    <div className="scroll-thin h-full overflow-auto p-3">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs no-print">
        {simOn && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={useSim} onChange={(e) => setUseSim(e.target.checked)} /> Include client what-ifs <SimTag />
          </label>
        )}
        <label className="flex items-center gap-1.5">
          Low coverage below
          <input type="number" min={1} className={cx(inputBase, 'h-7 w-20')} value={coverDays} onChange={(e) => setCoverDays(Math.max(1, Number(e.target.value) || 30))} />
          days
        </label>
        {compare && <span className="text-faint">Plant comparison: totals add up all compared plants.</span>}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Stat label={`Total ${groupCurr}`} sim={sim} value={fmtNum(k.total, 2)} sub={`${k.leafCount.toLocaleString('en-IN')} leaf lines`} title="Sum of TotCostInr over leaf rows (HasChild blank) and subcontracted assemblies (Sobsl 30)" />
        <Stat label="Freight share" sim={sim} value={fmtPct(k.freightShare)} sub={`${fmtNum(k.freight, 2)} ${groupCurr}`} />
        <Stat label="Rows without rate" value={k.noRate} tone={k.noRate ? 'bad' : 'good'} sub={k.noRate ? 'costed with freight only' : 'every line has a rate'} />
        <Stat label="From donor plant" value={k.donor} tone={k.donor ? 'warn' : undefined} sub="rate borrowed from another plant" />
        <Stat label={`Cover < ${coverDays} days`} value={k.lowCover} tone={k.lowCover ? 'warn' : undefined} sub={`${fmtNum(k.lowCoverValue, 2)} ${groupCurr} at risk`} title="999 (no requirement) is unlimited and excluded" />
        <Stat
          label="Budget variance"
          sim={sim}
          value={k.budgetRows ? fmtSigned(k.budgetVariance) : '—'}
          tone={!k.budgetRows ? undefined : k.budgetVariance.gt(0) ? 'bad' : 'good'}
          sub={k.budgetRows ? `${fmtPct(k.budgetBase.isZero() ? null : k.budgetVariance.div(k.budgetBase).times(100))} vs budget · ${k.budgetRows} lines` : 'run with "Include budget"'}
        />
      </div>

      <Card className="mt-3" title={<>Material cost breakup per 1 PC · RM / Perfume / PM ({groupCurr}) {sim && <SimTag />}</>} bodyClass="px-0 pb-1 pt-3">
        <BreakupTable items={pieces} plantNames={plantNames} simOn={sim} />
      </Card>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Card title={<>Cost by rate source {sim && <SimTag />}</>}>
          <SourceDonut data={base.bySource.map(([s, v]) => ({ name: s, value: n(v) }))} />
        </Card>
        <Card title={<>Top 10 cost drivers {sim && <SimTag />}</>}>
          <HBars data={base.topDrivers.map((d) => ({ name: d.comp, label: `${d.comp} ${d.text}`.slice(0, 28), value: n(d.value) }))} />
        </Card>
        <Card title={<>Cost by plant {sim && <SimTag />}</>}>
          <HBars data={base.byPlant.map(([p, v]) => ({ name: p, label: `${p} ${plantNames[p] ?? ''}`.slice(0, 28), value: n(v) }))} />
        </Card>
        <Card title={<>Cost by material group {sim && <SimTag />}</>}>
          <HBars data={base.byGroup.map(([g, v]) => ({ name: g, label: g, value: n(v) }))} />
        </Card>
        <Card title={`Coverage risk — under ${coverDays} days (${base.coverRisk.length})`} bodyClass="p-0">
          {base.coverRisk.length === 0 ? (
            <p className="p-3 text-sm text-muted">No component below {coverDays} days of cover{rows.some((r) => r.CovH1 !== '0') ? '' : ' (coverage was not requested)'}.</p>
          ) : (
            <div className="scroll-thin max-h-80 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-panel text-faint">
                  <tr><th className="px-3 py-1.5 text-left font-medium">Component</th><th className="text-left font-medium">Plant</th><th className="text-right font-medium">H1/H2/H3</th><th className="text-right font-medium">Min</th><th className="px-3 text-right font-medium">Cost value INR</th></tr>
                </thead>
                <tbody>
                  {base.coverRisk.slice(0, 200).map((c) => (
                    <tr key={c.i} className="cursor-pointer border-t border-line/60 hover:bg-accent/[0.04]" onClick={() => onOpenRow(c.i)}>
                      <td className="px-3 py-1"><span className="font-mono">{c.row.Idnrk}</span> <span className="text-muted">{c.row.Maktx}</span></td>
                      <td className="font-mono">{c.row.Hwerks}</td>
                      <td className="num text-right text-muted">{[c.row.CovH1, c.row.CovH2, c.row.CovH3].map((v) => (Number(v) === 999 ? '∞' : v)).join(' / ')}</td>
                      <td className="num text-right font-semibold text-bad">{c.cover}</td>
                      <td className="num px-3 text-right">{fmtNum(c.value, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title={<>Budget vs actual — biggest variances {sim && <SimTag />}</>}>
          {k.budgetRows === 0 ? (
            <p className="text-sm text-muted">No budget figures in this result. Run mode B with <strong>Include budget</strong>.</p>
          ) : (
            <>
              <p className="mb-2 text-2xs text-muted">(TotCostPcInr − BudLanded) × qty. Red = above budget, blue = below.</p>
              <DivergingBars
                data={[...base.budgetOver, ...base.budgetUnder.slice().reverse()].map((b) => ({ name: `${b.plant}|${b.label}`, label: `${b.plant} ${b.label}`.slice(0, 28), value: n(b.variance) }))}
              />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

