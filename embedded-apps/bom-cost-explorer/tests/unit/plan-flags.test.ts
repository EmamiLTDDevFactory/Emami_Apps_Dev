import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSapConfig } from '@/lib/sap/config';
import { mockRequestLog, mockSapFetch } from '../../mock/sap';
import { resetPlanMock } from '../../mock/plan';
import { PLAN_FLAG_STYLE, planFlag, planFlagValue } from '@/lib/plan/fields';
import { costFilter, defaultPlanCostQuery, planChecksRequest, planSummaryRequest, planWipRequest } from '@/lib/plan/requests';
import { uploadBody, uploadPlan } from '@/lib/plan/write';
import { fetchPlanChecks, fetchPlanCostLines } from '@/lib/plan/client';
import { buildSelectionFilter } from '@/lib/sap/filter';
import { defaultQuery } from '@/lib/query/schema';

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

const plan = 'FY27 BASE (v2)';
const all = { ...defaultPlanCostQuery(plan), allBoms: true, scrap: true, fallback: true };
const none = { ...defaultPlanCostQuery(plan), allBoms: false, scrap: false, fallback: false };

describe('planFlag', () => {
  it('style "string" is the default: on = eq \'X\', off = left out', () => {
    expect(PLAN_FLAG_STYLE).toBe('string');
    expect(planFlag('AllBoms', true)).toBe("AllBoms eq 'X'");
    expect(planFlag('AllBoms', false)).toBeNull();
    expect(planFlagValue(true)).toBe('X');
    expect(planFlagValue(false)).toBe('');
  });
  it('style "boolean" still produces the old output', () => {
    expect(planFlag('AllBoms', true, 'boolean')).toBe('AllBoms eq true');
    expect(planFlag('AllBoms', false, 'boolean')).toBe('AllBoms eq false');
    expect(planFlagValue(true, 'boolean')).toBe(true);
    expect(planFlagValue(false, 'boolean')).toBe(false);
  });
});

describe('plan filters', () => {
  it('on flags are eq \'X\' in CostLineSet Mode P and PlanSummarySet', () => {
    for (const f of [costFilter(all), planSummaryRequest(all).params.$filter!]) {
      expect(f).toContain("AllBoms eq 'X'");
      expect(f).toContain("Scrap eq 'X'");
      expect(f).toContain("Fallback eq 'X'");
      expect(f).not.toMatch(/(AllBoms|Scrap|Fallback) eq (true|false)/);
    }
  });
  it('off flags are absent, and no empty " and  and " is left behind', () => {
    for (const f of [costFilter(none), planSummaryRequest(none).params.$filter!]) {
      expect(f).not.toMatch(/AllBoms|Scrap|Fallback/);
      expect(f).not.toMatch(/and\s+and|^\s*and|and\s*$/);
    }
  });
  it('default query: Fallback ON (eq \'X\'), AllBoms and Scrap left out', () => {
    const f = costFilter(defaultPlanCostQuery(plan));
    expect(f).toContain("Fallback eq 'X'");
    expect(f).not.toMatch(/AllBoms|Scrap/);
  });
  it('the existing costing flags of Mode P stay boolean (eq true / eq false)', () => {
    const f = costFilter({ ...defaultPlanCostQuery(plan), inclFrt: true, stdFrt: false, inclBudget: false, inclCover: true });
    expect(f).toContain('InclFrt eq true');
    expect(f).toContain('StdFrt eq false');
    expect(f).toContain('InclBudget eq false');
    expect(f).toContain('InclCover eq true');
  });
  it('the BOM costing filter is untouched (its flags stay boolean)', () => {
    const f = buildSelectionFilter({ ...defaultQuery('B'), materials: ['FG1001'], plants: ['1000'] });
    expect(f).toMatch(/InclFrt eq (true|false)/);
    expect(f).not.toContain("eq 'X'");
  });
  it('PlanCheckSet: FG check has no ItemCheck, item check has ItemCheck eq \'X\'', () => {
    expect(planChecksRequest(plan, false).params.$filter).toBe(`Plan1 eq '${plan}'`);
    expect(planChecksRequest(plan, true, ['UN13']).params.$filter).toBe(`Plan1 eq '${plan}' and Werks eq 'UN13' and ItemCheck eq 'X'`);
  });
  it('PlanWipSet carries no CHAR1 flags', () => {
    expect(planWipRequest(plan).params.$filter).toBe(`Plan1 eq '${plan}'`);
  });
  it('plan name with spaces and brackets: encodeURIComponent, never "+"', () => {
    const enc = encodeURIComponent(costFilter(all));
    expect(enc).toContain('FY27%20BASE%20(v2)');
    expect(enc).not.toContain('+');
  });
});

describe('write bodies', () => {
  it('upload body: Dryrun "X" for the check, "" for the save, never a JSON boolean', () => {
    const rows = [{ plan, matnr: 'FG1001', werks: '1000', land1: 'IN', months: Array(12).fill('1') }];
    expect(uploadBody(plan, 'M', true, rows).Dryrun).toBe('X');
    expect(uploadBody(plan, 'R', false, rows).Dryrun).toBe('');
    expect(JSON.stringify(uploadBody(plan, 'M', false, rows))).toContain('"Dryrun":""');
  });
});

describe('against the mock (which refuses boolean literals on CHAR1 flags, like SAP)', () => {
  it('Mode P run, item check and FG check succeed; filters sent as eq \'X\'', async () => {
    await fetchPlanCostLines({ ...defaultPlanCostQuery('FY27-BASE'), plants: ['1000'], allBoms: true, scrap: true });
    const fg = await fetchPlanChecks('FY27-BASE', false);
    const item = await fetchPlanChecks('FY27-BASE', true);
    expect(fg.rows.every((c) => c.Kind === 'FG')).toBe(true);
    expect(item.rows.some((c) => c.Kind === 'ITEM')).toBe(true);
    const sent = mockRequestLog.map((u) => decodeURIComponent(u)).join('\n');
    expect(sent).toContain("AllBoms eq 'X'");
    expect(sent).toContain("ItemCheck eq 'X'");
    expect(sent).not.toMatch(/(AllBoms|Scrap|Fallback|ItemCheck) eq (true|false)/);
  });
  it('the mock answers 400 for "AllBoms eq true", as SAP does', async () => {
    const r = await mockSapFetch(`http://mock/api/NGD/ZMM_BOM_COST_SRV/CostLineSet?$filter=${encodeURIComponent("Mode eq 'P' and Plan1 eq 'FY27-BASE' and AllBoms eq true")}`);
    expect(r.status).toBe(400);
    expect(JSON.stringify(await r.json())).toMatch(/Invalid parametertype used at function 'eq'/);
  });
  it('check then save with Dryrun "X" / ""', async () => {
    const rows = [{ plan: 'FLAG TEST (1)', matnr: 'FG1001', werks: '1000', land1: 'IN', months: Array(12).fill('5') }];
    expect((await uploadPlan('FLAG TEST (1)', 'M', true, rows, 't@x')).Status).toBe('V');
    const save = await uploadPlan('FLAG TEST (1)', 'M', false, rows, 't@x');
    expect(save).toMatchObject({ Status: 'S', Saved: 1, Dryrun: false });
  });
});
