import { describe, expect, it } from 'vitest';
import type { ApprovalInbox, ApprovalStep, DoaChain } from '@/lib/entities';
import {
  buildCashFlowRows, buildDoaChain, buildStepChain, canActOn, commentError, docIdOf, filterRows, isGenericBackendError, isStale, nextRole,
  planBulk, runBudgetBulk, savingVsL1, skipUnitTechnical, splitByType, summarize,
} from '@/components/approvals/logic';

const row = (o: Partial<ApprovalInbox>): ApprovalInbox => ({ Cpeid: 'CPE-1', Doctype: 'CPE', Priority: 'High', Budgetid: 'B-1', PlantName: 'P', SubmittedByName: 'A', Title: 'Press line', ReachedOn: '', Werks: 'UN13', Capextype: '', DueOn: '', Category: '', DaysPending: 1, Amount: '100000', SlaState: '', Waers: 'INR', Status: 'IN_APPROVAL', CurrLevel: 'HOD', SubmittedBy: 'a', SubmittedOn: '', ...o });
const who = { role: 'HOD', isAdmin: false };

describe('inbox', () => {
  const rows = [row({ Cpeid: 'CPE-1', DaysPending: 1 }), row({ Cpeid: 'CPE-2', DaysPending: 4, Priority: 'Low', Title: 'Boiler' }), row({ Cpeid: 'B-9', Doctype: 'BUD', DaysPending: 9, Priority: 'Medium' })];
  it('splits by doc type permanently (log #101/#107)', () => {
    const s = splitByType(rows);
    expect(s.cpe.map(docIdOf)).toEqual(['CPE-1', 'CPE-2']);
    expect(s.budget.map(docIdOf)).toEqual(['B-9']);
  });
  it('filters by search, sla bucket (3/5 boundaries) and priority', () => {
    const f = { query: '', sla: '' as const, priority: '' };
    expect(filterRows(rows, { ...f, query: 'boil' }, 3, 5)).toHaveLength(1);
    expect(filterRows(rows, { ...f, query: 'b-9' }, 3, 5)).toHaveLength(1);
    expect(filterRows(rows, { ...f, sla: 'atRisk' }, 3, 5).map(docIdOf)).toEqual(['CPE-2']);
    expect(filterRows(rows, { ...f, sla: 'breached' }, 3, 5).map(docIdOf)).toEqual(['B-9']);
    expect(filterRows(rows, { ...f, priority: 'Low' }, 3, 5)).toHaveLength(1);
    expect(filterRows([row({ DaysPending: 3 }), row({ DaysPending: 5 })], { ...f, sla: 'onTrack' }, 3, 5)).toHaveLength(1);
  });
  it('summarizes value and SLA buckets', () => {
    expect(summarize(rows, 3, 5)).toEqual({ count: 3, value: 300000, onTrack: 1, atRisk: 1, breached: 1 });
  });
});

describe('can act / stale (log #110/#114)', () => {
  it('needs IN_APPROVAL, a level, and my role or admin', () => {
    expect(canActOn({ Status: 'IN_APPROVAL', CurrLevel: 'HOD' }, who)).toBe(true);
    expect(canActOn({ Status: 'IN_APPROVAL', CurrLevel: 'VP' }, who)).toBe(false);
    expect(canActOn({ Status: 'IN_APPROVAL', CurrLevel: 'VP' }, { role: 'x', isAdmin: true })).toBe(true);
    expect(canActOn({ Status: 'APPROVED', CurrLevel: 'HOD' }, who)).toBe(false);
    expect(canActOn({ Status: 'IN_APPROVAL', CurrLevel: '' }, who)).toBe(false);
    expect(canActOn(null, who)).toBe(false);
  });
  it('stale when moved on or gone', () => {
    expect(isStale({ Status: 'IN_APPROVAL', CurrLevel: 'VP' }, who)).toBe(true);
    expect(isStale(null, who)).toBe(true);
    expect(isStale({ Status: 'IN_APPROVAL', CurrLevel: 'HOD' }, who)).toBe(false);
  });
  it('planBulk skips and reports already-actioned ids', () => {
    const p = planBulk(['A', 'B', 'C'], { A: { Status: 'IN_APPROVAL', CurrLevel: 'HOD' }, B: { Status: 'IN_APPROVAL', CurrLevel: 'VP' }, C: null }, who);
    expect(p).toEqual({ valid: ['A'], stale: ['B', 'C'] });
  });
});

describe('runBudgetBulk', () => {
  const ok = { Status: 'IN_APPROVAL', CurrLevel: 'HOD' };
  it('re-reads before EACH action, skips actioned rows, approves the rest in order', async () => {
    const calls: string[] = [];
    const res = await runBudgetBulk(['A', 'B', 'C'], who, {
      readLive: async (id) => { calls.push('read ' + id); return id === 'B' ? { Status: 'APPROVED', CurrLevel: 'HOD' } : ok; },
      approve: async (id) => { calls.push('approve ' + id); },
    });
    expect(res).toEqual({ approved: ['A', 'C'], skipped: ['B'] });
    expect(calls).toEqual(['read A', 'approve A', 'read B', 'read C', 'approve C']);
  });
  it('stops at the first failure and reports which one', async () => {
    const err = new Error('boom');
    const res = await runBudgetBulk(['A', 'B', 'C'], who, { readLive: async () => ok, approve: async (id) => { if (id === 'B') throw err; } });
    expect(res.approved).toEqual(['A']);
    expect(res.failed).toEqual({ id: 'B', error: err });
  });
});

describe('chain', () => {
  const doa = (r: string, n: number): DoaChain => ({ ApproverName: r + ' name', Mandatory: 'X', Doaid: 'D1', Seqnr: String(n), Role: r, Approver: '', SlaDays: 2 });
  it('marks steps before current APPROVED, current PENDING, rest WAITING; 8 steps not truncated', () => {
    const c = buildDoaChain(Array.from({ length: 8 }, (_, i) => doa('R' + i, i + 1)), 'R3', 'IN_APPROVAL');
    expect(c).toHaveLength(8);
    expect(c.map((s) => s.status)).toEqual(['APPROVED', 'APPROVED', 'APPROVED', 'PENDING', 'WAITING', 'WAITING', 'WAITING', 'WAITING']);
  });
  it('a fully approved document marks every step done', () => {
    expect(buildDoaChain([doa('A', 1), doa('B', 2)], 'Completed', 'APPROVED').every((s) => s.status === 'APPROVED')).toBe(true);
  });
  it('skips Unit Technical and renumbers (log #135)', () => {
    const c = buildDoaChain([doa('Unit Technical Head', 1), doa('HOD', 2), doa('VP', 3)], 'HOD', 'IN_APPROVAL');
    expect(c.map((s) => [s.level, s.role])).toEqual([[1, 'HOD'], [2, 'VP']]);
    expect(skipUnitTechnical([{ role: 'unit technical x', level: 1 }, { role: 'A', level: 2 }])).toEqual([{ role: 'A', level: 1 }]);
  });
  it('nextRole: next level, or final on the last step', () => {
    const c = buildDoaChain([doa('A', 1), doa('B', 2)], 'A', 'IN_APPROVAL');
    expect(nextRole(c)).toEqual({ final: false, next: 'B' });
    expect(nextRole(buildDoaChain([doa('A', 1), doa('B', 2)], 'B', 'IN_APPROVAL'))).toEqual({ final: true, next: '' });
  });
  it('uses the newest cycle of real steps', () => {
    const st = (cy: string, lv: string, status: string, role: string, cur = '', reachedOn = ''): ApprovalStep => ({ IsCurrent: cur, Cyclenr: cy, Escalated: '', Doctype: 'CPE', IsAuto: '', ApproverName: '', Rollout: '', Docid: 'C', Levelnr: lv, Role: role, Approver: '', ActualAppr: '', Status: status, SlaDays: 1, ReachedOn: reachedOn, ActedOn: '', DueOn: '', Comments: 'ok' });
    const c = buildStepChain([st('1', '1', 'REJECTED', 'OLD'), st('2', '1', 'APPROVED', 'HOD'), st('2', '2', 'PENDING', 'VP', 'X')]);
    expect(c.map((s) => [s.role, s.status])).toEqual([['HOD', 'APPROVED'], ['VP', 'PENDING']]);
  });
  it('reachedOn (when a level\'s turn started) carries through distinct from actedOn (when it was decided) - the print Approval Status table uses reachedOn', () => {
    const st = (lv: string, status: string, role: string, reachedOn: string): ApprovalStep => ({ IsCurrent: '', Cyclenr: '1', Escalated: '', Doctype: 'CPE', IsAuto: '', ApproverName: '', Rollout: '', Docid: 'C', Levelnr: lv, Role: role, Approver: '', ActualAppr: '', Status: status, SlaDays: 1, ReachedOn: reachedOn, ActedOn: '', DueOn: '', Comments: '' });
    const c = buildStepChain([st('1', 'APPROVED', 'HOD', '2026-11-01'), st('2', 'PENDING', 'VP', '2026-11-06')]);
    expect(c.map((s) => s.reachedOn)).toEqual(['2026-11-01', '2026-11-06']);
    // A level never reached yet has neither a reachedOn nor an actedOn.
    expect(buildDoaChain([{ Doaid: 'D', Seqnr: '1', Role: 'HOD' } as any], 'HOD', 'IN_APPROVAL').map((s) => s.reachedOn)).toEqual(['']);
  });
});

describe('misc', () => {
  it('comment minimum', () => {
    expect(commentError('short', 10, 'reject')).not.toBe('');
    expect(commentError('  long enough here ', 10, 'reject')).toBe('');
  });
  it('cash flow rows discount at hurdle and accumulate from -investment', () => {
    const r = buildCashFlowRows([110, 121], 10, 150);
    expect(r[0].discounted).toBeCloseTo(100); expect(r[1].discounted).toBeCloseTo(100);
    expect(r[1].cumulative).toBeCloseTo(50);
  });
  it('saving vs L1', () => {
    const v = (Ranking: string, Selected: string, Totalcost: string) => ({ Ranking, Selected, QuoteAmt: Totalcost, Totalcost });
    expect(savingVsL1([v('L1', '', '100'), v('L2', 'X', '120')])).toBe(-20);
    expect(savingVsL1([v('L1', 'X', '100'), v('L2', '', '120')])).toBe(0);
  });
  it('detects the gateway generic error', () => {
    expect(isGenericBackendError(new Error('In the context of Data Services an unknown internal server error occurred'))).toBe(true);
    expect(isGenericBackendError(new Error('Budget exhausted'))).toBe(false);
  });
});
