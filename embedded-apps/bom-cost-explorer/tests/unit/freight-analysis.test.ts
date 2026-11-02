import { describe, expect, it } from 'vitest';
import { DEFAULT_RULE, analyseFreight, analysisTotals, breaches, componentsOf, freightAnalysisSheet, freightDaysFor, sortAnalysis, type Rule } from '@/lib/freight/analysis';
import type { FreightRow, RmPmRow } from '@/lib/sap/fields';

const rm = (Material: string, Mtart: string, Plant = '1000'): Pick<RmPmRow, 'Material' | 'Matdesc' | 'Mtart' | 'Plant'> => ({ Material, Matdesc: `${Material} text`, Mtart, Plant });
const po = (o: Partial<FreightRow>): FreightRow => ({
  RowId: '', Material: 'RM1', Matdesc: '', Plant: '1000', Conditiontype: 'ZFR1', Purchasedocument: '4500000001', Purchaseline: '00010', Podate: '2026-09-10',
  Baseunit: 'KG', Matuom: 'KG', Currency: 'INR', Localcurrency: 'INR', Actualdelvquantity: '100', Actualdelvcostamount: '110', ActRate: '1.1',
  Stddelvquantity: '100', Stddelvcostamount: '100', StdRate: '1', UsedSrc: 'ACTUAL', UsedRate: '1.1', UsedRatePc: '1.1', FxFactor: '1', UsedPcLoc: '1.1', FxInr: '1', UsedPcInr: '1.1', ...o,
});
const range = { from: '2026-09-01', to: '2026-09-30' };

describe('componentsOf', () => {
  it('keeps only ROH / PKGN / VERP, once per plant and material', () => {
    const list = componentsOf([rm('RM1', 'ROH'), rm('RM1', 'ROH'), rm('PM1', 'verp'), rm('SF1', 'HALB'), rm('PK1', 'PKGN', '2000'), rm('RM1', 'ROH', '2000')], ['ROH', 'PKGN', 'VERP']);
    expect(list.map((c) => c.key)).toEqual(['1000|PM1', '1000|RM1', '2000|PK1', '2000|RM1']);
  });
  it('honours the chosen types', () => {
    expect(componentsOf([rm('RM1', 'ROH'), rm('PM1', 'PKGN')], ['PKGN']).map((c) => c.material)).toEqual(['PM1']);
  });
});

describe('analyseFreight', () => {
  const comps = componentsOf([rm('RM1', 'ROH'), rm('RM2', 'ROH')], ['ROH']);
  it('weights actual and standard by quantity over the PO lines in the date range', () => {
    const rows = [
      po({ Purchaseline: '00010', Actualdelvquantity: '100', Actualdelvcostamount: '110', Stddelvquantity: '100', Stddelvcostamount: '100' }),
      po({ Purchaseline: '00020', Actualdelvquantity: '300', Actualdelvcostamount: '300', Stddelvquantity: '300', Stddelvcostamount: '300', Podate: '2026-09-20' }),
      po({ Purchaseline: '00030', Podate: '2026-08-31', Actualdelvcostamount: '9999' }), // before the range
      po({ Purchaseline: '00040', Podate: '2026-10-01', Actualdelvcostamount: '9999' }), // after the range
    ];
    const [r] = analyseFreight(comps, rows, range);
    expect(r.actual?.toFixed(4)).toBe('1.0250'); // 410 / 400
    expect(r.standard?.toFixed(4)).toBe('1.0000');
    expect(r.variance?.toFixed(4)).toBe('0.0250');
    expect(r.variancePct?.toFixed(2)).toBe('2.50');
    expect(r.pos).toBe(2);
    expect(r.lastPo).toBe('2026-09-20');
  });
  it('converts with FxInr and leaves EXCLUDED lines out', () => {
    const [r] = analyseFreight(comps, [po({ FxInr: '2', Actualdelvcostamount: '110', Stddelvcostamount: '100' }), po({ Purchaseline: '00020', UsedSrc: 'EXCLUDED', Actualdelvcostamount: '5000' })], range);
    expect(r.actual?.toFixed(2)).toBe('2.20');
    expect(r.standard?.toFixed(2)).toBe('2.00');
    expect(r.pos).toBe(1);
  });
  it('a component without an actual delivery has no actual figure and no variance', () => {
    const [r] = analyseFreight(comps, [po({ Actualdelvquantity: '0', Actualdelvcostamount: '0' })], range);
    expect(r.actual).toBeNull();
    expect(r.standard?.toFixed(2)).toBe('1.00');
    expect(r.variance).toBeNull();
    expect(breaches(r, { kind: 'any_above', threshold: '' })).toBe(false);
  });
  it('keeps components with no PO line at all, and ignores freight of other components', () => {
    const out = analyseFreight(comps, [po({ Material: 'OTHER' })], range);
    expect(out.map((r) => [r.material, r.pos])).toEqual([['RM1', 0], ['RM2', 0]]);
  });
});

describe('alert rules', () => {
  const comps = componentsOf([rm('UP', 'ROH'), rm('DOWN', 'ROH'), rm('NA', 'ROH')], ['ROH']);
  const rows = analyseFreight(comps, [
    po({ Material: 'UP', Actualdelvcostamount: '115' }), // +15 %
    po({ Material: 'DOWN', Actualdelvcostamount: '80' }), // -20 %
    po({ Material: 'NA', Actualdelvquantity: '0', Actualdelvcostamount: '0' }),
  ], range);
  const flagged = (rule: Rule) => rows.filter((r) => breaches(r, rule)).map((r) => r.material);
  it('pct_above', () => { expect(flagged({ kind: 'pct_above', threshold: '10' })).toEqual(['UP']); expect(flagged({ kind: 'pct_above', threshold: '15' })).toEqual([]); });
  it('abs_above', () => { expect(flagged({ kind: 'abs_above', threshold: '0.1' })).toEqual(['UP']); expect(flagged({ kind: 'abs_above', threshold: '0.2' })).toEqual([]); });
  it('any_above', () => expect(flagged({ kind: 'any_above', threshold: '' })).toEqual(['UP']));
  it('pct_both flags either direction', () => expect(flagged({ kind: 'pct_both', threshold: '10' }).sort()).toEqual(['DOWN', 'UP']));
  it('an empty or invalid threshold flags nothing', () => { expect(flagged({ kind: 'pct_above', threshold: '' })).toEqual([]); expect(flagged({ kind: 'abs_above', threshold: 'abc' })).toEqual([]); });
  it('totals, sorting and the export sheet follow the rule', () => {
    expect(analysisTotals(rows, DEFAULT_RULE)).toMatchObject({ rows: 3, withBoth: 2, flagged: 1, above: 1, below: 1, noActual: 1 });
    expect(sortAnalysis(rows, DEFAULT_RULE).map((r) => r.material)[0]).toBe('UP');
    const sheet = freightAnalysisSheet(rows, DEFAULT_RULE);
    expect(sheet.count).toBe(3);
    expect(sheet.cols.at(-1)!.get(rows.findIndex((r) => r.material === 'UP'))).toBe('ALERT');
  });
});

describe('freightDaysFor', () => {
  it('reaches back to the From date, within the 1 to 3650 the service accepts', () => {
    const now = new Date(2026, 9, 31);
    expect(freightDaysFor('2026-10-31', now)).toBe(1);
    expect(freightDaysFor('2026-10-01', now)).toBe(31);
    expect(freightDaysFor('2000-01-01', now)).toBe(3650);
    expect(freightDaysFor('2027-01-01', now)).toBe(1);
  });
});

describe('requests', () => {
  it('components: mode M for the FGs and plants; freight: mode F per plant, every PO line (LatestOnly off), window back to From', async () => {
    const { componentQuery, freightQuery } = await import('@/lib/freight/analysisFetch');
    const { pagedRequest } = await import('@/lib/sap/requests');
    const m = pagedRequest(componentQuery(['FG1'], ['1000', '2000']), 500, 0);
    expect(m.entitySet).toBe('RmPmRowSet');
    expect(m.params.$filter).toContain("Mode eq 'M'");
    expect(m.params.$filter).toContain("Matnr eq 'FG1'");
    const f = pagedRequest(freightQuery(['RM1', 'PM1'], '1000', 31), 500, 0);
    expect(f.entitySet).toBe('FreightRowSet');
    expect(f.params.$filter).toContain("Mode eq 'F'");
    expect(f.params.$filter).toContain("(Matnr eq 'RM1' or Matnr eq 'PM1')");
    expect(f.params.$filter).toContain("Werks eq '1000'");
    expect(f.params.$filter).toContain('FreightDays eq 31');
    expect(f.params.$filter).toContain("LatestOnly eq ''");
    expect(f.params.$filter).not.toContain('+');
  });
});
