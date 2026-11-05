import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSapConfig } from '@/lib/sap/config';
import { mockRequestLog } from '../../mock/sap';
import { resetBudgetMock } from '../../mock/budget';
import { fetchBudgetCheck, fetchBudgetSplit, fetchBudgetSummary, fetchPending, fetchPendingDet } from '@/lib/budget/service';
import { approveBody, approveBudget, initiateBody, initiateBudget } from '@/lib/budget/write';
import { defaultBudgetQuery, type BudgetQuery } from '@/lib/budget/filter';
import { distinctRunIds, groupPending, kpis, variancePct, varTone, splitTotals, issuesOf } from '@/lib/budget/view';
import { SapError } from '@/lib/sap/client';
import { D } from '@/lib/cost/decimal';

const ENV = ['MOCK_SAP', 'MOCK_SAP_DELAY_MS'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
beforeEach(() => { process.env.MOCK_SAP = 'true'; process.env.MOCK_SAP_DELAY_MS = '0'; resetSapConfig(); resetBudgetMock(); mockRequestLog.length = 0; });
afterEach(() => { for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; resetSapConfig(); vi.restoreAllMocks(); });

const q = (p: Partial<BudgetQuery> = {}): BudgetQuery => ({ ...defaultBudgetQuery(new Date('2026-11-04')), budatFrom: '2026-04-01', budatTo: '2026-09-30', plants: ['1000'], exclDiv: true, ...p });

describe('budget service against the mock SAP', () => {
  it('importing the hooks sends nothing; a run sends one request per plant, in order, no "+"', async () => {
    await import('@/lib/budget/useBudget');
    expect(mockRequestLog.length).toBe(0);
    const seen: string[] = [];
    const r = await fetchBudgetSummary(q({ plants: ['1000', '1100'] }), { onPlant: (w) => seen.push(w) });
    expect(seen).toEqual(['1000', '1100']);
    expect(mockRequestLog.length).toBe(2);
    expect(mockRequestLog.every((u) => u.includes('BudgetSumSet') && !u.includes('+'))).toBe(true);
    expect(new Set(r.rows.map((x) => x.Werks))).toEqual(new Set(['1000', '1100']));
    expect(distinctRunIds(r.rows).length).toBe(2);
  });
  it('rows come as strings / booleans, with the origin buckets', async () => {
    const r = await fetchBudgetSummary(q({ materials: ['FG1001'] }));
    const row = r.rows[0];
    expect(typeof row.CostPerpc1).toBe('string');
    expect(typeof row.MulBom).toBe('boolean');
    expect(D(row.Cap).gte(0)).toBe(true);
    expect(D(row.CostPerpc1).minus(D(row.RmCost)).minus(D(row.PmCost)).abs().lt('0.001')).toBe(true);
  });
  it('actual 12 % above budget is flagged high; no actual gives no variance', async () => {
    const r = await fetchBudgetSummary(q({ materials: ['FG1002', 'FG1003'] }));
    const hi = r.rows.find((x) => x.Matnr === 'FG1002')!, none = r.rows.find((x) => x.Matnr === 'FG1003')!;
    expect(varTone(variancePct(hi))).toBe('bad');
    expect(variancePct(none)).toBeNull();
    const k = kpis(r.rows);
    expect(k.rows).toBe(2); expect(k.high).toBe(1); expect(k.withActual).toBe(1);
  });
  it('the report\'s required-field message comes from SAP as a SapError; a missing plant never reaches SAP', async () => {
    await expect(fetchBudgetSummary(q({ budatFrom: '' }))).rejects.toThrow(/Posting date/);
    expect(mockRequestLog.length).toBe(0);
    await expect(fetchBudgetSummary(q({ materials: ['FAILFG'] }))).rejects.toBeInstanceOf(SapError);
  });
  it('an empty plant is no error: no rows and SAP\'s info message', async () => {
    const r = await fetchBudgetSummary(q({ plants: ['EMPT'] }));
    expect(r.rows).toEqual([]);
    expect(r.messages.some((m) => /No data to display/.test(m.message))).toBe(true);
  });
  it('the checklist flags come only when asked', async () => {
    const off = await fetchBudgetSummary(q({ materials: ['FG2001'] }));
    expect(issuesOf(off.rows[0])).toEqual([]);
    const on = await fetchBudgetSummary(q({ materials: ['FG2001'], checklist: true }));
    expect(issuesOf(on.rows[0])).toContain('Multiple BoMs active');
    const chk = await fetchBudgetCheck(q({ materials: ['FG2001'] }));
    expect(chk.rows[0].MulBom).toBe(true);
  });
  it('the split of one FG adds up to its summary budget cost', async () => {
    const sum = (await fetchBudgetSummary(q({ materials: ['FG1001'] }))).rows[0];
    const split = await fetchBudgetSplit(q(), 'FG1001', '1000');
    expect(split.rows.length).toBeGreaterThan(3);
    expect(split.rows.some((x) => x.Stufe === 2)).toBe(true);
    expect(splitTotals(split.rows).budget.minus(D(sum.CostPerpc1)).abs().lt('0.001')).toBe(true);
    expect(decodeURIComponent(mockRequestLog.at(-1) ?? '')).toContain("Matnr eq 'FG1001'");
  });
});

describe('initiate and approve', () => {
  it('initiate sends only identifiers (RunIds), never an amount; SAP saves what it computed', async () => {
    const run = await fetchBudgetSummary(q({ materials: ['FG1001', 'FG1002'] }));
    const body = initiateBody(distinctRunIds(run.rows), 'Q3 refresh', 'A@B.in');
    expect(Object.keys(body).sort()).toEqual(['AppUser', 'ExclDiv', 'Remarks', 'RunIds']);
    const res = await initiateBudget(distinctRunIds(run.rows), 'Q3 refresh', 'a@b.in');
    expect(res.Status).toBe('S'); expect(res.SavedSum).toBe(2); expect(res.Version).toBe('04'); // 03 is seeded
    const pend = await fetchPending('a@b.in');
    expect(groupPending(pend.rows).map((g) => g.version)).toEqual(['04', '03']);
  });
  it('an unknown run (expired in SAP) is refused with SAP\'s text; nothing to initiate is refused before SAP', async () => {
    await expect(initiateBudget(['RUN999999'], '', 'a@b.in')).rejects.toThrow(/no longer available/);
    mockRequestLog.length = 0;
    await expect(initiateBudget([], '', 'a@b.in')).rejects.toThrow(/Nothing to initiate/);
    expect(mockRequestLog.length).toBe(0);
  });
  it('approve moves one version out of the pending list; the detail rows come per version', async () => {
    const before = groupPending((await fetchPending('a@b.in')).rows);
    expect(before.map((g) => g.version)).toEqual(['03']);
    const det = await fetchPendingDet('a@b.in', '2026', '03');
    expect(det.rows.length).toBeGreaterThan(10);
    expect(approveBody('2026', '03', 'ok', 'A@B.in')).toEqual({ AppUser: 'a@b.in', Gjahr: '2026', Version: '03', Remarks1: 'ok' });
    const res = await approveBudget('2026', '03', 'ok', 'a@b.in');
    expect(res.Approved).toBe(3);
    expect((await fetchPending('a@b.in')).rows).toEqual([]);
    await expect(approveBudget('2026', '03', '', 'a@b.in')).rejects.toThrow(/No pending approval/);
  });
  it('the approver list is empty for someone who is not an approver (SAP decides)', async () => {
    expect((await fetchPending('nobody@emamiltd.in')).rows).toEqual([]);
  });
});
