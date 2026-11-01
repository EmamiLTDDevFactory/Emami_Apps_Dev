/**
 * Pure logic of the Cost and margin report: one row per finished good (or WIP) and sales area with the plant's actual cost per piece
 * (RM, PM, Perfume, Overheads, COGM - SAP's per-unit figures of the period), the latest MRP and selling price (SAP's latest sales order within the
 * look-back days), a simulated COGM and the ratios. The ONLY arithmetic done here, each labelled on screen "computed here": the simulated COGM
 * (COGM changed by a percentage and / or an amount), its variance against COGM, and the ratios MRP : COGM, Selling price : COGM and Simulated COGM : COGM
 * (only when the price is in INR like the cost; never converted).
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
export function ratio(a: Decimal | string | null | undefined, b: Decimal | string | null | undefined): Decimal | null {
  const x = typeof a === 'string' ? dec(a) : a ?? null;
  const y = typeof b === 'string' ? dec(b) : b ?? null;
  return x && y && !y.isZero() && x.gt(0) ? x.div(y) : null;
}

export interface ReportRow {
  key: string; fg: WacRow; price: SoPriceRow | null;
  /** price currency equals the cost currency (INR): the ratios are shown only then */
  sameCurrency: boolean;
  cogm: string; sim: Decimal | null; variance: Decimal | null;
  rMrp: Decimal | null; rSp: Decimal | null; rSim: Decimal | null;
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

export function buildReport(rows: WacRow[], prices: SoPriceRow[], sim: Simulation): ReportRow[] {
  const areas = new Map<string, SoPriceRow[]>();
  for (const p of latestPerArea(prices)) { const l = areas.get(p.Matnr) ?? []; l.push(p); areas.set(p.Matnr, l); }
  const out: ReportRow[] = [];
  for (const fg of [...rows].sort((a, b) => (dec(b.Qty)?.cmp(dec(a.Qty) ?? 0) ?? 0) || a.Matnr.localeCompare(b.Matnr))) {
    const list: (SoPriceRow | null)[] = areas.get(fg.Matnr)?.length ? areas.get(fg.Matnr)! : [null];
    for (const price of list) {
      const same = !!price && price.Curr.trim().toUpperCase() === 'INR';
      const s = simulatedCogm(fg.ActLanded, sim);
      const c = dec(fg.ActLanded);
      out.push({
        key: `${fg.Werks}|${fg.Matnr}|${price ? `${price.Vkorg}|${price.Vtweg}` : '-'}`, fg, price, sameCurrency: same, cogm: fg.ActLanded, sim: s, variance: s && c ? s.minus(c) : null,
        rMrp: same ? ratio(price!.Mrp, fg.ActLanded) : null, rSp: same ? ratio(price!.Sp, fg.ActLanded) : null, rSim: same && s ? ratio(price!.Sp, s) : null,
      });
    }
  }
  return out;
}

export const ratioText = (r: Decimal | null): string => (r ? `${r.toFixed(2)} : 1` : 'n/a');

/** Net direction of one component against the other rate sources: the variance of largest size decides (+ = actual above the source = cost up). */
export function direction(c: WacCompRow): 'up' | 'down' | 'none' {
  const m = maxAbsVariance(c);
  if (!m || m.isZero()) return 'none';
  const v = [c.VarpCmap, c.VarpCon, c.VarpAvg].map(dec).filter((x): x is Decimal => x !== null).sort((a, b) => b.abs().cmp(a.abs()))[0];
  return v.gt(0) ? 'up' : 'down';
}
