import { describe, expect, it } from 'vitest';
import { optionCalc, qtyPerFgPiece, rateCalc, type PlanLine } from '@/lib/plan/rateDetail';
import type { RateRow } from '@/lib/sap/fields';
import type { RateOptionRow } from '@/lib/rates/fields';

// RateRowSet Mode R for 151029143 @ UN13, live NWP 26.11.2026 (Consumption repeated 4x by SAP)
const rec = (p: Partial<RateRow>): RateRow => ({ RowId: 0, Recordsource: 'INFOREC', Material: '151029143', Matdesc: '', Plant: 'UN13', Vendor: '', Vendorname: '', Inforecord: '', Purchasedocument: '', Conditiontype: 'ZBAS', Validfrom: '2026-11-01', Validto: '2027-03-31', Currency: 'INR', Pricingunit: '1', Conditionunit: 'PC', Baseuom: 'PC', Localcurrency: 'INR', Rate: '0', RateUnit: '0', RatePc: '0', Ratelocal: '0', RateUnitLoc: '0', RatePcLoc: '0', FxFactor: '1', FxInr: '1', RateUnitInr: '0', RatePcInr: '0', ...p });
const cons = rec({ Recordsource: 'CONSUMP', Conditiontype: 'CONS', Rate: '1.450', RateUnit: '1.450', RateUnitInr: '1.450', Validfrom: '2026-11-21', Validto: '2026-11-21' });
const rows = [cons, cons, cons, cons,
  rec({ Vendor: '8991', Vendorname: 'ABDOS LAMITUBES', Inforecord: '5300183716', Rate: '1.460', RateUnit: '1.460', RateUnitInr: '1.460' }),
  rec({ Vendor: '6760', Vendorname: 'EPL LIMITED', Inforecord: '5300152913', Rate: '1.570', RateUnit: '1.570', RateUnitInr: '1.570' }),
  rec({ Vendor: '6605', Vendorname: 'UNITED ENGINEERS', Inforecord: '5300152917', Rate: '1.340', RateUnit: '1.340', RateUnitInr: '1.340' }),
  rec({ Recordsource: 'MBEW', Conditiontype: 'V', Rate: '1.450', RateUnit: '1.450', RateUnitInr: '1.450' }),
  // a USD record priced per 1,000 KG on a G base unit, to test the conversion steps
  rec({ Recordsource: 'CONTRACT', Vendor: '9', Vendorname: 'X', Currency: 'USD', Rate: '2000', Pricingunit: '1000', Conditionunit: 'KG', Baseuom: 'G', RateUnit: '0.002', FxInr: '84', RateUnitInr: '0.168' }),
];
const line = { Idnrk: '151029143', Werks: 'UN13', Hwerks: 'UN13', Headmat: '400016966', Seqnr: 7, Meins: 'PC', SelSource: 'INFOREC', SelVendor: '0000008991', SelRatePcInr: '1.46', FrtPcInr: '0.02', FrtSrc: 'STD', TotCostPcInr: '1.48', QtyTot: '1012000', PlanQty: '1000000', TotCostInr: '1497760' } as unknown as PlanLine;

describe('plan component: every rate source with its calculation', () => {
  const c = rateCalc(line, rows);
  it('qty per FG piece = plan quantity / FG planned quantity', () => {
    expect(qtyPerFgPiece(line)!.toFixed(3)).toBe('1.012');
    expect(qtyPerFgPiece({ QtyTot: '5', PlanQty: '0' } as never)).toBeNull();
  });
  it('one row per distinct record; SAP\'s selection matched on source and vendor', () => {
    expect(c.rows).toHaveLength(6); // Consumption shown once
    expect(c.selected!.vendor).toBe('8991');
    expect(c.rows[0].selected).toBe(true);
  });
  it('selected: landed = INR rate + freight; per FG piece and per 1,000; plan cost = the line; no gap', () => {
    const s = c.selected!;
    expect(s.landedInr.toFixed(4)).toBe('1.4800');
    expect(s.perFg!.toFixed(6)).toBe('1.497760');
    expect(s.perFg!.times(1000).toFixed(2)).toBe('1497.76');
    expect(s.planCost.toFixed(2)).toBe('1497760.00');
    expect(c.check!.isZero()).toBe(true);
  });
  it('Consumption and C-MAP never get freight added; others do; difference vs selected on the plan', () => {
    const cn = c.rows.find((r) => r.source === 'CONSUMP')!;
    expect(cn.freightInr.isZero()).toBe(true);
    expect(cn.freightIncluded).toBe(true);
    expect(cn.diffPlan.toFixed(0)).toBe('-30360'); // (1.45 - 1.48) x 1,012,000
    const ue = c.rows.find((r) => r.vendor === '6605')!;
    expect(ue.landedInr.toFixed(2)).toBe('1.36');
  });
  it('conversion steps: price per pricing unit -> condition unit -> base unit -> INR', () => {
    const k = c.rows.find((r) => r.source === 'CONTRACT')!;
    expect(k.perCondUnit.toFixed(2)).toBe('2.00'); // USD per KG
    expect(k.convFactor!.toFixed(4)).toBe('0.0010'); // KG -> G
    expect(k.perUnitInr.toFixed(3)).toBe('0.168');
  });
  it('rate options of the costing: same freight rule, per FG piece', () => {
    const o = optionCalc(line, [{ Source: 'MBEW', RatePcInr: '1.45', Rate: '1.45', Curr: 'INR', FxInr: '1', Plant: 'UN13', Cond: 'V' } as RateOptionRow, { Source: 'INFOREC', RatePcInr: '1.46', Rate: '1.46', Curr: 'INR', FxInr: '1', Plant: 'UN13', Cond: 'ZBAS' } as RateOptionRow]);
    expect(o[0].selected).toBe(true);
    expect(o[0].landedInr.toFixed(2)).toBe('1.48');
    expect(o[1].freightInr.isZero()).toBe(true);
    expect(o[1].perFg!.toFixed(4)).toBe('1.4674');
  });
});
