// Ported 1:1 from the original app.js / home.js / admin.js / resource-utilization.js.
// These values are load-bearing (progress %, colors, roster bands) — do not "clean up"
// without checking every call site; several intentional quirks from the original are
// preserved on purpose (see comments) because the task was to keep existing logic intact.

export const API_BASE = 'https://audit-capa-api.emamiapps.in/api/dev-tracker';
export const ACCESS_API_BASE = 'https://audit-capa-api.emamiapps.in/api';
export const HUB_AUTH_API_BASE = 'https://in65bjvxjd.execute-api.ap-south-1.amazonaws.com/api';
export const HUB_EMAIL_STORAGE_KEY = 'emami_apps_user_email';

// The 24 item fields, in the exact order the backend's FIELDS array uses.
export const FIELDS = [
  'devList', 'status', 'area', 'func', 'impact', 'complexity', 'priority',
  'spocFunction', 'spocIT', 'devFactory', 'startDate', 'reqDiscussion', 'fsPrep',
  'development', 'itTesting', 'userTesting', 'hypercare', 'targetDate', 'devTime',
  'rework', 'reasonCategory', 'reasonDelay', 'remarks', 'developer',
];

// Human-readable labels for the 24 item fields — used for the New/Edit panel and, to
// match the original's CSV export, as the exported header row (not the raw camelCase keys).
export const FIELD_LABELS = {
  devList: 'Development / item title', status: 'Status', func: 'Functional area / process',
  area: 'Area', priority: 'Priority', impact: 'Business impact', complexity: 'Technical complexity',
  spocFunction: 'SPOC (Functional)', spocIT: 'SPOC (IT)', devFactory: 'Dev factory', developer: 'Developer',
  startDate: 'Start date', reqDiscussion: 'Requirement discussion', fsPrep: 'FS preparation',
  development: 'Development', itTesting: 'IT testing', userTesting: 'User testing', hypercare: 'Hypercare (days)',
  targetDate: 'Target date', devTime: 'Man-days', rework: 'Rework (days)', reasonCategory: 'Reason category',
  reasonDelay: 'Reason for delay (detail)', remarks: 'Remarks',
};

export const CATEGORIES = [
  { key: 'area', label: 'Area', hasColor: true },
  { key: 'status', label: 'Status', hasColor: false },
  { key: 'priority', label: 'Priority', hasColor: false },
  { key: 'impact', label: 'Business Impact', hasColor: false },
  { key: 'complexity', label: 'Technical Complexity', hasColor: false },
  { key: 'devFactory', label: 'Dev Factory', hasColor: false },
  { key: 'reasonCategory', label: 'Reason for Delay', hasColor: false },
];

export const STAGE_PIPELINE = [
  { key: 'reqDiscussion', status: 'Requirement Discussion' },
  { key: 'fsPrep', status: 'FS Preparation' },
  { key: 'development', status: 'In Progress' },
  { key: 'itTesting', status: 'IT Testing' },
  { key: 'userTesting', status: 'User Testing' },
];

export const MANUAL_ONLY_STATUSES = ['Hypercare', 'Completed', 'On Hold', 'Cancelled'];

export const STATUS_PROGRESS_ORDER = [
  'Not Started', 'Requirement Discussion', 'FS Preparation', 'In Progress',
  'IT Testing', 'User Testing', 'Hypercare', 'Completed',
];

// Two independent, intentionally-preserved color maps — the original app had Home and
// Dashboard disagree slightly on On Hold / Hypercare shades. Kept as-is (not "fixed")
// since the ask was to keep existing behavior, just rebuilt in React.
export const STATUS_COLOR_DASHBOARD = {
  'Not Started': { bg: 'var(--st-gray-soft)', fg: 'var(--st-gray)' },
  'Requirement Discussion': { bg: 'var(--st-indigo-soft)', fg: 'var(--st-indigo)' },
  'FS Preparation': { bg: 'var(--st-indigo-soft)', fg: 'var(--st-indigo)' },
  'In Progress': { bg: 'var(--st-blue-soft)', fg: 'var(--st-blue)' },
  'IT Testing': { bg: 'var(--st-blue-soft)', fg: 'var(--st-blue)' },
  'User Testing': { bg: 'var(--st-blue-soft)', fg: 'var(--st-blue)' },
  Hypercare: { bg: '#fdf2df', fg: '#a56a12' },
  Completed: { bg: 'var(--st-green-soft)', fg: 'var(--st-green)' },
  'On Hold': { bg: '#fdf0e3', fg: '#c4711b' },
  Cancelled: { bg: 'var(--st-gray-soft)', fg: 'var(--st-gray)' },
};
export const STATUS_COLOR_HOME = {
  'Not Started': { bg: 'var(--st-gray-soft)', fg: 'var(--st-gray)' },
  'Requirement Discussion': { bg: 'var(--st-indigo-soft)', fg: 'var(--st-indigo)' },
  'FS Preparation': { bg: 'var(--st-indigo-soft)', fg: 'var(--st-indigo)' },
  'In Progress': { bg: 'var(--st-blue-soft)', fg: 'var(--st-blue)' },
  'IT Testing': { bg: 'var(--st-blue-soft)', fg: 'var(--st-blue)' },
  'User Testing': { bg: 'var(--st-blue-soft)', fg: 'var(--st-blue)' },
  Hypercare: { bg: 'var(--st-amber-soft)', fg: 'var(--st-amber)' },
  Completed: { bg: 'var(--st-green-soft)', fg: 'var(--st-green)' },
  'On Hold': { bg: 'var(--st-amber-soft)', fg: 'var(--st-amber)' },
  Cancelled: { bg: 'var(--st-gray-soft)', fg: 'var(--st-gray)' },
};

// Kanban board column grouping for the Dashboard — the 10 pipeline statuses grouped
// into 5 visual columns (each card still names its own exact stage/status).
export const KANBAN_COLUMNS = [
  { key: 'not-started', name: 'Not Started', dot: 'var(--st-gray)', statuses: ['Not Started'] },
  { key: 'discussion', name: 'In Discussion', dot: 'var(--st-indigo)', statuses: ['Requirement Discussion', 'FS Preparation'] },
  { key: 'development', name: 'In Development', dot: 'var(--st-blue)', statuses: ['In Progress'] },
  { key: 'testing', name: 'Testing', dot: 'var(--st-teal)', statuses: ['IT Testing', 'User Testing'] },
  { key: 'hypercare', name: 'Hypercare', dot: 'var(--st-amber)', statuses: ['Hypercare', 'On Hold'] },
  { key: 'completed', name: 'Completed', dot: 'var(--st-green)', statuses: ['Completed', 'Cancelled'] },
];

export const PRIORITY_RANK = { P1: 0, P2: 1, P3: 2 };

export const PULSE_WINDOWS = [
  { label: 'Since start', days: null },
  { label: 'Last 6 months', days: 182 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 15 days', days: 15 },
  { label: 'Last 7 days', days: 7 },
];

export const MAX_CONCURRENT = 5;
export const ZONES = [
  { from: 0, to: 1, cls: 'idle', label: 'Idle' },
  { from: 1, to: 2, cls: 'light', label: 'Light' },
  { from: 2, to: 4, cls: 'balanced', label: 'Balanced' },
  { from: 4, to: 5, cls: 'stretched', label: 'Stretched' },
];
export function bandFor(n) {
  if (n >= 4) return ZONES[3];
  if (n >= 2) return ZONES[2];
  if (n === 1) return ZONES[1];
  return ZONES[0];
}

// Fixed donut palette (Dashboard "Status mix" chart) and default area-fallback swatches.
export const DONUT_PALETTE = ['#5da8e0', '#3fcf9e', '#e8a33d', '#e0716d'];
