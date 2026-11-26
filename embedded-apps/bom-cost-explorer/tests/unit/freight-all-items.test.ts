import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSapConfig } from '@/lib/sap/config';
import { mockRequestLog } from '../../mock/sap';
import { analysisFilter } from '@/lib/freight/analysisFetch';
import { ALL_DATES, analyseFreight, applyBasis, groupPoLines, poLines, poLinesSheet, postings, postingsSheet, DEFAULT_RULE, type Component } from '@/lib/freight/analysis';
import { poLineBreakup } from '@/lib/freight/poBreakup';
import { compareFreight } from '@/lib/freight/compare';
import { buildSelectionFilter } from '@/lib/sap/filter';
import { defaultQuery } from '@/lib/query/schema';
import type { FreightRow } from '@/lib/sap/fields';

const ENV = ['MOCK_SAP', 'MOCK_SAP_DELAY_MS', 'NEXT_PUBLIC_FREIGHT_ALL_ITEMS'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
beforeEach(() => { process.env.MOCK_SAP = 'true'; process.env.MOCK_SAP_DELAY_MS = '0'; resetSapConfig(); mockRequestLog.length = 0; });
afterEach(() => { for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; resetSapConfig(); vi.resetModules(); });

const range = { from: '2026-08-01', to: '2026-10-31' };
const base = { mode: 'F' as const, materials: [] as string[], plant: '1000', range, inclFrt: true, freightDays: 92 };

describe('(a) filter', () => {
  it("AllItems eq 'X' and LatestOnly eq ' ' with the flag on, even when Latest only is ticked", () => {
    for (const latestOnly of [false, true]) {
      const f = analysisFilter({ ...base, latestOnly, allItems: true });
      expect(f).toContain("AllItems eq 'X'");
      expect(f).toContain("LatestOnly eq ' '");
      expect(f).not.toContain("LatestOnly eq 'X'");
      expect(f).not.toContain('AllItems eq true');
    }
  });
  it('neither AllItems nor a changed LatestOnly with the flag off; never on the components request', () => {
    expect(analysisFilter({ ...base, latestOnly: true })).not.toContain('AllItems');
    expect(analysisFilter({ ...base, latestOnly: true })).toContain("LatestOnly eq 'X'");
    expect(analysisFilter({ ...base, allItems: false })).not.toContain('AllItems');
    expect(analysisFilter({ ...base, mode: 'M', allItems: true })).not.toContain('AllItems');
  });
});

const comp: Component = { key: '1000|RM1', material: 'RM1', text: 'RM1 text', plant: '1000', mtart: 'ROH' };
let seq = 0;
const row = (p: Partial<FreightRow>): FreightRow => ({
  RowId: ++seq, Bukrs: '1000', FgMatnr: '', Lifnr: '', Name1: '', Belnr: `D${seq}`, Xblnr: '', Ztmode: '', GstPart: '', PlcSup: '', Material: 'RM1', Matdesc: '', Plant: '1000', Conditiontype: 'ZFR1', Purchasedocument: '4500000001', Purchaseline: '00010', Podate: '2026-09-10',
  Baseunit: 'KG', Matuom: 'KG', Currency: 'INR', Localcurrency: 'INR', Actualdelvquantity: '0', Actualdelvcostamount: '0', ActRate: '0', Stddelvquantity: '0', Stddelvcostamount: '0', StdRate: '0', UsedSrc: 'ACTUAL', UsedRate: '0', UsedRatePc: '0', FxFactor: '1', UsedPcLoc: '0', FxInr: '1', UsedPcInr: '0',
  Cpudt: null, Vgabe: '2', Buzei: '001', Gjahr: '2026', Shkzg: 'S', IsMaxDate: false, IsLatestPo: false, ...p,
});
const act = (date: string, qty: string, amt: string, p: Partial<FreightRow> = {}) => row({ Cpudt: date, Vgabe: '2', Actualdelvquantity: qty, Actualdelvcostamount: amt, ...p });
const std = (date: string, qty: string, amt: string, p: Partial<FreightRow> = {}) => row({ Cpudt: date, Vgabe: '1', Shkzg: 'H', Stddelvquantity: qty, Stddelvcostamount: amt, ...p });

// PO 1 line 10: 2 actual + 2 standard postings; PO 2 line 10 (older PO date): 1 actual + 1 standard
const rows: FreightRow[] = [
  act('2026-09-12', '40', '50.55', { IsMaxDate: false }), act('2026-09-20', '60', '81.45', { IsMaxDate: true, IsLatestPo: true }),
  std('2026-09-11', '30', '28', { IsMaxDate: false }), std('2026-09-15', '100', '100', { IsMaxDate: true, IsLatestPo: true }),
  act('2026-08-20', '50', '55', { Purchasedocument: '4500000002', Podate: '2026-08-10', IsMaxDate: true }), std('2026-08-18', '50', '45', { Purchasedocument: '4500000002', Podate: '2026-08-10', IsMaxDate: true }),
];

describe('(b) max date basis equals the one-row-per-line answer', () => {
  // what SAP returned before: one row per PO line, the max-date figures on both sides
  const old: FreightRow[] = [
    row({ Vgabe: '', Cpudt: null, Actualdelvquantity: '60', Actualdelvcostamount: '81.45', Stddelvquantity: '100', Stddelvcostamount: '100', Podate: '2026-09-10' }),
    row({ Vgabe: '', Cpudt: null, Purchasedocument: '4500000002', Podate: '2026-08-10', Actualdelvquantity: '50', Actualdelvcostamount: '55', Stddelvquantity: '50', Stddelvcostamount: '45' }),
  ];
  it('component figures and PO lines are identical', () => {
    const r = applyBasis(rows, { basis: 'maxdate', latestOnly: false });
    expect(r.fallback).toBe(false);
    const g = groupPoLines(r.rows);
    expect(analyseFreight([comp], g, range)).toEqual(analyseFreight([comp], old, range));
    const a = poLines([comp], g, range).map((l) => [l.po, l.line, l.poDate, l.actualQty.toFixed(3), l.actualAmount.toFixed(2), l.standardQty.toFixed(3), l.standardAmount.toFixed(2), l.actual?.toFixed(6), l.standard?.toFixed(6)]);
    const o = poLines([comp], old, range).map((l) => [l.po, l.line, l.poDate, l.actualQty.toFixed(3), l.actualAmount.toFixed(2), l.standardQty.toFixed(3), l.standardAmount.toFixed(2), l.actual?.toFixed(6), l.standard?.toFixed(6)]);
    expect(a).toEqual(o);
  });
  it("'all' differs: it counts every posting", () => {
    const all = analyseFreight([comp], groupPoLines(applyBasis(rows, { basis: 'all', latestOnly: false }).rows), range)[0];
    const max = analyseFreight([comp], groupPoLines(applyBasis(rows, { basis: 'maxdate', latestOnly: false }).rows), range)[0];
    expect(all.actualQty.toFixed(3)).toBe('150.000');
    expect(max.actualQty.toFixed(3)).toBe('110.000');
    expect(all.actual!.toFixed(6)).not.toBe(max.actual!.toFixed(6));
  });
});

describe('(c) groupPoLines', () => {
  it('sums equal the postings; a PO line with a standard but no invoice yet stays, without an actual figure', () => {
    const g = groupPoLines([...rows, std('2026-09-01', '10', '9', { Purchasedocument: '4500000003', Podate: '2026-09-01' })]);
    expect(g).toHaveLength(3);
    const open = g.find((r) => r.Purchasedocument === '4500000003')!;
    expect(open.Actualdelvquantity).toBe('0');
    expect(open.Stddelvcostamount).toBe('9');
    const l1 = g.find((r) => r.Purchasedocument === '4500000001')!;
    expect(l1.Actualdelvquantity).toBe('100');
    expect(l1.Actualdelvcostamount).toBe('132');
    expect(l1.Stddelvquantity).toBe('130');
    expect(l1.Stddelvcostamount).toBe('128');
    expect(l1.Podate).toBe('2026-09-10');
  });
  it('amounts are converted with FxInr per posting (1 when missing)', () => {
    const [g] = groupPoLines([act('2026-09-01', '10', '100', { FxInr: '0.5' }), act('2026-09-02', '10', '100', { FxInr: '0' })]);
    expect(g.Actualdelvcostamount).toBe('150');
  });
  it('EXCLUDED lines stay out', () => {
    expect(groupPoLines([act('2026-09-01', '10', '100', { UsedSrc: 'EXCLUDED' })])).toHaveLength(0);
  });
});

describe('(d) latest only through IsLatestPo', () => {
  it('keeps only the IsLatestPo postings, in the browser', () => {
    const r = applyBasis(rows, { basis: 'all', latestOnly: true });
    expect(r.rows.every((x) => x.IsLatestPo)).toBe(true);
    expect(r.rows).toHaveLength(2);
    expect(poLines([comp], groupPoLines(r.rows), range).map((l) => l.po)).toEqual(['4500000001']);
  });
});

describe('(e) fallback', () => {
  it('no IsMaxDate in the data: rows come back unchanged', () => {
    const old = rows.map((r) => ({ ...r, IsMaxDate: false, IsLatestPo: false }));
    const r = applyBasis(old, { basis: 'maxdate', latestOnly: true });
    expect(r.fallback).toBe(true);
    expect(r.rows).toBe(old);
  });
});

describe('(g) PO line breakup', () => {
  const key = { plant: '1000', material: 'RM1', po: '4500000001', line: '00010', cond: 'ZFR1' };
  const b = poLineBreakup(rows, key);
  it('every posting, actual first, dates newest first', () => {
    expect(b.items).toHaveLength(4);
    expect(b.items.map((i) => `${i.side}:${i.postingDate}`)).toEqual(['actual:2026-09-20', 'actual:2026-09-12', 'standard:2026-09-15', 'standard:2026-09-11']);
  });
  it('subtotals exact, rate = sum amount / sum quantity (not the average of the row rates)', () => {
    expect(b.actual.qty.toFixed(3)).toBe('100.000');
    expect(b.actual.amount.toFixed(2)).toBe('132.00');
    expect(b.actual.rate!.toFixed(6)).toBe('1.320000');
    expect(b.standard.qty.toFixed(3)).toBe('130.000');
    expect(b.standard.amount.toFixed(2)).toBe('128.00');
    expect(b.standard.rate!.toFixed(10)).toBe('0.9846153846');
    expect(b.variance!.toFixed(10)).toBe('0.3353846154');
    expect(b.variancePct!.toFixed(4)).toBe('34.0625');
  });
  it('% is null when the standard rate is 0 or missing; no rate when the quantity is 0', () => {
    const z = poLineBreakup([act('2026-09-20', '10', '12'), std('2026-09-15', '10', '0')], { plant: '1000', material: 'RM1', po: '4500000001', line: '00010' });
    expect(z.standard.rate!.toFixed(2)).toBe('0.00');
    expect(z.variancePct).toBeNull();
    const m = poLineBreakup([act('2026-09-20', '10', '12')], { plant: '1000', material: 'RM1', po: '4500000001', line: '00010' });
    expect(m.standard.rate).toBeNull();
    expect(m.variance).toBeNull();
    expect(m.variancePct).toBeNull();
  });
  it('the same rows whatever the basis and Latest only', () => {
    const inputs = [applyBasis(rows, { basis: 'all', latestOnly: false }), applyBasis(rows, { basis: 'maxdate', latestOnly: true })];
    // the breakup always reads the full data, never the filtered rows
    expect(poLineBreakup(rows, key).items).toHaveLength(4);
    expect(inputs[1].rows.length).toBeLessThan(rows.length);
  });
  it('an actual credit (Cr) posting takes its quantity off (shown minus)', () => {
    const c = poLineBreakup([act('2026-09-20', '10', '12'), act('2026-09-21', '4', '5', { Shkzg: 'H', Vgabe: '3' })], { plant: '1000', material: 'RM1', po: '4500000001', line: '00010' });
    expect(c.actual.qty.toFixed(3)).toBe('6.000');
    expect(c.items.find((i) => i.drCr === 'Cr')!.qty.toFixed(3)).toBe('-4.000');
  });
});

describe('postings', () => {
  it('one row per posting, side from Vgabe (not UsedSrc), type text, Dr / Cr, max date', () => {
    const p = postings([comp], [act('2026-09-20', '10', '12', { UsedSrc: 'STANDARD', Shkzg: 'H', Vgabe: '3', IsMaxDate: true })], ALL_DATES);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ side: 'actual', typeText: 'Subsequent debit / credit', drCr: 'Cr', isMaxDate: true, postingDate: '2026-09-20' });
    expect(postings([comp], rows, range)).toHaveLength(rows.length);
  });
});

describe('mock SAP and "no request"', () => {
  it('with the flag on: 4 postings for one PO line (2 actual + 2 standard), unique Rowid, flags; Basis / Latest only / breakup add no request', async () => {
    process.env.NEXT_PUBLIC_FREIGHT_ALL_ITEMS = 'true';
    vi.resetModules();
    const log0 = (await import('../../mock/sap')).mockRequestLog;
    log0.length = 0;
    const f = await import('@/lib/freight/analysisFetch');
    expect(f.FREIGHT_ALL_ITEMS).toBe(true);
    const a = await import('@/lib/freight/analysis');
    const bk = await import('@/lib/freight/poBreakup');
    const data = await f.fetchFreightAnalysis({ materials: [], info: {}, plants: ['1000'], types: ['ROH', 'PKGN', 'VERP'], range: { from: '2000-01-01', to: '2099-12-31' }, inclFrt: true, latestOnly: true, freightDays: 400 }, new AbortController().signal);
    expect(log0.some((u) => /FreightRowSet/.test(u) && decodeURIComponent(u).includes("AllItems eq 'X'") && decodeURIComponent(u).includes("LatestOnly eq ' '"))).toBe(true);
    expect(new Set(data.freight.map((r) => r.RowId)).size).toBe(data.freight.length);
    expect(data.freight.some((r) => r.Shkzg === 'H')).toBe(true);
    const lines = new Map<string, FreightRow[]>();
    for (const r of data.freight) lines.set(`${r.Material}|${r.Purchasedocument}|${r.Purchaseline}`, [...(lines.get(`${r.Material}|${r.Purchasedocument}|${r.Purchaseline}`) ?? []), r]);
    for (const l of lines.values()) { expect(l.length).toBeGreaterThanOrEqual(2); expect(l.length).toBeLessThanOrEqual(4); }
    const exact = [...lines.values()].filter((l) => l.filter((r) => a.sideOf(r) === 'actual').length === 2 && l.filter((r) => a.sideOf(r) === 'standard').length === 2);
    expect(exact.length).toBeGreaterThanOrEqual(1);
    // IsMaxDate postings give the old (one row per PO line) answer
    const log = log0.length;
    const g = a.groupPoLines(a.applyBasis(data.freight, { basis: 'maxdate', latestOnly: false }).rows);
    a.analyseFreight(data.components, g, a.ALL_DATES);
    a.applyBasis(data.freight, { basis: 'all', latestOnly: true });
    const k = exact[0][0];
    const br = bk.poLineBreakup(data.freight, { plant: k.Plant, material: k.Material, po: k.Purchasedocument, line: k.Purchaseline, cond: k.Conditiontype });
    expect(br.items).toHaveLength(4);
    expect(log0.length).toBe(log);
  });

  it('with AllItems absent the mock answers as before (no posting fields set)', async () => {
    const { mockSapFetch } = await import('../../mock/sap');
    const res = await mockSapFetch("http://x/sap/ZMM_BOM_COST_SRV/FreightRowSet?$filter=" + encodeURIComponent("Mode eq 'F' and Werks eq '1000' and FreightDays eq 400 and LatestOnly eq ' '") + '&$format=json');
    const j = (await res.json()) as { d: { results: Record<string, unknown>[] } };
    expect(j.d.results.length).toBeGreaterThan(0);
    expect(j.d.results.every((r) => !('Cpudt' in r) && !('IsMaxDate' in r))).toBe(true);
  });
});

describe('(h) other screens keep their filters', () => {
  it('buildSelectionFilter (Explorer / compare / breakup) has no AllItems', () => {
    for (const mode of ['B', 'F', 'R'] as const) {
      const f = buildSelectionFilter({ ...defaultQuery(mode), materials: ['RM1'], plants: ['1000'] });
      expect(f).not.toContain('AllItems');
      expect(f).toMatchSnapshot();
    }
  });
  it('compareFreight is untouched by the new row fields', () => {
    expect(compareFreight([], [], '1')).toEqual([]);
  });
});

describe('Shkzg (S debit / H credit) in the Freight analysis tables', () => {
  it('a PO line shows the Shkzg of its posting; absent on an older SAP is empty', () => {
    const [l] = poLines([comp], [act('2026-09-20', '10', '12', { Shkzg: 'h' })], ALL_DATES);
    expect(l.shkzg).toBe('H');
    const [o] = poLines([comp], [act('2026-09-20', '10', '12', { Shkzg: '' })], ALL_DATES);
    expect(o.shkzg).toBe('');
  });
  it('summing postings keeps one value when they agree and H/S when a line has both', () => {
    const same = groupPoLines([act('2026-09-01', '10', '10', { Shkzg: 'S' }), act('2026-09-02', '5', '5', { Shkzg: 'S' })]);
    expect(same[0].Shkzg).toBe('S');
    const mixed = groupPoLines([act('2026-09-01', '10', '10', { Shkzg: 'S' }), act('2026-09-02', '5', '5', { Shkzg: 'H' })]);
    expect(mixed[0].Shkzg).toBe('H/S');
    expect(poLines([comp], mixed, ALL_DATES)[0].shkzg).toBe('H/S');
  });
  it('the By posting rows and both exports carry a Shkzg column', () => {
    const [p] = postings([comp], [act('2026-09-20', '10', '12', { Shkzg: 'H' })], ALL_DATES);
    expect(p.shkzg).toBe('H');
    const ps = postingsSheet([p]);
    const col = ps.cols.find((c) => c.header === 'Shkzg')!;
    expect(col.get(0)).toBe('H');
    const lines = poLines([comp], [act('2026-09-20', '10', '12', { Shkzg: 'S' })], ALL_DATES);
    const ls = poLinesSheet(lines, DEFAULT_RULE);
    expect(ls.cols.find((c) => c.header.startsWith('Shkzg'))!.get(0)).toBe('S');
  });
});
