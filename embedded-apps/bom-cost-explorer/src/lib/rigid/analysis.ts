/** Utilisation, budget breakup and alerts of a rigid item: pure functions over the rows SAP sent and the cockpit's own rate of the line. */
import Decimal from 'decimal.js';
import type { RigidRow } from './fields';
import { dd, strip0, type RigidCalc } from './model';

export interface BudgetBreakup {
  d: { gjahr: string; basic: Decimal; discount: Decimal; tax: Decimal; frgAmt: Decimal; freight: Decimal; landed: Decimal; total: Decimal; budqty: Decimal; priceUnit: Decimal; uom: string; curr: string; category: string; validFrom: string | null; validTo: string | null }[];
  /** Packing budget build-up of the latest scenario (ZPKG_BUD_ITEM), as on the packing budget screen: the item row and its cost-element rows. Rates are per price unit. */
  p: PkgItem[];
}
export interface PkgComp { comp: string; compTxt: string; pctSap: Decimal; pctUsed: Decimal; zbudSap: Decimal; zbudUsed: Decimal; baseRate: Decimal; budgeted: Decimal; flag: string }
export interface PkgItem { item: string; maktx: string; scenario: string; origin: string; zbudMatnr: string; rSap: Decimal; rUsed: Decimal; budgeted: Decimal; variance: Decimal; varPct: Decimal; frtTotal: Decimal; landedRate: Decimal;
  curr: string; priceUnit: Decimal; uom: string; flag: string; comps: PkgComp[]; pctTotal: Decimal; budSum: Decimal }
export function parseBudget(rows: RigidRow[]): BudgetBreakup {
  return {
    d: rows.filter((r) => r.Grain === 'D').map((r) => ({ gjahr: r.Gjahr, basic: dd(r.Basic), discount: dd(r.DiscAmt), tax: dd(r.TaxAmt), frgAmt: dd(r.FrgAmt), freight: dd(r.Freight), landed: dd(r.Landed), total: dd(r.Total), budqty: dd(r.Budqty),
      priceUnit: dd(r.BomQty).gt(0) ? dd(r.BomQty) : new Decimal(1), uom: r.Meins, curr: r.Waers, category: r.Category, validFrom: r.ValidFrom, validTo: r.ValidTo })),
    p: rows.filter((r) => r.Grain === 'P' && !r.Comp.trim()).map((r) => {   // a 'P' row with a component is the old (mislabelled) format: skipped
      const comps = rows.filter((c) => c.Grain === 'Q' && strip0(c.Matnr) === strip0(r.Matnr) && c.Werks === r.Werks && c.Infnr === r.Infnr)
        .map((c) => ({ comp: strip0(c.Comp), compTxt: c.CompTxt, pctSap: dd(c.DosPerc), pctUsed: dd(c.DosPerc), zbudSap: dd(c.DosPercS), zbudUsed: dd(c.FUsed), baseRate: dd(c.Cbr), budgeted: dd(c.Cbud), flag: c.Flag }));
      return { item: strip0(r.Matnr), maktx: r.CompTxt, scenario: r.Infnr, origin: r.Origin, zbudMatnr: strip0(r.Mould), rSap: dd(r.RSap), rUsed: dd(r.RUsed), budgeted: dd(r.Br), variance: dd(r.Total), varPct: dd(r.VarPct),
        frtTotal: dd(r.FrtTotal), landedRate: dd(r.LandedRate), curr: r.Waers, priceUnit: dd(r.BomQty).gt(0) ? dd(r.BomQty) : new Decimal(1), uom: r.Meins, flag: r.Flag, comps,
        pctTotal: comps.reduce((s, c) => s.plus(c.pctUsed), new Decimal(0)), budSum: comps.reduce((s, c) => s.plus(c.budgeted), new Decimal(0)) };
    }),
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

/**
 * The packing budget build-up applied to the rate SELECTED in this costing (excluding freight), with SAP's own formula (verified on NWP 26.11.2026,
 * 150010368 @ UN13: 2,787 x 55 % = 1,532.85; x (1 - 2.938 %) = 1,487.81; + 2,787 x 45 % = 1,254.15 -> 2,741.96 per 1,000):
 *   element base     = rate per price unit x element %          (rate per price unit = rate per piece x price unit)
 *   element budgeted = element base x (1 + ZBUD % / 100)
 *   budgeted         = sum of the elements; per piece = budgeted / price unit
 */
export interface RateBreakupLine { comp: string; compTxt: string; pct: Decimal; base: Decimal; zbud: Decimal; budgeted: Decimal; flag: string }
export interface RateBreakup { rate: Decimal; priceUnit: Decimal; lines: RateBreakupLine[]; pctTotal: Decimal; base: Decimal; budgeted: Decimal; budgetedPc: Decimal; change: Decimal; changePct: Decimal | null }
export function breakupOfRate(h: Pick<PkgItem, 'priceUnit' | 'comps'>, ratePc: Decimal): RateBreakup {
  const pu = h.priceUnit.gt(0) ? h.priceUnit : new Decimal(1);
  const rate = ratePc.times(pu);
  const lines = h.comps.map((c) => {
    const base = rate.times(c.pctUsed).div(100);
    return { comp: c.comp, compTxt: c.compTxt, pct: c.pctUsed, base, zbud: c.zbudUsed, budgeted: base.times(new Decimal(1).plus(c.zbudUsed.div(100))), flag: c.flag };
  });
  const sum = (f: (l: RateBreakupLine) => Decimal) => lines.reduce((s, l) => s.plus(f(l)), new Decimal(0));
  const budgeted = sum((l) => l.budgeted);
  const base = sum((l) => l.base);
  const change = budgeted.minus(rate);
  return { rate, priceUnit: pu, lines, pctTotal: sum((l) => l.pct), base, budgeted, budgetedPc: budgeted.div(pu), change, changePct: rate.gt(0) ? change.div(rate).times(100) : null };
}

/** Budget financial year (April - March) of a day: Nov 2026 -> 2026, Feb 2027 -> 2026. */
export const budgetYearOf = (day: Date = new Date()): string => String(day.getMonth() >= 3 ? day.getFullYear() : day.getFullYear() - 1);
/** Only the budget rates of the current budget year (newest validity first); none -> empty. */
export const currentYearRates = (b: BudgetBreakup, day: Date = new Date()) => b.d.filter((r) => r.gjahr === budgetYearOf(day));
