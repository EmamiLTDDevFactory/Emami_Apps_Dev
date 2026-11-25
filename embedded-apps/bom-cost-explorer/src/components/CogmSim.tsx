'use client';
/**
 * COGM simulation per piece of each finished good: material at SAP's Selected rate vs the rates you changed in the simulator below (component rate or %),
 * plus the conversion (machine, labour, power, steam, other) from SAP's routing activities with an optional manual figure per element. Nothing is sent to SAP.
 */
import { useMemo, useState } from 'react';
import type Decimal from 'decimal.js';
import { RotateCcw } from 'lucide-react';
import type { CostLine } from '@/lib/sap/fields';
import { isLeafRow } from '@/lib/cost/tree';
import { D, ZERO } from '@/lib/cost/decimal';
import type { SimRow } from '@/lib/cost/simulate';
import { buildBreakup } from '@/lib/costbreakup/breakup';
import { CONVERSION_ELEMENTS, ELEMENT_LABEL, MATERIAL_ELEMENTS, type Element } from '@/lib/costbreakup/procOrder';
import { useActivities } from '@/lib/costbreakup/useActivities';
import { fmtNum } from '@/lib/format';
import { Button, Card, SimTag, cx, inputBase } from './ui';

const EL: Element[] = [...MATERIAL_ELEMENTS, ...CONVERSION_ELEMENTS];

export default function CogmSim({ rows, sim, explQty, qtyMult }: { rows: CostLine[]; sim: SimRow[]; explQty: string; qtyMult: number }) {
  const [manual, setManual] = useState<Record<string, string>>({});
  const plants = useMemo(() => [...new Set(rows.map((l) => l.Hwerks))], [rows]);
  const fgCodes = useMemo(() => [...new Set(rows.map((l) => l.Headmat))], [rows]);
  const semis = useMemo(() => rows.filter((l) => !isLeafRow(l) && l.Idnrk && l.Idnrk !== l.Headmat), [rows]);
  const actPlants = useMemo(() => [...new Set([...plants, ...semis.map((l) => l.Werks || l.Hwerks)])], [plants, semis]);
  const actMats = useMemo(() => [...new Set([...fgCodes, ...semis.map((l) => l.Idnrk)])], [fgCodes, semis]);
  const act = useActivities(actPlants, actMats, rows.length > 0);

  const q = useMemo(() => D(explQty || '1'), [explQty]);
  const qSim = q.times(qtyMult || 1);
  const base = useMemo(() => buildBreakup(rows, (l) => D(l.ProdQty), () => q, new Map(), act.perUnit), [rows, q, act.perUnit]);
  // the same lines with the simulated leaf cost (local currency scaled by the same ratio)
  const simLines = useMemo(() => rows.map((l, i) => {
    if (!isLeafRow(l) || !sim[i]) return l;
    const b = D(l.TotCostInr);
    return { ...l, TotCostInr: sim[i].total.toString(), TotCostLoc: b.isZero() ? l.TotCostLoc : D(l.TotCostLoc).times(sim[i].total.div(b)).toString() };
  }), [rows, sim]);
  const simFg = useMemo(() => buildBreakup(simLines, (l) => D(l.ProdQty).times(qtyMult || 1), () => qSim, new Map(), act.perUnit), [simLines, qSim, qtyMult, act.perUnit]);
  const simBy = useMemo(() => new Map(simFg.map((f) => [f.key, f])), [simFg]);
  if (!base.length) return null;
  const pc = (v: Decimal, d: Decimal) => (d.isZero() ? ZERO : v.div(d));
  const touched = Object.values(manual).some((v) => v !== '');

  return (
    <Card title="COGM per piece: SAP Selected rate vs your rates">
      <div className="space-y-4 p-3">
        <p className="text-2xs text-muted">
          Material = BOM quantity x rate. The left column uses the rate SAP selected; the right column uses the rates you change in <b>Component rates</b> below (type a new rate or a %). Conversion comes from SAP routing activities
          ({act.status === 'ready' ? (act.auto ? "priced in each material's latest cost estimate period" : `period ${act.period.poper}/${act.period.gjahr}`) : act.status === 'loading' ? 'loading…' : 'not available: conversion shows 0'}); type a manual ₹ / pc in a conversion row to try another figure.
        </p>
        {touched && <div><Button size="sm" onClick={() => setManual({})}><RotateCcw size={13} /> Clear manual conversion</Button></div>}
        {base.map((b) => {
          const s = simBy.get(b.key);
          const rowsOut = EL.map((el) => {
            const sap = pc(b.elements[el].inr, q);
            const simPc = s ? pc(s.elements[el].inr, qSim) : sap;
            const m = manual[`${b.key}|${el}`];
            const mv = m !== undefined && m !== '' && Number.isFinite(Number(m)) ? D(m) : null;
            return { el, sap, sim: mv ?? simPc, manual: mv !== null, editable: CONVERSION_ELEMENTS.includes(el) };
          }).filter((r) => !r.sap.isZero() || !r.sim.isZero() || r.editable && r.el !== 'CONV');
          const tSap = rowsOut.reduce((a, r) => a.plus(r.sap), ZERO), tSim = rowsOut.reduce((a, r) => a.plus(r.sim), ZERO);
          const delta = tSim.minus(tSap);
          return (
            <div key={b.key} className="rounded-xl border border-line">
              <div className="flex flex-wrap items-center gap-2 border-b border-line bg-sunken/50 px-3 py-2 text-xs">
                <span className="font-mono font-bold">{b.headmat}</span><span className="text-muted">{b.headtxt}</span>
                <span className="rounded bg-sunken px-1.5 text-[10px] font-bold text-muted">{b.hwerks}</span>
                <span className="ml-auto text-muted">INR per piece · {explQty} pc explosion</span>
              </div>
              <table className="w-full text-[13px]">
                <thead className="text-[11px] font-bold uppercase tracking-wide text-faint">
                  <tr><th className="px-3 py-1.5 text-left">Element</th><th className="py-1.5 text-right">SAP Selected</th><th className="py-1.5 text-right">Simulated / manual <SimTag /></th><th className="px-3 py-1.5 text-right">Difference</th></tr>
                </thead>
                <tbody>
                  {rowsOut.map((r) => {
                    const d = r.sim.minus(r.sap);
                    return (
                      <tr key={r.el} className="border-t border-line/70">
                        <td className="px-3 py-1">{ELEMENT_LABEL[r.el]}{r.editable && <span className="ml-1 text-2xs text-faint">conversion</span>}</td>
                        <td className="num py-1 text-right">{fmtNum(r.sap, 4)}</td>
                        <td className="py-1 text-right">
                          {r.editable
                            ? <input inputMode="decimal" aria-label={`${ELEMENT_LABEL[r.el]} manual INR per piece`} className={cx(inputBase, 'h-7 w-28 px-1.5 text-right text-xs', r.manual && 'text-sim')} placeholder={fmtNum(r.sap, 4)} value={manual[`${b.key}|${r.el}`] ?? ''} onChange={(e) => setManual({ ...manual, [`${b.key}|${r.el}`]: e.target.value.replace(',', '.') })} />
                            : <span className={cx('num', !d.isZero() && 'sim-val font-semibold')}>{fmtNum(r.sim, 4)}</span>}
                        </td>
                        <td className={cx('num px-3 py-1 text-right', d.gt(0) ? 'text-bad' : d.lt(0) ? 'text-good' : 'text-faint')}>{d.isZero() ? '-' : `${d.gt(0) ? '+' : ''}${fmtNum(d, 4)}`}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-line bg-sunken/40 font-extrabold">
                    <td className="px-3 py-1.5">COGM / pc</td><td className="num py-1.5 text-right">{fmtNum(tSap, 4)}</td><td className="num py-1.5 text-right">{fmtNum(tSim, 4)}</td>
                    <td className={cx('num px-3 py-1.5 text-right', delta.gt(0) ? 'text-bad' : delta.lt(0) ? 'text-good' : 'text-faint')}>{delta.isZero() ? '-' : `${delta.gt(0) ? '+' : ''}${fmtNum(delta, 4)} (${tSap.isZero() ? '-' : `${delta.div(tSap).times(100).toFixed(2)} %`})`}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
