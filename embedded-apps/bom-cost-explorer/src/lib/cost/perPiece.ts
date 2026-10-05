/**
 * Cost per 1 piece of each header in each plant (INR), split RM / Perfume / PM / Other, SAP vs
 * simulated. Per piece = sum of leaf costs / header quantity (ExplQty x the simulated quantity
 * multiplier for the simulated side, so a pure quantity change leaves the per-piece cost flat).
 */
import type { CostLine } from '../sap/fields';
import { D, ZERO, type Decimal } from './decimal';
import { isLeafRow } from './tree';
import { CATEGORIES, costCategory, type CostCategory } from './categories';
import type { SimRow } from './simulate';

export type Breakup = Record<CostCategory | 'TOTAL', Decimal>;
const empty = (): Breakup => ({ RM: ZERO, PERFUME: ZERO, PM: ZERO, OTHER: ZERO, TOTAL: ZERO });

export interface HeaderPerPiece {
  key: string; // plant|header
  plant: string;
  head: string;
  text: string;
  base: Breakup; // SAP, per 1 pc
  sim: Breakup; // simulated, per 1 pc
  delta: Decimal; // sim - base (total per pc)
  deltaPct: Decimal | null;
}

export function perPiece(rows: CostLine[], sim: SimRow[], explQty: string, qtyMult = 1): HeaderPerPiece[] {
  const q = D(explQty);
  const qSim = q.times(qtyMult || 1);
  const m = new Map<string, { plant: string; head: string; text: string; base: Breakup; sim: Breakup }>();
  rows.forEach((r, i) => {
    if (!isLeafRow(r)) return;
    const key = `${r.Hwerks}|${r.Headmat}`;
    let h = m.get(key);
    if (!h) m.set(key, (h = { plant: r.Hwerks, head: r.Headmat, text: r.Headtxt, base: empty(), sim: empty() }));
    const c = costCategory(r);
    const b = D(r.TotCostInr);
    const s = sim[i]?.total ?? b;
    h.base[c] = h.base[c].plus(b);
    h.sim[c] = h.sim[c].plus(s);
  });
  const per = (x: Breakup, div: Decimal): Breakup => {
    const out = empty();
    for (const c of CATEGORIES) {
      out[c] = div.isZero() ? ZERO : x[c].div(div);
      out.TOTAL = out.TOTAL.plus(out[c]);
    }
    return out;
  };
  return Array.from(m.entries()).map(([key, h]) => {
    const base = per(h.base, q);
    const simB = per(h.sim, qSim);
    const delta = simB.TOTAL.minus(base.TOTAL);
    return { key, plant: h.plant, head: h.head, text: h.text, base, sim: simB, delta, deltaPct: base.TOTAL.isZero() ? null : delta.div(base.TOTAL).times(100) };
  });
}

/** Header x plant matrix of cost per piece (INR) for the cross-plant comparison. */
export function perPieceByPlant(items: HeaderPerPiece[]) {
  const plants = Array.from(new Set(items.map((i) => i.plant)));
  const heads = new Map<string, { head: string; text: string; cells: Record<string, HeaderPerPiece> }>();
  for (const i of items) {
    const h = heads.get(i.head) ?? { head: i.head, text: i.text, cells: {} };
    h.cells[i.plant] = i;
    heads.set(i.head, h);
  }
  return {
    plants,
    rows: Array.from(heads.values()).map((h) => {
      const costed = plants.filter((p) => h.cells[p] && h.cells[p].sim.TOTAL.gt(0));
      const cheapest = costed.length >= 2 ? costed.reduce((a, b) => (h.cells[b].sim.TOTAL.lt(h.cells[a].sim.TOTAL) ? b : a)) : null;
      return { ...h, cheapest };
    }),
  };
}

/** Component x plant rate lines for the component-rate simulator (leaf rows aggregated). */
export interface ComponentRate {
  key: string; // plant|component  (the compPct key)
  plant: string;
  comp: string;
  text: string;
  category: CostCategory;
  uom: string;
  ratePcInr: Decimal; // SAP selected rate per pc in INR (qty-weighted if it differs per line)
  qty: Decimal;
  rateCost: Decimal; // ratePcInr x qty summed (SAP)
  noRate: boolean;
}

export const compKey = (r: Pick<CostLine, 'Hwerks' | 'Idnrk'>) => `${r.Hwerks}|${r.Idnrk}`;

export function componentRates(rows: CostLine[]): ComponentRate[] {
  const m = new Map<string, ComponentRate>();
  for (const r of rows) {
    if (!isLeafRow(r)) continue;
    const key = compKey(r);
    const qty = D(r.ProdQty);
    const c = m.get(key) ?? { key, plant: r.Hwerks, comp: r.Idnrk, text: r.Maktx, category: costCategory(r), uom: r.Meins, ratePcInr: ZERO, qty: ZERO, rateCost: ZERO, noRate: true };
    c.qty = c.qty.plus(qty);
    c.rateCost = c.rateCost.plus(D(r.SelRatePcInr).times(qty));
    if (r.SelSource) c.noRate = false;
    m.set(key, c);
  }
  for (const c of m.values()) c.ratePcInr = c.qty.isZero() ? ZERO : c.rateCost.div(c.qty);
  return Array.from(m.values()).sort((a, b) => b.rateCost.cmp(a.rateCost));
}
