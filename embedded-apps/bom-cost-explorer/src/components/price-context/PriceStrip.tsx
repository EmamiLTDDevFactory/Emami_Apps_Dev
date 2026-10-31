'use client';
/**
 * Price strip next to a finished good's rate sources: Standard cost (CK13N, loaded on demand), MRP, Selling price, the segment and
 * document-type chips, order date with an age badge, and a tooltip with the order and the condition used. Every amount shows its
 * own currency; when the price currency differs from the cost currency of the screen there is a "currency differs" badge and no
 * percentage. Values that are not available are grey "n/a", never zero. Nothing renders (and nothing is requested) with the switch off.
 */
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { cx } from '../ui';
import { useScope } from './PriceScope';
import { fmtDate, fmtNum } from '@/lib/format';
import { usePcApi } from '@/lib/price-context/context';
import { useStdCost } from '@/lib/price-context/usePriceContext';
import { currencyDiffers, hasPrice, isStale, orderRows, segmentChip, stripState } from '@/lib/price-context/display';
import { isUsable } from '@/lib/so/service';
import { COGM_SO_ENABLED } from '@/lib/so/flag';
import type { SoPriceRow } from '@/lib/so/types';

const CompareWithCost = dynamic(() => import('../so/CompareWithCost'), { ssr: false });

export const Na = ({ why }: { why?: string }) => <span className="text-faint" title={why ?? 'Not available'}>n/a</span>;
export const amount = (v: string, curr: string, uom?: string) => (hasPrice(v) ? <span className="num whitespace-nowrap">{fmtNum(v, 2, 'X')} <span className="text-2xs text-faint">{curr}{uom ? ` / ${uom}` : ''}</span></span> : <Na />);

/** Standard cost (CK13N): fetched when asked (hover / click), or shown from the screen when it already has it. */
export function StdCostCell({ matnr, plant, known, costCurr }: { matnr: string; plant: string; known?: { value: string; curr: string }; costCurr?: string }) {
  const [want, setWant] = useState(false);
  const { header, loading, error } = useStdCost(matnr, plant, want && !known);
  const v = known ?? (header ? { value: header.TotalUnit, curr: header.Curr } : null);
  if (v && hasPrice(v.value)) {
    return <span className="inline-flex items-center gap-1">{amount(v.value, v.curr)}{currencyDiffers(v.curr, costCurr) && <span className="rounded bg-warn/15 px-1 text-2xs font-bold text-warn">currency differs</span>}</span>;
  }
  if (!plant) return <Na why="Standard cost needs a plant" />;
  if (loading) return <span className="text-xs text-muted">loading…</span>;
  if (error) return <span className="text-xs text-bad" title={error}>error</span>;
  if (want) return <Na why="No standard cost estimate from SAP" />;
  return <button type="button" onMouseEnter={() => setWant(true)} onFocus={() => setWant(true)} onClick={() => setWant(true)} className="text-xs font-semibold text-accent underline">Standard…</button>;
}

function Chips({ r, costCurr }: { r: SoPriceRow; costCurr?: string }) {
  const stale = isStale(r);
  return (
    <span className="inline-flex flex-wrap items-center gap-1" title={`Order ${r.Vbeln}${r.Posnr ? `/${r.Posnr}` : ''} · condition ${r.SpCond || 'n/a'} · ${r.Vkorg}/${r.Vtweg} · ${r.Kalsm}${r.KalsmTxt ? ` ${r.KalsmTxt}` : ''}`}>
      <span className="rounded-full bg-accent/10 px-1.5 py-px text-2xs font-bold text-accent">{segmentChip(r) || 'order'}</span>
      {r.Audat && <span className={cx('rounded-full px-1.5 py-px text-2xs font-bold', stale ? 'bg-warn/15 text-warn' : 'bg-good/10 text-good')}>{fmtDate(r.Audat)} · {r.DaysOld} d{stale && <span className="sr-only"> (stale)</span>}</span>}
      {currencyDiffers(r.Curr, costCurr) && <span className="rounded bg-warn/15 px-1 text-2xs font-bold text-warn">currency differs</span>}
      {r.NSkip > 0 && <span className="text-2xs text-warn" title={`${r.NSkip} order(s) skipped`}>skip {r.NSkip}</span>}
    </span>
  );
}

export default function PriceStrip({ matnr, plant, costCurr, std, compact }: { matnr: string; plant?: string; costCurr?: string; std?: { value: string; curr: string }; compact?: boolean }) {
  const { state, admin } = usePcApi();
  const { pc, plant: scopePlant } = useScope();
  const [open, setOpen] = useState(false);
  const [cmp, setCmp] = useState(false);
  const rows = orderRows(pc.prices.get(matnr) ?? []);
  const st = stripState({ on: admin && state.on && state.vkorg.length > 0, loading: pc.loading, error: pc.error, rows });
  if (st === 'off') return null;
  const p = plant ?? scopePlant ?? '';
  const shown = open || compact === false ? rows : rows.slice(0, 2);
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-1 rounded-lg border border-line bg-sunken/50 px-2.5 py-1.5 text-xs" aria-label={`Price context of ${matnr}`}>
      <span className="flex items-center gap-1.5"><b className="text-2xs uppercase tracking-wide text-muted">Standard</b><StdCostCell matnr={matnr} plant={p} known={std} costCurr={costCurr} /></span>
      {st === 'loading' && <span className="text-muted">loading prices…</span>}
      {st === 'error' && <span className="inline-flex items-center gap-1 text-bad"><AlertTriangle size={12} aria-hidden /> {pc.error}</span>}
      {st === 'none' && <span className="text-faint">No MRP / selling price: no sales order found for this context</span>}
      {shown.map((r, i) => (
        <span key={`${r.Vkorg}|${r.Vtweg}|${r.Auart}|${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span className="flex items-center gap-1"><b className="text-2xs uppercase tracking-wide text-muted">MRP</b>{isUsable(r) ? amount(r.Mrp, r.Curr, r.Uom) : <Na why={r.Msg || 'No usable order'} />}</span>
          <span className="flex items-center gap-1"><b className="text-2xs uppercase tracking-wide text-muted">Selling price</b>{isUsable(r) ? amount(r.Sp, r.Curr, r.Uom) : <Na why={r.Msg || 'No usable order'} />}</span>
          <Chips r={r} costCurr={costCurr} />
        </span>
      ))}
      {cmp && COGM_SO_ENABLED && (
        <div className="basis-full"><CompareWithCost materials={[matnr]} plants={p ? [p] : undefined} selection={{ vkorg: state.vkorg, vtweg: state.vtweg, segment: state.segment, daysBack: state.days, auart: state.auart, pstyv: state.pstyv, kdgrp: state.kdgrp, kunnr: state.kunnr }} /></div>
      )}
      {COGM_SO_ENABLED && rows.length > 0 && <button type="button" aria-expanded={cmp} onClick={() => setCmp(!cmp)} className="text-2xs font-bold text-accent underline">{cmp ? 'Hide cost comparison' : 'Compare with cost (SAP)'}</button>}
      {rows.length > 2 && compact !== false && (
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="inline-flex items-center gap-0.5 text-2xs font-bold text-accent"><ChevronDown size={11} className={cx(open && 'rotate-180')} aria-hidden />{open ? 'fewer' : `+${rows.length - 2} more`}</button>
      )}
    </div>
  );
}
