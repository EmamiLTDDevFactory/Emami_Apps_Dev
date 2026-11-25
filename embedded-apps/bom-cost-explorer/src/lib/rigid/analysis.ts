/** Utilisation, budget breakup and alerts of a rigid item: pure functions over the rows SAP sent and the cockpit's own rate of the line. */
import Decimal from 'decimal.js';
import type { RigidRow } from './fields';
import { dd, strip0, type RigidCalc } from './model';

export interface BudgetBreakup {
  d: { gjahr: string; basic: Decimal; discount: Decimal; tax: Decimal; frgAmt: Decimal; freight: Decimal; landed: Decimal; total: Decimal; budqty: Decimal; priceUnit: Decimal; uom: string; curr: string; category: string; validFrom: string | null; validTo: string | null }[];
  p: { comp: string; compTxt: string; origin: string; rSap: Decimal; rUsed: Decimal; fUsed: Decimal; cbr: Decimal; cbud: Decimal; br: Decimal; varPct: Decimal; landedRate: Decimal; frtTotal: Decimal; curr: string; uom: string; flag: string; scenario: string; item: string }[];
}
export function parseBudget(rows: RigidRow[]): BudgetBreakup {
  return {
    d: rows.filter((r) => r.Grain === 'D').map((r) => ({ gjahr: r.Gjahr, basic: dd(r.Basic), discount: dd(r.DiscAmt), tax: dd(r.TaxAmt), frgAmt: dd(r.FrgAmt), freight: dd(r.Freight), landed: dd(r.Landed), total: dd(r.Total), budqty: dd(r.Budqty),
      priceUnit: dd(r.BomQty).gt(0) ? dd(r.BomQty) : new Decimal(1), uom: r.Meins, curr: r.Waers, category: r.Category, validFrom: r.ValidFrom, validTo: r.ValidTo })),
    p: rows.filter((r) => r.Grain === 'P').map((r) => ({ comp: strip0(r.Comp), compTxt: r.CompTxt, origin: r.Origin, rSap: dd(r.RSap), rUsed: dd(r.RUsed), fUsed: dd(r.FUsed), cbr: dd(r.Cbr), cbud: dd(r.Cbud), br: dd(r.Br), varPct: dd(r.VarPct),
      landedRate: dd(r.LandedRate), frtTotal: dd(r.FrtTotal), curr: r.Waers, uom: r.Meins, flag: r.Flag, scenario: r.Infnr, item: strip0(r.Matnr) })),
  };
}
/** Budget landed rate of the latest year per piece (the budget price is per price unit). */
export const budgetPerPiece = (b: BudgetBreakup): Decimal | null => (b.d.length && b.d[0].landed.gt(0) ? b.d[0].landed.div(b.d[0].priceUnit) : null);

export interface HistoryLine { validFrom: string | null; validTo: string | null; mould: string; lifnr: string; infnr: string; landed: Decimal; conv: Decimal; mat: Decimal; user: string; created: string | null }
/** One line per saved run, mould and month (the program saves one row per BOM line; the landed rate sits on the lines that carry it). */
export function parseHistory(rows: RigidRow[]): HistoryLine[] {
  const by = new Map<string, HistoryLine>();
  for (const r of rows.filter((x) => x.Grain === 'H')) {
    const k = `${r.ValidFrom}|${r.Mould}|${r.Lifnr}|${r.Infnr}`;
    const cur = by.get(k);
    const landed = dd(r.LandRate);
    if (!cur) by.set(k, { validFrom: r.ValidFrom, validTo: r.ValidTo, mould: strip0(r.Mould), lifnr: strip0(r.Lifnr), infnr: r.Infnr, landed, conv: dd(r.ConvCost), mat: dd(r.MatCost), user: r.Uname, created: r.CrtDate });
    else if (landed.gt(cur.landed)) { cur.landed = landed; cur.conv = dd(r.ConvCost); cur.mat = dd(r.MatCost); }
  }
  return [...by.values()].sort((a, b) => String(b.validFrom).localeCompare(String(a.validFrom)) || a.mould.localeCompare(b.mould));
}

export interface UtilLine { mould: string; vendor: string; outputDay: Decimal; efficiency: Decimal; cavities: Decimal; cycle: Decimal; budQty: Decimal | null; daysForBudget: Decimal | null; openPr: Decimal; asset: Decimal; depreciation: Decimal }
export function utilisation(c: RigidCalc, budQty: Decimal | null): UtilLine[] {
  return c.moulds.map((m) => {
    const out = dd(m.row.TotOut);
    return { mould: `${strip0(m.row.Mould)} ${m.row.MouldTxt}`.trim(), vendor: m.row.Vendor, outputDay: out, efficiency: dd(m.row.FacProd), cavities: dd(m.row.RunCavity), cycle: dd(m.row.CycTime), budQty, daysForBudget: budQty && out.gt(0) ? budQty.div(out) : null, openPr: dd(m.row.OpenPr), asset: dd(m.row.Kansw), depreciation: dd(m.row.Nafag) };
  });
}

export type Sev = 'high' | 'medium' | 'info';
export interface RigidAlert { sev: Sev; text: string }
const pctOf = (a: Decimal, b: Decimal) => (b.gt(0) ? a.minus(b).div(b).times(100) : null);
export function rigidAlerts(o: { calc: RigidCalc; budget: BudgetBreakup | null; history: HistoryLine[]; cockpitRatePc: Decimal | null; today?: string }): RigidAlert[] {
  const out: RigidAlert[] = [];
  const today = o.today ?? new Date().toISOString().slice(0, 10);
  for (const e of o.calc.errors) out.push({ sev: 'high', text: `${strip0(e.Mould) || strip0(e.Matnr)}: ${e.Msg || e.Flag}` });
  for (const m of o.calc.moulds) {
    const name = `${strip0(m.row.Mould)} / ${m.row.Vendor || strip0(m.row.Lifnr)}`;
    if (dd(m.row.CycTime).isZero()) out.push({ sev: 'high', text: `${name}: cycle time is 0, so the output per day and the conversion cost cannot be computed.` });
    const noRate = m.comps.filter((c) => dd(c.Zpbr).isZero());
    if (noRate.length) out.push({ sev: 'medium', text: `${name}: no polymer rate (ZPBR) for ${noRate.map((c) => strip0(c.Comp)).join(', ')}; their cost counts as 0.` });
    if (dd(m.row.Zmrt).isZero()) out.push({ sev: 'medium', text: `${name}: no machine-day rate (ZMRT) for the vendor and machine; conversion counts as 0.` });
    if (o.cockpitRatePc) {
      const d = pctOf(m.landed.div(1000), o.cockpitRatePc);
      if (d && d.abs().gte(5)) out.push({ sev: d.abs().gte(10) ? 'high' : 'medium', text: `${name}: the ZRIGID rate (${m.landed.div(1000).toFixed(4)} per piece) is ${d.gt(0) ? 'above' : 'below'} the rate used in this costing (${o.cockpitRatePc.toFixed(4)}) by ${d.abs().toFixed(1)} %.` });
    }
  }
  const last = o.history[0];
  if (last?.validTo && last.validTo < today) out.push({ sev: 'info', text: `The last rate saved by ZRIGID (${last.validFrom} to ${last.validTo}) has expired; the info record may need the current month.` });
  if (last && o.calc.moulds.length) {
    const d = pctOf(o.calc.moulds[0].landed, last.landed);
    if (d && d.abs().gte(5)) out.push({ sev: 'info', text: `The cheapest ZRIGID rate now (${o.calc.moulds[0].landed.toFixed(0)}) differs from the last saved one (${last.landed.toFixed(0)}) by ${d.toFixed(1)} %.` });
  }
  if (o.budget && budgetPerPiece(o.budget) && o.calc.moulds.length) {
    const b = budgetPerPiece(o.budget)!;
    const d = pctOf(o.calc.moulds[0].landed.div(1000), b);
    if (d && d.abs().gte(10)) out.push({ sev: 'medium', text: `The ZRIGID rate per piece (${o.calc.moulds[0].landed.div(1000).toFixed(4)}) is ${d.abs().toFixed(1)} % ${d.gt(0) ? 'above' : 'below'} the budget landed rate (${b.toFixed(4)}).` });
  }
  return out.sort((a, b) => ({ high: 0, medium: 1, info: 2 }[a.sev] - { high: 0, medium: 1, info: 2 }[b.sev]));
}
