import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fetchCostLines, isExpandUnsupported } from '@/lib/sap/service';
import { SapError, buildUrl } from '@/lib/sap/client';
import { mockRequestLog } from '../../mock/sap';
import { defaultQuery, type CostQuery } from '@/lib/query/schema';
import { isLeafRow } from '@/lib/cost/tree';

const q = (p: Partial<CostQuery>): CostQuery => ({ ...defaultQuery(p.mode ?? 'B'), materials: ['FG1001'], plants: ['1000'], ...p });

beforeAll(() => {
  process.env.MOCK_SAP = 'true';
  process.env.MOCK_SAP_DELAY_MS = '0';
});
afterEach(() => {
  delete process.env.MOCK_SAP_EXPAND_501;
  mockRequestLog.length = 0;
});

/** No request may address RateOptionSet or a per-line navigation (…CostLineSet(…)/RateOptions). */
const navCalls = () => mockRequestLog.filter((u) => /RateOption(Set)?(\(|\?|$)|\)\/RateOptions/.test(u.split('?')[0]));

describe('$expand=RateOptions', () => {
  it('mode B expands on CostLineSet and every line has a RateOptions array', async () => {
    const r = await fetchCostLines(q({ mode: 'B' }), {});
    expect(r.rateOptions).toBe(true);
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows.every((x) => Array.isArray(x.RateOptions))).toBe(true);
    expect(r.rows.filter(isLeafRow).some((x) => (x.RateOptions?.length ?? 0) > 0)).toBe(true);
    expect(mockRequestLog.some((u) => u.includes('/CostLineSet?') && /\$expand=RateOptions/.test(decodeURIComponent(u)))).toBe(true);
    expect(navCalls()).toEqual([]);
  });

  it('mode C never expands', async () => {
    const r = await fetchCostLines(q({ mode: 'C', bomPlant: '1000', compPlants: ['1000', '1100'], plants: [] }), {});
    expect(r.rateOptions).toBe(false);
    expect(r.rows.every((x) => x.RateOptions === undefined)).toBe(true);
    expect(mockRequestLog.every((u) => !u.includes('expand'))).toBe(true);
  });

  it('falls back without $expand when SAP has not implemented the navigation (501)', async () => {
    process.env.MOCK_SAP_EXPAND_501 = 'true';
    const r = await fetchCostLines(q({ mode: 'B' }), {});
    expect(r.rateOptions).toBe(false);
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows.every((x) => x.RateOptions === undefined)).toBe(true);
    expect(r.messages.some((m) => m.code === 'BFF/003' && m.severity === 'warning')).toBe(true);
    const cost = mockRequestLog.filter((u) => u.includes('/CostLineSet?'));
    expect(cost).toHaveLength(2); // expanded attempt, then the plain retry
    expect(cost[0]).toMatch(/expand=RateOptions/);
    expect(cost[1]).not.toMatch(/expand/);
    expect(navCalls()).toEqual([]);
  });

  it('recognises the not-implemented errors, but not other failures', () => {
    const mk = (msg: string, sapStatus = 400, kind: 'http' | 'timeout' = 'http') => new SapError(msg, kind, 400, [], sapStatus);
    expect(isExpandUnsupported(mk("Method 'RATEOPTIONSET_GET_ENTITYSET' not implemented", 501))).toBe(true);
    expect(isExpandUnsupported(mk('Navigation property RateOptions not supported'))).toBe(true);
    expect(isExpandUnsupported(mk('Material FG1 does not exist'))).toBe(false);
    expect(isExpandUnsupported(mk('not implemented', 0, 'timeout'))).toBe(false);
  });
});

describe('URL building', () => {
  it('percent-encodes every value (spaces as %20, never +) and keeps $ options literal', () => {
    const saved = { m: process.env.MOCK_SAP, u: process.env.SAP_BASE_URL, c: process.env.SAP_CLIENT };
    process.env.MOCK_SAP = 'false';
    process.env.SAP_BASE_URL = 'https://gw.example/sap/opu/odata/sap/ZMM_BOM_COST_SRV/';
    process.env.SAP_CLIENT = '100';
    try {
      const url = buildUrl('MaterialVHSet', { search: 'navratna oil+', $top: '100' });
      expect(url).toBe('https://gw.example/sap/opu/odata/sap/ZMM_BOM_COST_SRV/MaterialVHSet?search=navratna%20oil%2B&$top=100&$format=json&sap-client=100');
      const f = buildUrl('CostLineSet', { $filter: "Mode eq 'B' and Matnr eq 'A&B'", $expand: 'RateOptions' });
      expect(f).toContain("$filter=Mode%20eq%20'B'%20and%20Matnr%20eq%20'A%26B'");
      expect(f).not.toContain('+');
    } finally {
      process.env.MOCK_SAP = saved.m;
      process.env.SAP_BASE_URL = saved.u;
      process.env.SAP_CLIENT = saved.c;
    }
  });
});
