/**
 * Product cost broken into cost elements, per finished good (single FG costing, or every FG of a plan):
 *
 *   Material, from SAP's costing lines - each LEAF component by its own material type / group (lib/cost/categories):
 *     Raw Material  = ROH (any group but 106)    Perfume = ROH with material group 106    Pack Material = PKGN, VERP
 *     (anything else costed as a leaf: "Other material")      Total Material = Raw Material + Perfume + Pack Material (+ Other)
 *     quantity = the component quantity for the FG quantity; cost = the line's landed cost (TotCostLoc / TotCostInr)
 *   Conversion, from the process-order data set (new cost type, lib/costbreakup/procOrder):
 *     Labour, Power, Machine, Steam, Conversion Charge = actual quantity and cost per FG piece x the FG quantity
 *   Total Cost = Total Material + the conversion elements.
 *
 * Next to each element: the process-order actual per piece (material elements too), so simulated and actual compare.
 */
import { D, ZERO, type Decimal } from '../cost/decimal';
import { isLeafRow } from '../cost/tree';
import { costCategory } from '../cost/categories';
import { CONVERSION_ELEMENTS, MATERIAL_ELEMENTS, type Element, type FgActual, type QtyByUom } from './procOrder';

/** What the breakup needs from a cost line (BOM costing CostLine or plan PlanCostLine). */
export interface BreakupLine {
  Land1: string; Hwerks: string; Headmat: string; Headtxt: string; LocCurr: string; HasChild: string;
  Idnrk: string; Maktx: string; Mtart: string; Matkl: string; Meins: string; Werks: string;
  TotCostLoc: string; TotCostInr: string; SelRatePcInr: string; SelSource: string;
}

export interface ElementCell {
  qty: QtyByUom;
  loc: Decimal;
  inr: Decimal;
  /** process-order actual per FG piece (INR); null = no actual for this element */
  actualPcInr: Decimal | null;
  actualPcLoc: Decimal | null;
  /** where the simulated figure comes from */
  source: 'costing' | 'process orders' | 'none';
}

export interface FgBreakup {
  key: string; land1: string; hwerks: string; headmat: string; headtxt: string; curr: string;
  fgQty: Decimal;
  elements: Record<Element, ElementCell>;
  material: { loc: Decimal; inr: Decimal };
  conversion: { loc: Decimal; inr: Decimal };
  total: { loc: Decimal; inr: Decimal };
  actual: FgActual | null;
  /** leaf line indexes per material element (the drill-down) */
  lines: Record<Element, number[]>;
}

const emptyCell = (): ElementCell => ({ qty: {}, loc: ZERO, inr: ZERO, actualPcInr: null, actualPcLoc: null, source: 'none' });
const addQty = (q: QtyByUom, uom: string, v: Decimal) => { const u = uom || '-'; q[u] = (q[u] ?? ZERO).plus(v); };

/**
 * @param lines    leaf and parent cost lines (parents are skipped)
 * @param qtyOf    quantity of a line for the FG quantity (BOM costing: ProdQty; plan: QtyTot)
 * @param fgQtyOf  FG quantity for a header (BOM costing: the explosion quantity; plan: PlanQty)
 * @param actuals  Plant|FG -> process-order actual per piece (empty map = data set not available)
 */
export function buildBreakup<T extends BreakupLine>(lines: T[], qtyOf: (l: T) => Decimal, fgQtyOf: (l: T) => Decimal, actuals: Map<string, FgActual>): FgBreakup[] {
  const fgs = new Map<string, FgBreakup>();
  lines.forEach((l, i) => {
    if (!isLeafRow(l)) return;
    const key = `${l.Land1}|${l.Hwerks}|${l.Headmat}`;
    let f = fgs.get(key);
    if (!f) {
      const elements = Object.fromEntries([...MATERIAL_ELEMENTS, ...CONVERSION_ELEMENTS].map((e) => [e, emptyCell()])) as Record<Element, ElementCell>;
      const byLine = Object.fromEntries([...MATERIAL_ELEMENTS, ...CONVERSION_ELEMENTS].map((e) => [e, [] as number[]])) as Record<Element, number[]>;
      fgs.set(key, (f = { key, land1: l.Land1, hwerks: l.Hwerks, headmat: l.Headmat, headtxt: l.Headtxt, curr: l.LocCurr || 'INR', fgQty: fgQtyOf(l), elements, material: { loc: ZERO, inr: ZERO }, conversion: { loc: ZERO, inr: ZERO }, total: { loc: ZERO, inr: ZERO }, actual: actuals.get(`${l.Hwerks.toUpperCase()}|${l.Headmat}`) ?? null, lines: byLine }));
    }
    const el: Element = costCategory(l);
    const c = f.elements[el];
    addQty(c.qty, l.Meins, qtyOf(l));
    c.loc = c.loc.plus(D(l.TotCostLoc));
    c.inr = c.inr.plus(D(l.TotCostInr));
    c.source = 'costing';
    f.lines[el].push(i);
  });

  for (const f of fgs.values()) {
    const by = f.actual?.byElement ?? {};
    for (const el of MATERIAL_ELEMENTS) {
      const a = by[el];
      if (a) { f.elements[el].actualPcInr = a.costPcInr; f.elements[el].actualPcLoc = a.costPcLoc; }
      f.material.loc = f.material.loc.plus(f.elements[el].loc);
      f.material.inr = f.material.inr.plus(f.elements[el].inr);
    }
    for (const el of CONVERSION_ELEMENTS) {
      const a = by[el];
      if (!a) continue;
      const c = f.elements[el];
      c.qty = Object.fromEntries(Object.entries(a.qtyPc).map(([u, q]) => [u, q.times(f.fgQty)]));
      c.loc = a.costPcLoc.times(f.fgQty);
      c.inr = a.costPcInr.times(f.fgQty);
      c.actualPcInr = a.costPcInr;
      c.actualPcLoc = a.costPcLoc;
      c.source = 'process orders';
      f.conversion.loc = f.conversion.loc.plus(c.loc);
      f.conversion.inr = f.conversion.inr.plus(c.inr);
    }
    f.total = { loc: f.material.loc.plus(f.conversion.loc), inr: f.material.inr.plus(f.conversion.inr) };
  }
  return [...fgs.values()].sort((a, b) => a.land1.localeCompare(b.land1) || a.hwerks.localeCompare(b.hwerks) || a.headmat.localeCompare(b.headmat));
}

/** Sum over FGs (plan level). Quantities add per unit; local currency only when every FG has the same one. */
export function sumBreakups(list: FgBreakup[]): { elements: Record<Element, ElementCell>; material: { loc: Decimal | null; inr: Decimal }; conversion: { loc: Decimal | null; inr: Decimal }; total: { loc: Decimal | null; inr: Decimal }; curr: string | null; fgs: number } {
  const curr = list.length && list.every((f) => f.curr === list[0].curr) ? list[0].curr : null;
  const elements = Object.fromEntries([...MATERIAL_ELEMENTS, ...CONVERSION_ELEMENTS].map((e) => [e, emptyCell()])) as Record<Element, ElementCell>;
  let mi = ZERO, ml = ZERO, ci = ZERO, cl = ZERO;
  for (const f of list) {
    for (const el of [...MATERIAL_ELEMENTS, ...CONVERSION_ELEMENTS]) {
      const s = f.elements[el];
      const t = elements[el];
      for (const [u, q] of Object.entries(s.qty)) addQty(t.qty, u, q);
      t.loc = t.loc.plus(s.loc);
      t.inr = t.inr.plus(s.inr);
      if (s.source !== 'none') t.source = s.source;
    }
    mi = mi.plus(f.material.inr); ml = ml.plus(f.material.loc); ci = ci.plus(f.conversion.inr); cl = cl.plus(f.conversion.loc);
  }
  return { elements, material: { loc: curr ? ml : null, inr: mi }, conversion: { loc: curr ? cl : null, inr: ci }, total: { loc: curr ? ml.plus(cl) : null, inr: mi.plus(ci) }, curr, fgs: list.length };
}

/** "12.500 KG · 2,000 PC" */
export function qtyText(q: QtyByUom, fmt: (d: Decimal) => string): string {
  const parts = Object.entries(q).filter(([, v]) => !v.isZero()).map(([u, v]) => `${fmt(v)} ${u}`);
  return parts.length ? parts.join(' · ') : '—';
}
