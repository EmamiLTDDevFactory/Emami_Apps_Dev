/**
 * $filter for the Margin sets. Several values of one property are joined with "or" inside brackets; In / Ex are separate properties; decimals carry
 * the "m" suffix (NewSp eq 75m); flags are Edm.String ('X' on, left out for off); dates are datetime'YYYY-MM-DDT00:00:00'; every value goes through
 * the shared literal helpers (odataString quoting) and the URL through encodeURIComponent, never "+". A LIVE call takes 25 finished goods at most.
 */
import { FilterError, odataDate, odataDecimal, odataString } from '../sap/filter';
import { EMPTY_LIST, type ListFilter } from '../so/types';
import { MARGIN_FILTER as F, type MarginSetKey } from './fields';
import type { Scenario } from './types';

export const MARGIN_LIVE_MAX = 25;

export interface MarginQuery {
  materials?: string[]; plants?: string[]; market?: string; channel?: string; prodha?: string; brand?: string;
  source?: 'L' | 'S'; priceDate?: string; explQty?: string; inclFrt?: boolean;
  scenario?: Scenario; newMrp?: string; newSp?: string; cogmDpct?: string; cogmDabs?: string; tgtRatio?: string; tgtRemain?: string;
  groupBy?: 'P' | 'W' | 'M' | 'B'; daysBack?: number; rule?: string[];
  /** 'O' = latest sales order (the sales-area filters below apply); '' / undefined = uploaded prices */
  priceSrc?: 'O' | '';
  vkorg?: string[]; vtweg?: string[]; segment?: string[]; soDays?: number;
  auart?: ListFilter; pstyv?: ListFilter; kdgrp?: ListFilter; kunnr?: ListFilter;
}

const uniq = (v: readonly string[] | undefined) => Array.from(new Set((v ?? []).map((x) => String(x).trim()).filter(Boolean)));
function multi(name: string, values: string[]): string | null {
  if (!values.length) return null;
  const parts = values.map((v) => `${name} eq ${odataString(v)}`);
  return parts.length === 1 ? parts[0] : `(${parts.join(' or ')})`;
}
const one = (name: string, v: string | undefined) => (v && v.trim() ? `${name} eq ${odataString(v.trim())}` : null);
const dec = (name: string, v: string | undefined, label: string) => {
  if (v === undefined || !String(v).trim()) return null;
  try { return `${name} eq ${odataDecimal(String(v).replace(',', '.'))}`; } catch { throw new FilterError(`${label} must be a number.`); }
};
const whole = (name: string, v: number | undefined, label: string) => {
  if (v === undefined) return null;
  if (!Number.isInteger(v) || v < 1) throw new FilterError(`${label} must be a whole number of at least 1.`);
  return `${name} eq ${v}`;
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const chunkMaterials = <T,>(list: readonly T[], size = MARGIN_LIVE_MAX): T[][] => { const o: T[][] = []; for (let i = 0; i < list.length; i += size) o.push(list.slice(i, i + size)); return o; };

/** The sets that run SAP's live costing (and so take 25 finished goods at most) when Source is 'L'. */
const LIVE_SETS: MarginSetKey[] = ['ROW', 'DRIVER', 'SIM', 'ALERT', 'BOARD'];
const SALES = new Set<MarginSetKey>(['ROW', 'DRIVER', 'SIM', 'ALERT', 'BOARD']);

export function buildMarginFilter(q: MarginQuery, set: MarginSetKey): string {
  const materials = uniq(q.materials);
  const live = (q.source ?? 'L') === 'L' && LIVE_SETS.includes(set);
  if (live && materials.length > MARGIN_LIVE_MAX) throw new FilterError(`A live call takes ${MARGIN_LIVE_MAX} finished goods at most (split the list).`);
  if (set === 'HISTORY' && !materials.length) throw new FilterError('Pick a finished good.');
  const c: (string | null)[] = [multi(F.Matnr, materials), multi(F.Werks, uniq(q.plants).map((p) => p.toUpperCase())), one(F.Market, q.market), one(F.Channel, q.channel)];
  if (set === 'ROW' || set === 'ALERT' || set === 'BOARD' || set === 'SIM') c.push(one(F.Prodha, q.prodha), one(F.Brand, q.brand));
  if (set !== 'HISTORY') {
    if (q.source) c.push(`${F.Source} eq ${odataString(q.source)}`);
    if (q.priceDate) { if (!DAY.test(q.priceDate)) throw new FilterError('The price date must be a date.'); c.push(`${F.PriceDate} eq ${odataDate(q.priceDate)}`); }
    c.push(dec(F.ExplQty, q.explQty, 'The explosion quantity'));
    if (q.inclFrt) c.push(`${F.InclFrt} eq 'X'`);
  }
  if (set === 'SIM') {
    if (q.newMrp?.trim() && q.newSp?.trim()) throw new FilterError('Give a new MRP or a new selling price, not both.');
    c.push(q.scenario ? `${F.Scenario} eq ${odataString(q.scenario)}` : null, dec(F.NewMrp, q.newMrp, 'The new MRP'), dec(F.NewSp, q.newSp, 'The new selling price'),
      dec(F.CogmDpct, q.cogmDpct, 'The COGM change %'), dec(F.CogmDabs, q.cogmDabs, 'The COGM change amount'), dec(F.TgtRatioIn, q.tgtRatio, 'The target ratio'), dec(F.TgtRemainIn, q.tgtRemain, 'The target remaining amount'));
  }
  if (set === 'BOARD' && q.groupBy) c.push(`${F.GroupBy} eq ${odataString(q.groupBy)}`);
  if (set === 'HISTORY') c.push(whole(F.DaysBack, q.daysBack, 'Days'));
  if (set === 'ALERT') c.push(multi(F.RuleIn, uniq(q.rule)));
  if (SALES.has(set) && q.priceSrc === 'O') {
    c.push(`${F.PriceSrcIn} eq 'O'`, multi(F.VkorgIn, uniq(q.vkorg)), multi(F.VtwegIn, uniq(q.vtweg)), multi(F.SegmentIn, uniq(q.segment)), whole(F.SoDaysIn, q.soDays, 'Days'));
    const lists: [string, string, ListFilter | undefined][] = [[F.AuartIn, F.AuartEx, q.auart], [F.PstyvIn, F.PstyvEx, q.pstyv], [F.KdgrpIn, F.KdgrpEx, q.kdgrp], [F.KunnrIn, F.KunnrEx, q.kunnr]];
    for (const [inName, exName, l] of lists) c.push(multi(inName, uniq(l?.in)), multi(exName, uniq(l?.ex)));
  }
  return c.filter(Boolean).join(' and ');
}
export { EMPTY_LIST };
