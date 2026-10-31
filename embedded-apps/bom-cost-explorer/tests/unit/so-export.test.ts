import { describe, expect, it } from 'vitest';
import { cogmSheet, filterListsSheet, pricesSheet, pricingSheet, procSheet, rulesSheet } from '@/lib/so/export';
import type { CogmRow, SoCondRow, SoFilterRow, SoPriceRow, SoPricingRow, SoProcRow } from '@/lib/so/types';

const price = (p: Partial<SoPriceRow> = {}): SoPriceRow => ({ Matnr: '=cmd|calc', Maktx: 'Oil', Vkorg: '1000', Vtweg: '10', Auart: 'ZOD1', AuartTxt: 'Domestic', Segment: 'DOM', SegTxt: 'Domestic', Kalsm: 'ZSDP01', KalsmTxt: 'Std', Curr: 'INR', Uom: 'PC', Werks: '', Mrp: '175.5', Sp: '149', NetPrice: '', SpCond: 'ZP12', Vbeln: '12345', Posnr: '10', Kunnr: '1000123', Audat: '2026-10-20', DaysOld: 11, NOrders: 4, NSkip: 1, Src: 'O', Msg: '', ...p });
const col = <T extends { cols: { header: string; get: (i: number) => string | number | null }[] }>(s: T, h: string, i = 0) => s.cols.find((c) => c.header === h)!.get(i);

describe('Excel sheets', () => {
  it('Prices: one row per price row, numbers as numbers, currency and unit as their own columns, n/a stays empty', () => {
    const s = pricesSheet([price(), price({ Mrp: '0', Sp: '0', NetPrice: '' })]);
    expect(s.name).toBe('Prices');
    expect(s.count).toBe(2);
    expect(col(s, 'MRP (per unit)')).toBe(175.5);
    expect(col(s, 'Selling price (per unit)')).toBe(149);
    expect(col(s, 'Net price (reference)')).toBeNull();
    expect(col(s, 'Currency')).toBe('INR');
    expect(col(s, 'Unit')).toBe('PC');
    expect(col(s, 'Segment')).toBe('DOM - Domestic');
    expect(col(s, 'Orders skipped')).toBe(1);
    expect(col(s, 'Pricing procedure')).toBe('ZSDP01 - Std');
  });
  it('Pricing: rate, per, value with currency; inactive / statistical / role flagged', () => {
    const l: SoPricingRow = { Vbeln: '12345', Posnr: '10', Matnr: 'M1', Vkorg: '1000', Vtweg: '10', Auart: 'ZOD1', Stunr: '010', Zaehk: '01', Kschl: 'ZP12', Txt: 'SP', Kbetr: '149', Kpein: '1', Kmein: 'PC', Kwert: '149', Waers: 'INR', Kstat: true, Kinak: false, Role: 'SP' };
    const s = pricingSheet([l]);
    expect(s.name).toBe('Pricing');
    expect(col(s, 'Value')).toBe(149);
    expect(col(s, 'Currency')).toBe('INR');
    expect(col(s, 'Statistical')).toBe('X');
    expect(col(s, 'Inactive')).toBe('');
    expect(col(s, 'Role (MRP / SP)')).toBe('SP');
  });
  it('Pricing procedure, Rules, Filter lists and Compare with cost', () => {
    const proc: SoProcRow = { Kalsm: 'P', KalsmTxt: 'Std', Stunr: '010', Zaehl: '000', Kschl: 'ZMRP', Txt: 'MRP', Role: 'MRP' };
    expect(col(procSheet([proc]), 'Role (MRP / SP)')).toBe('MRP');
    const c: SoCondRow = { Vkorg: '1000', Vtweg: '10', Auart: 'ZRET', Kalsm: 'P', OrgTxt: '', ChnTxt: '', KschlSp: 'ZP12', SpTxt: '', KschlMrp: 'ZMRP', MrpTxt: '', SpBasis: '', SpAbs: '', Fallback: '', Segment: 'DOM', SegTxt: '', Excl: true, Text: '', ChBy: 'ABC' };
    expect(col(rulesSheet([c]), 'Never counted')).toBe('X');
    const f: SoFilterRow = { Kind: 'AUART', Code: 'ZOD1', Txt: 'Domestic', NLines: 9, NOrders: 4, SharePct: '62.5', LastDate: '2026-10-20' };
    expect(col(filterListsSheet([f]), 'Share %')).toBe(62.5);
    const g = { Matnr: 'M1', Maktx: '', Werks: 'UN13', Market: '1000', Channel: '10/ZOD1', Curr: 'INR', SellUom: 'PC', Mrp: '175', SellPrice: '149', PriceFrom: '', PriceSrc: 'O', CogmStd: '60', CogmAct: '', CogmBud: '', CogmCur: '70', RatioStd: '0.40', RatioCur: '0.47', RemainStd: '89', RemainCur: '79', ErosionPct: '', AnnualImpactInr: '1200000', ReqSpRestore: '', Status: '', Msg: '' } as CogmRow;
    const cs = cogmSheet([g]);
    expect(col(cs, 'Ratio (current)')).toBe(0.47);
    expect(col(cs, 'Erosion %')).toBeNull();
    expect(col(cs, 'Amount remaining after manufacturing cost (current)')).toBe(79);
    expect(cs.cols.map((x) => x.header).join('|').toLowerCase()).not.toContain('profit');
  });
  it('an empty list gives an empty sheet', () => expect(pricesSheet([]).count).toBe(0));
});
