import { describe, expect, it } from 'vitest';
import { actionBody, generateBody, historyFilter, patchBody, rateFilter, rateKeyPath } from '@/lib/budgetMgmt/api';
import { csvList, dateText, defaultHistWindow, fiscalYear, isEditable, padMatnr, showDate, stripZeros, toSapDate, validateAction, validateEdit, validateHistory, groupHistory, filterHistory, latestSourceRate, projectedValue, sortByCountryTotal, adjustRate, budgetedBasic, landedRate, validateEdit as validateEdit2, srcCode, freightApplies, pickByPriority, marketRate, DEFAULT_B_PRIORITY } from '@/lib/budgetMgmt/rules';

const hist = { land1: 'IN', gjahr: '2026', histFrom: '2025-04-01', histTo: '2026-03-31', catAFrom: '8,000,000', catBFrom: '4,000,000' };

describe('budget rate management rules', () => {
  it('formats dates and material numbers', () => {
    expect(showDate('20260401')).toBe('01.04.2026');
    expect(toSapDate('2026-04-01')).toBe('20260401');
    expect(dateText('/Date(1775001600000)/')).toBe('20260401');
    expect(padMatnr('10000001')).toBe('000000000010000001');
    expect(padMatnr('abc')).toBe('ABC');
    expect(stripZeros('000000000010000001')).toBe('10000001');
    expect(csvList('a, b  a;c')).toEqual(['A', 'B', 'C']);
  });
  it('fiscal year starts in April; history window is the year before', () => {
    expect(fiscalYear(new Date(2026, 3, 1))).toBe('2026');
    expect(fiscalYear(new Date(2026, 2, 31))).toBe('2025');
    expect(defaultHistWindow('2026')).toEqual({ from: '2025-04-01', to: '2026-03-31' });
  });
  it('builds the history, rate and source filters', () => {
    expect(historyFilter(hist)).toBe("Land1 eq 'IN' and Gjahr eq '2026' and HistFrom eq datetime'2025-04-01T00:00:00' and HistTo eq datetime'2026-03-31T00:00:00' and CatAFrom eq 8000000m and CatBFrom eq 4000000m");
    expect(historyFilter({ ...hist, mtart: ['PKGN'] })).toBe(historyFilter(hist) + " and Mtart eq 'PKGN'");
    expect(historyFilter({ ...hist, mtart: ['PKGN', 'VERP', 'PKGN'] })).toBe(historyFilter(hist) + " and (Mtart eq 'PKGN' or Mtart eq 'VERP')");
    expect(historyFilter({ ...hist, mtart: [] })).toBe(historyFilter(hist));
    expect(rateFilter({ gjahr: '2026', land1: 'IN', status: 'D' })).toBe("Gjahr eq '2026' and Land1 eq 'IN' and ApprStatus eq 'D'");
    expect(rateFilter({ gjahr: '2026', land1: 'IN', status: '', matnr: ['1', '2'], werks: ['1000'] })).toBe("Gjahr eq '2026' and Land1 eq 'IN' and (Matnr eq '000000000000000001' or Matnr eq '000000000000000002') and Werks eq '1000'");
  });
  it('validates the history filter', () => {
    expect(validateHistory(hist)).toEqual({});
    expect(validateHistory({ ...hist, gjahr: '26' }).gjahr).toBeTruthy();
    expect(validateHistory({ ...hist, histFrom: '2026-03-31' }).histFrom).toBeTruthy();
    expect(validateHistory({ ...hist, catAFrom: '3,000,000' }).catAFrom).toBeTruthy();
  });
  it('validates the edit row', () => {
    expect(validateEdit({ adjType: 'N', adjValue: '', overrideRate: '', overrideRsn: '' })).toEqual({});
    expect(validateEdit({ adjType: 'P', adjValue: '', overrideRate: '', overrideRsn: '' }).adjValue).toBeTruthy();
    expect(validateEdit({ adjType: 'P', adjValue: '1000', overrideRate: '', overrideRsn: '' }).adjValue).toBeTruthy();
    expect(validateEdit({ adjType: 'P', adjValue: '-5', overrideRate: '', overrideRsn: '' })).toEqual({});
    expect(validateEdit({ adjType: 'A', adjValue: '-12.5', overrideRate: '', overrideRsn: '' })).toEqual({});
    expect(validateEdit({ adjType: 'N', adjValue: '', overrideRate: '10', overrideRsn: '' }).overrideRsn).toBeTruthy();
    expect(validateEdit({ adjType: 'N', adjValue: '', overrideRate: '0', overrideRsn: 'x' }).overrideRate).toBeTruthy();
    expect(validateEdit({ adjType: 'N', adjValue: '', overrideRate: '10', overrideRsn: 'x' })).toEqual({});
  });
  it('validates the action panel', () => {
    const p = { action: 'APPROVE' as const, gjahr: '2026', land1: 'IN', matnrCsv: '', werksCsv: '', reason: '', email: 'a@b.com' };
    expect(validateAction(p)).toEqual({});
    expect(validateAction({ ...p, email: '' }).email).toBeTruthy();
    expect(validateAction({ ...p, email: 'nope' }).email).toBeTruthy();
    expect(validateAction({ ...p, action: 'REJECT' }).reason).toBeTruthy();
    expect(validateAction({ ...p, action: 'REJECT', reason: 'bad' })).toEqual({});
  });
  it('builds the write bodies and the row key', () => {
    expect(rateKeyPath({ Gjahr: '2026', Land1: 'IN', Matnr: '10000001', Werks: '1000', ValidFrom: '20260401' })).toBe("BudRateSet(Gjahr='2026',Land1='IN',Matnr='000000000010000001',Werks='1000',ValidFrom='20260401')");
    expect(patchBody({ adjType: 'P', adjValue: '5', overrideRate: '', overrideRsn: 'ignored' })).toEqual({ AdjType: 'P', AdjValue: '5', OverrideRate: '0', OverrideRsn: '' });
    expect(patchBody({ adjType: 'N', adjValue: '9', overrideRate: '1,250.5', overrideRsn: ' why ' })).toEqual({ AdjType: 'N', AdjValue: '0', OverrideRate: '1250.5', OverrideRsn: 'why' });
    expect(actionBody({ action: 'SUBMIT', gjahr: '2026', land1: 'IN', matnrCsv: '', werksCsv: '1000', reason: 'x', email: ' A@B.com ' })).toEqual({ Action: 'SUBMIT', Gjahr: '2026', Land1: 'IN', MatnrCsv: '', WerksCsv: '1000', Reason: '', Email: 'a@b.com' });
  });
  it('only draft and revised rates are editable', () => {
    expect(['D', 'V'].every(isEditable)).toBe(true);
    expect(['S', 'A', 'R'].some(isEditable)).toBe(false);
  });
});

describe('history at material + country level', () => {
  const row = (o: Record<string, unknown>) => ({ Rowid: '1', Matnr: '151029248', Maktx: 'M', Land1: 'IN', Werks: 'UN13', Mtart: 'PKGN', BaseUom: 'PC', NetQty: 0, NetValue: 0, Currency: 'INR', AvgRate: 0, CtryValue: 2971.46, Matcat: 'C', ...o }) as never;
  it('sums the plants of one material and country; country total and category are taken, not added', () => {
    const [g, ...rest] = groupHistory([row({ Werks: 'UN13', NetValue: -22.9, NetQty: 10 }), row({ Werks: 'UN02', NetValue: 2994.36, NetQty: 30 })]);
    expect(rest).toHaveLength(0);
    expect(g.NetValue).toBeCloseTo(2971.46, 6); expect(g.NetQty).toBe(40); expect(g.AvgRate).toBeCloseTo(2971.46 / 40, 6);
    expect(g.CtryValue).toBe(2971.46); expect(g.Matcat).toBe('C'); expect(g.plants.map((p) => p.Werks)).toEqual(['UN02', 'UN13']);
  });
  it('keeps different materials and countries apart; zero quantity gives a zero rate', () => {
    const g = groupHistory([row({}), row({ Matnr: '2' }), row({ Land1: 'LK' })]);
    expect(g).toHaveLength(3); expect(g[0].AvgRate).toBe(0);
  });
  it('a mixed unit or currency across the plants is left blank', () => {
    const [g] = groupHistory([row({ BaseUom: 'PC' }), row({ Werks: 'X', BaseUom: 'KG', Currency: 'USD' })]);
    expect(g.BaseUom).toBe(''); expect(g.Currency).toBe('');
  });
});

describe('history filter on material and category', () => {
  const r = (Matnr: string, Maktx: string, Matcat: string) => ({ Rowid: '1', Matnr, Maktx, Land1: 'IN', Werks: 'P1', Mtart: 'PKGN', BaseUom: 'PC', NetQty: 1, NetValue: 1, Currency: 'INR', AvgRate: 1, CtryValue: 1, Matcat }) as never;
  const g = groupHistory([r('000000000151000001', 'Cap blue', 'A'), r('000000000151000002', 'Carton white', 'B'), r('000000000151000003', 'Label', 'C')]);
  it('no filter shows everything', () => { expect(filterHistory(g, '', [])).toHaveLength(3); });
  it('material: number (with or without leading zeros) or description, several allowed', () => {
    expect(filterHistory(g, '151000002', []).map((x) => x.Matnr)).toEqual(['000000000151000002']);
    expect(filterHistory(g, 'CAP', [])).toHaveLength(1);
    expect(filterHistory(g, '151000001, label', [])).toHaveLength(2);
  });
  it('category: any of the chosen; combines with the material filter', () => {
    expect(filterHistory(g, '', ['A', 'C'])).toHaveLength(2);
    expect(filterHistory(g, 'ca', ['B']).map((x) => x.Maktx)).toEqual(['Carton white']);
    expect(filterHistory(g, 'label', ['A'])).toHaveLength(0);
  });
});


describe('projected rate and value', () => {
  const s = (RatePc: number, ValidFrom: string) => ({ RateSrc: 'P', CondType: '', Vendor: '', Vendname: '', Rate: RatePc, Currency: 'INR', PriceUnit: 1, ValidFrom, ValidTo: '99991231', RatePc, LocalCurr: 'INR', RateLocal: RatePc, FrtTotal: 0, LandedRate: RatePc });
  it('takes the rate with the latest ValidFrom, ignoring zero rates', () => {
    expect(latestSourceRate([s(10, '20250401'), s(12, '20260401'), s(0, '20270101')])).toBe(12);
    expect(latestSourceRate([])).toBeNull();
  });
  it('value = quantity x rate, without float noise', () => { expect(projectedValue(3, 0.1)).toBe(0.3); });
  it('sorts by country total, biggest first', () => {
    const g = (k: string, CtryValue: number) => ({ key: k, CtryValue }) as never;
    expect(sortByCountryTotal([g('a', 1), g('b', 9), g('c', 5)]).map((x) => (x as { key: string }).key)).toEqual(['b', 'c', 'a']);
  });
});

describe('rate derivation preview', () => {
  const e = (adjType: 'N' | 'P' | 'A', adjValue = '', overrideRate = ''): never => ({ adjType, adjValue, overrideRate, overrideRsn: 'r' }) as never;
  const s = (RateSrc: string, RatePc: number, ValidFrom = '20260101') => ({ RateSrc, CondType: '', Vendor: '', Vendname: '', Rate: RatePc, Currency: 'INR', PriceUnit: 1, ValidFrom, ValidTo: '99991231', RatePc, LocalCurr: 'INR', RateLocal: RatePc, FrtTotal: 0, LandedRate: RatePc });
  it('percent and amount adjustments, positive and negative (spec 8)', () => {
    expect(adjustRate(100, 'P', 5)).toBe(105); expect(adjustRate(100, 'P', -5)).toBe(95); expect(adjustRate(105, 'P', 5)).toBe(110.25);
    expect(adjustRate(100, 'A', 5)).toBe(105); expect(adjustRate(100, 'A', -5)).toBe(95);
  });
  it('override wins over the adjustment; landed = basic + freight where it applies', () => {
    expect(budgetedBasic(100, e('P', '5'))).toBe(105); expect(budgetedBasic(100, e('P', '5', '90'))).toBe(90); expect(budgetedBasic(100, e('N'))).toBe(100);
    expect(landedRate(100, 8, true)).toBe(108); expect(landedRate(100, 8, false)).toBe(100);
  });
  it('a final rate of zero or below is refused', () => {
    expect(validateEdit2(e('P', '-100'), 100).adjValue).toBeTruthy(); expect(validateEdit2(e('A', '-100'), 100).adjValue).toMatch(/zero or negative/);
    expect(validateEdit2(e('A', '-99'), 100).adjValue).toBeUndefined(); expect(validateEdit2(e('N'), 100)).toEqual({});
  });
  it('source codes fold and C-Map has no freight', () => {
    expect(['CONT', 'INFO', 'MARKT', 'CONS', 'C-MAP', 'MBEW'].map(srcCode)).toEqual(['CONTRACT', 'INFOREC', 'MARKT', 'CONSUMP', 'MBEW', 'MBEW']);
    expect(freightApplies('MBEW')).toBe(false); expect(freightApplies('CONT')).toBe(true);
  });
  it('priority picks the first source with a valid rate (spec 7.2 example)', () => {
    const rows = [s('CONT', 105), s('INFO', 108), s('MBEW', 103)];
    expect(pickByPriority(rows, DEFAULT_B_PRIORITY)?.rate).toBe(105);
    expect(pickByPriority([s('CONT', 0), s('INFO', 108), s('MBEW', 103)], DEFAULT_B_PRIORITY)?.source).toBe('INFOREC');
    expect(pickByPriority([], DEFAULT_B_PRIORITY)).toBeNull();
    expect(marketRate([s('MARKT', 110, '20250101'), s('MARKT', 112, '20260101')])?.RatePc).toBe(112);
  });
});

describe('generate draft rates', () => {
  it('posts GENERATE with the history window and limits', () => {
    expect(generateBody({ ...hist, mtart: ['ROH'] }, ' A@B.com ')).toEqual({
      Action: 'GENERATE', Gjahr: '2026', Land1: 'IN', MatnrCsv: '', WerksCsv: '', Reason: '', Email: 'a@b.com',
      HistFrom: '/Date(1743465600000)/', HistTo: '/Date(1774915200000)/', CatAFrom: '8000000', CatBFrom: '4000000', MtartCsv: 'ROH',
    });
  });
});

describe('BudRateSrcDtlSet: average base price and last price', () => {
  const d = (RateSrc: string, RatePc: number, ValidFrom = '20260101') => ({ RateSrc, CondType: '', Vendor: '', Vendname: '', Rate: RatePc, Currency: 'INR', PriceUnit: 1, CondUnit: 'KG', ValidFrom, ValidTo: '99991231', RatePc, FrtLines: [], FrtTotal: 0, FrtCurr: '', LandedRate: RatePc, LandedCurr: 'INR' });
  // material 100000014 on NGQ: CONT 122, INFO 10, BASE 10.317884
  const rows = [d('CONT', 122, '20250911'), d('INFO', 10, '20261011'), d('BASE', 10.317884, '20250401')];
  it('filters on material, company code and country; company code defaults to 1000', async () => {
    const { srcDtlFilter } = await import('@/lib/budgetMgmt/api');
    expect(srcDtlFilter('100000014', '1000', 'IN')).toBe("Matnr eq '000000000100000014' and Bukrs eq '1000' and Land1 eq 'IN'");
    expect(srcDtlFilter('100000014', '', 'IN')).toContain("Bukrs eq '1000'");
  });
  it('average base price is the BASE row', async () => {
    const { avgBasePrice } = await import('@/lib/budgetMgmt/rules');
    expect(avgBasePrice(rows)?.RatePc).toBe(10.317884);
    expect(avgBasePrice([d('INFO', 5)])).toBeNull();
  });
  it('last price follows the chosen priority and falls back to the other source', async () => {
    const { lastPrice } = await import('@/lib/budgetMgmt/rules');
    expect(lastPrice(rows, 'IR_C')?.row.RatePc).toBe(10);
    expect(lastPrice(rows, 'C_IR')?.row.RatePc).toBe(122);
    expect(lastPrice(rows, 'IR')?.source).toBe('INFOREC');
    expect(lastPrice([d('CONT', 7), d('BASE', 3)], 'IR_C')?.source).toBe('CONTRACT');
    expect(lastPrice([d('CONT', 7)], 'IR')).toBeNull();
  });
});

describe('rule per category from BudRateSrcDtlSet (no BudRateSrcSet)', () => {
  const d = (RateSrc: string, RatePc: number, ValidFrom = '20260101') => ({ RateSrc, CondType: '', Vendor: '', Vendname: '', Rate: RatePc, Currency: 'INR', PriceUnit: 1, CondUnit: 'KG', ValidFrom, ValidTo: '99991231', RatePc, FrtLines: [], FrtTotal: 0, FrtCurr: '', LandedRate: RatePc, LandedCurr: 'INR' });
  const rows = [d('CONT', 122), d('INFO', 10), d('BASE', 10.32)];
  it('A: last purchase price in the chosen order, else avg base price', async () => {
    const { historyBreakup } = await import('@/lib/budgetMgmt/rules');
    expect(historyBreakup('A', rows, undefined, 'IR_C').derived).toBe(10);
    expect(historyBreakup('A', rows, undefined, 'C_IR').derived).toBe(122);
    expect(historyBreakup('A', [d('BASE', 7)]).derived).toBe(7);
  });
  it('B: priority Contract / Info record, else avg base price', async () => {
    const { historyBreakup } = await import('@/lib/budgetMgmt/rules');
    expect(historyBreakup('B', rows, ['CONTRACT', 'INFOREC']).derived).toBe(122);
    expect(historyBreakup('B', rows, ['INFOREC', 'CONTRACT']).derived).toBe(10);
    expect(historyBreakup('B', [d('BASE', 3)], ['CONTRACT']).derived).toBe(3);
  });
  it('C: latest Info record, else avg base price; nothing when there is no price', async () => {
    const { historyBreakup } = await import('@/lib/budgetMgmt/rules');
    expect(historyBreakup('C', rows).derived).toBe(10);
    expect(historyBreakup('C', [d('CONT', 9), d('BASE', 4)]).derived).toBe(4);
    expect(historyBreakup('C', []).derived).toBeNull();
  });
});

describe('column filter expressions', () => {
  it('text contains, numbers compare, ranges, blank and any-of', async () => {
    const { matchExpr, rowMatches } = await import('@/lib/budgetMgmt/rules');
    expect(matchExpr('Glycol RM', 'glyc')).toBe(true);
    expect(matchExpr('Glycol RM', 'xyz')).toBe(false);
    expect(matchExpr(122.5, '>100')).toBe(true);
    expect(matchExpr(122.5, '<=100')).toBe(false);
    expect(matchExpr(122.5, '100..130')).toBe(true);
    expect(matchExpr(122.5, '=122.5')).toBe(true);
    expect(matchExpr(122.5, '122.5')).toBe(true);
    expect(matchExpr(null, 'blank')).toBe(true);
    expect(matchExpr(5, '!blank')).toBe(true);
    expect(matchExpr(null, '>1')).toBe(false);
    expect(matchExpr('B', 'a|b')).toBe(true);
    expect(matchExpr(1234.5, '1,234')).toBe(true);
    expect(rowMatches({ cat: 'A', rate: 10 }, { cat: 'a', rate: '>5' })).toBe(true);
    expect(rowMatches({ cat: 'A', rate: 10 }, { cat: 'b' })).toBe(false);
  });
});

describe('freight line items', () => {
  it('reads as cond + cond and is empty without lines', async () => {
    const { freightText } = await import('@/lib/budgetMgmt/rules');
    expect(freightText([{ cond: 'ZFR4', rate: 9.781875 }, { cond: 'ZOTC', rate: 17.313415 }])).toBe('ZFR4 9.78 + ZOTC 17.31');
    expect(freightText([])).toBe('');
  });
});

describe('Avg base price breakup (BasePrcDetSet)', () => {
  const r = (Rowid: number, Ebeln: string, Podate: string, Vendor: string, Qtybase: number, Valuelocal: number, Rowtype = 'D') => ({ Rowid, Matnr: '100004266', Ebeln, Ebelp: '00010', Podate, Vendor, Plant: 'UN08', Matdesc: 'RM', Baseunit: 'KG', Qtybase, Doccurr: 'INR', Valuedoc: Valuelocal, Localcurr: 'INR', Valuelocal, Valuegroup: Valuelocal, Wtdavglocal: 0, Wtdavggroup: 0, Rowtype });
  it('weighted average = total value / total quantity and agrees with the S row', async () => {
    const { basePrcBreakup } = await import('@/lib/budgetMgmt/rules');
    // material 100004266 on NGQ: two POs of 60 KG at 109860 each, SAP summary 1831
    const rows = [r(1, '6500579520', '20250703', '7036', 60, 109860), r(2, '6500579521', '20250703', '7036', 60, 109860), { ...r(3, '', '', '', 120, 219720, 'S'), Wtdavglocal: 1831 }];
    const b = basePrcBreakup(rows);
    expect(b.lines).toHaveLength(2);
    expect(b.totalQty).toBe(120); expect(b.totalValue).toBe(219720); expect(b.avg).toBe(1831);
    expect(b.sapAvg).toBe(1831); expect(b.agrees).toBe(true);
    expect(b.byVendor).toEqual([{ vendor: '7036', qty: 120, value: 219720, avg: 1831, qtyShare: 1 }]);
    expect(b.byMonth[0].month).toBe('2025-07');
  });
  it('a credit line lowers the average; no lines gives no average', async () => {
    const { basePrcBreakup } = await import('@/lib/budgetMgmt/rules');
    const b = basePrcBreakup([r(1, 'A', '20260101', 'V1', 10, 1000), r(2, 'B', '20260102', 'V2', 10, -100)]);
    expect(b.avg).toBe(45); expect(b.sapAvg).toBeNull(); expect(b.agrees).toBe(false);
    expect(basePrcBreakup([]).avg).toBeNull();
  });
});
