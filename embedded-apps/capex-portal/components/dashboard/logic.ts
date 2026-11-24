import { fyDigits, num, slaState, slaTone } from '@/lib/format';
import type { ApprovalInbox } from '@/lib/entities';
import type { Tone } from '@/components/ui';

type N = string | number | null | undefined;

/** Percentage 0..100, clamped; 0 when there is no total (Dashboard/Reports `formatter.share`). */
export function share(part: N, total: N): number {
  const t = num(total);
  if (!t) return 0;
  return Math.max(0, Math.min(100, (num(part) / t) * 100));
}

/** Progress colour from utilisation: >=90 error, >=75 warning, else success (Dashboard.formatUtilState). */
export function utilTone(spent: N, approved: N): Tone {
  const p = share(spent, approved);
  if (p >= 90) return 'error';
  if (p >= 75) return 'warning';
  return 'success';
}

/** Stacked utilisation meter widths in % (Dashboard.formatMeter): spent, committed on top of spent, reserved (approved CPE) on top of committed. */
export function meterSegments(spent: N, committed: N, approvedCpe: N, total: N) {
  const pct = (v: N) => (num(total) ? Math.max(0, Math.min(100, (num(v) / num(total)) * 100)) : 0);
  const pSpent = pct(spent);
  return { spent: pSpent, committed: Math.max(0, pct(committed) - pSpent), reserved: Math.max(0, pct(approvedCpe) - pct(committed)) };
}

export interface QueueRow { level: string; count: number; value: number; days: number; maxDays: number; byType: Record<string, number>; tone: Tone }

/** Approval inbox grouped by DOA level, worst ageing first (Dashboard._buildQueue, log #41/#104). warnDays/breachDays come from ConfigSet. */
export function buildQueue(inbox: ApprovalInbox[], warnDays = 3, breachDays = 5): QueueRow[] {
  const m = new Map<string, QueueRow>();
  for (const r of inbox) {
    const k = r.CurrLevel || 'Unassigned';
    let o = m.get(k);
    if (!o) { o = { level: k, count: 0, value: 0, days: 0, maxDays: 0, byType: {}, tone: 'success' }; m.set(k, o); }
    const d = num(r.DaysPending);
    o.count += 1; o.value += num(r.Amount); o.days += d; o.maxDays = Math.max(o.maxDays, d);
    const t = r.Doctype || 'Other';
    o.byType[t] = (o.byType[t] ?? 0) + 1;
  }
  return Array.from(m.values()).map((o) => ({
    ...o,
    days: Math.round(o.days / o.count),
    tone: slaTone(slaState(o.maxDays, warnDays, breachDays)),
  })).sort((a, b) => b.maxDays - a.maxDays);
}

/** "2 CPE . 1 Budget" caption; empty when the level holds one document type only (log #104). */
export function queueBreakdown(byType: Record<string, number>): string {
  const labels: Record<string, string> = { BUD: 'Budget', CPE: 'CPE' };
  const keys = Object.keys(byType);
  if (keys.length <= 1) return '';
  return keys.map((k) => `${byType[k]} ${labels[k] ?? k}`).join(' · ');
}

/**
 * Inbox rows scoped to a fiscal year. ApprovalInboxSet has no year field, so each row is
 * cross-referenced to its Budget/CPE (Dashboard._recalcRollup, log #43). Rows whose document is unknown are dropped.
 */
export function inboxForYear(inbox: ApprovalInbox[], budgetFy: Map<string, string>, cpeFy: Map<string, string>, fy: string): ApprovalInbox[] {
  const want = fyDigits(fy);
  return inbox.filter((r) => {
    const rowFy = r.Doctype === 'BUD' ? budgetFy.get(r.Budgetid || r.Cpeid) : cpeFy.get(r.Cpeid);
    return rowFy === want;
  });
}

export const slaBreaches = (inbox: ApprovalInbox[], breachDays = 5) => inbox.filter((r) => num(r.DaysPending) > breachDays).length;

/** Readable IC status (Dashboard.formatIcStatus). */
export function icStatusLabel(s: string): string {
  return ({ PENDING: 'IC Pending', NOT_STARTED: 'IC Not Started', CAPITALIZED: 'Capitalized' } as Record<string, string>)[s] ?? (s || '-');
}

/** CWIP risk text from SAP -> tone. */
export function riskTone(s: string): Tone {
  const v = (s || '').toLowerCase();
  if (v.startsWith('err') || v.startsWith('high') || v.startsWith('crit')) return 'error';
  if (v.startsWith('warn') || v.startsWith('med')) return 'warning';
  if (v.startsWith('succ') || v.startsWith('low')) return 'success';
  return 'neutral';
}

export interface AuditFilter { q: string; docType: string; from: string; to: string }
export interface AuditRowView { Doctype: string; Docid: string; Action: string; Comments: string; Username: string; Userid: string; ts: number }

/** Audit Trail filters (AuditTrail.onFilter): free text over doc/action/user/comment, doc type, inclusive date range (yyyy-mm-dd). */
export function filterAudit<T extends AuditRowView>(rows: T[], f: AuditFilter): T[] {
  const q = f.q.trim().toLowerCase();
  const from = f.from ? new Date(`${f.from}T00:00:00`).getTime() : NaN;
  const to = f.to ? new Date(`${f.to}T23:59:59.999`).getTime() : NaN;
  return rows.filter((r) => {
    if (q && ![r.Docid, r.Action, r.Username, r.Userid, r.Comments].some((x) => (x || '').toLowerCase().includes(q))) return false;
    if (f.docType && r.Doctype !== f.docType) return false;
    if (!Number.isNaN(from) && r.ts < from) return false;
    if (!Number.isNaN(to) && r.ts > to) return false;
    return true;
  });
}

/** Route of the source document of an audit line, or null when the type has no detail screen. */
export function auditDocHref(docType: string, id: string): string | null {
  const base = ({ BUD: '/budget/detail/', CPE: '/cpe/detail/', PO: '/po/detail/', IC: '/ic/detail/', QUOTA: '/quota/detail/' } as Record<string, string>)[docType];
  return base ? `${base}?id=${encodeURIComponent(id)}` : null;
}

export function auditTone(t: string): Tone {
  return ({ BUD: 'info', CPE: 'success', PO: 'warning', IC: 'info' } as Record<string, Tone>)[t] ?? 'neutral';
}
