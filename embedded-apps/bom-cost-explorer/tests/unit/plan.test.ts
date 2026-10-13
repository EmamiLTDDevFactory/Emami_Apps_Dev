import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSapConfig } from '@/lib/sap/config';
import { mockRequestLog, mockSapFetch } from '../../mock/sap';
import { resetPlanMock } from '../../mock/plan';
import { PLAN_MODULE_ENABLED } from '@/lib/plan/flag';
import { PLAN_COST_EXTRA, PLAN_MAX_ROWS_PER_REQUEST, monthKeys } from '@/lib/plan/fields';
import { costFilter, defaultPlanCostQuery, planCostRequest, planEntriesRequest } from '@/lib/plan/requests';
import { fetchPlanChecks, fetchPlanCostLines, fetchPlanEntries, fetchPlanHeads, fetchPlanSummary, fetchPlanWip } from '@/lib/plan/client';
import { OPTIONAL_PROPS } from '@/lib/sap/fields';
import { D } from '@/lib/cost/decimal';

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

const upload = async (body: unknown) => {
  const r = await mockSapFetch('http://mock/api/NGD/ZMM_BOM_COST_SRV/PlanUploadSet', { method: 'POST', body: JSON.stringify(body) });
  return { status: r.status, d: ((await r.json()) as { d: Record<string, unknown> }).d };
};
const row = (Matnr: string, Werks: string, qty = '100.000') => ({ Matnr, Werks, Land1: 'IN', ...Object.fromEntries(monthKeys('Mth').map((k) => [k, qty])) });

describe('flag', () => {
  it('PLAN_MODULE_ENABLED is off unless the build sets it', () => {
    expect(process.env.NEXT_PUBLIC_PLAN_MODULE_ENABLED).toBeUndefined();
    expect(PLAN_MODULE_ENABLED).toBe(false);
  });
});

describe('requests', () => {
  it('Mode P filter: plan first, plants as an or-group, booleans, never $expand, no "+"', () => {
    const q = { ...defaultPlanCostQuery('FY27 BASE'), plants: ['1000', '1100'], materials: ['fg1001'] };
    const f = costFilter(q);
    expect(f.startsWith("Mode eq 'P' and Plan1 eq 'FY27 BASE' and (Werks eq '1000' or Werks eq '1100') and Matnr eq 'FG1001' and MtartFilter eq 'A'")).toBe(true);
    expect(f).toContain('Fallback eq true');
    const r = planCostRequest(q, OPTIONAL_PROPS);
    expect(r.entitySet).toBe('CostLineSet');
    expect(r.params.$expand).toBeUndefined();
    const sel = r.params.$select!.split(',');
    expect(sel).toEqual(expect.arrayContaining(['Seqnr', 'TotCostInr', ...Object.values(PLAN_COST_EXTRA).map(([n]) => n)]));
    expect(sel).not.toContain('CovH1');
    expect(encodeURIComponent(f)).not.toContain('+');
  });
  it('a plan is required', () => {
    expect(() => planEntriesRequest('  ')).toThrow(/Choose a plan/);
  });
});

describe('client against the mock plan sets', () => {
  it('PlanHeadSet lists the seeded plans, one row per plan and plant', async () => {
    const r = await fetchPlanHeads();
    const base = r.rows.filter((h) => h.Plan1 === 'FY27-BASE');
    expect(base.map((h) => h.Werks)).toEqual(['1000', '1100', '1200', 'BD10']);
    expect(base.find((h) => h.Werks === '1000')).toMatchObject({ RowCnt: 2, WerksTxt: 'Kolkata Plant' });
    expect(base.every((h) => D(h.Total).gt(0))).toBe(true);
    expect(base[0]).not.toHaveProperty('PlantCnt');
  });
  it('PlanEntrySet filters by plant; months are decimal strings April..March', async () => {
    const r = await fetchPlanEntries('FY27-BASE', { plants: ['1000'] });
    expect(r.rows.map((e) => e.Matnr).sort()).toEqual(['FG1001', 'FG3001']);
    const e = r.rows[0];
    expect(typeof e.Mth1).toBe('string');
    expect(D(e.Total).eq(monthKeys('Mth').reduce((a, k) => a.plus(D((e as unknown as Record<string, string>)[k])), D(0)))).toBe(true);
  });
  it('CostLineSet Mode P: ONE call, no $expand, monthly quantities add up, LASTPROD example with its warning', async () => {
    const r = await fetchPlanCostLines(defaultPlanCostQuery('FY27-BASE'));
    const calls = mockRequestLog.filter((u) => u.includes('/CostLineSet'));
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toMatch(/expand/);
    expect(r.rows.length).toBeGreaterThan(0);
    const lp = r.rows.filter((l) => l.BomSrc === 'LASTPROD');
    expect(lp.length).toBeGreaterThan(0);
    expect(lp[0]).toMatchObject({ Hwerks: 'BD10', BomPlant: '1000', BomSrcDate: '2026-08-12' });
    expect(r.messages.some((m) => /BOM from plant 1000 \(last production 12\.08\.2026\)/.test(m.message))).toBe(true);
    const leaf = r.rows.find((l) => !l.HasChild?.trim() && D(l.QtyTot).gt(0))!;
    const sum = monthKeys('QtyM').reduce((a, k) => a.plus(D((leaf as unknown as Record<string, string>)[k])), D(0));
    expect(sum.minus(D(leaf.QtyTot)).abs().lt(0.05)).toBe(true);
    expect(r.rows.every((l) => l.Plan1 === 'FY27-BASE')).toBe(true);
  });
  it('more than 30 plan rows in one request: SAP refuses and says to filter', async () => {
    const rows = Array.from({ length: PLAN_MAX_ROWS_PER_REQUEST + 1 }, (_, i) => row(i % 2 ? 'FG1001' : 'FG3001', ['1000', '1100', '1200', '1300'][i % 4]));
    // make every row unique by country so 31 survive the duplicate check
    const unique = rows.map((r, i) => ({ ...r, Land1: `X${String(i).padStart(2, '0')}` }));
    const res = await upload({ Plan1: 'BIG', UpdMode: 'R', Dryrun: false, Entries: unique });
    expect(res.d.Status).toBe('S');
    await expect(fetchPlanCostLines(defaultPlanCostQuery('BIG'))).rejects.toThrow(/maximum 30 plan rows per request/);
  });
  it('PlanCheckSet, PlanSummarySet and PlanWipSet answer', async () => {
    const checks = await fetchPlanChecks('FY27-BASE', true);
    expect(checks.rows.some((c) => c.Kind === 'FG' && c.Werks === 'BD10')).toBe(true);
    expect(checks.rows.some((c) => c.Kind === 'ITEM')).toBe(true);
    const sum = await fetchPlanSummary({ ...defaultPlanCostQuery('FY27-BASE'), plants: ['1000'] });
    expect(sum.rows.length).toBeGreaterThan(0);
    expect(D(sum.rows[0].BudQty).gt(0)).toBe(true);
    const wip = await fetchPlanWip('FY27-BASE');
    expect(wip.rows.every((w) => w.Comp && w.Matnr)).toBe(true);
  });
});

describe('mock PlanUploadSet deep insert', () => {
  it('dry run checks without saving; save merges; errors save nothing', async () => {
    const dry = await upload({ Plan1: 'NEW-PLAN', UpdMode: 'M', Dryrun: true, Entries: [row('FG1001', '1000'), row('FG5001', 'BD10')] });
    expect(dry.status).toBe(201);
    expect(dry.d).toMatchObject({ Status: 'V', Saved: 0, Errors: 0 });
    expect((dry.d.Entries as { results: { Status: string }[] }).results.map((e) => e.Status)).toEqual(['S', 'W']);
    expect((await fetchPlanHeads()).rows.some((h) => h.Plan1 === 'NEW-PLAN')).toBe(false);
    const save = await upload({ Plan1: 'NEW-PLAN', UpdMode: 'M', Dryrun: false, Entries: [row('FG1001', '1000')] });
    expect(save.d).toMatchObject({ Status: 'S', Saved: 1 });
    expect((await fetchPlanHeads({ plans: ['NEW-PLAN'] })).rows).toMatchObject([{ Plan1: 'NEW-PLAN', Werks: '1000', RowCnt: 1 }]);
    const bad = await upload({ Plan1: 'NEW-PLAN', UpdMode: 'M', Dryrun: false, Entries: [row('FG1001', 'XX'), { ...row('FG1002', '1000'), Mth3: '-5.000' }] });
    expect(bad.d).toMatchObject({ Status: 'E', Saved: 0, Errors: 2 });
  });
});
