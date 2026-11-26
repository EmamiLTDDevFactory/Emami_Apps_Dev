/**
 * Production Plan > Breakup > one component: every rate source SAP has for it, with the calculation from SAP's price to the plan cost.
 *
 *   price in SAP            Rate (Currency) per Pricingunit Conditionunit                       RateRowSet (Mode R), every record of the component
 *   per condition unit      Rate / Pricingunit
 *   per base unit           RateUnit (SAP converts condition unit -> base unit)                  factor = RateUnit / (Rate / Pricingunit)
 *   INR per base unit       RateUnitInr = RateUnit x FxInr
 *   + freight per unit      the component's freight (FrtPcInr as SAP sent it), NOT added on Consumption / C-MAP (they include it)
 *   = landed per unit       what the costing uses as cost per unit (TotCostPcInr for the selected source)
 *   x qty per FG piece      QtyTot / PlanQty (component quantity in the plan / FG planned quantity)
 *   = per FG piece          (x 1,000 for per 1,000 pieces)
 *   x plan quantity         QtyTot -> plan cost (TotCostInr for the selected source)
 *
 * SAP picks the source; nothing here changes the costing. Rows SAP repeats identically (Consumption per movement) are shown once.
 */
import { D, type Decimal } from '../cost/decimal';
import { sourceFreightInr, type FreightTagged } from '../cost/freightIncluded';
import type { RateRow } from '../sap/fields';
import type { RateOptionRow } from '../rates/fields';
import type { PlanCostLine } from './fields';

export type PlanLine = PlanCostLine & FreightTagged;

export interface CalcRow {
  key: string;
  source: string;
  vendor: string;
  vendorName: string;
  doc: string;
  cond: string;
  validFrom: string | null;
  validTo: string | null;
  currency: string;
  /** SAP price per pricing unit, in its currency */
  rate: Decimal;
  pricingUnit: Decimal;
  condUnit: string;
  baseUom: string;
  /** rate per condition unit (rate / pricing unit) */
  perCondUnit: Decimal;
  /** condition unit -> base unit factor (null when SAP gives no rate) */
  convFactor: Decimal | null;
  /** per base unit, document currency */
  perUnit: Decimal;
  fxInr: Decimal;
  perUnitInr: Decimal;
  freightInr: Decimal;
  freightIncluded: boolean;
  landedInr: Decimal;
  qtyPerFg: Decimal | null;
  /** per 1 FG piece */
  perFg: Decimal | null;
  planCost: Decimal;
  /** vs the source SAP selected, on the plan */
  diffPlan: Decimal;
  selected: boolean;
}

export interface CalcResult {
  rows: CalcRow[];
  qtyPerFg: Decimal | null;
  planQty: Decimal;
  compQty: Decimal;
  selected: CalcRow | null;
  /** the selected source's landed per unit vs the line's TotCostPcInr (should be ~0) */
  check: Decimal | null;
}

const tx = (v: string | null | undefined) => String(v ?? '').trim();
const strip = (v: string) => tx(v).replace(/^0+/, '');

/** Component quantity per FG piece: QtyTot / PlanQty (null without a planned quantity). */
export const qtyPerFgPiece = (l: Pick<PlanCostLine, 'QtyTot' | 'PlanQty'>): Decimal | null => (D(l.PlanQty).gt(0) ? D(l.QtyTot).div(D(l.PlanQty)) : null);

export function rateCalc(l: PlanLine, records: RateRow[]): CalcResult {
  const qtyPerFg = qtyPerFgPiece(l);
  const compQty = D(l.QtyTot);
  const seen = new Set<string>();
  const raw: Omit<CalcRow, 'diffPlan' | 'selected'>[] = [];
  for (const r of records) {
    const sig = [r.Recordsource, r.Vendor, r.Inforecord, r.Purchasedocument, r.Conditiontype, r.Validfrom, r.Validto, r.Rate, r.Pricingunit, r.Conditionunit, r.RateUnitInr].join('|');
    if (seen.has(sig)) continue;
    seen.add(sig);
    const rate = D(r.Rate);
    const pu = D(r.Pricingunit).gt(0) ? D(r.Pricingunit) : D(1);
    const perCondUnit = rate.div(pu);
    const perUnit = D(r.RateUnit);
    const fxInr = D(r.FxInr).gt(0) ? D(r.FxInr) : D(1);
    const perUnitInr = D(r.RateUnitInr).gt(0) || perUnit.isZero() ? D(r.RateUnitInr) : perUnit.times(fxInr);
    const source = tx(r.Recordsource).toUpperCase();
    const freightInr = sourceFreightInr(source, l);
    const landedInr = perUnitInr.plus(freightInr);
    raw.push({
      key: sig, source, vendor: strip(r.Vendor), vendorName: tx(r.Vendorname), doc: tx(r.Inforecord) || tx(r.Purchasedocument), cond: tx(r.Conditiontype),
      validFrom: r.Validfrom, validTo: r.Validto, currency: tx(r.Currency), rate, pricingUnit: pu, condUnit: tx(r.Conditionunit), baseUom: tx(r.Baseuom),
      perCondUnit, convFactor: perCondUnit.isZero() ? null : perUnit.div(perCondUnit), perUnit, fxInr, perUnitInr, freightInr,
      freightIncluded: freightInr.isZero() && !D(l.FrtPcInrSap ?? l.FrtPcInr).isZero(), landedInr,
      qtyPerFg, perFg: qtyPerFg ? landedInr.times(qtyPerFg) : null, planCost: landedInr.times(compQty),
    });
  }
  const selSrc = tx(l.SelSource).toUpperCase();
  const selVendor = strip(l.SelVendor);
  const selRate = D(l.SelRatePcInr);
  // SAP's choice: same source (and vendor when SAP names one); among several, the one whose INR rate is SAP's
  const cands = raw.filter((r) => r.source === selSrc && (!selVendor || r.vendor === selVendor));
  const pick = cands.length > 1 ? cands.reduce((b, r) => (r.perUnitInr.minus(selRate).abs().lt(b.perUnitInr.minus(selRate).abs()) ? r : b)) : cands[0];
  const base = D(l.TotCostInr);
  const rows: CalcRow[] = raw.map((r) => ({ ...r, selected: r === pick, diffPlan: r.planCost.minus(base) }));
  rows.sort((a, b) => Number(b.selected) - Number(a.selected) || a.landedInr.comparedTo(b.landedInr));
  const selected = rows.find((r) => r.selected) ?? null;
  return { rows, qtyPerFg, planQty: D(l.PlanQty), compQty, selected, check: selected ? selected.landedInr.minus(D(l.TotCostPcInr)) : null };
}

/** The costing's own options for the line (RateOptionSet), per component unit and on the plan; per FG piece with the line's quantity. */
export interface OptionCalc { o: RateOptionRow; perUnitInr: Decimal; freightInr: Decimal; landedInr: Decimal; perFg: Decimal | null; planCost: Decimal; selected: boolean }
export function optionCalc(l: PlanLine, options: RateOptionRow[]): OptionCalc[] {
  const q = qtyPerFgPiece(l);
  const selSrc = tx(l.SelSource).toUpperCase();
  return options.map((o) => {
    const perUnitInr = D(o.RatePcInr);
    const freightInr = sourceFreightInr(tx(o.Source).toUpperCase(), l);
    const landedInr = perUnitInr.plus(freightInr);
    return { o, perUnitInr, freightInr, landedInr, perFg: q ? landedInr.times(q) : null, planCost: landedInr.times(D(l.QtyTot)), selected: tx(o.Source).toUpperCase() === selSrc };
  }).sort((a, b) => Number(b.selected) - Number(a.selected) || a.landedInr.comparedTo(b.landedInr));
}

