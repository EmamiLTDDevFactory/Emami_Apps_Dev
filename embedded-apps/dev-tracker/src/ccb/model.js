import { ROUTES } from '../shared/routes.js';

// Labels, tones and the process model for the Change Control Board. The nine steps are the
// "Proposed Change Process with CCB" from the change management deck (Oct 2026); steps 6-9 are
// read live from the linked Dev Tracker assignment, so one request shows its whole journey.

export const CATEGORY_META = {
  major: { label: 'Major CR / project', inScope: true },
  financial: { label: 'Financial impact', inScope: true },
  control: { label: 'Control-level change', inScope: true },
  strategic: { label: 'Strategic change', inScope: true },
  report: { label: 'Report (new / modification)', inScope: false },
  cosmetic: { label: 'Cosmetic change', inScope: false },
};
export const CATEGORY_HELP = {
  major: 'Major CRs or projects not on the out-of-scope list.',
  financial: 'Changes that affect financial postings, valuation or reporting.',
  control: 'Changes to approvals, authorisations or internal controls.',
  strategic: 'Changes tied to strategic business initiatives.',
  report: 'New reports or modifications to existing reports.',
  cosmetic: 'Layout, label or other cosmetic changes with no process impact.',
};

export const STATUS_META = {
  draft: { label: 'Draft', tone: 'gray' },
  feasibility_review: { label: 'Feasibility review', tone: 'amber' },
  awaiting_ccb: { label: 'Awaiting CCB', tone: 'indigo' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  withdrawn: { label: 'Withdrawn', tone: 'gray' },
  terminated: { label: 'Terminated', tone: 'red' },
};

export const PRIORITY_META = {
  critical: { label: 'Critical', tone: 'red' },
  high: { label: 'High', tone: 'amber' },
  medium: { label: 'Medium', tone: 'blue' },
  low: { label: 'Low', tone: 'gray' },
};

export const FEASIBILITY_META = {
  feasible: { label: 'Feasible', tone: 'green' },
  feasible_with_conditions: { label: 'Feasible with conditions', tone: 'amber' },
  not_feasible: { label: 'Not feasible', tone: 'red' },
};

export const ROUTE_META = {
  ccb: { label: 'Approved by CCB', tone: 'green' },
  out_of_scope: { label: 'Approved by IT Application Head (outside CCB scope)', tone: 'teal' },
  emergency: { label: 'Emergency approval by IT Application Head', tone: 'purple' },
};

export const DECISION_META = {
  approved: { label: 'Approved', tone: 'green' },
  approved_with_modifications: { label: 'Approved with modifications', tone: 'teal' },
  rejected: { label: 'Rejected', tone: 'red' },
  deferred: { label: 'Deferred', tone: 'amber' },
  ratified: { label: 'Ratified', tone: 'green' },
  not_ratified: { label: 'Not ratified', tone: 'red' },
};

export const MEETING_STATUS_META = {
  scheduled: { label: 'Scheduled', tone: 'blue' },
  in_progress: { label: 'In session', tone: 'purple' },
  completed: { label: 'Completed', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'gray' },
};

export const ROLE_META = {
  'IT SPOC': { tone: 'blue', duty: 'Reviews the requirement, logs it in the CCB application and categorises it against the CCB scope for the next meeting.' },
  'Module Lead': { tone: 'teal', duty: 'Logs requests for their system or module and assigns the developer once a change is approved.' },
  'IT Application Head': { tone: 'purple', duty: 'Checks scope and feasibility, including the impact on other systems and modules; recommends and puts items up to the CCB; updates requests after CCB discussion and initiates or terminates development.' },
  'CCB Secretary': { tone: 'indigo', duty: 'Schedules and runs CCB meetings: agenda, attendance, decisions and minutes.' },
  'CCB Member': { tone: 'green', duty: 'Approves, rejects or modifies in-scope change requests. Counts toward quorum.' },
};
export const ROLES = Object.keys(ROLE_META);

// IT area of a request (stored in the request's "sapSystem" column) and suggested systems / modules for
// each — the CCB covers every IT change, not only ERP. Users can also type their own.
export const IT_AREAS = ['ERP', 'Application Development', 'Analytics', 'Infrastructure', 'Cybersecurity', 'Other'];
export const AREA_MODULES = {
  ERP: ['SD', 'MM', 'PP', 'QM', 'PM', 'WM', 'FI', 'CO', 'HR', 'BW', 'ABAP', 'Basis'],
  'Application Development': ['Web portal', 'Mobile app', 'Emami Apps hub', 'Integration / API', 'Workflow', 'Database'],
  Analytics: ['Power BI', 'Data warehouse', 'Data pipeline', 'Dashboards', 'Data model', 'AI / ML'],
  Infrastructure: ['Network', 'Servers', 'Cloud', 'Storage & backup', 'End-user devices', 'Email & collaboration'],
  Cybersecurity: ['Identity & access', 'Firewall', 'Endpoint security', 'Monitoring', 'Policies'],
  Other: [],
};

// Dev Tracker statuses in pipeline order (see shared/constants.js STATUSES).
const DEV_ORDER = ['Not Started', 'Requirement Discussion', 'FS Preparation', 'In Progress', 'IT Testing', 'User Testing', 'Hypercare', 'Completed'];
const devIndex = (s) => DEV_ORDER.indexOf(s);

export const PROCESS_STEPS = [
  { key: 'raise', label: 'Function raises requirement', sub: 'with BRD' },
  { key: 'log', label: 'IT SPOC logs request', sub: 'in the CCB application', isNew: true },
  { key: 'categorise', label: 'Categorised against CCB scope', sub: 'IT SPOC', isNew: true },
  { key: 'feasibility', label: 'Scope & feasibility check', sub: 'IT Application Head', isNew: true },
  { key: 'ccb', label: 'CCB decision', sub: 'approve, reject or modify', isNew: true },
  { key: 'assign', label: 'Developer assigned', sub: 'Module Lead' },
  { key: 'build', label: 'Developer builds the change', sub: 'config, code, unit test' },
  { key: 'uat', label: 'Function performs UAT', sub: 'user acceptance' },
  { key: 'transport', label: 'Deployed & verified', sub: 'release to production' },
];

/** Per-step state for a request: done | current | todo | skipped | stopped, plus an optional note. */
export function processState(r) {
  const s = PROCESS_STEPS.map(() => ({ state: 'todo', note: '' }));
  const set = (i, state, note = '') => { s[i] = { state, note }; };
  set(0, 'done'); set(1, 'done');
  const stoppedAt = (i, note) => { set(i, 'stopped', note); };

  if (r.status === 'draft') { set(2, 'current', r.returnNote ? 'Returned for clarification' : 'Draft'); return s; }
  set(2, 'done');
  if (r.status === 'withdrawn') {
    const i = r.reviewedAt ? 4 : 3;
    for (let k = 2; k < i; k++) set(k, 'done');
    stoppedAt(i, 'Withdrawn');
    return s;
  }
  if (r.status === 'feasibility_review') { set(3, 'current', 'With IT Application Head'); return s; }
  if (r.status === 'rejected' && !r.meetingId) { stoppedAt(3, 'Rejected at feasibility'); return s; }
  set(3, 'done');
  if (r.status === 'awaiting_ccb') { set(4, 'current', 'On the CCB agenda'); return s; }
  if (r.status === 'rejected') { stoppedAt(4, 'Rejected by CCB'); return s; }

  if (r.approvalRoute === 'out_of_scope') set(4, 'skipped', 'Not required — outside CCB scope');
  else if (r.approvalRoute === 'emergency') set(4, r.ratificationStatus === 'ratified' ? 'done' : 'current', r.ratificationStatus === 'ratified' ? 'Emergency approval ratified' : r.ratificationStatus === 'not_ratified' ? 'Not ratified by CCB' : 'Emergency approval — ratification pending');
  else set(4, 'done', r.decision === 'approved_with_modifications' ? 'Approved with modifications' : 'Approved');

  const dev = r.devStatus;
  const di = devIndex(dev);
  const terminated = r.status === 'terminated' || dev === 'Cancelled';
  const developer = r.devDeveloper;
  const next = (i, note) => (terminated ? stoppedAt(i, 'Development terminated') : set(i, 'current', note));

  if (!developer && di <= 0) { next(5, 'Awaiting developer'); return s; }
  set(5, 'done', developer || '');
  if (di <= 4) { next(6, dev === 'On Hold' ? 'On hold' : dev || 'Not started'); return s; }
  set(6, 'done');
  if (di === 5) { next(7, 'In UAT'); return s; }
  set(7, 'done');
  if (di === 6) { set(8, 'done', 'Live · hypercare'); return s; }
  set(8, 'done', 'Delivered');
  return s;
}

/** Index of the step a request is at (first current/stopped step; 9 when fully delivered). */
export function currentStepIndex(r) {
  const st = processState(r);
  const i = st.findIndex((x) => x.state === 'current' || x.state === 'stopped');
  return i === -1 ? PROCESS_STEPS.length : i;
}

/** One short "where is it now" label for list views. */
export function stageLabel(r) {
  if (r.status !== 'approved') return STATUS_META[r.status]?.label || r.status;
  if (!r.devStatus) return 'Approved';
  if (r.devStatus === 'Completed') return 'Delivered';
  if (r.devStatus === 'Cancelled') return 'Cancelled in Dev Tracker';
  if (r.devStatus === 'Not Started' && !r.devDeveloper) return 'Awaiting developer';
  if (r.devStatus === 'User Testing') return 'In UAT';
  if (r.devStatus === 'Hypercare') return 'Live · hypercare';
  return `In development · ${r.devStatus}`;
}

export const isDelivered = (r) => r.status === 'approved' && ['Completed', 'Hypercare'].includes(r.devStatus);
export const isInDelivery = (r) => r.status === 'approved' && !isDelivered(r) && r.devStatus !== 'Cancelled';
export const isClosed = (r) => ['rejected', 'withdrawn', 'terminated'].includes(r.status);
export const informOverdue = (r) => r.approvalRoute === 'emergency' && !r.ccbInformedAt && r.informDueBy && dateOnly(r.informDueBy) < todayIso();

export function devTrackerLink(issueNo) {
  return `${ROUTES.dashboard}?issue=Assignment-${issueNo}`;
}
export function requestLink(crNo) {
  return `${ROUTES.ccbRequests}?cr=${encodeURIComponent(crNo)}`;
}
export function meetingLink(id) {
  return `${ROUTES.ccbMeetings}?id=${id}`;
}

/* ---------- Dates ---------- */

export function todayIso() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
export function dateOnly(v) {
  if (!v) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
export function fmtDate(v) {
  const iso = dateOnly(v);
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function fmtDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
}
export function fmtTime(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
}
export function relative(v) {
  if (!v) return '';
  const diff = (Date.now() - new Date(v).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} d ago`;
  return fmtDate(v);
}
export function daysUntil(v) {
  const target = new Date(v);
  const now = new Date();
  const a = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86400000);
}

/** The board's regular slot: the 3rd Friday of the month — this month's if still ahead, else next. */
export function nextThirdFriday(from = new Date()) {
  const third = (y, m) => {
    const first = new Date(y, m, 1);
    const offset = (5 - first.getDay() + 7) % 7;
    return new Date(y, m, 1 + offset + 14);
  };
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let d = third(from.getFullYear(), from.getMonth());
  if (d < today) d = third(from.getFullYear(), from.getMonth() + 1);
  return d;
}
export function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Indian financial year (April–March) containing a date. */
export function fiscalYearStart(d = new Date()) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return new Date(y, 3, 1);
}

/* ---------- Ageing & service levels ---------- */

/** Mon–Fri days between two dates (start day excluded), for SLA ageing. */
export function businessDaysBetween(from, to = new Date()) {
  const d = new Date(from);
  const end = new Date(to);
  d.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  let n = 0;
  while (d < end) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

/**
 * Where an open request is waiting and for how long, against the board's targets (Governance settings):
 *   feasibility_review  business days since submission  vs reviewSlaDays (IT Application Head)
 *   awaiting_ccb        calendar days since recommended vs ccbSlaDays   (the board)
 * Returns null for stages without a target. state: 'ok' | 'due' (last 20 % of the window) | 'over'.
 */
export function slaOf(r, settings) {
  if (!settings) return null;
  let since; let used; let limit; let unit; let who;
  if (r.status === 'feasibility_review' && r.submittedAt) {
    since = r.submittedAt; used = businessDaysBetween(since); limit = settings.reviewSlaDays || 5; unit = 'business day'; who = 'IT Application Head';
  } else if (r.status === 'awaiting_ccb') {
    since = r.reviewedAt || r.submittedAt || r.updatedAt; if (!since) return null;
    used = Math.max(0, -daysUntil(since)); limit = settings.ccbSlaDays || 30; unit = 'day'; who = 'CCB';
  } else {
    return null;
  }
  const state = used > limit ? 'over' : used >= Math.ceil(limit * 0.8) ? 'due' : 'ok';
  return { since, used, limit, unit, who, state, label: `${used} of ${limit} ${unit}${limit === 1 ? '' : 's'}` };
}
export const SLA_TONE = { ok: 'green', due: 'amber', over: 'red' };

export const REVIEW_META = {
  support: { label: 'Support', tone: 'green' },
  concerns: { label: 'Concerns', tone: 'amber' },
  oppose: { label: 'Oppose', tone: 'red' },
};
export const ACTION_STATUS_META = {
  open: { label: 'Open', tone: 'blue' },
  done: { label: 'Done', tone: 'green' },
  dropped: { label: 'Dropped', tone: 'gray' },
};
export const actionOverdue = (a) => a.status === 'open' && a.dueDate && daysUntil(a.dueDate) < 0;
