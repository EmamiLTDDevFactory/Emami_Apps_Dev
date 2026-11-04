import { describe, expect, it } from 'vitest';
import { poLines, poLinesSheet, sortPoLines, breaches, DEFAULT_RULE, type Component } from '@/lib/freight/analysis';
import type { FreightRow } from '@/lib/sap/fields';

const comp = (material: string, plant = '1000'): Component => ({ key: `${plant}|${material}`, material, text: `${material} text`, plant, mtart: 'ROH' });
const row = (p: Partial<FreightRow>): FreightRow => ({
  RowId: 0, Bukrs: '', FgMatnr: '', Lifnr: '', Name1: '', Belnr: '', Xblnr: '', Ztmode: '', GstPart: '', PlcSup: '', Material: 'RM1', Matdesc: '', Plant: '1000', Conditiontype: 'ZFR1', Purchasedocument: '4500000001', Purchaseline: '00010', Podate: '2026-10-10', Baseunit: 'KG', Matuom: 'KG',
  Currency: 'INR', Localcurrency: 'INR', Actualdelvquantity: '100', Actualdelvcostamount: '120', ActRate: '1.2', Stddelvquantity: '100', Stddelvcostamount: '100', StdRate: '1', UsedSrc: 'ACTUAL',
  UsedRate: '1.2', UsedRatePc: '1.2', FxFactor: '1', UsedPcLoc: '1.2', FxInr: '1', UsedPcInr: '1.2', ...p,
}) as FreightRow;
const range = { from: '2026-08-01', to: '2026-10-31' };

describe('purchase order wise lines', () => {
  it('one row per PO line with the per-unit figures of the component rows', () => {
    const r = poLines([comp('RM1')], [row({}), row({ Purchasedocument: '4500000002', Podate: '2026-09-01', Actualdelvcostamount: '80' })], range);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ po: '4500000001', line: '00010', poDate: '2026-10-10', cond: 'ZFR1', material: 'RM1', plant: '1000' }); // newest first
    expect(r[0].actual!.toFixed(4)).toBe('1.2000');
    expect(r[0].standard!.toFixed(4)).toBe('1.0000');
    expect(r[0].variance!.toFixed(4)).toBe('0.2000');
    expect(r[0].variancePct!.toFixed(2)).toBe('20.00');
    expect(r[1].actual!.toFixed(4)).toBe('0.8000');
    expect(r[1].variancePct!.toFixed(2)).toBe('-20.00');
  });
  it('INR: the amount is multiplied by FxInr', () => {
    const r = poLines([comp('RM1')], [row({ Currency: 'BDT', FxInr: '0.7', Actualdelvcostamount: '200', Stddelvcostamount: '100' })], range);
    expect(r[0].actualAmount.toFixed(2)).toBe('140.00');
    expect(r[0].actual!.toFixed(4)).toBe('1.4000');
    expect(r[0].standard!.toFixed(4)).toBe('0.7000');
  });
  it('leaves out EXCLUDED lines, lines outside the range, and materials that are not components', () => {
    const r = poLines([comp('RM1')], [row({ UsedSrc: 'EXCLUDED' }), row({ Podate: '2026-07-31' }), row({ Podate: '2026-11-01' }), row({ Material: 'OTHER' }), row({ Plant: '2000' }), row({})], range);
    expect(r).toHaveLength(1);
  });
  it('a line with no actual delivery has no actual figure and is never an alert', () => {
    const r = poLines([comp('RM1')], [row({ Actualdelvquantity: '0', Actualdelvcostamount: '0', UsedSrc: 'STANDARD' })], range);
    expect(r[0].actual).toBeNull();
    expect(r[0].variance).toBeNull();
    expect(breaches(r[0], DEFAULT_RULE)).toBe(false);
    expect(r[0].src).toBe('STANDARD');
  });
  it('the alert rule applies per line; alerts sort first', () => {
    const lines = poLines([comp('RM1')], [row({ Purchasedocument: '1', Podate: '2026-10-20', Actualdelvcostamount: '101' }), row({ Purchasedocument: '2', Podate: '2026-10-01', Actualdelvcostamount: '150' })], range);
    const sorted = sortPoLines(lines, { kind: 'pct_above', threshold: '10' });
    expect(sorted.map((x) => x.po)).toEqual(['2', '1']); // 50 % breaches, 1 % does not, although PO 1 is newer
    expect(breaches(sorted[0], { kind: 'pct_above', threshold: '10' })).toBe(true);
    expect(breaches(sorted[1], { kind: 'pct_above', threshold: '10' })).toBe(false);
  });
  it('the export has the PO number, line and date, and an alert column', () => {
    const lines = poLines([comp('RM1')], [row({})], range);
    const sheet = poLinesSheet(lines, DEFAULT_RULE);
    expect(sheet.count).toBe(1);
    const heads = sheet.cols.map((c) => c.header);
    expect(heads).toEqual(expect.arrayContaining(['Purchase order', 'PO line', 'PO date', 'Freight condition', 'Actual freight / unit (INR)']));
    expect(sheet.cols.find((c) => c.header === 'Purchase order')!.get(0)).toBe('4500000001');
    expect(String(sheet.cols[sheet.cols.length - 1].get(0))).toBe('ALERT'); // 20 % over, default rule is 10 %
  });
});

describe('PO lines the date range hides', () => {
  const nine = [
    ['6500663150', '2026-09-08'], ['6500658722', '2026-08-08'], ['6500658721', '2026-08-08'], ['6500658462', '2026-08-06'], ['5500597655', '2026-07-29'],
    ['6500651908', '2026-06-22'], ['6500651314', '2026-06-18'], ['6500649691', '2026-06-06'], ['6500647567', '2026-05-22'],
  ].map(([po, d]) => row({ Purchasedocument: po, Podate: d, Material: 'RM1' }));
  it('9 PO lines from SAP, 3 inside 7 Aug to 4 Nov: the other 6 are counted as hidden (the case seen on www)', async () => {
    const { linesOutsideRange } = await import('@/lib/freight/analysis');
    const r = linesOutsideRange([comp('RM1')], nine, { from: '2026-08-07', to: '2026-11-04' });
    expect(r).toMatchObject({ returned: 9, inRange: 3, outside: 6, earliest: '2026-05-22', latest: '2026-09-08' });
    expect(poLines([comp('RM1')], nine, { from: '2026-08-07', to: '2026-11-04' })).toHaveLength(3);
  });
  it('all dates shows every line', async () => {
    const { ALL_DATES } = await import('@/lib/freight/analysis');
    expect(poLines([comp('RM1')], nine, ALL_DATES)).toHaveLength(9);
  });
  it('a wide enough range hides nothing', async () => {
    const { linesOutsideRange } = await import('@/lib/freight/analysis');
    expect(linesOutsideRange([comp('RM1')], nine, { from: '2026-01-01', to: '2026-12-31' }).outside).toBe(0);
  });
});
