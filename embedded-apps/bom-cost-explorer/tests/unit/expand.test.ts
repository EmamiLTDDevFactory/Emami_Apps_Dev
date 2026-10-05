import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fetchCostLines, isExpandUnsupported } from '@/lib/sap/service';
import { SapError, buildUrl, htmlToText } from '@/lib/sap/client';
import { loadSapConfig, resetSapConfig } from '@/lib/sap/config';
import { getCapability, markUnsupported, resetCapability, RETEST_AFTER_MS, shouldExpand } from '@/lib/sap/capability';
import { mockRequestLog } from '../../mock/sap';
import { defaultQuery, type CostQuery } from '@/lib/query/schema';
import { isLeafRow } from '@/lib/cost/tree';

const q = (p: Partial<CostQuery>): CostQuery => ({ ...defaultQuery(p.mode ?? 'B'), materials: ['FG1001'], plants: ['1000'], ...p });
const ENV = ['MOCK_SAP', 'MOCK_SAP_DELAY_MS', 'MOCK_SAP_EXPAND_501', 'SAP_EXPAND_RATE_OPTIONS', 'SAP_GATEWAY_HOST', 'SAP_SYSTEM', 'APP_ENV', 'SAP_CLIENT', 'SAP_AUTH_MODE', 'SAP_AUTH_USER', 'SAP_AUTH_PASSWORD'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

beforeEach(() => {
  for (const k of ENV) delete process.env[k];
  process.env.MOCK_SAP = 'true';
  process.env.MOCK_SAP_DELAY_MS = '0';
  resetSapConfig();
  resetCapability('NGD');
  mockRequestLog.length = 0;
});
afterEach(() => {
  for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  resetSapConfig();
});

/** No request may address RateOptionSet or a per-line navigation (…CostLineSet(…)/RateOptions). */
const navCalls = () => mockRequestLog.filter((u) => /RateOption(Set)?(\(|\?|$)|\)\/RateOptions/.test(u.split('?')[0]));
const costCalls = () => mockRequestLog.filter((u) => u.includes('/CostLineSet?'));

describe('$expand=RateOptions (auto)', () => {
  it('mode B expands on CostLineSet; every line has RateOptions; capability -> supported', async () => {
    const r = await fetchCostLines(q({ mode: 'B' }));
    expect(r.rateOptions).toBe(true);
    expect(r.capability).toBe('supported');
    expect(r.rows.every((x) => Array.isArray(x.RateOptions))).toBe(true);
    expect(r.rows.filter(isLeafRow).some((x) => (x.RateOptions?.length ?? 0) > 0)).toBe(true);
    expect(decodeURIComponent(costCalls()[0])).toContain('$expand=RateOptions');
    expect(navCalls()).toEqual([]);
  });

  it('mode C never expands', async () => {
    const r = await fetchCostLines(q({ mode: 'C', bomPlant: '1000', compPlants: ['1000', '1100'], plants: [] }));
    expect(r.rateOptions).toBe(false);
    expect(r.rows.every((x) => x.RateOptions === undefined)).toBe(true);
    expect(mockRequestLog.every((u) => !u.includes('expand'))).toBe(true);
  });

  it('on 501: retries ONCE without $expand, marks unsupported, and the next run is a single call', async () => {
    process.env.MOCK_SAP_EXPAND_501 = 'true';
    const first = await fetchCostLines(q({ mode: 'B' }));
    expect(first.rateOptions).toBe(false);
    expect(first.capability).toBe('unsupported');
    expect(first.messages.some((m) => m.code === 'BFF/003')).toBe(true);
    expect(costCalls()).toHaveLength(2);
    mockRequestLog.length = 0;
    const second = await fetchCostLines(q({ mode: 'B' }));
    expect(second.rateOptions).toBe(false);
    expect(costCalls()).toHaveLength(1); // no double run while unsupported
    expect(costCalls()[0]).not.toMatch(/expand/);
    expect(navCalls()).toEqual([]);
  });

  it('re-tests after 15 minutes, and immediately after an admin reset', () => {
    markUnsupported('NGD', 'x', 1_000);
    expect(shouldExpand('auto', 'NGD', 1_000 + RETEST_AFTER_MS - 1)).toBe(false);
    expect(shouldExpand('auto', 'NGD', 1_000 + RETEST_AFTER_MS)).toBe(true);
    markUnsupported('NGD', 'x');
    resetCapability('NGD');
    expect(getCapability('NGD').state).toBe('unknown');
  });
});

describe('SAP_EXPAND_RATE_OPTIONS on / off', () => {
  it('off: never sends $expand', async () => {
    process.env.SAP_EXPAND_RATE_OPTIONS = 'off';
    const r = await fetchCostLines(q({ mode: 'B' }));
    expect(r.rateOptions).toBe(false);
    expect(costCalls()).toHaveLength(1);
    expect(costCalls()[0]).not.toMatch(/expand/);
  });
  it('on: always sends it and shows the SAP error (no silent retry)', async () => {
    process.env.SAP_EXPAND_RATE_OPTIONS = 'on';
    process.env.MOCK_SAP_EXPAND_501 = 'true';
    await expect(fetchCostLines(q({ mode: 'B' }))).rejects.toThrow(/RATEOPTIONSET_GET_ENTITYSET/);
    expect(costCalls()).toHaveLength(1);
  });
  it('recognises the not-implemented errors, but not other failures', () => {
    const mk = (msg: string, sapStatus = 400, kind: 'http' | 'timeout' = 'http') => new SapError(msg, kind, 400, [], sapStatus);
    expect(isExpandUnsupported(mk("Method 'RATEOPTIONSET_GET_ENTITYSET' not implemented", 501))).toBe(true);
    expect(isExpandUnsupported(mk('Navigation property RateOptions not supported'))).toBe(true);
    expect(isExpandUnsupported(mk('Material FG1 does not exist'))).toBe(false);
    expect(isExpandUnsupported(mk('not implemented', 0, 'timeout'))).toBe(false);
  });
});

describe('connection config', () => {
  it('derives SAP_BASE_URL = host/api/system/service and percent-encodes values (%20, never +)', () => {
    process.env.MOCK_SAP = 'false';
    process.env.SAP_GATEWAY_HOST = 'https://gw.example/';
    process.env.SAP_SYSTEM = 'NGQ';
    process.env.APP_ENV = 'qa';
    process.env.SAP_CLIENT = '100';
    resetSapConfig();
    const c = loadSapConfig('localhost');
    expect(c.ok && c.config.baseUrl).toBe('https://gw.example/api/NGQ/ZMM_BOM_COST_SRV');
    const url = buildUrl('MaterialVHSet', { search: 'navratna oil+', $top: '50' });
    expect(url).toBe('https://gw.example/api/NGQ/ZMM_BOM_COST_SRV/MaterialVHSet?search=navratna%20oil%2B&$top=50&$format=json&sap-client=100');
    expect(buildUrl('CostLineSet', { $filter: "Matnr eq 'A&B'" })).not.toContain('+');
  });
  it('sends sap-client only when SAP_CLIENT is set', () => {
    process.env.MOCK_SAP = 'false';
    resetSapConfig();
    expect(buildUrl('PlantVHSet', {})).not.toContain('sap-client');
  });
  it('follows the hostname: dev -> NGD, www -> NWP production', () => {
    process.env.MOCK_SAP = 'false';
    resetSapConfig();
    const dev = loadSapConfig('dev.emamiapps.in');
    expect(dev.ok && [dev.config.system, dev.config.appEnv]).toEqual(['NGD', 'development']);
    resetSapConfig();
    const prd = loadSapConfig('www.emamiapps.in');
    expect(prd.ok && [prd.config.system, prd.config.appEnv]).toEqual(['NWP', 'production']);
  });
  it('refuses NWP outside production and production on a non-NWP system', () => {
    process.env.SAP_SYSTEM = 'NWP';
    process.env.APP_ENV = 'development';
    resetSapConfig();
    const a = loadSapConfig('localhost');
    expect(a.ok).toBe(false);
    expect(!a.ok && a.error).toMatch(/Refusing SAP_SYSTEM=NWP/);
    process.env.SAP_SYSTEM = 'NGD';
    process.env.APP_ENV = 'production';
    resetSapConfig();
    expect(loadSapConfig('localhost').ok).toBe(false);
  });
  it('validates the auth mode needs its credentials', () => {
    process.env.SAP_AUTH_MODE = 'basic';
    resetSapConfig();
    const r = loadSapConfig('localhost');
    expect(!r.ok && r.error).toMatch(/SAP_AUTH_USER/);
  });
  it('turns a proxy HTML error page into its first 300 characters of text', () => {
    const t = htmlToText('<html><head><style>x{}</style></head><body><h1>502 Bad Gateway</h1><p>Upstream &amp; timeout</p></body></html>');
    expect(t).toBe('502 Bad Gateway Upstream & timeout');
    expect(htmlToText(`<p>${'x'.repeat(500)}</p>`).length).toBe(300);
  });
});

describe('$select on CostLineSet', () => {
  const ECHO = ['Mode', 'Matnr', 'Cplnt', 'Lookback', 'FreightDays', 'ExplQty', 'MaxLevel', 'Capid', 'Prio', 'DonorPlant', 'AsofDate', 'UseAsof', 'InclFrt', 'StdFrt', 'LatestOnly', 'InclBudget', 'BudgetYr', 'InclCover', 'Hor1', 'Hor2', 'Hor3', 'BudatFrom', 'BudatTo'];
  it('drops the filter-echo columns, keeps every UI field, selects RateOptions only when expanding', async () => {
    const { costRequest, costLineSelect } = await import('@/lib/sap/requests');
    const b = costRequest(q({ mode: 'B' })).params.$select!.split(',');
    for (const e of ECHO) expect(b).not.toContain(e);
    expect(b).toEqual(expect.arrayContaining(['Seqnr', 'Haschild', 'Werks', 'Hwerks', 'Idnrk', 'SelSource', 'SrcCount', 'TotCostInr', 'RateOptions']));
    expect(b).not.toContain('CovH1'); // absent from the live service: a $select of it would fail
    const c = costRequest(q({ mode: 'C', bomPlant: '1000', compPlants: ['1100'], plants: [] })).params.$select!.split(',');
    expect(c).not.toContain('RateOptions');
    expect(costLineSelect(true).endsWith(',RateOptions')).toBe(true);
  });
  it('the mock (like SAP) returns only selected properties and still expands RateOptions', async () => {
    const r = await fetchCostLines(q({ mode: 'B' }));
    expect(r.rateOptions).toBe(true);
    expect(r.rows.every((x) => Array.isArray(x.RateOptions))).toBe(true);
    const sent = decodeURIComponent(costCalls()[0]);
    expect(sent).toMatch(/\$select=Seqnr,/);
    expect(sent).toContain('$expand=RateOptions');
    expect(costCalls()[0]).not.toContain('+');
  });
});
