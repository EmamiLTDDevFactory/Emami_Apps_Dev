import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SapError } from '@/lib/sap/client';

const cost = vi.fn();
const entries = vi.fn();
vi.mock('@/lib/plan/client', () => ({ fetchPlanCostLines: (...a: unknown[]) => cost(...a), fetchPlanEntries: (...a: unknown[]) => entries(...a) }));
const { planUnits, runPlanUnits, PLAN_BATCH } = await import('@/lib/plan/batchRun');
const { defaultPlanCostQuery } = await import('@/lib/plan/requests');

const q = defaultPlanCostQuery('P1');
const line = (m: string, n: number) => ({ Headmat: m, Seqnr: n } as never);
const ok = (mats: string[]) => ({ rows: mats.map((m, i) => line(m, i + 1)), messages: [], ms: 1 });

beforeEach(() => { cost.mockReset(); entries.mockReset(); });

describe('plan costing in steps', () => {
  it('makes one unit per plant and batch of FGs, from the plan entries (duplicates per country collapse)', async () => {
    entries.mockImplementation(async (_p: string, f: { plants: string[] }) => ({ rows: f.plants[0] === 'A' ? ['1', '1', '2', '3', '4', '5', '6'].map((Matnr) => ({ Matnr })) : [{ Matnr: '9' }], messages: [], ms: 1 }));
    const u = await planUnits(q, ['A', 'B']);
    expect(PLAN_BATCH).toBe(5);
    expect(u).toEqual([{ werks: 'A', materials: ['1', '2', '3', '4', '5'] }, { werks: 'A', materials: ['6'] }, { werks: 'B', materials: ['9'] }]);
  });

  it('publishes rows after every step, in unit order, and counts the steps', async () => {
    cost.mockImplementation(async (qq: { materials: string[] }) => ok(qq.materials));
    const seen: number[] = [];
    const r = await runPlanUnits(q, [{ werks: 'A', materials: ['1', '2'] }, { werks: 'B', materials: ['3'] }], { onStep: (run, p) => { seen.push(run.rows.length); expect(p.total).toBe(2); } });
    expect(r.rows.map((x) => x.Headmat)).toEqual(['1', '2', '3']);
    expect(Math.max(...seen)).toBe(3);
    expect(seen.some((n) => n > 0 && n < 3)).toBe(true);
  });

  it('splits a unit that times out and reports only the FG that still fails', async () => {
    cost.mockImplementation(async (qq: { materials: string[] }) => {
      if (qq.materials.includes('2')) throw new SapError('slow', 'timeout');
      return ok(qq.materials);
    });
    const r = await runPlanUnits(q, [{ werks: 'A', materials: ['1', '2', '3', '4'] }]);
    expect(r.rows.map((x) => x.Headmat).sort()).toEqual(['1', '3', '4']);
    expect(r.failed).toEqual([{ werks: 'A', materials: ['2'], message: 'slow' }]);
  });

  it('a retry slots the recovered FG in without touching the rows already there', async () => {
    cost.mockImplementation(async (qq: { materials: string[] }) => (qq.materials[0] === '2' ? { rows: [line('2', 1)], messages: [], ms: 1 } : ok(qq.materials)));
    const units = [{ werks: 'A', materials: ['1'] }, { werks: 'A', materials: ['2'] }];
    const first = await runPlanUnits(q, units, { parts: [[line('1', 1)], []], indexes: [1] });
    expect(first.rows.map((x) => x.Headmat)).toEqual(['1', '2']);
  });

  it('stops at once when cancelled', async () => {
    const c = new AbortController();
    cost.mockImplementation(async () => { c.abort(); throw new SapError('x', 'aborted'); });
    await expect(runPlanUnits(q, [{ werks: 'A', materials: ['1'] }], { signal: c.signal })).rejects.toThrow('aborted');
  });

  it('a plan with no plant list is one plain run', async () => {
    expect(await planUnits({ ...q, materials: ['7'] }, [])).toEqual([{ werks: '', materials: ['7'] }]);
  });
});
