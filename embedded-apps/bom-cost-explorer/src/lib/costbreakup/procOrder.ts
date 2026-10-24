/**
 * New cost type "Process order actual": the actual cost of finished goods from their process orders, broken into the
 * cost elements - material (raw material, perfume, pack material) and conversion (labour, power, machine, steam,
 * conversion charge) - with quantities. The business provides this data set in ZMM_BOM_COST_SRV; the entity and
 * property names below are the app's proposal until the SAP team confirms theirs (change them only here).
 *
 *   GET ProcOrderCostSet?$filter=(Werks eq '1000' or ...) and (Matnr eq 'FG1001' or ...) and Budat ge '20251024'
 *       Werks, Matnr (FG), Aufnr (process order), Budat (posting date of the order's goods receipt, YYYYMMDD),
 *       Yield (FG quantity delivered by the order), YieldUom, Element (RM | PERFUME | PM | LABOUR | POWER | MACHINE |
 *       STEAM | CONV), Lstar (activity type), Kostl (cost centre), Kstar (cost element), Idnrk (component, material
 *       elements), Maktx, Menge (quantity consumed / activity quantity), Meins, Cost (local currency), Waers,
 *       CostInr (INR)
 *
 * One row per order x element x activity type / component. Until the set answers, the Cost breakup shows the material
 * elements from SAP's costing and says the conversion elements wait for this data set.
 */
import { D, ZERO, type Decimal } from '../cost/decimal';
import { odataString } from '../sap/filter';
import type { SapGetOptions } from '../sap/client';
import { readFeed, type Feed } from '../plan/sapFeeds';

export const PROC_ORDER_SET = 'ProcOrderCostSet';
export const PROC_ORDER = {
  Werks: ['Werks', 's'], Matnr: ['Matnr', 's'], Aufnr: ['Aufnr', 's'], Budat: ['Budat', 's'], Yield: ['Yield', 'd'], YieldUom: ['YieldUom', 's'],
  Element: ['Element', 's'], Lstar: ['Lstar', 's'], Kostl: ['Kostl', 's'], Kstar: ['Kstar', 's'], Idnrk: ['Idnrk', 's'], Maktx: ['Maktx', 's'],
  Menge: ['Menge', 'd'], Meins: ['Meins', 's'], Cost: ['Cost', 'd'], Waers: ['Waers', 's'], CostInr: ['CostInr', 'd'],
} as const;
export interface ProcOrderRow {
  Werks: string; Matnr: string; Aufnr: string; Budat: string; Yield: string; YieldUom: string; Element: string; Lstar: string; Kostl: string; Kstar: string;
  Idnrk: string; Maktx: string; Menge: string; Meins: string; Cost: string; Waers: string; CostInr: string;
}

export const ELEMENTS = ['RM', 'PERFUME', 'PM', 'OTHER', 'LABOUR', 'POWER', 'MACHINE', 'STEAM', 'CONV'] as const;
export type Element = (typeof ELEMENTS)[number];
export const MATERIAL_ELEMENTS: Element[] = ['RM', 'PERFUME', 'PM', 'OTHER'];
export const CONVERSION_ELEMENTS: Element[] = ['LABOUR', 'POWER', 'MACHINE', 'STEAM', 'CONV'];
export const ELEMENT_LABEL: Record<Element, string> = {
  RM: 'Raw Material', PERFUME: 'Perfume', PM: 'Pack Material', OTHER: 'Other material',
  LABOUR: 'Labour', POWER: 'Power', MACHINE: 'Machine', STEAM: 'Steam', CONV: 'Conversion Charge',
};

/** SAP's element text -> the app's element (accepts the usual spellings). */
export function elementOf(v: string): Element | null {
  const s = String(v ?? '').trim().toUpperCase().replace(/[\s_-]+/g, '');
  const map: Record<string, Element> = {
    RM: 'RM', RAWMATERIAL: 'RM', RAW: 'RM', PERFUME: 'PERFUME', PF: 'PERFUME', PM: 'PM', PACKMATERIAL: 'PM', PACKING: 'PM', PACKINGMATERIAL: 'PM',
    OTHER: 'OTHER', LABOUR: 'LABOUR', LABOR: 'LABOUR', LAB: 'LABOUR', POWER: 'POWER', PWR: 'POWER', MACHINE: 'MACHINE', MACH: 'MACHINE', MC: 'MACHINE',
    STEAM: 'STEAM', STM: 'STEAM', CONV: 'CONV', CONVERSION: 'CONV', CONVERSIONCHARGE: 'CONV', CONVCHARGE: 'CONV',
  };
  return map[s] ?? null;
}

const anyOf = (prop: string, values: string[]) => {
  const v = [...new Set(values.map((x) => x.trim().toUpperCase()).filter(Boolean))];
  if (!v.length) return null;
  return v.length === 1 ? `${prop} eq ${odataString(v[0])}` : `(${v.map((x) => `${prop} eq ${odataString(x)}`).join(' or ')})`;
};

/** Process orders of these FGs in these plants posted on or after `fromYmd`. */
export function procOrderRequest(plants: string[], fgs: string[], fromYmd: string) {
  const f = [anyOf('Werks', plants), anyOf('Matnr', fgs), fromYmd ? `Budat ge ${odataString(fromYmd)}` : null].filter(Boolean).join(' and ');
  return { entitySet: PROC_ORDER_SET, params: { $filter: f } as Record<string, string | undefined> };
}

/** All rows for the FGs, 40 FGs per request (filter length); 'missing' as soon as SAP says the set is not there. */
export async function fetchProcOrders(plants: string[], fgs: string[], fromYmd: string, opts: SapGetOptions = {}): Promise<Feed<ProcOrderRow>> {
  const list = [...new Set(fgs)];
  const rows: ProcOrderRow[] = [];
  let last: Feed<ProcOrderRow> | null = null;
  for (let i = 0; i < Math.max(1, list.length); i += 40) {
    last = await readFeed<ProcOrderRow>(procOrderRequest(plants, list.slice(i, i + 40), fromYmd), PROC_ORDER, opts);
    if (last.status !== 'ready') return last;
    rows.push(...last.rows);
  }
  return { ...(last as Feed<ProcOrderRow>), rows };
}

/** YYYYMMDD `months` months before today. */
export function monthsAgo(months: number, today = new Date()): string {
  const d = new Date(Date.UTC(today.getFullYear(), today.getMonth() - months, today.getDate()));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

/* ---------- per FG: actual quantity and cost per FG piece, by element ---------- */

export interface QtyByUom { [uom: string]: Decimal }
export interface ElementActual { qtyPc: QtyByUom; costPcLoc: Decimal; costPcInr: Decimal; curr: string; rows: ProcOrderRow[] }
export interface FgActual { werks: string; matnr: string; orders: number; yield: Decimal; yieldUom: string; byElement: Partial<Record<Element, ElementActual>> }

const yieldKey = (r: ProcOrderRow) => `${r.Aufnr}`;

/** Plant|FG -> actual per FG piece by element, weighted over all orders (sum of cost / sum of yield). */
export function actualsPerPiece(rows: ProcOrderRow[]): Map<string, FgActual> {
  const out = new Map<string, FgActual & { orderYield: Map<string, Decimal>; sums: Partial<Record<Element, { qty: QtyByUom; loc: Decimal; inr: Decimal; curr: string; rows: ProcOrderRow[] }>> }>();
  for (const r of rows) {
    const el = elementOf(r.Element);
    if (!el) continue;
    const k = `${r.Werks.toUpperCase()}|${r.Matnr}`;
    let f = out.get(k);
    if (!f) out.set(k, (f = { werks: r.Werks.toUpperCase(), matnr: r.Matnr, orders: 0, yield: ZERO, yieldUom: r.YieldUom, byElement: {}, orderYield: new Map(), sums: {} }));
    if (!f.orderYield.has(yieldKey(r))) f.orderYield.set(yieldKey(r), D(r.Yield));
    const s = f.sums[el] ?? (f.sums[el] = { qty: {}, loc: ZERO, inr: ZERO, curr: r.Waers, rows: [] });
    const u = r.Meins || '-';
    s.qty[u] = (s.qty[u] ?? ZERO).plus(D(r.Menge));
    s.loc = s.loc.plus(D(r.Cost));
    s.inr = s.inr.plus(D(r.CostInr).gt(0) || r.Waers !== 'INR' ? D(r.CostInr) : D(r.Cost));
    s.curr ||= r.Waers;
    s.rows.push(r);
  }
  const result = new Map<string, FgActual>();
  for (const [k, f] of out) {
    const yieldSum = [...f.orderYield.values()].reduce((a, v) => a.plus(v), ZERO);
    const by: Partial<Record<Element, ElementActual>> = {};
    if (yieldSum.gt(0)) {
      for (const [el, s] of Object.entries(f.sums) as [Element, NonNullable<(typeof f.sums)[Element]>][]) {
        by[el] = { qtyPc: Object.fromEntries(Object.entries(s.qty).map(([u, q]) => [u, q.div(yieldSum)])), costPcLoc: s.loc.div(yieldSum), costPcInr: s.inr.div(yieldSum), curr: s.curr, rows: s.rows };
      }
    }
    result.set(k, { werks: f.werks, matnr: f.matnr, orders: f.orderYield.size, yield: yieldSum, yieldUom: f.yieldUom, byElement: by });
  }
  return result;
}
