/**
 * Item level breakup of one finished good (DashCdrillSet). SAP finds the process orders of the sold batches (ZMB31_POUTILITY, post type 01),
 * runs ZCL_AUFM_UTILITY3 and returns the components below the finished good (WIP cost ignored, its own components kept). Here: grouping by category and shares.
 * Categories: R = raw material (ROH), P = packing (VERP / PKGN), F = perfume (ROH, material group 106), O = other.
 */
import Decimal from 'decimal.js';
import type { CdrillRow } from './types';

const d = (v: string | number | null | undefined) => { try { return new Decimal(String(v ?? '0') || '0'); } catch { return new Decimal(0); } };
export type Cat = 'R' | 'P' | 'F' | 'O';
export const CAT_LABEL: Record<Cat, string> = { R: 'Raw material', P: 'Packing material', F: 'Perfume', O: 'Other' };

export interface CdrillSummary { rm: Decimal; pm: Decimal; pf: Decimal; oth: Decimal; total: Decimal; soldQty: Decimal; orders: number; msg: string; flag: string }
export interface CdrillBatch { charg: string; sold: Decimal; prod: Decimal; orders: number; rm: Decimal; pm: Decimal; pf: Decimal; oth: Decimal; flag: string; msg: string }
export interface CdrillComp { matnr: string; maktx: string; mtart: string; matkl: string; cat: Cat; meins: string; qty: Decimal; val: Decimal; qtyPc: Decimal; costPc: Decimal; share: Decimal | null }
export interface Cdrill { summary: CdrillSummary | null; batches: CdrillBatch[]; comps: Record<Cat, CdrillComp[]>; costed: number; notCosted: number }

export function parseCdrill(rows: CdrillRow[]): Cdrill {
  const s = rows.find((r) => r.Grain === 'S');
  const summary: CdrillSummary | null = s ? { rm: d(s.RmPc), pm: d(s.PmPc), pf: d(s.PfPc), oth: d(s.OthPc), total: d(s.RmPc).plus(d(s.PmPc)).plus(d(s.PfPc)).plus(d(s.OthPc)), soldQty: d(s.SoldQty), orders: s.Orders, msg: s.Msg, flag: s.Flag } : null;
  const batches = rows.filter((r) => r.Grain === 'B').map((r) => ({ charg: r.Charg, sold: d(r.SoldQty), prod: d(r.ProdQty), orders: r.Orders, rm: d(r.RmPc), pm: d(r.PmPc), pf: d(r.PfPc), oth: d(r.OthPc), flag: r.Flag, msg: r.Msg }))
    .sort((a, b) => (a.flag === 'OK' ? 0 : 1) - (b.flag === 'OK' ? 0 : 1) || b.sold.abs().comparedTo(a.sold.abs()));
  const comps: Record<Cat, CdrillComp[]> = { R: [], P: [], F: [], O: [] };
  for (const r of rows.filter((x) => x.Grain === 'C')) {
    const cat = (['R', 'P', 'F'].includes(r.Cat) ? r.Cat : 'O') as Cat;
    comps[cat].push({ matnr: r.Idnrk, maktx: r.Maktx, mtart: r.Mtart, matkl: r.Matkl, cat, meins: r.Meins, qty: d(r.Qty), val: d(r.Val), qtyPc: d(r.AvgQtyPc), costPc: d(r.AvgCostPc), share: null });
  }
  (Object.keys(comps) as Cat[]).forEach((k) => {
    const tot = comps[k].reduce((a, c) => a.plus(c.costPc), new Decimal(0));
    comps[k] = comps[k].map((c) => ({ ...c, share: tot.gt(0) ? c.costPc.div(tot).times(100) : null })).sort((a, b) => b.costPc.comparedTo(a.costPc));
  });
  return { summary, batches, comps, costed: batches.filter((b) => b.flag === 'OK').length, notCosted: batches.filter((b) => b.flag !== 'OK').length };
}
