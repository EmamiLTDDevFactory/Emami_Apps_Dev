import { describe, expect, it } from 'vitest';
import { auditDocHref, buildQueue, filterAudit, inboxForYear, meterSegments, queueBreakdown, utilTone } from '@/components/dashboard/logic';
import type { ApprovalInbox } from '@/lib/entities';

const row = (o: Partial<ApprovalInbox>) => ({ Cpeid: 'C1', Doctype: 'CPE', Budgetid: '', CurrLevel: 'L1', DaysPending: 1, Amount: '100', ...o }) as unknown as ApprovalInbox;

describe('dashboard logic', () => {
  it('utilTone thresholds', () => {
    expect(utilTone(90, 100)).toBe('error'); expect(utilTone(75, 100)).toBe('warning'); expect(utilTone(10, 100)).toBe('success'); expect(utilTone(5, 0)).toBe('success');
  });
  it('meter segments stack', () => {
    const m = meterSegments(20, 50, 70, 100);
    expect(m).toEqual({ spent: 20, committed: 30, reserved: 20 });
  });
  it('queue groups by level, worst first, SLA tone, breakdown', () => {
    const q = buildQueue([row({ CurrLevel: 'A', DaysPending: 2 }), row({ CurrLevel: 'B', DaysPending: 6, Doctype: 'BUD' }), row({ CurrLevel: 'B', DaysPending: 2 })]);
    expect(q[0].level).toBe('B'); expect(q[0].tone).toBe('error'); expect(q[0].days).toBe(4); expect(q[1].tone).toBe('success');
    expect(queueBreakdown(q[0].byType)).toBe('1 Budget · 1 CPE'); expect(queueBreakdown(q[1].byType)).toBe('');
  });
  it('inbox is scoped to the year via its document', () => {
    const r = inboxForYear([row({ Cpeid: 'C1' }), row({ Cpeid: 'C2' })], new Map(), new Map([['C1', '2026'], ['C2', '2025']]), 'FY2026');
    expect(r.map((x) => x.Cpeid)).toEqual(['C1']);
  });
  it('audit filter + doc links', () => {
    const rows = [{ Doctype: 'CPE', Docid: 'CPE-1', Action: 'Approved', Comments: '', Username: 'Ann', Userid: 'a', ts: new Date('2026-11-02T10:00:00').getTime() }, { Doctype: 'BUD', Docid: 'B-1', Action: 'Created', Comments: 'x', Username: 'Bob', Userid: 'b', ts: new Date('2026-10-01T10:00:00').getTime() }];
    expect(filterAudit(rows, { q: 'ann', docType: '', from: '', to: '' })).toHaveLength(1);
    expect(filterAudit(rows, { q: '', docType: 'BUD', from: '', to: '' })).toHaveLength(1);
    expect(filterAudit(rows, { q: '', docType: '', from: '2026-11-02', to: '2026-11-02' })).toHaveLength(1);
    expect(auditDocHref('CPE', 'CPE-1')).toBe('/cpe/detail/?id=CPE-1'); expect(auditDocHref('GRN', 'x')).toBeNull();
  });
});
