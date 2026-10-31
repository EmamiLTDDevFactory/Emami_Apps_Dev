'use client';
/** The extra source columns of a finished-good matrix: "Standard (CK13N)", "MRP", "Selling price" (header level only, never for component rows). */
import { Fragment } from 'react';
import { Na, StdCostCell, amount } from './PriceStrip';
import { useScope } from './PriceScope';
import { usePcApi } from '@/lib/price-context/context';
import { costPctOfPrice, currencyDiffers, orderRows, segmentChip } from '@/lib/price-context/display';
import { fmtNum } from '@/lib/format';
import { isUsable } from '@/lib/so/service';

export const PRICE_COL_LABELS = ['Standard (CK13N)', 'MRP', 'Selling price'] as const;

const useOn = () => { const { state, admin } = usePcApi(); return admin && state.on && state.vkorg.length > 0; };

export function PriceHeads({ className }: { className: string }) {
  return useOn() ? <>{PRICE_COL_LABELS.map((l) => <th key={l} className={className}>{l}</th>)}</> : null;
}

/** `std` = the standard cost when the screen already has it; `costCurr` = the currency of the screen's cost (a different price currency gets a badge). */
/** Empty cells for the rows of a matrix that have no price (component rows, RM / PM / Perfume rows): the columns stay aligned. */
export function PriceBlank({ className }: { className: string }) {
  return useOn() ? <>{PRICE_COL_LABELS.map((l) => <td key={l} className={className} />)}</> : null;
}

/** `costValue` (a cost per unit in `costCurr`, as SAP gave it): under the selling price, "cost as % of selling price (computed here)" - only when the currencies are equal. */
export function PriceCells({ matnr, plant, className, costCurr, std, costValue }: { matnr: string; plant: string; className: string; costCurr?: string; std?: { value: string; curr: string }; costValue?: string }) {
  const on = useOn();
  const { pc } = useScope();
  if (!on) return null;
  const rows = orderRows(pc.prices.get(matnr) ?? []);
  const col = (pick: 'Mrp' | 'Sp') => (
    <td className={className}>
      {!rows.length ? <Na why={pc.loading ? 'loading' : 'No sales order for this context'} /> : rows.slice(0, 3).map((r, i) => (
        <div key={i} className="whitespace-nowrap">
          {isUsable(r) ? amount(r[pick], r.Curr, r.Uom) : <Na why={r.Msg || 'No usable order'} />}
          <span className="ml-1 text-2xs text-faint">{segmentChip(r)}</span>
          {currencyDiffers(r.Curr, costCurr) && <span className="ml-1 rounded bg-warn/15 px-1 text-2xs font-bold text-warn">currency differs</span>}
          {pick === 'Sp' && costValue && costCurr && isUsable(r) && (() => { const pct = costPctOfPrice(costValue, costCurr, r.Sp, r.Curr); return pct ? <div className="text-2xs text-muted">cost = {fmtNum(pct, 1, 'X')} % of selling price <span className="text-faint">(computed here)</span></div> : null; })()}
        </div>
      ))}
      {rows.length > 3 && <div className="text-2xs text-faint">+{rows.length - 3} more</div>}
    </td>
  );
  return <Fragment><td className={className}><StdCostCell matnr={matnr} plant={plant} known={std} costCurr={costCurr} /></td>{col('Mrp')}{col('Sp')}</Fragment>;
}
