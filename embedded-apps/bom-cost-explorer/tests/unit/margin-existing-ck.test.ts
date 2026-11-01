import { describe, expect, it } from 'vitest';
import { isOlderEstimateMsg, partComps, stdCheck } from '@/lib/ck/view';
import { CK_COMP, CK_HEADER } from '@/lib/ck/fields';
import { normalizeRow } from '@/lib/price-context/odata';
import { CK_NULLABLE } from '@/lib/ck/fields';
import { headerSheet } from '@/lib/ck/export';
import type { CkCompRow, CkHeaderRow } from '@/lib/ck/types';

const comp = (p: Partial<CkCompRow> = {}): CkCompRow => ({ CompNo: '100', CompTxt: 'RM', Grp: 'RM', Seq: 1, Total: '10', SharePct: '50', Curr: 'INR', IsSum: false, IsMemo: false, ...p });

describe('Standard cost header: difference to the standard price', () => {
  it('no "Differs" block (note) without a message from SAP, however big the difference', () => {
    expect(stdCheck({ StdDiffPct: '11.17', Msg: '', PriceCtrl: 'S' }).state).toBe('plain');
    expect(stdCheck({ StdDiffPct: '11.17' }).state).toBe('plain');
  });
  it('price control V (moving average): never a green check and never a Differs block', () => {
    expect(stdCheck({ StdDiffPct: '11.17', Msg: 'The cost components do not reproduce the standard price', PriceCtrl: 'V' }).state).toBe('plain');
    expect(stdCheck({ StdDiffPct: '0.1', PriceCtrl: 'v' }).state).toBe('plain');
  });
  it('with SAP\'s message and a difference of 0.5 % or more: the amber note carries the message', () => {
    const c = stdCheck({ StdDiffPct: '2.5', Msg: 'Check CK_VALUE', PriceCtrl: 'S' });
    expect(c.state).toBe('note'); expect(c.msg).toBe('Check CK_VALUE');
  });
  it('the older-estimate message is a neutral note, never the explanation of a difference', () => {
    expect(isOlderEstimateMsg('An older estimate is shown: no released estimate in the last 30 days')).toBe(true);
    expect(isOlderEstimateMsg('Check CK_VALUE')).toBe(false);
    const c = stdCheck({ StdDiffPct: '3', Msg: 'An older estimate is shown', PriceCtrl: 'S' });
    expect(c.state).toBe('plain'); expect(c.msg).toBe('');
  });
  it('MapPrice, FixedUnit and VarUnit are read; a property SAP does not send reads as "" (n/a), not 0', () => {
    const h = normalizeRow<CkHeaderRow>({ Matnr: 'M', StdPrice: '37.96', MapPrice: '38.10', FixedUnit: 'PC', VarUnit: '' }, CK_HEADER, CK_NULLABLE.HEADER);
    expect(h.MapPrice).toBe('38.1'); expect(h.FixedUnit).toBe('PC');
    expect(normalizeRow<CkHeaderRow>({ Matnr: 'M' }, CK_HEADER, CK_NULLABLE.HEADER).MapPrice).toBe('');
  });
  it('the Excel header sheet says "Standard price", "Moving average price" and "Standard (last 30 days)"', () => {
    const h = normalizeRow<CkHeaderRow>({ Matnr: 'M', Curr: 'INR', StdPrice: '1', MapPrice: '2', CurStd: 'X' }, CK_HEADER, CK_NULLABLE.HEADER);
    const s = headerSheet(h);
    const label = (i: number) => String(s.cols[0].get(i));
    const all = Array.from({ length: s.count }, (_, i) => label(i));
    expect(all).toContain('Standard price (INR)'); expect(all).toContain('Moving average price (INR)'); expect(all).toContain('Standard (last 30 days)');
    expect(all.join('|')).not.toMatch(/Current standard|material master/);
  });
});

describe('Standard cost components: memo components', () => {
  it('memo components are left out of the share (the chart parts) but stay in the list', () => {
    const rows = [comp({ CompNo: 'A', Seq: 1 }), comp({ CompNo: 'M', Seq: 2, IsMemo: true }), comp({ CompNo: 'S', Seq: 3, IsSum: true, Grp: 'SUM' })];
    expect(partComps(rows).map((r) => r.CompNo)).toEqual(['A']);
  });
  it('IsMemo is a flag property of the component set; absent = not a memo', () => {
    expect(normalizeRow<CkCompRow>({ CompNo: '1', IsMemo: 'X' }, CK_COMP, CK_NULLABLE.COMP).IsMemo).toBe(true);
    expect(normalizeRow<CkCompRow>({ CompNo: '1' }, CK_COMP, CK_NULLABLE.COMP).IsMemo).toBe(false);
  });
});
