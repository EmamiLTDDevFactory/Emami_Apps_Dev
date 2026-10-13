import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSapConfig } from '@/lib/sap/config';
import { mockRequestLog } from '../../mock/sap';
import { resetPlanMock } from '../../mock/plan';
import { filterPlanGroups, groupPlanHeads, needsPlant, planHref, readPlanUrl } from '@/lib/plan/plants';
import { fetchPlanChecks, fetchPlanCostLines, fetchPlanEntries, fetchPlanHeads, fetchPlanWip } from '@/lib/plan/client';
import { costFilter, defaultPlanCostQuery, planChecksRequest, planHeadsRequest, planSummaryRequest, planWipRequest } from '@/lib/plan/requests';
import { D } from '@/lib/cost/decimal';
import type { PlanHead } from '@/lib/plan/fields';

const ENV = ['MOCK_SAP', 'MOCK_SAP_DELAY_MS'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
beforeEach(() => {
  process.env.MOCK_SAP = 'true';
  process.env.MOCK_SAP_DELAY_MS = '0';
  resetSapConfig();
  resetPlanMock();
  mockRequestLog.length = 0;
});
afterEach(() => {
  for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  resetSapConfig();
});

const head = (Plan1: string, Werks: string, RowCnt: number, Total: string, WerksTxt = ''): PlanHead => ({ Plan1, Werks, WerksTxt, RowCnt, Total });

describe('grouping per plan', () => {
  it('sums rows and totals per plan with decimal.js (no float drift)', () => {
    const g = groupPlanHeads([head('B', 'UN14', 2, '0.2'), head('A', 'UN13', 3, '0.1', 'Plant 13'), head('B', 'UN13', 1, '0.1')]);
    expect(g.map((x) => x.plan)).toEqual(['A', 'B']);
    const b = g[1];
    expect(b.plants.map((p) => p.werks)).toEqual(['UN13', 'UN14']);
    expect(b.rows).toBe(3);
    expect(b.total.toString()).toBe('0.3'); // 0.1 + 0.2 in float would be 0.30000000000000004
  });
  it('search matches plan names and plant codes / names; plant filter keeps only those plants', () => {
    const g = groupPlanHeads([head('FY27', 'UN13', 2, '10', 'Pantnagar'), head('FY27', 'UN14', 3, '5', 'Guwahati'), head('EXP', 'AE10', 1, '7', 'Dubai')]);
    expect(filterPlanGroups(g, 'fy', []).map((x) => x.plan)).toEqual(['FY27']);
    const byName = filterPlanGroups(g, 'guwa', []);
    expect(byName).toHaveLength(1);
    expect(byName[0].plants.map((p) => p.werks)).toEqual(['UN14']);
    expect(byName[0].total.toString()).toBe('5');
    expect(filterPlanGroups(g, '', ['AE10', 'UN13']).map((x) => `${x.plan}:${x.plants.map((p) => p.werks)}`)).toEqual(['EXP:AE10', 'FY27:UN13']);
  });
  it('against the mock: FY27-BASE groups its four plants and the sum matches the plan entries', async () => {
    const g = groupPlanHeads((await fetchPlanHeads()).rows).find((x) => x.plan === 'FY27-BASE')!;
    expect(g.plants).toHaveLength(4);
    const entries = (await fetchPlanEntries('FY27-BASE')).rows;
    expect(g.rows).toBe(entries.length);
    expect(g.total.eq(entries.reduce((a, e) => a.plus(D(e.Total)), D(0)))).toBe(true);
  });
});

describe('URL with werks', () => {
  it('builds /plan/view/?plan=..&werks=.. with %20, never "+"', () => {
    expect(planHref('FY27 BASE')).toBe('/plan/view/?plan=FY27%20BASE');
    const h = planHref('FY27 BASE+X', ['UN13', 'UN14']);
    expect(h).toBe('/plan/view/?plan=FY27%20BASE%2BX&werks=UN13&werks=UN14');
    expect(h).not.toMatch(/\+/);
  });
  it('reads zero or more werks (repeated or comma separated), upper-cased, de-duplicated', () => {
    expect(readPlanUrl('?plan=FY27%20BASE')).toEqual({ plan: 'FY27 BASE', werks: [] });
    expect(readPlanUrl('?plan=P&werks=un13&werks=UN14,un13')).toEqual({ plan: 'P', werks: ['UN13', 'UN14'] });
    const u = planHref('P 1', ['UN13']);
    expect(readPlanUrl(u.slice(u.indexOf('?')))).toEqual({ plan: 'P 1', werks: ['UN13'] });
  });
});

describe('no heavy call without a plant when the plan has several', () => {
  it('rule', () => {
    expect(needsPlant([], [{}, {}])).toBe(true); // several plants, none chosen
    expect(needsPlant([], null)).toBe(true); // plants still loading
    expect(needsPlant([], [{}])).toBe(false); // single-plant plan
    expect(needsPlant(['UN13'], [{}, {}])).toBe(false);
  });
});

describe('plant filter in every detail filter string', () => {
  it('one plant -> Werks eq; several -> an or-group; no "+" once encoded', () => {
    const one = { ...defaultPlanCostQuery('FY27 BASE'), plants: ['un13'] };
    const two = { ...one, plants: ['UN13', 'UN14'] };
    const OR = "(Werks eq 'UN13' or Werks eq 'UN14')";
    expect(costFilter(one)).toContain("Werks eq 'UN13'");
    expect(costFilter(two)).toContain(OR);
    expect(planSummaryRequest(two).params.$filter).toContain(OR);
    expect(planChecksRequest('FY27 BASE', true, ['UN13', 'UN14']).params.$filter).toBe(`Plan1 eq 'FY27 BASE' and ${OR} and ItemCheck eq true`);
    expect(planWipRequest('FY27 BASE', ['UN13']).params.$filter).toBe("Plan1 eq 'FY27 BASE' and Werks eq 'UN13'");
    expect(planHeadsRequest({ plans: ['FY27 BASE'], plants: ['un13'] }).params.$filter).toBe("Plan1 eq 'FY27 BASE' and Werks eq 'UN13'");
    expect(planHeadsRequest().params.$filter).toBeUndefined();
    for (const f of [costFilter(two), planChecksRequest('FY27 BASE', true, ['UN13']).params.$filter!]) expect(encodeURIComponent(f)).not.toContain('+');
  });
  it('the mock honours Werks on every detail set', async () => {
    expect((await fetchPlanHeads({ plans: ['FY27-BASE'], plants: ['1000'] })).rows.map((h) => h.Werks)).toEqual(['1000']);
    expect((await fetchPlanChecks('FY27-BASE', true, ['1000'])).rows.every((c) => c.Werks === '1000')).toBe(true);
    expect((await fetchPlanWip('FY27-BASE', ['1100'])).rows.every((w) => w.Werks === '1100')).toBe(true);
    const cost = await fetchPlanCostLines({ ...defaultPlanCostQuery('FY27-BASE'), plants: ['BD10'] });
    expect(new Set(cost.rows.map((l) => l.Hwerks))).toEqual(new Set(['BD10']));
    expect(mockRequestLog.every((u) => !/\+/.test(u.replace(/^[^?]*\?/, '')))).toBe(true);
  });
});
