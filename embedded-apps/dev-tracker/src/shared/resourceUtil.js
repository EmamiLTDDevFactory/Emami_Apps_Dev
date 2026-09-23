// Resource Utilization calculation engine.
//
// Ground rule (per the brief this was built against): utilization is capacity math, not an
// assignment headcount. Two small assignments can consume less capacity than one large one, so
// every number here is derived from actual man-days and working-day overlap with the selected
// period — nothing is hardcoded.
//
// Known data gaps and the fallback each one gets (documented here once, referenced everywhere
// below) because the assignment schema has no capacity/roster entities of its own. (There's no
// leave/unavailability concept at all — deliberately: no leave data source exists anywhere in
// this app, so rather than show a permanently-zero "On Leave" figure, that concept is left out
// of this page entirely. Available capacity is simply "working days in the period".)
//   1. "Working day" = Mon–Fri, plus odd Saturdays (1st/3rd/5th of the month — the org works
//      those), minus Sunday and every 2nd/4th Saturday, minus any date in the "Holidays" master
//      data category (see buildHolidaySet below — admin-managed, not hardcoded).
//   2. There is no standalone resource/roster table — a "resource" is inferred from the distinct
//      `developer` / `spocFunction` names that appear on assignments (same approach the previous
//      concurrency-based version of this page used). This means someone with literally zero
//      assignments, ever, can't be discovered as a resource at all; the "resource universe" is
//      built from ALL assignments (regardless of date) specifically so a person with assignments
//      outside the selected period, but none inside it, still shows up correctly as Bench rather
//      than disappearing.
//   3. An assignment only stores one total `devTime` (man-days) figure, not day-by-day effort.
//      Its contribution to any given period is its man-days scaled by the fraction of the
//      assignment's own working-day span that falls inside that period (see
//      allocatedManDaysInPeriod). A 10-day, 10-man-day assignment that's 50% inside the selected
//      period contributes 5 man-days to it, not the full 10.

// --- Date helpers --------------------------------------------------------
export function parseDate(s) {
  if (!s) return null;
  const d = new Date(s + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}
export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
// Sunday's always off. Saturday depends on which occurrence in the month it is — 1st/3rd/5th
// ("odd") Saturdays are worked, 2nd/4th are off. holidaySet (see buildHolidaySet below) then
// knocks out any remaining admin-listed holiday regardless of what weekday it falls on.
function isWorkingDay(d, holidaySet) {
  const day = d.getDay();
  if (day === 0) return false;
  if (day === 6 && Math.ceil(d.getDate() / 7) % 2 === 0) return false;
  if (holidaySet && holidaySet.has(toISODate(d))) return false;
  return true;
}
// Inclusive working-day count between two Dates (a <= b) — see gap #1 above for exactly what
// counts as a working day.
export function countWorkingDays(a, b, holidaySet) {
  if (!a || !b || b < a) return 0;
  let count = 0;
  const cur = new Date(a);
  while (cur <= b) {
    if (isWorkingDay(cur, holidaySet)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// Holiday master-data values are "YYYY-MM-DD Label" (admin's "Holidays" category) — only the
// leading date matters here; the label is for whoever's reading the list in Manage Master Data.
// A malformed entry (no leading date) is simply skipped rather than breaking the calendar.
const HOLIDAY_DATE_RE = /^(\d{4}-\d{2}-\d{2})/;
export function buildHolidaySet(masterData) {
  const set = new Set();
  for (const row of masterData || []) {
    if (row.category !== 'holiday' || !row.active) continue;
    const m = HOLIDAY_DATE_RE.exec(String(row.value || '').trim());
    if (m) set.add(m[1]);
  }
  return set;
}
function calendarDays(a, b) {
  return Math.round((b - a) / 86400000) + 1;
}
function clampRange(aStart, aEnd, bStart, bEnd) {
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  return end < start ? null : { start, end };
}

// --- Assignment window (start -> revised target, falling back to target date) ------------
// Matches the Timeline bar rule: bar end is the revised target date if available, else the
// plain target date. revisedTarget() (utils.js) already implements exactly that fallback.
export function assignmentWindow(item, revisedTargetFn) {
  const start = parseDate(item.startDate);
  const end = parseDate(revisedTargetFn(item));
  if (!start || !end || end < start) return null;
  return { start, end };
}

// An assignment's man-days contribution to [periodStart, periodEnd], proportional to how much
// of the assignment's own working-day span falls inside the period (gap #3 above).
export function allocatedManDaysInPeriod(win, manDays, periodStart, periodEnd, holidaySet) {
  const overlap = clampRange(win.start, win.end, periodStart, periodEnd);
  if (!overlap) return 0;
  const totalSpanWorkingDays = countWorkingDays(win.start, win.end, holidaySet);
  const overlapWorkingDays = countWorkingDays(overlap.start, overlap.end, holidaySet);
  if (totalSpanWorkingDays > 0) return (manDays || 0) * (overlapWorkingDays / totalSpanWorkingDays);
  // Degenerate case (assignment window is entirely weekend/zero working days) — fall back to a
  // calendar-day fraction so a same-day or weekend-only assignment doesn't just silently vanish.
  const totalSpanDays = calendarDays(win.start, win.end);
  const overlapDays = calendarDays(overlap.start, overlap.end);
  return totalSpanDays > 0 ? (manDays || 0) * (overlapDays / totalSpanDays) : 0;
}

export function availableManDays(periodStart, periodEnd, holidaySet) {
  return countWorkingDays(periodStart, periodEnd, holidaySet);
}

// --- Resource universe + allocations --------------------------------------------------
// One allocation record per (resource, assignment) pair. An assignment can produce up to two
// allocations — one for its `developer`, one for its `spocFunction` — ported intentionally from
// the previous roster model: the same assignment legitimately consumes both people's capacity.
const ROLE_FIELD = { Developer: 'developer', 'Functional SPOC': 'spocFunction' };

export function buildAllocations(items, revisedTargetFn) {
  const allocations = [];
  for (const item of items || []) {
    if (item.status === 'Cancelled') continue; // cancelled work never consumed capacity
    for (const role of Object.keys(ROLE_FIELD)) {
      const name = item[ROLE_FIELD[role]];
      if (!name) continue;
      const win = assignmentWindow(item, revisedTargetFn);
      allocations.push({
        resourceName: name,
        role,
        item,
        window: win, // null when the item has no usable start/target date — excluded from timeline/effort math, but the allocation itself (and resource) still exists
        module: item.area || null,
      });
    }
  }
  return allocations;
}

// The full set of people who appear anywhere in the data, independent of date range or filters —
// this is what makes Bench detection possible (gap #3 above).
export function buildResourceUniverse(items) {
  const byName = new Map();
  for (const item of items || []) {
    for (const role of Object.keys(ROLE_FIELD)) {
      const name = item[ROLE_FIELD[role]];
      if (!name) continue;
      if (!byName.has(name)) byName.set(name, { name, roles: new Set(), moduleTally: {} });
      const entry = byName.get(name);
      entry.roles.add(role);
      if (item.area) entry.moduleTally[item.area] = (entry.moduleTally[item.area] || 0) + 1;
    }
  }
  return Array.from(byName.values()).map((entry) => ({
    name: entry.name,
    // A person can technically appear as both Developer and Functional SPOC across different
    // assignments; primaryRole picks whichever role has more of their assignments for display
    // (filters still match on either role — see matchesFilters below).
    roles: Array.from(entry.roles),
    primaryRole: Array.from(entry.roles)[0],
    primaryModule: Object.entries(entry.moduleTally).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
  }));
}

// --- Filtering -----------------------------------------------------------------
// filters: { resourceName, role, module, status }. Module/status match the allocation's own
// assignment; role/resourceName match the allocation's resource identity.
export function matchesFilters(alloc, filters) {
  if (filters.resourceName && alloc.resourceName !== filters.resourceName) return false;
  if (filters.role && alloc.role !== filters.role) return false;
  if (filters.module && alloc.module !== filters.module) return false;
  if (filters.status && alloc.item.status !== filters.status) return false;
  return true;
}

export function isActiveAssignment(item) {
  return !['Completed', 'Cancelled'].includes(item.status);
}
export function overlapsPeriod(win, periodStart, periodEnd) {
  return !!win && !!clampRange(win.start, win.end, periodStart, periodEnd);
}

// --- Utilization buckets --------------------------------------------------------
export const UTIL_BUCKETS = [
  { key: 'under', label: 'Under-utilised', test: (p) => p < 50, color: 'var(--st-gray)', soft: 'var(--st-gray-soft)' },
  { key: 'moderate', label: 'Moderate', test: (p) => p >= 50 && p < 70, color: 'var(--st-blue)', soft: 'var(--st-blue-soft)' },
  { key: 'well', label: 'Well utilised', test: (p) => p >= 70 && p < 90, color: 'var(--st-green)', soft: 'var(--st-green-soft)' },
  { key: 'near', label: 'Near capacity', test: (p) => p >= 90 && p <= 100, color: 'var(--st-amber)', soft: 'var(--st-amber-soft)' },
  { key: 'over', label: 'Over allocated', test: (p) => p > 100, color: 'var(--st-red)', soft: 'var(--st-red-soft)' },
];
export function bucketFor(pct) {
  return UTIL_BUCKETS.find((b) => b.test(pct)) || UTIL_BUCKETS[0];
}

// --- Resource status (precedence: Over Allocated -> Active -> Bench) --------------------
// Mutually exclusive by construction — each resource gets exactly one status.
export const RESOURCE_STATUS_META = {
  'Over Allocated': { color: 'var(--st-red)', soft: 'var(--st-red-soft)' },
  Active: { color: 'var(--st-green)', soft: 'var(--st-green-soft)' },
  Bench: { color: 'var(--st-gray)', soft: 'var(--st-gray-soft)' },
};
export function resourceStatus({ utilizationPct, hasActiveOverlap }) {
  if (utilizationPct > 100) return 'Over Allocated';
  if (hasActiveOverlap) return 'Active';
  return 'Bench';
}

// --- Per-resource stats for a period --------------------------------------------------
// allocs: this resource's allocations that already passed the non-date filters.
export function computeResourceStats(allocs, periodStart, periodEnd, holidaySet) {
  const overlapping = allocs.filter((a) => overlapsPeriod(a.window, periodStart, periodEnd));
  const allocatedManDays = overlapping.reduce((sum, a) => sum + allocatedManDaysInPeriod(a.window, Number(a.item.devTime) || 0, periodStart, periodEnd, holidaySet), 0);
  const available = availableManDays(periodStart, periodEnd, holidaySet);
  const utilizationPct = available > 0 ? (allocatedManDays / available) * 100 : 0;
  const activeOverlapping = overlapping.filter((a) => isActiveAssignment(a.item));
  return {
    allocatedManDays,
    availableManDays: available,
    utilizationPct,
    overlapping,
    activeOverlapping,
    hasActiveOverlap: activeOverlapping.length > 0,
  };
}

// --- Allocation-level "assignment allocation %" ---------------------------------------
// Per the brief: this is NOT the resource's overall utilization. It's this one assignment's
// man-days (scoped to the period) against the resource's available capacity during that same
// period — i.e. how much of the person's capacity this one assignment alone is eating.
export function allocationPct(alloc, periodStart, periodEnd, holidaySet) {
  if (!alloc.window) return 0;
  const manDays = allocatedManDaysInPeriod(alloc.window, Number(alloc.item.devTime) || 0, periodStart, periodEnd, holidaySet);
  const available = availableManDays(periodStart, periodEnd, holidaySet);
  return available > 0 ? (manDays / available) * 100 : 0;
}

// --- Allocation by Module --------------------------------------------------------------
// Man-days based where devTime is usable; falls back to a plain allocation count (and callers
// should relabel the chart "Allocations by Module" in that case) per the brief's explicit
// fallback instruction.
export function allocationByModule(allocs, periodStart, periodEnd, holidaySet) {
  const overlapping = allocs.filter((a) => overlapsPeriod(a.window, periodStart, periodEnd));
  const manDaysByModule = {};
  const countByModule = {};
  let totalManDays = 0;
  for (const a of overlapping) {
    const mod = a.module || 'Unassigned';
    const md = allocatedManDaysInPeriod(a.window, Number(a.item.devTime) || 0, periodStart, periodEnd, holidaySet);
    manDaysByModule[mod] = (manDaysByModule[mod] || 0) + md;
    countByModule[mod] = (countByModule[mod] || 0) + 1;
    totalManDays += md;
  }
  const useManDays = totalManDays > 0.01;
  const source = useManDays ? manDaysByModule : countByModule;
  const total = useManDays ? totalManDays : overlapping.length;
  const rows = Object.entries(source)
    .map(([module, value]) => ({ module, value, pct: total > 0 ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
  return { rows, useManDays, total };
}
