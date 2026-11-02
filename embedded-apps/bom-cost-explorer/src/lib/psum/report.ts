/**
 * Pure logic of the Cost and margin report: one row per finished good (or WIP) and sales area with the plant's actual cost per piece
 * (RM, PM, Perfume, Overheads, COGM - SAP's per-unit figures of the period), the latest MRP and selling price (SAP's latest sales order within the
 * look-back days), a simulated COGM and the ratios. The ONLY arithmetic done here, each labelled on screen "computed here": the simulated COGM
 * (COGM changed by a percentage and / or an amount), its variance against COGM, and the ratios MRP : COGM, Selling price : COGM and Simulated COGM : COGM
 * (only when the price is in INR like the cost; never converted). The margins are the amount remaining after manufacturing cost as a percentage of the price.
 */
import Decimal from 'decimal.js';
import { toDay } from '../wac/dates';
import { dec, maxAbsVariance } from '../wac/view';
import type { WacCompRow, WacRow } from '../wac/types';
import type { SoPriceRow } from '../so/types';

export type ReportKind = 'fg' | 'wip';
export const WIP_TYPE = 'HALB';
export const isWip = (r: Pick<WacRow, 'Mtart'>): boolean => r.Mtart.trim().toUpperCase() === WIP_TYPE;

/** The look-back window ending today. */
export function lookbackRange(days: number, now: Date = new Date()): { from: string; to: string } {
  const d = Math.max(1, Math.floor(days));
  return { from: toDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - d + 1)), to: toDay(now) };
}

export interface Filters { kind: ReportKind; brand: string; prodha: string; matnr: string; search: string }
const lc = (s: string) => s.toLowerCase();

/** Produced rows of the chosen kind (quantity above zero) that match the Brand / Product / SKU choice and the search. */
export function filterReportRows(rows: WacRow[], f: Filters): WacRow[] {
  const q = lc(f.search.trim());
  return rows.filter((r) => (dec(r.Qty)?.gt(0) ?? false) && (f.kind === 'wip' ? isWip(r) : !isWip(r))
    && (!f.brand || r.Zbrand === f.brand) && (!f.prodha || r.Prodha === f.prodha) && (!f.matnr || r.Matnr === f.matnr)
    && (!q || lc(`${r.Matnr} ${r.Maktx} ${r.Zbrand} ${r.Prodha}`).includes(q)));
}

export interface Option { value: string; label: string }
/** Dropdown options (Brand / Product / SKU) from the loaded rows of the chosen kind, each of the others narrowing the next. */
export function optionsOf(rows: WacRow[], kind: ReportKind, pick: Pick<Filters, 'brand' | 'prodha'>): { brands: Option[]; products: Option[]; skus: Option[] } {
  const base = rows.filter((r) => (dec(r.Qty)?.gt(0) ?? false) && (kind === 'wip' ? isWip(r) : !isWip(r)));
  const uniq = (list: WacRow[], key: (r: WacRow) => string, label: (r: WacRow) => string): Option[] => {
    const m = new Map<string, string>();
    for (const r of list) { const k = key(r).trim(); if (k && !m.has(k)) m.set(k, label(r)); }
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  };
  const byBrand = pick.brand ? base.filter((r) => r.Zbrand === pick.brand) : base;
  const byProduct = pick.prodha ? byBrand.filter((r) => r.Prodha === pick.prodha) : byBrand;
  return {
    brands: uniq(base, (r) => r.Zbrand, (r) => r.Zbrand),
    products: uniq(byBrand, (r) => r.Prodha, (r) => r.Prodha),
    skus: uniq(byProduct, (r) => r.Matnr, (r) => `${r.Matnr} ${r.Maktx}`),
  };
}

export interface Simulation { pct: string; abs: string }
export const simulationOn = (s: Simulation): boolean => (dec(s.pct) !== null && !dec(s.pct)!.isZero()) || (dec(s.abs) !== null && !dec(s.abs)!.isZero());
/** Simulated COGM per piece = COGM x (1 + pct / 100) + amount. null when COGM is not there or no simulation is entered. */
export function simulatedCogm(cogm: string, s: Simulation): Decimal | null {
  const c = dec(cogm);
  if (!c || !simulationOn(s)) return null;
  return c.times(new Decimal(1).plus((dec(s.pct) ?? new Decimal(0)).div(100))).plus(dec(s.abs) ?? 0);
}

/** "a : b" as a ratio of a to b (a divided by b), null when either is missing or b is zero. */
/** Margin in percent: the amount remaining after manufacturing cost as a share of the price = (price - COGM) / price x 100. Negative when the cost is above the
 * price. null when the price or the COGM is missing or not above zero. Computed here (the only arithmetic besides the simulation); never "profit". */
export function marginPct(price: Decimal | string | null | undefined, cost: Decimal | string | null | undefined): Decimal | null {
  const p = typeof price === 'string' ? dec(price) : price ?? null;
  const c = typeof cost === 'string' ? dec(cost) : cost ?? null;
  return p && c && p.gt(0) && c.gt(0) ? p.minus(c).div(p).times(100) : null;
}
export const marginText = (m: Decimal | null): string => (m ? `${m.lt(0) ? '▼ −' : ''}${m.abs().toFixed(1)} %` : 'n/a');

export function ratio(a: Decimal | string | null | undefined, b: Decimal | string | null | undefined): Decimal | null {
  const x = typeof a === 'string' ? dec(a) : a ?? null;
  const y = typeof b === 'string' ? dec(b) : b ?? null;
  return x && y && !y.isZero() && x.gt(0) ? x.div(y) : null;
}

export interface ReportRow {
  key: string; fg: WacRow; price: SoPriceRow | null;
  /** price currency equals the cost currency (INR): the ratios are shown only then */
  sameCurrency: boolean;
  /** COGM per piece = RM + PM + Perfume (see cogmOf); '' while SAP sent none of them. ActLanded is NEVER used as COGM. */
  cogm: string;
  cogmPending: boolean;
  sim: Decimal | null; variance: Decimal | null;
  rMrp: Decimal | null; rSp: Decimal | null; rSim: Decimal | null;
}

/** The cost parts that make the COGM: RM + PM + Perfume (WIP has no PM). Overheads (conversion) and ActLanded are NOT part of it. */
const cogmParts = (fg: Pick<WacRow, 'ActRm' | 'ActPm' | 'ActPerf'>): Decimal[] => [fg.ActRm, fg.ActPm, fg.ActPerf].map((v) => dec(v ?? '')).filter((d): d is Decimal => d !== null);
/** The COGM of a row = RM + PM + Perfume per piece (SAP's ActRm, ActPm, ActPerf), summed here. '' when SAP sent none of the three or the sum is 0. */
export const cogmOf = (fg: Pick<WacRow, 'ActRm' | 'ActPm' | 'ActPerf'>): string => { const p = cogmParts(fg); const t = p.reduce((a, d) => a.plus(d), new Decimal(0)); return p.length && !t.isZero() ? t.toFixed() : ''; };
/** SAP sent the cost parts but they add up to 0: no cost documents for this material in the period (n/a, not a COGM of 0). */
export const cogmNone = (fg: Pick<WacRow, 'ActRm' | 'ActPm' | 'ActPerf'>): boolean => { const p = cogmParts(fg); return p.length > 0 && p.every((d) => d.isZero()); };
export const COGM_NONE_NOTE = 'SAP returned no cost (0) for this material in the period';
/** No row of the answer carries RM, PM or Perfume cost: SAP has not been updated yet (a note, not an error). */
export const cogmPending = (rows: Pick<WacRow, 'ActRm' | 'ActPm' | 'ActPerf'>[]): boolean => rows.length > 0 && rows.every((r) => cogmParts(r).length === 0);
export const COGM_PENDING_NOTE = 'SAP update pending: COGM not available';

/** Why a ratio is n/a (tooltip): no COGM, no price, or the price is not in the cost currency. */
export function ratioWhy(r: Pick<ReportRow, 'cogm' | 'price' | 'sameCurrency'> & { cogmPending?: boolean }): string {
  if (!dec(r.cogm)) return r.cogmPending === false ? COGM_NONE_NOTE : COGM_PENDING_NOTE;
  if (!r.price) return 'No sales order with a selling price';
  if (!r.sameCurrency) return `The price is in ${r.price.Curr || 'another currency'}, the cost in INR: no ratio (never converted here)`;
  return '';
}

/** The latest usable price row (selling price above zero, newest order date) of each sales organisation and channel. */
export function latestPerArea(prices: SoPriceRow[]): SoPriceRow[] {
  const best = new Map<string, SoPriceRow>();
  for (const p of prices) {
    if (!(dec(p.Sp)?.gt(0) ?? false)) continue;
    const k = `${p.Matnr}|${p.Vkorg}|${p.Vtweg}`;
    const cur = best.get(k);
    if (!cur || (p.Audat ?? '') > (cur.Audat ?? '')) best.set(k, p);
  }
  return [...best.values()].sort((a, b) => a.Matnr.localeCompare(b.Matnr) || a.Vkorg.localeCompare(b.Vkorg) || a.Vtweg.localeCompare(b.Vtweg));
}

/** Key of a finished good's costing result: plant | material. */
export const rateCogmKey = (werks: string, matnr: string): string => `${werks}|${matnr}`;

/** `rateCogm`, when given, replaces the percentage / amount simulation: the COGM per piece at the chosen BOM-costing rate type, per plant | material
 * (a material without an entry stays n/a, never 0). */
export function buildReport(rows: WacRow[], prices: SoPriceRow[], sim: Simulation, rateCogm?: ReadonlyMap<string, Decimal> | null): ReportRow[] {
  const areas = new Map<string, SoPriceRow[]>();
  for (const p of latestPerArea(prices)) { const l = areas.get(p.Matnr) ?? []; l.push(p); areas.set(p.Matnr, l); }
  const out: ReportRow[] = [];
  for (const fg of [...rows].sort((a, b) => (dec(b.Qty)?.cmp(dec(a.Qty) ?? 0) ?? 0) || a.Matnr.localeCompare(b.Matnr))) {
    const cogm = cogmOf(fg);
    const list: (SoPriceRow | null)[] = areas.get(fg.Matnr)?.length ? areas.get(fg.Matnr)! : [null];
    for (const price of list) {
      const same = !!price && price.Curr.trim().toUpperCase() === 'INR';
      const s = rateCogm ? rateCogm.get(rateCogmKey(fg.Werks, fg.Matnr)) ?? null : simulatedCogm(cogm, sim);
      const c = dec(cogm);
      out.push({
        key: `${fg.Werks}|${fg.Matnr}|${price ? `${price.Vkorg}|${price.Vtweg}` : '-'}`, fg, price, sameCurrency: same, cogm, cogmPending: !c && !cogmNone(fg), sim: s, variance: s && c ? s.minus(c) : null,
        rMrp: same && c ? marginPct(price!.Mrp, cogm) : null, rSp: same && c ? marginPct(price!.Sp, cogm) : null, rSim: same && s ? marginPct(price!.Sp, s) : null,
      });
    }
  }
  return out;
}

/** SKUs with no row carrying a selling price above zero. */
export const withoutPrice = (table: ReportRow[]): number => {
  const withP = new Set(table.filter((r) => r.price).map((r) => r.fg.Matnr));
  return new Set(table.filter((r) => !withP.has(r.fg.Matnr)).map((r) => r.fg.Matnr)).size;
};

export const ratioText = (r: Decimal | null): string => (r ? `${r.toFixed(2)} : 1` : 'n/a');

/** Age of a sales order in days: warn from this many days (the Sales price page uses the same threshold). */
export const ageTone = (days: number, stale: number): 'ok' | 'stale' => (days > stale ? 'stale' : 'ok');

/** Net direction of one component against the other rate sources: the variance of largest size decides (+ = actual above the source = cost up). */
export function direction(c: WacCompRow): 'up' | 'down' | 'none' {
  const m = maxAbsVariance(c);
  if (!m || m.isZero()) return 'none';
  const v = [c.VarpCmap, c.VarpCon, c.VarpAvg].map(dec).filter((x): x is Decimal => x !== null).sort((a, b) => b.abs().cmp(a.abs()))[0];
  return v.gt(0) ? 'up' : 'down';
}
