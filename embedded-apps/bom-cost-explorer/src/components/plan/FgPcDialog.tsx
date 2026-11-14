'use client';
/**
 * "How is this /pc worked out": the calculation behind a cost per FG piece, in a dialog. Cost per pc = sum over the FG's leaf components of
 * (total component quantity x rate) / plan quantity, shown line by line with its share, on the basis that was clicked (incl. freight, Budget, C-MAP,
 * Consumption or the selected rate). A component with no rate on that basis adds nothing and is marked.
 */
import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button, cx } from '../ui';
import { D, ZERO, type Decimal } from '@/lib/cost/decimal';
import { isLeafRow } from '@/lib/cost/tree';
import { costCategory, CATEGORIES, CATEGORY_LABEL, type CostCategory } from '@/lib/cost/categories';
import { PLAN_SOURCE_LABEL, PLAN_SOURCES, PLAN_SOURCE_COLOR, componentRate, type PlanLineWithOptions, type PlanSource } from '@/lib/plan/sources';
import { fmtNum, fmtQty, fmtRate } from '@/lib/format';
import { tdCls, tdNum, thCls, thNum } from './common';

export type PcBasis = PlanSource | 'INCL';
export const PC_BASIS_LABEL: Record<PcBasis, string> = { ...PLAN_SOURCE_LABEL, INCL: 'Selected incl. freight (Breakup)' };
const BASES: PcBasis[] = ['INCL', 'BUDGET', 'MBEW', 'CONSUMP', 'SELECTED'];

interface Row { l: PlanLineWithOptions; qty: Decimal; rate: Decimal | null; cost: Decimal; cat: CostCategory }

export default function FgPcDialog({ fgKey, lines, basis: start, optionsReady, onClose }: { fgKey: string; lines: PlanLineWithOptions[]; basis: PcBasis; optionsReady: boolean; onClose: () => void }) {
  const [basis, setBasis] = useState<PcBasis>(start);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);

  const head = useMemo(() => lines.find((l) => `${l.Land1}|${l.Hwerks}|${l.Headmat}` === fgKey), [lines, fgKey]);
  const planQty = D(head?.PlanQty ?? 0);
  const rows: Row[] = useMemo(() => lines.filter((l) => isLeafRow(l) && `${l.Land1}|${l.Hwerks}|${l.Headmat}` === fgKey).map((l) => {
    const qty = D(l.QtyTot);
    if (basis === 'INCL') { const c = D(l.TotCostInr); return { l, qty, rate: D(l.TotCostPcInr), cost: c, cat: costCategory(l) }; }
    const rate = componentRate(l, basis);
    return { l, qty, rate, cost: rate ? rate.times(qty) : ZERO, cat: costCategory(l) };
  }).sort((a, b) => b.cost.comparedTo(a.cost)), [lines, fgKey, basis]);

  const total = rows.reduce((a, r) => a.plus(r.cost), ZERO);
  const perPc = planQty.gt(0) ? total.div(planQty) : null;
  const priced = rows.filter((r) => r.rate && r.rate.gt(0)).length;
  const byCat = CATEGORIES.map((c) => ({ c, v: rows.filter((r) => r.cat === c).reduce((a, r) => a.plus(r.cost), ZERO) })).filter((x) => !x.v.isZero());
  const needsOptions = (basis === 'MBEW' || basis === 'CONSUMP') && !optionsReady;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print" role="dialog" aria-modal="true" aria-label="Cost per piece calculation">
      <div className="absolute inset-0 bg-plum-deep/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col rounded-2xl border border-line bg-panel shadow-pop">
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-bold">Cost per piece — <span className="font-mono">{head?.Headmat.replace(/^0+/, '')}</span> {head?.Headtxt}</p>
            <p className="text-xs text-muted">Plant {head?.Hwerks} · plan country {head?.Land1} {head?.Landx} · plan quantity {fmtQty(planQty)}{head?.Stlal ? ` · alt BOM ${head.Stlal}` : ''}</p>
          </div>
          <Button size="sm" onClick={onClose}><X size={13} /> Close</Button>
        </div>
        <div className="overflow-auto p-4">
          <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Rate basis">
            <span className="mr-1 text-xs font-bold text-muted">Rate basis</span>
            {BASES.map((b) => (
              <button key={b} type="button" aria-pressed={basis === b} onClick={() => setBasis(b)} className={cx('rounded-full border px-2.5 py-0.5 text-xs font-semibold', basis === b ? 'border-accent bg-accent text-white' : 'border-line bg-panel text-ink hover:border-accent/60')}>
                {b !== 'INCL' && <span className="mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: PLAN_SOURCE_COLOR[b] }} />}{PC_BASIS_LABEL[b]}
              </button>
            ))}
          </div>
          {needsOptions && <p className="mb-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs">C-MAP / Consumption rate options are still loading (or failed): components without them show no rate yet.</p>}

          <div className="mb-3 grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-line px-3 py-2"><p className="text-2xs text-muted">Total cost of the plan quantity (INR)</p><p className="num text-lg">{fmtNum(total, 2)}</p><p className="text-2xs text-muted">Σ (component qty × rate)</p></div>
            <div className="rounded-xl border border-line px-3 py-2"><p className="text-2xs text-muted">Plan quantity (FG)</p><p className="num text-lg">{fmtQty(planQty)}</p></div>
            <div className="rounded-xl border border-line bg-accent/5 px-3 py-2"><p className="text-2xs text-muted">Cost per piece (INR)</p><p className="num text-lg font-extrabold text-accent">{perPc ? fmtRate(perPc) : '—'}</p><p className="text-2xs text-muted">{perPc ? `${fmtNum(total, 2)} ÷ ${fmtQty(planQty)}` : 'no plan quantity'}</p></div>
            <div className="rounded-xl border border-line px-3 py-2"><p className="text-2xs text-muted">Components priced</p><p className={cx('num text-lg', priced < rows.length && 'text-warn')}>{priced} / {rows.length}</p><p className="text-2xs text-muted">{priced < rows.length ? 'unpriced ones add nothing' : 'all have a rate'}</p></div>
          </div>
          <p className="mb-3 text-xs text-muted">{basis === 'INCL'
            ? 'Cost per piece = Σ over the leaf components of (total quantity × the selected rate + freight) ÷ plan quantity. Freight is not added where the selected rate already includes it (Consumption, C-MAP).'
            : `Cost per piece = Σ over the leaf components of (total quantity × the ${PC_BASIS_LABEL[basis]} rate per component unit) ÷ plan quantity. Quantities are the BOM explosion of the plan.`}</p>

          {byCat.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              {byCat.map(({ c, v }) => <span key={c} className="rounded-lg border border-line px-2.5 py-1"><b>{CATEGORY_LABEL[c]}</b> <span className="num">{planQty.gt(0) ? fmtRate(v.div(planQty)) : '—'}</span> /pc <span className="text-muted">({total.gt(0) ? fmtNum(v.div(total).times(100), 1) : '0'}%)</span></span>)}
            </div>
          )}

          <div className="max-h-[48vh] overflow-auto rounded-xl border border-line">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-sunken">
                <tr><th className={thCls}>Component</th><th className={thCls}>Type</th><th className={thCls}>Source</th><th className={thNum}>Total qty</th><th className={thCls}>Unit</th><th className={thNum}>Qty per FG pc</th><th className={thNum}>Rate / unit INR</th><th className={thNum}>Cost INR</th><th className={thNum}>Cost per pc</th><th className={thNum}>Share</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-line/50">
                    <td className={cx(tdCls, 'max-w-[300px] truncate')} title={`${r.l.Idnrk} ${r.l.Maktx}`}><span className="font-mono">{r.l.Idnrk.replace(/^0+/, '')}</span> <span className="text-muted">{r.l.Maktx}</span></td>
                    <td className={tdCls}>{r.l.Mtart}</td>
                    <td className={tdCls}>{basis === 'INCL' ? (r.l.SelSource || 'NO RATE') : PLAN_SOURCES.includes(basis as PlanSource) ? basis : ''}</td>
                    <td className={tdNum}>{fmtQty(r.qty)}</td><td className={tdCls}>{r.l.Meins}</td>
                    <td className={tdNum}>{planQty.gt(0) ? fmtNum(r.qty.div(planQty), 6) : '—'}</td>
                    <td className={cx(tdNum, !r.rate && 'text-warn')}>{r.rate && r.rate.gt(0) ? fmtRate(r.rate) : 'no rate'}</td>
                    <td className={tdNum}>{fmtNum(r.cost, 2)}</td>
                    <td className={cx(tdNum, 'font-semibold')}>{planQty.gt(0) ? fmtNum(r.cost.div(planQty), 4) : '—'}</td>
                    <td className={tdNum}>{total.gt(0) ? `${fmtNum(r.cost.div(total).times(100), 1)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-sunken font-extrabold"><tr><td className={tdCls} colSpan={7}>Total</td><td className={tdNum}>{fmtNum(total, 2)}</td><td className={cx(tdNum, 'text-accent')}>{perPc ? fmtNum(perPc, 4) : '—'}</td><td className={tdNum}>100%</td></tr></tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
