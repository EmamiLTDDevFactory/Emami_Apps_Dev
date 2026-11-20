import { describe, expect, it } from 'vitest';
import { bandsOf, brandSales, gmBand, gmBands, pvmSteps, salesTotals, salesViews, skuSales } from '@/lib/dash/logic';
import { buildSalesFilter } from '@/lib/dash/service';
import Decimal from 'decimal.js';
import type { SalesRow } from '@/lib/dash/types';

const row = (o: Partial<SalesRow> = {}): SalesRow => ({ Grain: 'S', Zbrand: '0011', Matnr: '400000095', Maktx: 'FG', Matkl: 'PK01', Vtweg: '10', VtwegTxt: 'General Trade-Urban', SoldQty: '100', Gsv: '1200', Deductions: '200', Nsv: '1000', CogmQty: '100', NsvCmp: '1000', Cogm: '700', CogmPc: '7', SkuCnt: 1, SkuNocogm: 0, Msg: '', ...o });

describe('Sales view logic', () => {
  it('margin = NSV - COGM over the lines that have a cost; per piece figures', () => {
    const [s] = salesViews([row()]);
    expect(s.gm.toString()).toBe('300');
    expect(s.gmPct?.toFixed(1)).toBe('30.0');
    expect(s.netRealPc?.toString()).toBe('10');
    expect(s.cogmPc?.toString()).toBe('7');
    expect(s.gmPc?.toString()).toBe('3');
    expect(s.band).toBe('good');
  });
  it('a line without actual cost keeps its sales but has no margin', () => {
    const [s] = salesViews([row({ CogmQty: '0', NsvCmp: '0', Cogm: '0', CogmPc: '0', SkuNocogm: 1 })]);
    expect(s.nsv.toString()).toBe('1000');
    expect(s.gmPct).toBeNull();
    expect(s.cogmPc).toBeNull();
    expect(s.band).toBe('none');
  });
  it('GM bands: below 18 red, below 22 amber, else good', () => {
    expect([17.9, 21.9, 22].map((v) => gmBand(new Decimal(v)))).toEqual(['red', 'amber', 'good']);
  });
  it('grains split and totals add the brand rows; margin on the costed NSV only', () => {
    const v = salesViews([row({ Grain: 'B' }), row({ Grain: 'B', Zbrand: '0001', Nsv: '500', NsvCmp: '0', Cogm: '0', CogmPc: '0', SkuNocogm: 1 }), row()]);
    expect(brandSales(v)).toHaveLength(2);
    expect(skuSales(v)).toHaveLength(1);
    const t = salesTotals(brandSales(v));
    expect(t.nsv.toString()).toBe('1500');
    expect(t.gm.toString()).toBe('300');
    expect(t.gmPct?.toFixed(1)).toBe('30.0');
  });
});

describe('Sales filter', () => {
  it('plants, to-date and from-date', () => {
    expect(buildSalesFilter(['em02'], '2026-04-01', '2026-11-18')).toBe("Werks eq 'EM02' and DateTo eq datetime'2026-11-18T00:00:00' and DateFrom eq datetime'2026-04-01T00:00:00'");
  });
  it('refuses a wrong order of dates', () => {
    expect(() => buildSalesFilter(['EM02'], '2026-12-01', '2026-11-18')).toThrow();
  });
});

import { breakupByBrand, breakupByFg } from '@/lib/dash/logic';
import type { WacRow } from '@/lib/wac/types';
const wac = (o: Partial<WacRow>): WacRow => ({ Rowid: 1, Matnr: 'A', Maktx: 'FG A', Werks: 'UN13', Mtart: 'FERT', Zbrand: '0011', Prodha: '', Zskugrcodecrs: '', Zskugroupcrs: '', Uom: 'PC', Docs: 1, Batches: 1, DupDocs: 0, Qty: '100', ActRm: '6', ActPm: '3', ActPerf: '1', ActMat: '10', ActConv: '2', ActLanded: '0', ActRecon: '0', VarpSel: '', VarpCmap: '', VarpCon: '', VarpAvg: '', FlagSel: '', FlagCmap: '', FlagCon: '', FlagAvg: '', Status: '', Msg: '', ...o });

describe('Cost breakup', () => {
  it('per FG: groups per piece, COGM = RM + PM + perfume + conversion, shares of the COGM; unproduced goods left out', () => {
    const v = breakupByFg([wac({}), wac({ Matnr: 'B', Qty: '0' })]);
    expect(v).toHaveLength(1);
    expect(v[0].cogm.toString()).toBe('12');
    expect(v[0].shareRm?.toFixed(1)).toBe('50.0');
    expect(v[0].shareConv?.toFixed(1)).toBe('16.7');
  });
  it('per brand: quantity weighted cost per piece', () => {
    const b = breakupByBrand(breakupByFg([wac({ Qty: '100', ActRm: '10' }), wac({ Matnr: 'B', Qty: '300', ActRm: '2' })]));
    expect(b).toHaveLength(1);
    expect(b[0].qty.toString()).toBe('400');
    expect(b[0].rm.toString()).toBe('4');            // (10x100 + 2x300) / 400
  });
});

describe('Alert bands by category and the PVM steps', () => {
  const thr = [{ Metric: 'GM', Category: '', RedPct: '18.00', AmberPct: '22.00', HighBad: '' }, { Metric: 'GM', Category: 'PK01', RedPct: '30.00', AmberPct: '35.00', HighBad: '' }, { Metric: 'CMRP', Category: '', RedPct: '1', AmberPct: '2', HighBad: 'X' }];
  it('a category with its own bands uses them, others use the blank-category default, none = the mock bands', () => {
    const b = gmBands(thr);
    expect(bandsOf(b, 'PK01')).toEqual({ red: 30, amber: 35 });
    expect(bandsOf(b, 'XX')).toEqual({ red: 18, amber: 22 });
    expect(bandsOf(gmBands([]), 'XX')).toEqual({ red: 18, amber: 22 });
  });
  it('the SKU alert follows the category bands (30 % margin is amber for PK01, green by default)', () => {
    const [own] = salesViews([row()], gmBands(thr));
    expect(own.band).toBe('amber');
    expect(salesViews([row()])[0].band).toBe('good');
  });
  it('bridge steps in SAP order, budget and actual margin marked as totals, the placeholder row dropped', () => {
    const s = pvmSteps([
      { Effect: 'Actual gross margin', SortNo: 6, Value: '1000', Msg: '' }, { Effect: 'Budget gross margin', SortNo: 1, Value: '1200', Msg: 'FY 2026' },
      { Effect: 'Price', SortNo: 2, Value: '-20', Msg: '' }, { Effect: 'No budget', SortNo: 0, Value: '0', Msg: 'none' },
    ]);
    expect(s.map((x) => x.effect)).toEqual(['Budget gross margin', 'Price', 'Actual gross margin']);
    expect(s.map((x) => x.total)).toEqual([true, false, true]);
  });
});
