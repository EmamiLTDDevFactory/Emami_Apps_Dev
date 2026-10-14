import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSapConfig } from '@/lib/sap/config';
import { buildSelectionFilter } from '@/lib/sap/filter';
import { costRequest } from '@/lib/sap/requests';
import { fetchCostLines } from '@/lib/sap/service';
import { mockRequestLog, mockSapFetch } from '../../mock/sap';
import { resetPlanMock } from '../../mock/plan';
import { defaultQuery, type CostQuery } from '@/lib/query/schema';
import { resetRatesCapability } from '@/lib/rates/capability';
import { clearRatesCache, directRequest, expandRequest, fetchRateOptions, fetchRateOptionsByFilter } from '@/lib/rates/options';
import { RATEOPTION_STRING_FLAGS, rateOptionBoolStyle, rateOptionFilter } from '@/lib/rates/optionFilter';
import { costFilter, defaultPlanCostQuery } from '@/lib/plan/requests';
import { fetchPlanCostLines } from '@/lib/plan/client';

const ENV = ['MOCK_SAP', 'MOCK_SAP_DELAY_MS', 'MOCK_SAP_RATES', 'RATEOPTION_BOOL_STYLE', 'NEXT_PUBLIC_RATEOPTION_BOOL_STYLE', 'NEXT_PUBLIC_RATES_PROBE_MATNR', 'NEXT_PUBLIC_RATES_PROBE_WERKS'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
beforeEach(() => {
  for (const k of ENV) delete process.env[k];
  process.env.MOCK_SAP = 'true';
  process.env.MOCK_SAP_DELAY_MS = '0';
  resetSapConfig();
  resetRatesCapability('NGD');
  clearRatesCache();
  resetPlanMock();
  mockRequestLog.length = 0;
});
afterEach(() => {
  for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  resetSapConfig();
});

// Every one of the six flags in the costing filter, some true some false.
const q = (p: Partial<CostQuery> = {}): CostQuery => ({ ...defaultQuery('B'), materials: ['FG1001'], plants: ['1000', '1100'], inclFrt: true, stdFrt: false, latestOnly: true, inclBudget: false, inclCover: true, useAsof: true, asofDate: '2026-09-30', donorPlant: '1200', lookback: 730, ...p });
const FLAG = RATEOPTION_STRING_FLAGS.join('|');
const filterOf = (u: string) => decodeURIComponent((/[?&]\$filter=([^&]*)/.exec(u) ?? [])[1] ?? '');
const path = (u: string) => u.split('?')[0];

describe('RateOptionSet filter', () => {
  it('default style is "string": the six flags become \'X\' / \'\' (false never left out), no eq true / eq false', () => {
    expect(rateOptionBoolStyle()).toBe('string');
    const costing = buildSelectionFilter(q());
    const opts = directRequest(q()).params.$filter!;
    expect(costing).toMatch(new RegExp(`(${FLAG}) eq (true|false)`)); // costing keeps Edm.Boolean
    expect(opts).not.toMatch(new RegExp(`(${FLAG}) eq (true|false)`));
    expect(opts).toContain("InclFrt eq 'X'");
    expect(opts).toContain("StdFrt eq ''");
    expect(opts).toContain("InclBudget eq ''");
    expect(opts).toContain("InclCover eq 'X'");
    expect(opts).toContain("UseAsof eq 'X'");
    for (const f of RATEOPTION_STRING_FLAGS) {
      const m = new RegExp(`${f} eq ('X'|'')`).exec(opts);
      if (costing.includes(`${f} eq`)) expect(m).not.toBeNull();
    }
  });
  it('everything else is byte for byte the costing filter, in the same order', () => {
    const costing = buildSelectionFilter(q());
    const opts = directRequest(q()).params.$filter!;
    const strip = (s: string) => s.replace(new RegExp(`\\b(${FLAG}) eq ('X'|''|true|false)`, 'g'), '$1 eq ?');
    expect(strip(opts)).toBe(strip(costing));
    expect(opts.split(' and ').length).toBe(costing.split(' and ').length);
  });
  it('the costing call (CostLineSet) is unchanged; the $expand fallback is a CostLineSet call and keeps the booleans', () => {
    const costing = buildSelectionFilter(q());
    expect(costRequest(q(), false).params.$filter).toBe(costing);
    expect(expandRequest(q()).params.$filter).toBe(costing);
  });
  it('style "boolean" sends eq true / eq false exactly as the costing call', () => {
    process.env.RATEOPTION_BOOL_STYLE = 'boolean';
    expect(rateOptionBoolStyle()).toBe('boolean');
    expect(directRequest(q()).params.$filter).toBe(buildSelectionFilter(q()));
  });
  it('plan Mode P: Fallback stays \'X\', AllBoms / Scrap omitted when off, BudgetYr a string, booleans rewritten', () => {
    const pq = { ...defaultPlanCostQuery('FY27 (A) BASE'), plants: ['1000'], inclFrt: true, stdFrt: false, inclBudget: true, inclCover: false };
    const costing = costFilter(pq);
    const opts = rateOptionFilter(costing);
    expect(opts).toContain("Fallback eq 'X'");
    expect(opts).not.toMatch(/AllBoms|Scrap/);
    expect(opts).toContain(`BudgetYr eq '${pq.budgetYr}'`);
    expect(opts).toContain("InclFrt eq 'X'");
    expect(opts).toContain("StdFrt eq ''");
    expect(opts).toContain("InclBudget eq 'X'");
    expect(opts).toContain("InclCover eq ''");
    expect(opts).toContain("Plan1 eq 'FY27 (A) BASE'");
  });
  it('text inside quoted values is never rewritten', () => {
    expect(rateOptionFilter("Plan1 eq 'InclFrt eq true' and InclFrt eq false")).toBe("Plan1 eq 'InclFrt eq true' and InclFrt eq ''");
  });
});

describe('against the mock (RateOptionSet refuses boolean literals like SAP)', () => {
  it('a boolean flag on RateOptionSet is a 400 "Invalid parametertype used at function \'eq\'"', async () => {
    const r = await mockSapFetch(`http://mock/api/NGD/ZMM_BOM_COST_SRV/RateOptionSet?$filter=${encodeURIComponent(buildSelectionFilter(q()))}`);
    expect(r.status).toBe(400);
    expect(JSON.stringify(await r.json())).toContain("Invalid parametertype used at function 'eq'");
  });
  it('costing then options: CostLineSet keeps eq true/false, RateOptionSet gets \'X\'/\'\', no "+" in any URL', async () => {
    process.env.MOCK_SAP_RATES = 'direct-works';
    await fetchCostLines(q());
    const r = await fetchRateOptions(q());
    expect('rows' in r && r.mode).toBe('direct');
    expect('rows' in r && r.rows.length).toBeGreaterThan(0);
    const costing = mockRequestLog.find((u) => path(u).endsWith('/CostLineSet'))!;
    const direct = mockRequestLog.filter((u) => path(u).endsWith('/RateOptionSet')).at(-1)!;
    expect(filterOf(costing)).toBe(buildSelectionFilter(q()));
    expect(filterOf(direct)).toBe(rateOptionFilter(buildSelectionFilter(q())));
    expect(filterOf(direct)).not.toMatch(new RegExp(`(${FLAG}) eq (true|false)`));
    for (const u of mockRequestLog) expect(u).not.toContain('+');
  });
  it('plan Mode P options through the mock', async () => {
    process.env.MOCK_SAP_RATES = 'direct-works';
    const pq = { ...defaultPlanCostQuery('FY27-BASE'), plants: ['1000'] };
    await fetchPlanCostLines(pq);
    const r = await fetchRateOptionsByFilter(costFilter(pq));
    expect('rows' in r && r.rows.length).toBeGreaterThan(0);
    const direct = mockRequestLog.filter((u) => path(u).endsWith('/RateOptionSet')).at(-1)!;
    expect(filterOf(direct)).not.toMatch(new RegExp(`(${FLAG}) eq (true|false)`));
    expect(mockRequestLog.every((u) => !u.includes('+'))).toBe(true);
  });
});
