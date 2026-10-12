import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fetchCostLines } from '@/lib/sap/service';
import { resetSapConfig } from '@/lib/sap/config';
import { costRequest } from '@/lib/sap/requests';
import { buildSelectionFilter } from '@/lib/sap/filter';
import { mockRequestLog } from '../../mock/sap';
import { defaultQuery, type CostQuery } from '@/lib/query/schema';
import { isLeafRow } from '@/lib/cost/tree';
import { getRatesCapability, resetRatesCapability, setRatesCapability, RATES_TTL_MS } from '@/lib/rates/capability';
import { attachRateOptions, clearRatesCache, fetchRateOptions, fromDirect, fromExpand, isRatesShapeMissing } from '@/lib/rates/options';
import { buildSourcesModel, cheapestOption, usedOption } from '@/lib/rates/sources';
import { SapError } from '@/lib/sap/client';
import { leaf, opt } from './helpers';

const q = (p: Partial<CostQuery> = {}): CostQuery => ({ ...defaultQuery(p.mode ?? 'B'), materials: ['FG1001'], plants: ['1000'], ...p });
const ENV = ['MOCK_SAP', 'MOCK_SAP_DELAY_MS', 'MOCK_SAP_EXPAND_501', 'MOCK_SAP_RATES', 'SAP_EXPAND_RATE_OPTIONS', 'NEXT_PUBLIC_RATES_PROBE_MATNR', 'NEXT_PUBLIC_RATES_PROBE_WERKS'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

beforeEach(() => {
  for (const k of ENV) delete process.env[k];
  process.env.MOCK_SAP = 'true';
  process.env.MOCK_SAP_DELAY_MS = '0';
  resetSapConfig();
  resetRatesCapability('NGD');
  clearRatesCache();
  mockRequestLog.length = 0;
});
afterEach(() => {
  for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  resetSapConfig();
});

const path = (u: string) => u.split('?')[0];
const costingCalls = () => mockRequestLog.filter((u) => path(u).endsWith('/CostLineSet') && !u.includes('expand'));
const expandCalls = () => mockRequestLog.filter((u) => path(u).endsWith('/CostLineSet') && u.includes('expand'));
const directCalls = () => mockRequestLog.filter((u) => path(u).endsWith('/RateOptionSet'));

describe('(a) main costing call: no $expand, network baseline unchanged', () => {
  it('one CostLineSet call whose URL equals the baseline (filter + existing $select + $format, no $expand)', async () => {
    const query = q();
    await fetchCostLines(query);
    expect(mockRequestLog.filter((u) => path(u).endsWith('/CostLineSet'))).toHaveLength(1);
    const sent = costingCalls()[0];
    const { params } = costRequest(query, false);
    expect(params.$expand).toBeUndefined();
    const expected = `$filter=${buildSelectionFilter(query)}&$select=${params.$select!}&$format=json`;
    expect(decodeURIComponent(sent.split('?')[1])).toBe(expected);
    expect(sent).not.toMatch(/[ +']/); // spaces as %20, quotes encoded, never "+"
    // Frozen baseline: any change to the existing call (filter, $select list, options) fails here.
    expect(decodeURIComponent(sent.split('?')[1])).toMatchSnapshot();
  });
  it('the spec example keeps the documented shape', () => {
    const f = buildSelectionFilter({ ...defaultQuery('B'), materials: ['400016291'], plants: ['UB01'], explQty: '1000' });
    expect(f.startsWith("Mode eq 'B' and Matnr eq '400016291' and Werks eq 'UB01' and ExplQty eq 1000m")).toBe(true);
  });
});

describe('(b) SAP cannot expand (501) and has no direct set', () => {
  it('exactly ONE costing call; options resolve to unavailable after one direct + one expand probe', async () => {
    process.env.MOCK_SAP_RATES = 'expand-fails';
    const r = await fetchCostLines(q());
    expect(costingCalls()).toHaveLength(1);
    expect(r.messages.some((m) => /RATEOPTIONSET/i.test(m.message))).toBe(false);
    const o = await fetchRateOptions(q());
    expect('unavailable' in o && o.unavailable).toBe(true);
    if ('unavailable' in o) expect(o.reason).toMatch(/not available from SAP for this system/);
    expect(directCalls()).toHaveLength(1);
    expect(expandCalls()).toHaveLength(1);
    expect(costingCalls()).toHaveLength(1); // never a second full costing run
    const cap = getRatesCapability('NGD');
    expect(cap.state).toBe('unavailable');
    expect(cap.probes.map((p) => [p.kind, p.status])).toEqual([['direct', 404], ['expand', 501]]);
    // remembered: no further probes
    mockRequestLog.length = 0;
    clearRatesCache();
    expect('unavailable' in (await fetchRateOptions(q({ materials: ['FG3001'] })))).toBe(true);
    expect(mockRequestLog).toEqual([]);
  });
});

describe('(c) direct set works', () => {
  it('reads RateOptionSet once, flat rows join back to the cost lines, the tab has blocks', async () => {
    process.env.MOCK_SAP_RATES = 'direct-works';
    const lines = (await fetchCostLines(q())).rows;
    const o = await fetchRateOptions(q());
    expect('rows' in o && o.mode).toBe('direct');
    if (!('rows' in o)) return;
    expect(o.rows.length).toBeGreaterThan(0);
    expect(o.rows[0].TotCostInr).toBeDefined(); // direct-only field
    expect(directCalls()).toHaveLength(1);
    expect(expandCalls()).toHaveLength(0);
    const withOpts = attachRateOptions(lines, o.rows);
    expect(withOpts.filter(isLeafRow).some((l) => (l.RateOptions?.length ?? 0) > 0)).toBe(true);
    const m = buildSourcesModel(withOpts);
    expect(m.blocks.length).toBeGreaterThan(0);
    expect(getRatesCapability('NGD').state).toBe('direct');
  });
});

describe('(d) only the expand works', () => {
  it('falls back to $expand after the direct probe 404s; rows carry the parent join key', async () => {
    process.env.MOCK_SAP_RATES = 'only-expand-works';
    const o = await fetchRateOptions(q());
    expect('rows' in o && o.mode).toBe('expand');
    if (!('rows' in o)) return;
    expect(o.rows.length).toBeGreaterThan(0);
    expect(o.rows.every((r) => r.Seqnr > 0 && r.Hwerks && r.Headmat)).toBe(true);
    expect(o.rows[0].TotCostInr).toBeUndefined(); // expand has no Cost/TotCost: the tab computes them
    expect(directCalls()).toHaveLength(1);
    expect(expandCalls()).toHaveLength(1);
    expect(getRatesCapability('NGD').state).toBe('expand');
  });
  it('a configured probe material is used for the probe, then the real query is read', async () => {
    process.env.MOCK_SAP_RATES = 'only-expand-works';
    process.env.NEXT_PUBLIC_RATES_PROBE_MATNR = 'FG3001';
    process.env.NEXT_PUBLIC_RATES_PROBE_WERKS = '1000';
    await fetchRateOptions(q());
    const filters = [...directCalls(), ...expandCalls()].map((u) => decodeURIComponent(u));
    expect(filters.some((u) => u.includes("Matnr eq 'FG3001'") && u.includes('ExplQty eq 1m'))).toBe(true);
    expect(expandCalls().some((u) => decodeURIComponent(u).includes("Matnr eq 'FG1001'"))).toBe(true);
  });
});

describe('(e) capability expiry and Re-test', () => {
  it('a verdict holds 15 minutes, then reads unknown; Re-test clears it at once', () => {
    setRatesCapability('NGD', 'unavailable', [], 'x', 1_000);
    expect(getRatesCapability('NGD', 1_000 + RATES_TTL_MS - 1).state).toBe('unavailable');
    expect(getRatesCapability('NGD', 1_000 + RATES_TTL_MS + 1).state).toBe('unknown');
    setRatesCapability('NGD', 'direct', []);
    resetRatesCapability('NGD');
    expect(getRatesCapability('NGD').state).toBe('unknown');
  });
  it('switched off (SAP_EXPAND_RATE_OPTIONS=off): unavailable without any request', async () => {
    process.env.SAP_EXPAND_RATE_OPTIONS = 'off';
    expect('unavailable' in (await fetchRateOptions(q()))).toBe(true);
    expect(mockRequestLog).toEqual([]);
  });
  it('only "this shape is missing" errors decide anything; network / 500 do not', () => {
    expect(isRatesShapeMissing(new SapError("Method 'RATEOPTIONSET_GET_ENTITYSET' not implemented", 'http', 501, [], 501))).toBe(true);
    expect(isRatesShapeMissing(new SapError("Resource not found for segment 'RateOptionSet'", 'http', 404, [], 404))).toBe(true);
    expect(isRatesShapeMissing(new SapError('Property Mode not found in type RateOption', 'http', 400, [], 400))).toBe(true);
    expect(isRatesShapeMissing(new SapError('RFC error', 'http', 500, [], 500))).toBe(false);
    expect(isRatesShapeMissing(new SapError('down', 'network', 502, [], 0))).toBe(false);
  });
});

describe('(f) normaliser', () => {
  it('unwraps {results:[...]} from the expand and fills the join key; direct rows stay flat', () => {
    const rows = fromExpand([
      { __metadata: {}, Seqnr: 7, Hwerks: '1000', Headmat: 'FG1', RateOptions: { results: [{ __metadata: {}, Source: 'INFOREC', RatePcInr: '1.230000', ValidFrom: '/Date(1774915200000)/' }] } },
      { Seqnr: 8, Hwerks: '1000', Headmat: 'FG1', RateOptions: { __deferred: { uri: 'x' } } },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ Seqnr: 7, Hwerks: '1000', Headmat: 'FG1', Source: 'INFOREC', RatePcInr: '1.23', ValidFrom: '2026-03-31' });
    const d = fromDirect([{ Seqnr: 1, Hwerks: '1000', Headmat: 'FG1', Source: 'MARKT', RatePcInr: '2.5', TotCostInr: '10.00', Selected: 'X' }]);
    expect(d[0]).toMatchObject({ Source: 'MARKT', RatePcInr: '2.5', TotCostInr: '10', Selected: 'X' });
  });
});

describe('(g) URLs', () => {
  it('no "+" in any URL of a costing run and an options load', async () => {
    process.env.MOCK_SAP_RATES = 'direct-works';
    await fetchCostLines(q({ materials: ['FG1001', 'FG3001'] }));
    await fetchRateOptions(q({ materials: ['FG1001', 'FG3001'] }));
    expect(mockRequestLog.length).toBeGreaterThan(1);
    for (const u of mockRequestLog) expect(u).not.toContain('+');
  });
});

describe('Rate sources model', () => {
  it('a rate of 0 is never the cheapest; saving = used - cheapest over leaf rows', () => {
    const a = opt({ Source: 'CONTRACT', RatePcInr: '10' });
    const b = opt({ Source: 'MARKT', RatePcInr: '8' });
    const z = opt({ Source: 'MBEW', RatePcInr: '0' });
    const l = leaf(1, 1, 'C1', '10', '0', '10', { SelSource: 'CONTRACT', SelRatePcInr: '10', TotCostInr: '100', FrtPcInr: '0', RateOptions: [a, b, z] });
    expect(cheapestOption(l, [a, b, z])).toBe(b);
    expect(usedOption(l, [a, b, z])).toBe(a);
    const m = buildSourcesModel([l]);
    expect(m.usedTotal.toString()).toBe('100');
    expect(m.cheapestTotal.toString()).toBe('80');
    expect(m.saving.toString()).toBe('20');
    expect(m.blocks.map((x) => x.source)).toEqual(['CONTRACT', 'MARKT', 'MBEW']);
  });
});
