// Ported 1:1 from the original app.js / home.js / admin.js / resource-utilization.js.
// These values are load-bearing (progress %, colors, roster bands) — do not "clean up"
// without checking every call site; several intentional quirks from the original are
// preserved on purpose (see comments) because the task was to keep existing logic intact.

// In `npm run dev`, these two go through the same-origin `/api` proxy configured in
// vite.config.js instead of hitting the real host directly — the API's CORS allowlist
// doesn't cover a local dev origin, so a direct cross-origin fetch here would just fail.
// Dead code (and stripped) in the real production build, same as the devEmail override below.
//
// Same dev/prod split every other embedded app in this monorepo makes off the browser's own
// hostname (see embedded-apps/payment-tracking/src/lib/hubAccessApi.ts's accessApiBase(),
// embedded-apps/audit-capa/src/components/layout/emamiAppsUrl.js's `HOSTNAME.includes('dev')`) —
// this app has no build-time env injection of its own, so without this every deployed build
// (dev.emamiapps.in included) always hit prod's backend/DB, regardless of which environment it
// was actually built and running on.
const HUB_HOSTNAME_IS_DEV = typeof window !== 'undefined' && window.location.hostname.includes('dev');
export const API_BASE = import.meta.env.DEV
  ? '/api/dev-tracker'
  : `https://audit-capa-api.emamiapps.in${HUB_HOSTNAME_IS_DEV ? '/dev-api' : ''}/api/dev-tracker`;
export const ACCESS_API_BASE = import.meta.env.DEV
  ? '/api'
  : `https://audit-capa-api.emamiapps.in${HUB_HOSTNAME_IS_DEV ? '/dev-api' : ''}/api`;
export const HUB_AUTH_API_BASE = 'https://in65bjvxjd.execute-api.ap-south-1.amazonaws.com/api';
export const HUB_EMAIL_STORAGE_KEY = 'emami_apps_user_email';

// The 28 item fields, in the exact order the backend's FIELDS array uses.
export const FIELDS = [
  'devList', 'status', 'area', 'func', 'impact', 'complexity', 'priority',
  'spocFunction', 'spocIT', 'devFactory', 'startDate', 'reqDiscussion', 'fsPrep',
  'development', 'itTesting', 'userTesting', 'hypercare',
  'hypercareDate', 'onHoldDate', 'completedDate', 'cancelledDate',
  'targetDate', 'devTime', 'rework', 'reasonCategory', 'reasonDelay', 'remarks', 'developer',
];

// Human-readable labels for the item fields — used for the New/Edit panel and, to
// match the original's CSV export, as the exported header row (not the raw camelCase keys).
export const FIELD_LABELS = {
  devList: 'Development / Item Title', status: 'Status', func: 'Functional Area / Process',
  area: 'Module', priority: 'Priority', impact: 'Business Impact', complexity: 'Technical Complexity',
  spocFunction: 'SPOC (Functional)', spocIT: 'SPOC (IT)', devFactory: 'Dev Factory', developer: 'Developer',
  startDate: 'Start Date', reqDiscussion: 'Requirement Discussion', fsPrep: 'FS Preparation',
  development: 'Development', itTesting: 'IT Testing', userTesting: 'User Testing', hypercare: 'Hypercare (Days)',
  hypercareDate: 'Hypercare Date', onHoldDate: 'On Hold Date', completedDate: 'Completed Date', cancelledDate: 'Cancelled Date',
  targetDate: 'Target Date', devTime: 'Man-days', rework: 'Rework (Days)', reasonCategory: 'Reason Category',
  reasonDelay: 'Reason for Delay (Detail)', remarks: 'Remarks',
};

// Column headers from templates downloaded before 5830f2e that no longer match any current
// label, mapped to the field they used to mean. Import Center accepts these so an old saved
// template keeps importing. Only genuine renames belong here — everything else that commit
// changed was capitalisation, which the importer's case-insensitive header match absorbs.
export const LEGACY_FIELD_LABELS = {
  area: 'Area', // now labelled 'Module'
};

// The item fields holding a calendar date, all stored as plain 'YYYY-MM-DD' strings (what
// ItemPanel's <input type="date"> produces). Shared with Import Center, which has to coerce
// Excel's own date representation back into exactly this shape.
export const DATE_FIELDS = new Set([
  'startDate', 'reqDiscussion', 'fsPrep', 'development', 'itTesting', 'userTesting', 'targetDate',
  'hypercareDate', 'onHoldDate', 'completedDate', 'cancelledDate',
]);

export const CATEGORIES = [
  { key: 'area', label: 'Area', hasColor: true },
  { key: 'status', label: 'Status', hasColor: true },
  { key: 'priority', label: 'Priority', hasColor: true },
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

// These four statuses are excluded from STAGE_PIPELINE's forward auto-suggestion (see
// suggestedStatus() in utils.js) since they don't follow the same one-way sequence — Cancelled
// or On Hold can happen from any stage, and Hypercare can follow Completed. They still each get
// their own required date field, just validated separately (see stageDateKeyFor() below)
// instead of feeding the auto-suggestion pipeline.
export const MANUAL_STATUS_DATES = {
  Hypercare: 'hypercareDate',
  'On Hold': 'onHoldDate',
  Completed: 'completedDate',
  Cancelled: 'cancelledDate',
};

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

// Command-centre risk thresholds — an active item is "at risk" once its revised target is
// this many days out or closer, and "stalled" once it's gone this many days with no field
// change recorded in item_history (tracked via the item's own updatedAt timestamp).
export const AT_RISK_WINDOW_DAYS = 3;
export const STALLED_DAYS = 5;

// Display metadata for the four risk levels riskLevel() (see utils.js) can return, keyed by
// the CSS custom properties already defined in tokens.css so severity colors stay consistent
// with the rest of the app instead of introducing a parallel palette.
export const RISK_META = {
  critical: { label: 'Overdue', shortLabel: 'late', color: 'var(--st-red)', soft: 'var(--st-red-soft)' },
  stalled: { label: 'Stalled', shortLabel: 'stalled', color: 'var(--st-amber)', soft: 'var(--st-amber-soft)' },
  atRisk: { label: 'Due soon', shortLabel: 'due soon', color: 'var(--st-indigo)', soft: 'var(--st-indigo-soft)' },
  onTrack: { label: 'On track', shortLabel: '', color: 'var(--muted)', soft: 'var(--bg-alt)' },
  done: { label: 'Done', shortLabel: '', color: 'var(--st-green)', soft: 'var(--st-green-soft)' },
};

// Time-window options for Home's "Module-wise distribution" chart. `days` is a rolling
// window; `special` is a calendar-relative one resolved in Home.jsx (distWindowCutoff()).
export const DIST_WINDOWS = [
  { label: 'Since start', days: null },
  { label: 'Last 1 year', days: 365 },
  { label: 'Last 6 months', days: 182 },
  { label: 'Last 3 months', days: 90 },
  { label: 'This month', special: 'month' },
  { label: 'Last 15 days', days: 15 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Today', special: 'today' },
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
