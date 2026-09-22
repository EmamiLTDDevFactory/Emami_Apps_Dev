import { STATUS_PROGRESS_ORDER, STAGE_PIPELINE, MANUAL_ONLY_STATUSES, MANUAL_STATUS_DATES, PRIORITY_RANK, AT_RISK_WINDOW_DAYS, STALLED_DAYS } from './constants.js';

// The one field key that must be filled in for a given status — either its STAGE_PIPELINE
// stage date, or (for Hypercare/On Hold/Completed/Cancelled) its MANUAL_STATUS_DATES entry.
// Not Started has neither, so this returns null for it. Shared by ItemPanel's save validation
// and Dashboard's drag-and-drop auto-fill so both stay in sync with the same rule.
export function stageDateKeyFor(status) {
  return STAGE_PIPELINE.find((s) => s.status === status)?.key || MANUAL_STATUS_DATES[status] || null;
}

// Every date field that should default to today when a status is set directly (New Item form,
// an edit, or a Kanban drag) — not just that status's own date, but every earlier pipeline
// stage skipped to get there, so a task created (or dragged) straight into e.g. "In Progress"
// doesn't end up with blank Requirement Discussion / FS Preparation dates. Only ever used to
// fill fields that are still empty — an already-set date (from data entry or a previous auto-
// fill) is never overwritten, and every filled date stays freely editable afterward.
// On Hold / Cancelled are deliberately excluded from backfilling the forward pipeline (same
// reasoning as the MANUAL_ONLY_STATUSES comment above stageDateKeyFor's use: either can happen
// from any stage, so completion of earlier stages can't be assumed) — only their own date is
// filled. Completed and Hypercare, by contrast, only ever follow the full dev pipeline, so both
// backfill every STAGE_PIPELINE date too.
// startDate isn't itself a STAGE_PIPELINE entry, but reaching ANY status past "Not Started"
// (pipeline or manual) still means the task started — so it's backfilled whenever anything
// else here would be, on every status except Not Started.
export function datesToAutoFillForStatus(status) {
  if (!status || status === 'Not Started') return [];
  const stageIdx = STAGE_PIPELINE.findIndex((s) => s.status === status);
  const keys = ['startDate'];
  if (stageIdx !== -1) {
    keys.push(...STAGE_PIPELINE.slice(0, stageIdx + 1).map((s) => s.key));
    return keys;
  }
  if (['Completed', 'Hypercare'].includes(status)) keys.push(...STAGE_PIPELINE.map((s) => s.key));
  const manualKey = MANUAL_STATUS_DATES[status];
  if (manualKey) keys.push(manualKey);
  return keys;
}

// The backend assigns each item a full crypto.randomUUID() as its id — fine as a database
// key, unreadable as the "MODULE-xxxx" code shown next to an item in the Dashboard. Trims
// it to the UUID's first segment (8 hex chars, still effectively unique for display purposes).
export function shortId(id) {
  return (id || '').split('-')[0].toUpperCase();
}

// --- Dates -------------------------------------------------------------
// todayStr() intentionally mirrors the original app.js/home.js behavior: it reads the
// UTC calendar date (via toISOString), not the local one. This means for IST users any
// local time before 05:30 reads as "yesterday" — a known quirk of the original app that
// is preserved here rather than silently fixed, since the ask was to keep existing logic.
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr, days) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + (Number(days) || 0));
  return d.toISOString().slice(0, 10);
}

export function revisedTarget(row) {
  const rework = Number(row.rework) || 0;
  if (!row.targetDate) return '';
  return rework > 0 ? addDays(row.targetDate, rework) : row.targetDate;
}

export function isOverdue(row) {
  const rt = revisedTarget(row);
  return !['Completed', 'Cancelled'].includes(row.status) && rt && rt < todayStr();
}

export function daysBetween(a, b) {
  const d1 = new Date(a + 'T00:00:00');
  const d2 = new Date(b + 'T00:00:00');
  return Math.round((d2 - d1) / 86400000);
}

// Days since the item's row was last written (createdAt on a brand-new item, updatedAt on
// anything touched since) — a proxy for "nobody has moved this forward lately" that needs no
// extra history query, since dev_tracker.items already carries both timestamps.
export function daysSinceUpdate(row) {
  const stamp = row.updatedAt || row.createdAt;
  if (!stamp) return null;
  const then = new Date(stamp).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86400000);
}

// Command-centre severity for one item: 'done' (Completed/Cancelled, never escalated),
// 'critical' (past its revised target date), 'stalled' (active but untouched for
// STALLED_DAYS+), 'atRisk' (revised target lands within AT_RISK_WINDOW_DAYS), else 'onTrack'.
// Checked in that order so a genuinely overdue item is never downgraded to merely "stalled".
export function riskLevel(row) {
  if (['Completed', 'Cancelled'].includes(row.status)) return 'done';
  if (isOverdue(row)) return 'critical';
  const stale = daysSinceUpdate(row);
  if (stale != null && stale >= STALLED_DAYS) return 'stalled';
  const rt = revisedTarget(row);
  if (rt) {
    const diff = daysBetween(todayStr(), rt);
    if (diff >= 0 && diff <= AT_RISK_WINDOW_DAYS) return 'atRisk';
  }
  return 'onTrack';
}

export function fmtDate(dateStr, { withYear = true } = {}) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

// --- Status / progress ---------------------------------------------------
export function statusProgress(status) {
  if (status === 'On Hold' || status === 'Cancelled') return 0;
  const idx = STATUS_PROGRESS_ORDER.indexOf(status);
  if (idx === -1) return 0;
  return Math.round((idx / (STATUS_PROGRESS_ORDER.length - 1)) * 100);
}

export function suggestedStatus(row) {
  let current = null;
  for (const stage of STAGE_PIPELINE) {
    if (row[stage.key]) current = stage.status;
  }
  return current || 'Not Started';
}

export function currentStageInfo(row) {
  if (MANUAL_ONLY_STATUSES.includes(row.status)) return null;
  let stage = null;
  for (const s of STAGE_PIPELINE) {
    if (row.status === s.status) stage = s;
  }
  if (!stage || !row[stage.key]) return null;
  return { days: daysBetween(row[stage.key], todayStr()), stageKey: stage.key };
}

export function priorityRankOf(item) {
  const r = PRIORITY_RANK[item.priority];
  return r === undefined ? 2 : r;
}
export function criticalScore(daysDiff, item) {
  return daysDiff + priorityRankOf(item) * 2;
}

// --- Misc ------------------------------------------------------------
export function hexToRgba(hex, alpha) {
  if (!hex) return `rgba(0,0,0,${alpha})`;
  const h = hex.replace('#', '');
  const bigint = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function hexToSoft(hex) {
  return hexToRgba(hex, 0.12);
}

// Home page's initials: first two raw characters.
export function initialsHome(name) {
  return (name || '?').slice(0, 2).toUpperCase();
}
// Resource Utilization's initials: first letter of each word.
export function initialsRoster(name) {
  const cleaned = (name || '').replace(/[^a-zA-Z\s]/g, '');
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export function relativeTime(dateStr) {
  if (!dateStr) return '';
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return fmtDate(dateStr.slice(0, 10));
}

export function debounceFree(fn) {
  // No debounce in the original (search re-renders on every keystroke) — kept as a
  // pass-through so call sites read the same either way if that's revisited later.
  return fn;
}
