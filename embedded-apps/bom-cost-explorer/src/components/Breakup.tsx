'use client';
import type { HeaderPerPiece } from '@/lib/cost/perPiece';
import { perPieceByPlant } from '@/lib/cost/perPiece';
import { CATEGORIES, CATEGORY_LABEL, type CostCategory } from '@/lib/cost/categories';
import { fmtNum, fmtPct, fmtSigned } from '@/lib/format';
import { cx, SimTag } from './ui';

/** Category colours: categorical slots from the validated palette (blue, magenta, aqua, grey). */
export const CATEGORY_COLOR: Record<CostCategory, string> = { RM: '#2a78d6', PERFUME: '#e87ba4', PM: '#1baf7a', OTHER: '#9a9cab' };

export function CategoryBadge({ c }: { c: CostCategory }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sunken px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-ink">
      <span className="h-2 w-2 rounded-full" style={{ background: CATEGORY_COLOR[c] }} aria-hidden />
      {CATEGORY_LABEL[c]}
    </span>
  );
}

const Delta = ({ d, pct }: { d: HeaderPerPiece['delta']; pct: HeaderPerPiece['deltaPct'] }) =>
  d.isZero() ? <span className="text-faint">—</span> : (
    <span className={cx('num font-semibold', d.gt(0) ? 'text-bad' : 'text-good')}>
      {fmtSigned(d, 4)} <span className="text-[11px] font-medium">({d.gt(0) ? '+' : ''}{fmtPct(pct, 2)})</span>
    </span>
  );

/** Impact of the simulation on cost per 1 PC of each header, per plant (INR). */
export function PerPieceImpact({ items, plantNames, simOn }: { items: HeaderPerPiece[]; plantNames: Record<string, string>; simOn: boolean }) {
  return (
    <table className="w-full text-[13px]">
      <thead className="sticky top-0 bg-panel text-[11px] font-bold uppercase tracking-wide text-faint">
        <tr>
          <th className="px-3 py-2 text-left">Plant</th>
          <th className="py-2 text-left">Header</th>
          <th className="py-2 text-right">SAP cost / 1 PC</th>
          <th className="py-2 text-right">Simulated / 1 PC {simOn && <SimTag />}</th>
          <th className="px-3 py-2 text-right">Impact (INR · %)</th>
        </tr>
      </thead>
      <tbody>
        {items.map((h) => (
          <tr key={h.key} className="border-t border-line/70">
            <td className="px-3 py-1.5"><span className="font-mono text-xs font-bold">{h.plant}</span> <span className="text-xs text-muted">{plantNames[h.plant]}</span></td>
            <td className="py-1.5"><span className="font-mono text-xs">{h.head}</span> <span className="text-xs text-muted">{h.text}</span></td>
            <td className="num py-1.5 text-right">{fmtNum(h.base.TOTAL, 4)}</td>
            <td className="num py-1.5 text-right"><span className={cx(!h.delta.isZero() && 'sim-val font-semibold')}>{fmtNum(h.sim.TOTAL, 4)}</span></td>
            <td className="px-3 py-1.5 text-right"><Delta d={h.delta} pct={h.deltaPct} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Header x plant, cost per 1 PC in INR (group currency): the only comparable currency. */
export function AcrossPlants({ items, plantNames, simOn }: { items: HeaderPerPiece[]; plantNames: Record<string, string>; simOn: boolean }) {
  const { plants, rows } = perPieceByPlant(items);
  if (plants.length < 2) return <p className="p-3 text-sm text-muted">Run with two or more plants to compare cost per piece across plants.</p>;
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead className="text-[11px] font-bold uppercase tracking-wide text-faint">
          <tr>
            <th className="px-3 py-2 text-left">Header · INR per 1 PC</th>
            {plants.map((p) => (
              <th key={p} className="px-2 py-2 text-right"><span className="font-mono">{p}</span> <span className="font-medium normal-case text-muted">{plantNames[p]}</span></th>
            ))}
            <th className="px-3 py-2 text-left">Cheapest</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.head} className="border-t border-line/70">
              <td className="px-3 py-1.5"><span className="font-mono text-xs">{r.head}</span> <span className="text-xs text-muted">{r.text}</span></td>
              {plants.map((p) => {
                const c = r.cells[p];
                return (
                  <td key={p} className={cx('num px-2 py-1.5 text-right', r.cheapest === p && 'bg-good/10 font-bold text-good')}>
                    {c ? (
                      <>
                        <span className={cx(simOn && !c.delta.isZero() && r.cheapest !== p && 'sim-val')}>{fmtNum(c.sim.TOTAL, 4)}</span>
                        {simOn && !c.delta.isZero() && <span className="block text-[10.5px] font-normal text-faint">SAP {fmtNum(c.base.TOTAL, 4)}</span>}
                      </>
                    ) : <span className="text-faint">—</span>}
                  </td>
                );
              })}
              <td className="px-3 py-1.5 font-mono text-xs font-bold">{r.cheapest ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** RM / Perfume / PM / Other per 1 PC, with a stacked bar per header (identity by legend + label). */
export function BreakupTable({ items, plantNames, simOn }: { items: HeaderPerPiece[]; plantNames: Record<string, string>; simOn: boolean }) {
  const max = Math.max(...items.map((h) => Number(h.sim.TOTAL.toFixed(6))), 0.000001);
  return (
    <div>
      <div className="flex flex-wrap gap-3 px-3 pb-2 text-[11px] font-semibold text-muted">
        {CATEGORIES.map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CATEGORY_COLOR[c] }} aria-hidden />{CATEGORY_LABEL[c]}</span>
        ))}
        <span className="ml-auto text-faint">INR per 1 PC{simOn ? ' · simulated (SAP below)' : ''}</span>
      </div>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-[11px] font-bold uppercase tracking-wide text-faint">
            <tr>
              <th className="px-3 py-2 text-left">Plant · Header</th>
              {CATEGORIES.map((c) => <th key={c} className="px-2 py-2 text-right">{CATEGORY_LABEL[c]}</th>)}
              <th className="px-2 py-2 text-right">Total</th>
              <th className="w-[28%] px-3 py-2 text-left">Mix</th>
            </tr>
          </thead>
          <tbody>
            {items.map((h) => (
              <tr key={h.key} className="border-t border-line/70 align-top">
                <td className="px-3 py-1.5">
                  <span className="font-mono text-xs font-bold">{h.plant}</span> <span className="font-mono text-xs">{h.head}</span>
                  <span className="block truncate text-xs text-muted" title={`${plantNames[h.plant] ?? ''} · ${h.text}`}>{h.text}</span>
                </td>
                {[...CATEGORIES, 'TOTAL' as const].map((c) => {
                  const changed = simOn && !h.sim[c].eq(h.base[c]);
                  return (
                    <td key={c} className={cx('num px-2 py-1.5 text-right', c === 'TOTAL' && 'font-bold')}>
                      <span className={cx(changed && 'sim-val')}>{fmtNum(h.sim[c], 4)}</span>
                      {changed && <span className="block text-[10.5px] font-normal text-faint">{fmtNum(h.base[c], 4)}</span>}
                      {c !== 'TOTAL' && !h.sim.TOTAL.isZero() && <span className="block text-[10.5px] font-normal text-faint">{fmtPct(h.sim[c].div(h.sim.TOTAL).times(100), 1)}</span>}
                    </td>
                  );
                })}
                <td className="px-3 py-2">
                  <div className="flex h-3 overflow-hidden rounded-full bg-sunken" style={{ width: `${Math.max(4, (Number(h.sim.TOTAL.toFixed(6)) / max) * 100)}%` }} role="img" aria-label={CATEGORIES.map((c) => `${CATEGORY_LABEL[c]} ${fmtNum(h.sim[c], 2)}`).join(', ')}>
                    {CATEGORIES.map((c) => {
                      const w = h.sim.TOTAL.isZero() ? 0 : Number(h.sim[c].div(h.sim.TOTAL).times(100).toFixed(2));
                      return w > 0 ? <span key={c} style={{ width: `${w}%`, background: CATEGORY_COLOR[c] }} className="h-full border-r-2 border-panel last:border-r-0" /> : null;
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
