import type { Severity, TicketRow } from './types';

// Every date in Setu is shown in IST, wherever the viewer is.
const TZ = 'Asia/Kolkata';

export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
export const fmtNum = (n: number) => n.toLocaleString('en-IN');

/** Today in IST as YYYY-MM-DD (date inputs and the report range). */
export const istToday = (offsetDays = 0) => new Date(Date.now() + 330 * 60_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);

export function relative(iso: string | null): string {
  if (!iso) return '—';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : fmtDate(iso);
}

/** "2h 05m" / "3d 4h" for a number of minutes. */
export function fmtMins(mins: number | null | undefined): string {
  if (mins === null || mins === undefined) return '—';
  const m = Math.abs(Math.round(mins));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export const PRIORITY_LABEL: Record<number, string> = { 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Urgent' };
export const PRIORITY_TONE: Record<number, 'neutral' | 'accent' | 'warn' | 'bad'> = { 1: 'neutral', 2: 'accent', 3: 'warn', 4: 'bad' };
export const SEVERITY_LABEL: Record<Severity, string> = { FATAL: 'Fatal', SERIOUS: 'Serious', NORMAL: 'Normal' };
export const SEVERITY_TONE: Record<Severity, 'bad' | 'warn' | 'neutral'> = { FATAL: 'bad', SERIOUS: 'warn', NORMAL: 'neutral' };
/** Left edge colour of a ticket row / card. */
export const SEVERITY_EDGE: Record<Severity, string> = { FATAL: 'border-l-bad', SERIOUS: 'border-l-warn', NORMAL: 'border-l-line' };

export type SlaState = { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral'; title: string };

/** What the SLA clock says for a ticket: first response until someone replies, then resolution. */
export function slaState(t: Pick<TicketRow, 'firstResponseDueAt' | 'resolutionDueAt' | 'firstRespondedAt' | 'resolvedAt' | 'pausesSla' | 'isResolved' | 'frViolated' | 'resViolated'>, now = Date.now()): SlaState {
  if (t.isResolved) {
    const late = t.resViolated;
    return { label: late ? 'Resolved late' : 'Resolved', tone: late ? 'bad' : 'good', title: late ? 'Resolved after the resolution due time' : 'Resolved within SLA' };
  }
  if (t.pausesSla) return { label: 'Paused', tone: 'neutral', title: 'The SLA clock is paused in this status' };
  const first = !t.firstRespondedAt && t.firstResponseDueAt;
  const due = first ? t.firstResponseDueAt : t.resolutionDueAt;
  if (!due) return { label: 'No SLA', tone: 'neutral', title: 'No SLA target applies' };
  const mins = (new Date(due).getTime() - now) / 60_000;
  const what = first ? 'First response' : 'Resolution';
  if (mins < 0) return { label: `Overdue ${fmtMins(mins)}`, tone: 'bad', title: `${what} was due ${fmtDateTime(due)}` };
  return { label: `${first ? 'Respond' : 'Resolve'} in ${fmtMins(mins)}`, tone: mins <= 60 ? 'warn' : 'good', title: `${what} due ${fmtDateTime(due)}` };
}

const ENTITY: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
/** HTML to readable plain text (canned responses go into the plain-text composer). */
export const htmlToText = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITY[m] ?? m)
    .trim();

export const ACTION_LABEL: Record<string, string> = {
  created: 'Created',
  updated: 'Updated',
  automation: 'Automation',
  email_sent: 'Email sent',
  message: 'Message',
  requester_replied: 'Requester replied',
  call_logged: 'Call',
  whatsapp_sent: 'WhatsApp sent',
  whatsapp_failed: 'WhatsApp not sent',
  linked: 'Linked',
  unlinked: 'Unlinked',
  merged_into: 'Merged into',
  merged_from: 'Merged in',
  child_of: 'Child ticket of',
  child_added: 'Child ticket added',
  scenario: 'Scenario',
  spam: 'Marked as spam',
  unspam: 'Not spam',
  trashed: 'Moved to trash',
  restored: 'Restored',
  csat_received: 'Rated the support',
};

/** Last-activity wording in the ticket list ("Requester replied", "Status changed" ...). */
export const ACTIVITY_LABEL: Record<string, string> = {
  created: 'Created',
  status: 'Status changed',
  assigned: 'Assigned',
  agent_reply: 'Agent replied',
  requester_reply: 'Requester replied',
  note: 'Note added',
  forward: 'Forwarded',
  call: 'Call logged',
};

export const BELL_EVENT_LABEL: Record<string, string> = {
  requester_reply: 'Requester replies',
  new_ticket: 'New tickets from email, portal or WhatsApp',
  assigned: 'Tickets assigned to me',
  note: 'Private notes on my tickets',
  mention: 'Someone @mentioned me in a note',
  status_changed: "Someone else changed my ticket's status",
  escalated: 'Tickets escalated to L3',
  sla_warning: 'First response / resolution due soon',
  sla_breach: 'SLA breached',
  csat: 'Requester rated the support',
  watching: 'Updates on tickets I watch',
};

/** Short names for the bell's filter chips. */
export const BELL_EVENT_SHORT: Record<string, string> = {
  requester_reply: 'Replies', new_ticket: 'New', assigned: 'Assigned', note: 'Notes', mention: 'Mentions', status_changed: 'Status',
  escalated: 'Escalated', sla_warning: 'Due soon', sla_breach: 'SLA breach', csat: 'CSAT', watching: 'Watching',
};

/** Agent email / Emami Apps inbox notifications an agent can switch off (backend AGENT_EMAIL_TEMPLATES). */
export const EMAIL_NOTICE_LABEL: Record<string, string> = {
  'agent.assigned_agent': 'A ticket is assigned to me',
  'agent.assigned_group': 'A ticket is routed to my group',
  'agent.requester_replied': 'The requester replied on my ticket',
  'agent.note_added': 'A colleague added a note on my ticket',
  'agent.first_response_reminder': 'First response due soon',
  'agent.resolution_reminder': 'Resolution due soon',
  'agent.first_response_violated': 'First response overdue',
  'agent.resolution_violated': 'Resolution overdue',
  'agent.escalation_l3': 'Ticket escalated to L3',
};

/** Seconds as "4m 30s" / "1h 5m". */
export function fmtSecs(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return secs % 60 ? `${m}m ${secs % 60}s` : `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
