import { FIELDS } from './constants.js';
import { datesToAutoFillForStatus, todayStr, shortId, revisedTarget } from './utils.js';

// Jira-style project-management layer on top of the original 28 item fields. The backend stores
// these as extra columns on dev_tracker.items (see PM_FIELDS in backend/devTracker.js); issueNo is
// assigned server-side and read-only here.
export const PM_FIELDS = ['issueType', 'description', 'storyPoints', 'epicId', 'sprintId', 'parentId', 'labels', 'reporter', 'rank'];
export const ALL_ITEM_FIELDS = [...FIELDS, ...PM_FIELDS];

export const PROJECT_KEY = 'DEV';
export const PROJECT_NAME = 'SAP Development';

export const ISSUE_TYPES = [
  { key: 'Epic', color: '#904EE2', description: 'A large body of work that groups stories and tasks.' },
  { key: 'Story', color: '#63BA3C', description: 'A user-facing requirement or change.' },
  { key: 'Task', color: '#4BADE8', description: 'A piece of work to be done.' },
  { key: 'Bug', color: '#E5493A', description: 'A problem or defect to fix.' },
  { key: 'Sub-task', color: '#4BADE8', description: 'A smaller piece of a parent issue.' },
];
export const ISSUE_TYPE_META = Object.fromEntries(ISSUE_TYPES.map((t) => [t.key, t]));

// Jira's three status categories, mapped from this app's SAP delivery statuses. Board column
// headers, lozenges, progress bars and every "done" check derive from this one table.
export const STATUS_CATEGORY = {
  'Not Started': 'todo',
  'On Hold': 'todo',
  'Requirement Discussion': 'inprogress',
  'FS Preparation': 'inprogress',
  'In Progress': 'inprogress',
  'IT Testing': 'inprogress',
  'User Testing': 'inprogress',
  Hypercare: 'inprogress',
  Completed: 'done',
  Cancelled: 'done',
};
export const CATEGORY_META = {
  todo: { label: 'To Do', bg: '#DFE1E6', fg: '#42526E', bar: '#8993A4' },
  inprogress: { label: 'In Progress', bg: '#DEEBFF', fg: '#0747A6', bar: '#0C66E4' },
  done: { label: 'Done', bg: '#E3FCEF', fg: '#006644', bar: '#22A06B' },
};
export function statusCategory(status) {
  return STATUS_CATEGORY[status] || 'todo';
}
export function isDone(it) {
  return statusCategory(it?.status) === 'done';
}

export const PRIORITY_META = {
  P1: { label: 'High', color: '#E5493A', dir: 'up' },
  P2: { label: 'Medium', color: '#E97F33', dir: 'mid' },
  P3: { label: 'Low', color: '#2D8738', dir: 'down' },
};

export function issueKey(it) {
  if (!it) return '';
  if (it.issueNo != null) return `${PROJECT_KEY}-${it.issueNo}`;
  return `${it.area || 'GEN'}-${shortId(it.id)}`;
}
export function typeOf(it) {
  return ISSUE_TYPE_META[it?.issueType] ? it.issueType : 'Task';
}
export function isEpic(it) {
  return it?.issueType === 'Epic';
}
export function points(it) {
  const n = Number(it?.storyPoints);
  return Number.isFinite(n) ? n : 0;
}
export function parseLabels(v) {
  return String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
}
export function fmtPoints(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// Backlog/board order: explicit rank (drag-to-reorder), else creation order.
export function rankOf(it) {
  if (it.rank != null && Number.isFinite(Number(it.rank))) return Number(it.rank);
  const t = new Date(it.createdAt || 0).getTime();
  return Number.isNaN(t) ? 0 : t;
}
export function byRank(a, b) {
  return rankOf(a) - rankOf(b);
}
// A rank that lands between two neighbours (either may be missing at a list edge).
export function rankBetween(before, after) {
  const a = before ? rankOf(before) : null;
  const b = after ? rankOf(after) : null;
  if (a == null && b == null) return Date.now();
  if (a == null) return b - 1000;
  if (b == null) return a + 1000;
  return (a + b) / 2;
}

// PUT /items/:id on an older API is a full-row replace, so every save sends the whole row — the
// item's current values with `patch` on top. A status change also back-fills the stage dates it
// implies (same rule the original New/Edit panel and Kanban drag used), never overwriting a date
// that is already set.
export function buildPayload(item, patch = {}) {
  const payload = {};
  for (const key of ALL_ITEM_FIELDS) payload[key] = item?.[key] ?? '';
  Object.assign(payload, patch);
  if (patch.status && patch.status !== item?.status) {
    const today = todayStr();
    for (const dateKey of datesToAutoFillForStatus(patch.status)) {
      if (!payload[dateKey]) payload[dateKey] = today;
    }
  }
  return payload;
}

export function dueDate(it) {
  return revisedTarget(it) || '';
}

// Case-insensitive "is this me" check against the free-text name fields, matching on the hub
// profile name or the email's local part — same rule the old My Work preset used.
export function namesForMe(profileName, email) {
  const out = [];
  if (profileName) out.push(profileName.trim().toLowerCase());
  if (email) out.push(String(email).split('@')[0].replace(/[._]/g, ' ').trim().toLowerCase());
  return out.filter(Boolean);
}
export function nameMatches(value, myNames) {
  const v = (value || '').trim().toLowerCase();
  return !!v && myNames.some((n) => v === n || v.startsWith(n) || n.startsWith(v));
}

// Timezone-safe day arithmetic on 'YYYY-MM-DD' strings, used by the workspace code (timeline,
// sprints, reports). utils.js's addDays() now does the same UTC math.
export function shiftDate(dateStr, days) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + (Number(days) || 0))).toISOString().slice(0, 10);
}
