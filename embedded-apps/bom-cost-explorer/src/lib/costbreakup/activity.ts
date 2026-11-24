/**
 * Conversion cost from SAP's routing activities: ZMM_BOM_COST_SRV/ActivityCostSet (live on NGQ and NWP).
 *
 *   GET ActivityCostSet?$filter=(Matnr eq 'FG1' or ...) and (Werks eq 'UN13' or ...) and Gjahr eq '2026' and Poper eq '007'
 *   ("Material or plant is required" without Matnr / Werks)
 *
 * One row per material x BOM alternative (Stlal) x routing operation (Vornr) x activity type (Lstar) x period (Poper):
 *   ActQty  activity quantity (ActUnit: MIN, KWH, KG ...) for the BOM base quantity BomQty (BomUnit) - the routing's
 *           time for its own base quantity RcpQty scaled to BomQty
 *   ActPrice x ActQty = ActValue (company code currency; Curr is blank on the live systems = the plant currency)
 *   ValuePc / ValuePcInr / FxInr  SAP's per-unit figures - zero on the live systems so far, used once SAP fills them
 *   Poper '000' + NoPrice 'X' = no activity price for the period (quantity only)
 *
 * Live quirks (NGQ / NWP, 24.10.2026): every row comes twice (only Rowid differs), every BOM alternative repeats the
 * same routing, ActGrp is 'OTHER' on every row (so the element is told from the activity type: MACHRS, LABHRS, POWER,
 * STEAM). Semi-finished / bulk materials have their own routing (steam and most power sit there), so the breakup reads
 * the activities of the FG and of every semi-finished component in the BOM.
 */
import { D, ZERO, type Decimal } from '../cost/decimal';
import { odataString } from '../sap/filter';
import type { SapGetOptions } from '../sap/client';
import { readFeed, type Feed } from '../plan/sapFeeds';
import { elementOf, type Element, type QtyByUom } from './procOrder';

export const ACTIVITY_SET = 'ActivityCostSet';
export const ACTIVITY = {
  Rowid: ['Rowid', 'i'], Matnr: ['Matnr', 's'], Maktx: ['Maktx', 's'], Werks: ['Werks', 's'], Stlnr: ['Stlnr', 's'], Stlal: ['Stlal', 's'],
  Plnnr: ['Plnnr', 's'], Plnal: ['Plnal', 's'], Vornr: ['Vornr', 's'], Resrc: ['Resrc', 's'], ResrcTxt: ['ResrcTxt', 's'], Actseq: ['Actseq', 'i'],
  Poper: ['Poper', 's'], Kokrs: ['Kokrs', 's'], Kostl: ['Kostl', 's'], Lstar: ['Lstar', 's'], ActName: ['ActName', 's'], ActDesc: ['ActDesc', 's'],
  ActGrp: ['ActGrp', 's'], GrpSeq: ['GrpSeq', 's'], BomUnit: ['BomUnit', 's'], BomQty: ['BomQty', 'd'], RcpQty: ['RcpQty', 'd'], ActQty: ['ActQty', 'd'],
  ActUnit: ['ActUnit', 's'], Curr: ['Curr', 's'], ActPrice: ['ActPrice', 'd'], ActValue: ['ActValue', 'd'], ValuePc: ['ValuePc', 'd'], FxInr: ['FxInr', 'd'],
  ValuePcInr: ['ValuePcInr', 'd'], NoPrice: ['NoPrice', 's'], Gjahr: ['Gjahr', 's'], Versn: ['Versn', 's'],
} as const;
export interface ActivityRow {
  Rowid: number; Matnr: string; Maktx: string; Werks: string; Stlnr: string; Stlal: string; Plnnr: string; Plnal: string; Vornr: string; Resrc: string; ResrcTxt: string;
  Actseq: number; Poper: string; Kokrs: string; Kostl: string; Lstar: string; ActName: string; ActDesc: string; ActGrp: string; GrpSeq: string; BomUnit: string;
  BomQty: string; RcpQty: string; ActQty: string; ActUnit: string; Curr: string; ActPrice: string; ActValue: string; ValuePc: string; FxInr: string; ValuePcInr: string;
  NoPrice: string; Gjahr: string; Versn: string;
}

/** Emami's fiscal year starts in April: October 2026 = Gjahr 2026, Poper 007. */
export function fiscalPeriod(today = new Date()): { gjahr: string; poper: string } {
  const m = today.getMonth() + 1;
  const y = m >= 4 ? today.getFullYear() : today.getFullYear() - 1;
  return { gjahr: String(y), poper: String(((m - 4 + 12) % 12) + 1).padStart(3, '0') };
}

/** The last n fiscal periods, newest first (period of today first). */
export function recentPeriods(n = 24, today = new Date()): Array<{ gjahr: string; poper: string }> {
  const out: Array<{ gjahr: string; poper: string }> = [];
  for (let i = 0; i < n; i++) out.push(fiscalPeriod(new Date(today.getFullYear(), today.getMonth() - i, 1)));
  return out;
}

const anyOf = (prop: string, values: string[]) => {
  const v = [...new Set(values.map((x) => x.trim().toUpperCase()).filter(Boolean))];
  if (!v.length) return null;
  return v.length === 1 ? `${prop} eq ${odataString(v[0])}` : `(${v.map((x) => `${prop} eq ${odataString(x)}`).join(' or ')})`;
};

export function activityRequest(plants: string[], mats: string[], period: { gjahr: string; poper: string }) {
  const f = [anyOf('Matnr', mats), anyOf('Werks', plants), `Gjahr eq ${odataString(period.gjahr)}`, `Poper eq ${odataString(period.poper)}`].filter(Boolean).join(' and ');
  return { entitySet: ACTIVITY_SET, params: { $filter: f } as Record<string, string | undefined> };
}

/** All rows for the materials, 40 per request; 'missing' when the system has no ActivityCostSet. */
export async function fetchActivities(plants: string[], mats: string[], period: { gjahr: string; poper: string }, opts: SapGetOptions = {}): Promise<Feed<ActivityRow>> {
  const list = [...new Set(mats)];
  const rows: ActivityRow[] = [];
  let last: Feed<ActivityRow> | null = null;
  for (let i = 0; i < Math.max(1, list.length); i += 40) {
    last = await readFeed<ActivityRow>(activityRequest(plants, list.slice(i, i + 40), period), ACTIVITY, opts);
    if (last.status !== 'ready') return last;
    rows.push(...last.rows);
  }
  return { ...(last as Feed<ActivityRow>), rows };
}

/** Conversion element of an activity: SAP's group when it names one, else the activity type / name. Unknown = Conversion Charge. */
export function activityElement(r: Pick<ActivityRow, 'ActGrp' | 'Lstar' | 'ActName'>): Element {
  const g = elementOf(r.ActGrp);
  if (g && g !== 'OTHER' && !['RM', 'PERFUME', 'PM'].includes(g)) return g;
  const s = `${r.Lstar} ${r.ActName}`.toUpperCase();
  if (/LAB/.test(s)) return 'LABOUR';
  if (/MACH|MCH/.test(s)) return 'MACHINE';
  if (/STEAM|STM/.test(s)) return 'STEAM';
  if (/POWER|PWR|ELEC|KWH/.test(s)) return 'POWER';
  return 'CONV';
}

export interface ActivityLine { row: ActivityRow; el: Element; qtyPerUnit: Decimal; valuePerUnit: Decimal; valuePerUnitInr: Decimal | null }
export interface MatActivity {
  werks: string; matnr: string; maktx: string; bomQty: Decimal; bomUnit: string; stlal: string; priced: boolean;
  /** the task list used, and other valid task lists of the same alternative that were left out (data quality: SAP takes one) */
  plnnr: string; otherRoutings: string[];
  /** per BOM unit of the material, by element: quantity per activity unit, value in the plant currency, INR when SAP gives it */
  byElement: Partial<Record<Element, { qty: QtyByUom; loc: Decimal; inr: Decimal | null }>>;
  lines: ActivityLine[];
}

const rowKey = (r: ActivityRow) => [r.Werks, r.Matnr, r.Stlal, r.Plnnr, r.Plnal, r.Vornr, r.Actseq, r.Lstar, r.Poper, r.ActQty, r.ActValue].join('|');

/**
 * Werks|Matnr -> activities per BOM unit. Duplicates dropped; one BOM alternative (the lowest Stlal - the same one the
 * BOM explosion takes by default); priced period rows win over Poper '000' rows.
 */
export function activitiesPerUnit(rows: ActivityRow[], poper?: string): Map<string, MatActivity> {
  const seen = new Set<string>();
  const byMat = new Map<string, ActivityRow[]>();
  for (const r of rows) {
    const k = rowKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    const mk = `${r.Werks.toUpperCase()}|${r.Matnr}`;
    (byMat.get(mk) ?? byMat.set(mk, []).get(mk)!).push(r);
  }
  const out = new Map<string, MatActivity>();
  for (const [mk, list] of byMat) {
    const priced = list.filter((r) => r.Poper !== '000' && (!poper || r.Poper === poper));
    const use0 = priced.length ? priced : list;
    const stlal = use0.map((r) => r.Stlal).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))[0];
    const sameAlt = use0.filter((r) => r.Stlal === stlal);
    // One routing only. A material can have several valid task lists (same alternative, same plant, full lot size range, e.g. WIP 250005590 in UN02 has 50033142 and
    // 50033181): SAP costing takes ONE of them (the latest created = highest group number), so adding all of them counts the semi-finished routing two or three times.
    const plans = [...new Set(sameAlt.map((r) => `${r.Plnnr}|${r.Plnal}`))];
    const num = (x: string) => (/^\d+$/.test(x) ? Number(x) : -1);
    const chosen = plans.slice().sort((a, b) => { const [pa, la] = a.split('|'), [pb, lb] = b.split('|'); return num(pb) - num(pa) || pb.localeCompare(pa) || num(la) - num(lb); })[0];
    const use = plans.length > 1 ? sameAlt.filter((r) => `${r.Plnnr}|${r.Plnal}` === chosen) : sameAlt;
    const otherRoutings = plans.filter((x) => x !== chosen).map((x) => x.split('|')[0]);
    const first = use[0];
    const bomQty = D(first.BomQty).gt(0) ? D(first.BomQty) : D(1);
    const m: MatActivity = { werks: first.Werks.toUpperCase(), matnr: first.Matnr, maktx: first.Maktx, bomQty, bomUnit: first.BomUnit, stlal, priced: priced.length > 0, plnnr: first.Plnnr, otherRoutings: plans.length > 1 ? otherRoutings : [], byElement: {}, lines: [] };
    for (const r of use) {
      const el = activityElement(r);
      const bq = D(r.BomQty).gt(0) ? D(r.BomQty) : bomQty;
      const qtyPerUnit = D(r.ActQty).div(bq);
      const valuePerUnit = D(r.ValuePc).gt(0) ? D(r.ValuePc) : D(r.ActValue).div(bq);
      const valuePerUnitInr = D(r.ValuePcInr).gt(0) ? D(r.ValuePcInr) : D(r.FxInr).gt(0) ? valuePerUnit.times(D(r.FxInr)) : null;
      m.lines.push({ row: r, el, qtyPerUnit, valuePerUnit, valuePerUnitInr });
      const e = m.byElement[el] ?? (m.byElement[el] = { qty: {}, loc: ZERO, inr: ZERO });
      const u = r.ActUnit || '-';
      e.qty[u] = (e.qty[u] ?? ZERO).plus(qtyPerUnit);
      e.loc = e.loc.plus(valuePerUnit);
      e.inr = e.inr && valuePerUnitInr ? e.inr.plus(valuePerUnitInr) : null;
    }
    out.set(mk, m);
  }
  return out;
}
