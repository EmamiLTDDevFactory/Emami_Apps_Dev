import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from '../shared/Sidebar.jsx';
import Topbar from '../shared/Topbar.jsx';
import { useDevTrackerSession } from '../shared/useDevTrackerSession.js';
import { useNotifications } from '../shared/useNotifications.js';
import { apiList, apiMasterData, getCurrentUserEmail } from '../shared/api.js';
import { groupMasterData, activeValues, areaColorMap } from '../shared/masterData.js';
import { fmtDate, revisedTarget } from '../shared/utils.js';
import {
  toISODate, allocatedManDaysInPeriod, buildAllocations, buildResourceUniverse, matchesFilters,
  overlapsPeriod, bucketFor, UTIL_BUCKETS, resourceStatus, RESOURCE_STATUS_META,
  computeResourceStats, allocationPct, allocationByModule, buildHolidaySet,
} from '../shared/resourceUtil.js';
import {
  CalendarIcon, FilterIcon, DownloadIcon, GridIcon, MoreIcon, SearchIcon,
  CaretUpDownIcon, ChevronLeftIcon, ChevronRightIcon, UsersIcon, CheckCircleIcon,
  BarChartIcon, LayersIcon, AlertIcon, ChevronDownIcon,
} from '../shared/icons.jsx';

const VIEW_OPTIONS = [
  { key: 'timeline', label: 'Timeline View', icon: CalendarIcon },
  { key: 'table', label: 'Allocation Table', icon: GridIcon },
  { key: 'summary', label: 'Resource Summary', icon: BarChartIcon },
];
const ROLE_OPTIONS = ['Developer', 'Functional SPOC'];
const GRANULARITIES = ['Months', 'Weeks', 'Days'];
const PAGE_SIZES = [10, 15, 25, 50];
const MODULE_PALETTE = ['var(--st-blue)', 'var(--st-green)', 'var(--st-purple)', 'var(--st-amber)', 'var(--st-red)', 'var(--st-teal)', 'var(--st-indigo)', 'var(--st-gray)'];
const AVATAR_PALETTE = ['var(--st-purple)', 'var(--st-blue)', 'var(--st-teal)', 'var(--st-green)', 'var(--st-indigo)', 'var(--st-amber)', 'var(--accent)'];
// Each timeline bar gets its own full-height lane (bar + gap) instead of the old thin
// stacked strip, so a title + date range both fit inside the bar like the reference design.
const BAR_LANE_HEIGHT = 52;

function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function addDaysD(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function todayMidnight() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function defaultRange() { const t = todayMidnight(); return { start: startOfMonth(t), end: endOfMonth(t) }; }
function initialsOf(name) { return (name || '').slice(0, 2).toUpperCase() || '?'; }
function avatarColor(name) {
  if (!name) return 'var(--st-gray)';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}
function buildAxis(start, end, granularity) {
  const totalMs = end - start + 86400000;
  const pct = (d) => Math.max(0, Math.min(100, ((d - start) / totalMs) * 100));
  const ticks = [];
  if (granularity === 'Months') {
    let cur = startOfMonth(start);
    while (cur <= end) {
      ticks.push({ date: new Date(cur), label: cur.toLocaleDateString('en-US', { month: 'long', year: cur.getFullYear() !== start.getFullYear() ? 'numeric' : undefined }) });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
  } else if (granularity === 'Weeks') {
    let cur = new Date(start);
    const day = cur.getDay();
    cur.setDate(cur.getDate() + (day === 0 ? -6 : 1 - day));
    while (cur <= end) {
      ticks.push({ date: new Date(cur), label: `${cur.getDate()} ${cur.toLocaleDateString('en-US', { month: 'short' })}` });
      cur = addDaysD(cur, 7);
    }
  } else {
    let cur = new Date(start);
    while (cur <= end) {
      ticks.push({ date: new Date(cur), label: `${cur.getDate()}` });
      cur = addDaysD(cur, 1);
    }
  }
  return { pct, ticks, start, end };
}

function Donut({ segments, total, centerLabel, centerSub, size = 90 }) {
  const stroke = Math.round(size * 0.14);
  const r = size / 2 - stroke / 2 - 1;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="ru-donut-wrap">
      <div className="status-donut" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--bg-alt)" strokeWidth={stroke} />
          {segments.filter((s) => s.value > 0).map((s) => {
            const frac = total > 0 ? s.value / total : 0;
            const dash = frac * circumference;
            const seg = (
              <circle key={s.key || s.label} cx={c} cy={c} r={r} fill="none" stroke={s.color} strokeWidth={stroke}
                strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-offset} transform={`rotate(-90 ${c} ${c})`} />
            );
            offset += dash;
            return seg;
          })}
        </svg>
        <div className="status-donut-center">
          <span className="status-donut-total" style={{ fontSize: Math.round(size * 0.22) }}>{centerLabel}</span>
          <span className="status-donut-label">{centerSub}</span>
        </div>
      </div>
      <div className="ru-donut-legend">
        {segments.map((s) => (
          <div className="status-legend-row" key={s.key || s.label}>
            <span className="dot" style={{ background: s.color }} />
            <span className="status-legend-label">{s.label}</span>
            <span className="status-legend-count">{Math.round(s.value * 10) / 10}</span>
            <span className="status-legend-pct">({total > 0 ? Math.round((s.value / total) * 100) : 0}%)</span>
          </div>
        ))}
        {!segments.some((s) => s.value > 0) && <div className="major-tile-empty">Nothing in range.</div>}
      </div>
    </div>
  );
}

function StatTile({ icon: Icon, tone, label, value, sub }) {
  return (
    <div className={`ru-tile tone-${tone}`}>
      <div className="ru-tile-icon"><Icon size={13} /></div>
      <div className="ru-tile-text">
        <div className="ru-tile-value">{value}</div>
        <div className="ru-tile-label">{label}</div>
        {sub && <div className="ru-tile-sub">{sub}</div>}
      </div>
    </div>
  );
}

export default function ResourceUtilization() {
  const [items, setItems] = useState([]);
  const [masterData, setMasterData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const [range, setRange] = useState(defaultRange);
  const [filterResource, setFilterResource] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterModule, setFilterModule] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  const [view, setView] = useState('timeline');
  const [granularity, setGranularity] = useState('Months');

  const [tableSearch, setTableSearch] = useState('');
  const [tableSortBy, setTableSortBy] = useState('resource');
  const [tableSortDir, setTableSortDir] = useState('asc');
  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState(10);

  const [summaryGroupBy, setSummaryGroupBy] = useState('resource');
  const [summarySearch, setSummarySearch] = useState('');

  const email = getCurrentUserEmail();
  const { isAdmin, roleLabel, profileName } = useDevTrackerSession(email);
  const { visibleNotifications, markAllRead, clear } = useNotifications(email, items, [], profileName);

  useEffect(() => {
    if (!email) { window.location.href = '/'; return; }
    Promise.all([apiList(email), apiMasterData(email)])
      .then(([itemRows, mdRows]) => { setItems(itemRows || []); setMasterData(mdRows || []); })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  const options = useMemo(() => {
    const grouped = groupMasterData(masterData);
    const out = {};
    for (const key of Object.keys(grouped)) out[key] = activeValues(masterData, key);
    return out;
  }, [masterData]);
  const areaColors = useMemo(() => areaColorMap(masterData), [masterData]);
  const holidaySet = useMemo(() => buildHolidaySet(masterData), [masterData]);

  const universe = useMemo(() => buildResourceUniverse(items), [items]);
  const allAllocations = useMemo(() => buildAllocations(items, revisedTarget), [items]);
  const resourceNameOptions = useMemo(() => universe.map((r) => r.name).sort(), [universe]);

  const filters = useMemo(() => ({ resourceName: filterResource, role: filterRole, module: filterModule, status: filterStatus }), [filterResource, filterRole, filterModule, filterStatus]);
  const filteredAllocations = useMemo(
    () => allAllocations.filter((a) => matchesFilters(a, filters) && (!filterPriority || a.item.priority === filterPriority)),
    [allAllocations, filters, filterPriority]
  );

  const periodStart = range.start;
  const periodEnd = range.end;
  const today = useMemo(() => todayMidnight(), []);
  const todayInRange = today >= periodStart && today <= periodEnd;

  const matchingResourceNames = useMemo(() => new Set(filteredAllocations.map((a) => a.resourceName)), [filteredAllocations]);
  const resourcesInScope = useMemo(() => universe.filter((r) => matchingResourceNames.has(r.name)), [universe, matchingResourceNames]);

  // The one row per resource that every view (Timeline / Table / Summary) is built from, so the
  // three never disagree — same filtered population, same period, same utilization math.
  const resourceRows = useMemo(() => resourcesInScope.map((r) => {
    const allocs = filteredAllocations.filter((a) => a.resourceName === r.name);
    const stats = computeResourceStats(allocs, periodStart, periodEnd, holidaySet);
    const bucket = bucketFor(stats.utilizationPct);
    const status = resourceStatus({ utilizationPct: stats.utilizationPct, hasActiveOverlap: stats.hasActiveOverlap });
    const modules = Array.from(new Set(stats.overlapping.map((a) => a.module).filter(Boolean)));
    const currentTaskAllocs = todayInRange ? allocs.filter((a) => overlapsPeriod(a.window, today, today)) : stats.overlapping;
    const role = allocs[0]?.role || r.primaryRole;
    return { resource: r, role, allocs, stats, bucket, status, modules, currentTaskAllocs };
  }), [resourcesInScope, filteredAllocations, periodStart, periodEnd, today, todayInRange, holidaySet]);

  const totalResources = resourceRows.length;
  const activeResourcesCount = resourceRows.filter((r) => r.stats.hasActiveOverlap).length;
  // Capacity-weighted, not a plain average of each resource's own % — sum(allocated) /
  // sum(available) across the whole scoped team. A plain average of percentages would let one
  // wildly over/under-allocated resource skew the figure as much as anyone else, independent of
  // team size or how much real work is behind that percentage; this instead answers "how much of
  // the team's total capacity is actually spoken for."
  const totalAvailableManDays = resourceRows.reduce((s, r) => s + r.stats.availableManDays, 0);
  const avgUtilization = totalAvailableManDays > 0
    ? (resourceRows.reduce((s, r) => s + r.stats.allocatedManDays, 0) / totalAvailableManDays) * 100
    : 0;
  const overlappingAllocations = useMemo(() => filteredAllocations.filter((a) => overlapsPeriod(a.window, periodStart, periodEnd)), [filteredAllocations, periodStart, periodEnd]);
  const totalAllocationsCount = overlappingAllocations.length;

  const utilDistribution = UTIL_BUCKETS.map((b) => ({ key: b.key, label: b.label, color: b.color, value: resourceRows.filter((r) => r.bucket.key === b.key).length }));
  const moduleAlloc = useMemo(() => allocationByModule(filteredAllocations, periodStart, periodEnd, holidaySet), [filteredAllocations, periodStart, periodEnd, holidaySet]);
  const moduleAllocSegments = moduleAlloc.rows.map((m, i) => ({ key: m.module, label: m.module, value: Math.round(m.value * 10) / 10, color: (areaColors[m.module] && areaColors[m.module].color) || MODULE_PALETTE[i % MODULE_PALETTE.length] }));

  const statusCounts = { 'Over Allocated': 0, Active: 0, Bench: 0 };
  resourceRows.forEach((r) => { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1; });

  // Fully/Under/Over allocated summary tiles for the Allocation Table view, defined from the
  // same utilization buckets (well+near = "fully", under+moderate = "under") so it can never
  // disagree with the Utilization Distribution donut elsewhere on the page.
  const fullyAllocated = resourceRows.filter((r) => r.bucket.key === 'well' || r.bucket.key === 'near').length;
  const underAllocated = resourceRows.filter((r) => r.bucket.key === 'under' || r.bucket.key === 'moderate').length;
  const overAllocatedCount = resourceRows.filter((r) => r.bucket.key === 'over').length;

  const upcoming = useMemo(() => filteredAllocations
    .filter((a) => a.window && a.window.start > today)
    .sort((a, b) => a.window.start - b.window.start)
    .slice(0, 5), [filteredAllocations, today]);

  const axis = useMemo(() => buildAxis(periodStart, periodEnd, granularity), [periodStart, periodEnd, granularity]);

  function shiftRange(dir) {
    const spanDays = Math.round((periodEnd - periodStart) / 86400000) + 1;
    setRange((r) => ({ start: addDaysD(r.start, dir * spanDays), end: addDaysD(r.end, dir * spanDays) }));
  }

  function clearFilters() {
    setFilterResource(''); setFilterRole(''); setFilterModule(''); setFilterStatus(''); setFilterPriority('');
  }

  // --- Allocation Table rows: one row per resource<->assignment allocation overlapping period --
  const allocationRows = useMemo(() => overlappingAllocations.map((a) => {
    const manDays = a.window ? allocatedManDaysInPeriod(a.window, Number(a.item.devTime) || 0, periodStart, periodEnd, holidaySet) : 0;
    const pct = allocationPct(a, periodStart, periodEnd, holidaySet);
    return {
      key: `${a.resourceName}::${a.role}::${a.item.id}`,
      resourceName: a.resourceName, role: a.role, title: a.item.devList, module: a.module,
      startDate: a.item.startDate, endDate: a.window ? toISODate(a.window.end) : (revisedTarget(a.item) || a.item.targetDate || ''),
      manDays, pct, status: a.item.status, remarks: a.item.remarks, item: a.item,
    };
  }), [overlappingAllocations, periodStart, periodEnd, holidaySet]);

  const tableFiltered = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    let rows = allocationRows;
    if (q) rows = rows.filter((r) => [r.resourceName, r.title, r.module, r.remarks].some((v) => (v || '').toLowerCase().includes(q)));
    const dir = tableSortDir === 'desc' ? -1 : 1;
    const cmp = {
      resource: (a, b) => a.resourceName.localeCompare(b.resourceName),
      title: (a, b) => a.title.localeCompare(b.title),
      module: (a, b) => (a.module || '').localeCompare(b.module || ''),
      startDate: (a, b) => (a.startDate || '').localeCompare(b.startDate || ''),
      endDate: (a, b) => (a.endDate || '').localeCompare(b.endDate || ''),
      manDays: (a, b) => a.manDays - b.manDays,
      pct: (a, b) => a.pct - b.pct,
    }[tableSortBy] || (() => 0);
    return [...rows].sort((a, b) => cmp(a, b) * dir);
  }, [allocationRows, tableSearch, tableSortBy, tableSortDir]);

  const tableTotalPages = Math.max(1, Math.ceil(tableFiltered.length / tablePageSize));
  const tablePageSafe = Math.min(tablePage, tableTotalPages);
  const tablePageRows = tableFiltered.slice((tablePageSafe - 1) * tablePageSize, tablePageSafe * tablePageSize);

  function handleTableSort(key) {
    if (tableSortBy === key) setTableSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setTableSortBy(key); setTableSortDir('asc'); }
  }

  const summaryFiltered = useMemo(() => {
    const q = summarySearch.trim().toLowerCase();
    if (!q) return resourceRows;
    return resourceRows.filter((r) => r.resource.name.toLowerCase().includes(q) || r.role.toLowerCase().includes(q) || r.modules.join(' ').toLowerCase().includes(q));
  }, [resourceRows, summarySearch]);

  // "Resource" means no grouping at all — the table is already one row per resource, so that
  // option is just the flat list. Role/Module group resources by their own attribute, each
  // group sorted by utilization (worst-first) with a real per-group summary, not just a count.
  const summaryGroups = useMemo(() => {
    // Capacity-weighted per group, same reasoning as the page-level avgUtilization above.
    const withAvg = (key, rows) => {
      const sorted = [...rows].sort((a, b) => b.stats.utilizationPct - a.stats.utilizationPct);
      const totalAvailable = sorted.reduce((s, r) => s + r.stats.availableManDays, 0);
      const avg = totalAvailable > 0
        ? (sorted.reduce((s, r) => s + r.stats.allocatedManDays, 0) / totalAvailable) * 100
        : 0;
      return { key, rows: sorted, avgUtilization: avg };
    };
    if (summaryGroupBy === 'resource') return [withAvg(null, summaryFiltered)];
    const map = new Map();
    for (const r of summaryFiltered) {
      const k = summaryGroupBy === 'role' ? r.role : (r.resource.primaryModule || 'Unassigned');
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, rows]) => withAvg(key, rows));
  }, [summaryFiltered, summaryGroupBy]);

  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  function toggleGroup(key) {
    setCollapsedGroups((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function exportCsv() {
    const header = ['Resource', 'Role', 'Assignment', 'Module', 'Start Date', 'End Date', 'Man-days (period)', 'Allocation %', 'Status', 'Remarks'];
    const rows = allocationRows.map((r) => [r.resourceName, r.role, r.title, r.module || '', r.startDate || '', r.endDate || '', r.manDays.toFixed(1), `${Math.round(r.pct)}%`, r.status, r.remarks || '']);
    const csv = [header, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'resource-utilization.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  if (!email) return null;

  if (loading || failed) {
    return (
      <div className="app-shell">
        <Sidebar active="resourceUtilization" isAdmin={isAdmin} email={email} name={profileName} identityInTopbar visual="roster" />
        <main className="shell-main">
          <Topbar email={email} name={profileName} roleLabel={roleLabel} notifications={visibleNotifications} onMarkAllRead={markAllRead} onClear={clear} />
          <div className="empty-state">{loading ? 'Loading resource data…' : "Couldn't load live data — try refreshing the page."}</div>
        </main>
      </div>
    );
  }

  const rangeLabel = `${fmtDate(toISODate(periodStart))} → ${fmtDate(toISODate(periodEnd))}`;

  return (
    <div className="app-shell">
      <Sidebar active="resourceUtilization" isAdmin={isAdmin} email={email} name={profileName} identityInTopbar visual="roster" />
      <main className="shell-main">
        <Topbar email={email} name={profileName} roleLabel={roleLabel} notifications={visibleNotifications} onMarkAllRead={markAllRead} onClear={clear} />

        <div className="dash-header-row">
          <div>
            <h1 className="dash-title">Resource Utilization</h1>
            <p className="dash-header-sub">Plan. Track. Optimize. — {rangeLabel}</p>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={exportCsv}>
            <DownloadIcon size={14} /> Export
          </button>
        </div>

        <div className="filters-row">
          <select value={filterResource} onChange={(e) => setFilterResource(e.target.value)}>
            <option value="">All Resources</option>
            {resourceNameOptions.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
            <option value="">All Roles</option>
            {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={filterModule} onChange={(e) => setFilterModule(e.target.value)}>
            <option value="">All Modules</option>
            {(options.area || []).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {(options.status || []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="date-range">
            <CalendarIcon size={14} />
            <input type="date" value={toISODate(periodStart)} onChange={(e) => { const d = new Date(e.target.value + 'T00:00:00'); if (!Number.isNaN(d.getTime())) setRange((r) => ({ ...r, start: d })); }} aria-label="Start date" />
            <span className="date-range-arrow">&rarr;</span>
            <input type="date" value={toISODate(periodEnd)} onChange={(e) => { const d = new Date(e.target.value + 'T00:00:00'); if (!Number.isNaN(d.getTime())) setRange((r) => ({ ...r, end: d })); }} aria-label="End date" />
          </div>
          <div className="more-filters-wrap" onMouseLeave={() => setMoreFiltersOpen(false)}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMoreFiltersOpen((o) => !o)}>
              <FilterIcon size={14} /> More Filters {filterPriority && <span className="more-filters-count">1</span>}
            </button>
            {moreFiltersOpen && (
              <div className="more-filters-panel">
                <div className="more-filters-panel-title">Additional filters</div>
                <div className="more-filters-grid">
                  <div>
                    <label>Priority</label>
                    <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
                      <option value="">Any</option>
                      {(options.priority || []).map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                </div>
                <div className="more-filters-foot">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear all</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="view-toolbar">
          <div className="seg-toggle">
            {VIEW_OPTIONS.map((v) => (
              <button key={v.key} type="button" className={view === v.key ? 'active' : ''} onClick={() => setView(v.key)}>
                <v.icon size={14} /> {v.label}
              </button>
            ))}
          </div>
          {view === 'timeline' && (
            <div className="view-toolbar-right">
              <div className="seg-toggle">
                {GRANULARITIES.map((g) => <button key={g} type="button" className={granularity === g ? 'active' : ''} onClick={() => setGranularity(g)}>{g}</button>)}
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => shiftRange(-1)}><ChevronLeftIcon size={14} /></button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRange(defaultRange())}>Today</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => shiftRange(1)}><ChevronRightIcon size={14} /></button>
            </div>
          )}
          {view === 'table' && (
            <div className="view-toolbar-right">
              <div className="search-by-id" style={{ minWidth: 200 }}>
                <SearchIcon size={14} />
                <input type="text" placeholder="Search in table…" value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} />
              </div>
            </div>
          )}
          {view === 'summary' && (
            <div className="view-toolbar-right">
              <span className="sort-label">Group by</span>
              <select value={summaryGroupBy} onChange={(e) => { setSummaryGroupBy(e.target.value); setCollapsedGroups(new Set()); }}>
                <option value="resource">Resource (no grouping)</option>
                <option value="role">Role</option>
                <option value="module">Module</option>
              </select>
            </div>
          )}
        </div>

        {/* ---------------------------- Timeline View ---------------------------- */}
        {view === 'timeline' && (
          <>
            <div className="ru-timeline-card">
              <div className="ru-axis-header">
                <div className="ru-axis-side">Resource ({resourceRows.length})</div>
                <div className="ru-axis-role-col">Role</div>
                <div className="ru-axis-workload-col">Workload</div>
                <div className="ru-axis-track">
                  {axis.ticks.map((t, i) => <span key={i} className="ru-axis-tick" style={{ left: `${axis.pct(t.date)}%` }}>{t.label}</span>)}
                  {todayInRange && <span className="today-pill" style={{ left: `${axis.pct(today)}%` }}>Today</span>}
                  {todayInRange && <div className="today-line" style={{ left: `${axis.pct(today)}%` }} />}
                </div>
              </div>
              {!resourceRows.length && <div className="empty-state">No resources match the current filters.</div>}
              {resourceRows.map((r) => {
                const bars = r.allocs.filter((a) => overlapsPeriod(a.window, periodStart, periodEnd));
                const rowHeight = Math.max(64, 10 + bars.length * BAR_LANE_HEIGHT);
                return (
                  <div className="ru-row" key={r.resource.name}>
                    <div className="ru-row-side">
                      <div className="avatar mono" style={{ background: avatarColor(r.resource.name) }}>{initialsOf(r.resource.name)}</div>
                      <div>
                        <div className="ru-row-name">{r.resource.name}</div>
                        <div className="ru-row-role">{r.resource.primaryModule || '—'}</div>
                      </div>
                    </div>
                    <div className="ru-row-role-col">{r.role}</div>
                    <div className="ru-row-workload-col">
                      <span className="ru-workload-pct">{Math.round(r.stats.utilizationPct)}%</span>
                      <span className="ru-workload-track"><span className="ru-workload-fill" style={{ width: `${Math.min(100, r.stats.utilizationPct)}%`, background: r.bucket.color }} /></span>
                    </div>
                    <div className="ru-row-track" style={{ height: rowHeight }}>
                      {axis.ticks.map((t, i) => <div key={i} className="month-div" style={{ left: `${axis.pct(t.date)}%`, opacity: 0.4 }} />)}
                      {todayInRange && <div className="today-line" style={{ left: `${axis.pct(today)}%`, opacity: 0.4 }} />}
                      {!bars.length && <span className="ru-row-empty">No allocations in this period</span>}
                      {bars.map((a, idx) => {
                        const s = a.window.start < periodStart ? periodStart : a.window.start;
                        const e = a.window.end > periodEnd ? periodEnd : a.window.end;
                        const left = axis.pct(s);
                        const width = Math.max(1.5, axis.pct(e) - left);
                        const meta = areaColors[a.module] || { color: 'var(--mod-fallback)', softColor: 'var(--bg-alt)' };
                        const completed = a.item.status === 'Completed';
                        const overdue = !['Completed', 'Cancelled'].includes(a.item.status) && a.window.end < today;
                        const dateRange = `${fmtDate(a.item.startDate, { withYear: false })} – ${fmtDate(toISODate(a.window.end), { withYear: false })}`;
                        return (
                          <div
                            key={idx}
                            className="bar"
                            style={{ left: `${left}%`, width: `${width}%`, top: 8 + idx * BAR_LANE_HEIGHT, background: meta.softColor, opacity: completed ? 0.6 : 1, borderBottom: overdue ? '3px solid var(--st-red)' : 'none' }}
                            title={`${a.item.devList} — ${dateRange}${completed ? ' (completed)' : ''}`}
                          >
                            <span className="bar-title" style={{ color: meta.color }}>{a.item.devList}{completed ? ' ✓' : ''}</span>
                            <span className="bar-dates">{dateRange}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="ru-bottom-grid">
              <div className="ru-panel">
                <div className="ru-panel-title">Resource Overview</div>
                <div className="ru-stat-grid ru-stat-grid-3">
                  <StatTile icon={UsersIcon} tone="blue" label="Total Resources" value={totalResources} />
                  <StatTile icon={CheckCircleIcon} tone="green" label="Active" value={activeResourcesCount} />
                  <StatTile icon={BarChartIcon} tone="purple" label="Avg. Utilization" value={`${Math.round(avgUtilization)}%`} />
                </div>
              </div>
              <div className="ru-panel">
                <div className="ru-panel-title">Utilization Distribution</div>
                <Donut segments={utilDistribution} total={totalResources} centerLabel={totalResources} centerSub="Resources" />
              </div>
              <div className="ru-panel">
                <div className="ru-panel-title">Upcoming Allocations</div>
                <div className="ru-upcoming-list">
                  {upcoming.map((a, i) => {
                    const days = Math.round((a.window.start - today) / 86400000);
                    return (
                      <div className="ru-upcoming-row" key={i}>
                        <span className="dot" style={{ background: (areaColors[a.module] || { color: 'var(--mod-fallback)' }).color }} />
                        <div className="ru-upcoming-main">
                          <div className="ru-upcoming-title">{a.item.devList}</div>
                          <div className="ru-upcoming-sub">Starts in {days} day{days === 1 ? '' : 's'}</div>
                        </div>
                        <div className="ru-upcoming-date mono">{fmtDate(a.item.startDate)}</div>
                      </div>
                    );
                  })}
                  {!upcoming.length && <div className="major-tile-empty">No upcoming allocations.</div>}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ---------------------------- Allocation Table ---------------------------- */}
        {view === 'table' && (
          <>
            <div className="table-view-wrap">
              <table className="table-view">
                <thead>
                  <tr>
                    <th>#</th>
                    <th className="sortable" onClick={() => handleTableSort('resource')}>Resource <CaretUpDownIcon size={11} className={tableSortBy === 'resource' ? 'caret-active' : ''} /></th>
                    <th>Role</th>
                    <th className="sortable" onClick={() => handleTableSort('title')}>Assignment / Task <CaretUpDownIcon size={11} className={tableSortBy === 'title' ? 'caret-active' : ''} /></th>
                    <th className="sortable" onClick={() => handleTableSort('module')}>Module <CaretUpDownIcon size={11} className={tableSortBy === 'module' ? 'caret-active' : ''} /></th>
                    <th className="sortable" onClick={() => handleTableSort('startDate')}>Start Date <CaretUpDownIcon size={11} className={tableSortBy === 'startDate' ? 'caret-active' : ''} /></th>
                    <th className="sortable" onClick={() => handleTableSort('endDate')}>End Date <CaretUpDownIcon size={11} className={tableSortBy === 'endDate' ? 'caret-active' : ''} /></th>
                    <th className="sortable" onClick={() => handleTableSort('manDays')}>Man-days <CaretUpDownIcon size={11} className={tableSortBy === 'manDays' ? 'caret-active' : ''} /></th>
                    <th className="sortable" onClick={() => handleTableSort('pct')}>Allocation <CaretUpDownIcon size={11} className={tableSortBy === 'pct' ? 'caret-active' : ''} /></th>
                    <th>Status</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {tablePageRows.map((r, i) => (
                    <tr key={r.key}>
                      <td className="mono">{(tablePageSafe - 1) * tablePageSize + i + 1}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <div className="avatar-sm mono" style={{ background: avatarColor(r.resourceName) }}>{initialsOf(r.resourceName)}</div>
                          {r.resourceName}
                        </div>
                      </td>
                      <td>{r.role}</td>
                      <td>{r.title}</td>
                      <td>{r.module || '—'}</td>
                      <td className="mono">{r.startDate ? fmtDate(r.startDate) : '—'}</td>
                      <td className="mono">{r.endDate ? fmtDate(r.endDate) : '—'}</td>
                      <td className="mono">{r.manDays.toFixed(1)}</td>
                      <td>
                        <div className="ru-util-cell">
                          <span className="ru-workload-track sm"><span className="ru-workload-fill" style={{ width: `${Math.min(100, r.pct)}%`, background: bucketFor(r.pct).color }} /></span>
                          <span className="mono">{Math.round(r.pct)}%</span>
                        </div>
                      </td>
                      <td><span className="priority-pill" style={{ background: 'var(--bg-alt)', color: 'var(--text-2)' }}>{r.status}</span></td>
                      <td className="table-remarks">{r.remarks || '—'}</td>
                    </tr>
                  ))}
                  {!tablePageRows.length && <tr><td colSpan={10} className="table-empty">No allocations match the current filters.</td></tr>}
                </tbody>
              </table>
              {tableFiltered.length > 0 && (
                <div className="table-pagination">
                  <span className="table-pagination-summary">Showing {(tablePageSafe - 1) * tablePageSize + 1} - {Math.min(tablePageSafe * tablePageSize, tableFiltered.length)} of {tableFiltered.length} allocations</span>
                  <div className="pager-controls">
                    <button type="button" disabled={tablePageSafe === 1} onClick={() => setTablePage(tablePageSafe - 1)}><ChevronLeftIcon size={14} /></button>
                    <button type="button" className="active">{tablePageSafe}</button>
                    <button type="button" disabled={tablePageSafe === tableTotalPages} onClick={() => setTablePage(tablePageSafe + 1)}><ChevronRightIcon size={14} /></button>
                  </div>
                  <div className="page-size">
                    Show
                    <select value={tablePageSize} onChange={(e) => { setTablePageSize(Number(e.target.value)); setTablePage(1); }}>
                      {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    per page
                  </div>
                </div>
              )}
            </div>

            <div className="ru-bottom-grid">
              <div className="ru-panel">
                <div className="ru-panel-title">Allocation Summary</div>
                <div className="ru-stat-grid">
                  <StatTile icon={UsersIcon} tone="blue" label="Total Resources" value={totalResources} />
                  <StatTile icon={CheckCircleIcon} tone="green" label="Fully Allocated" value={fullyAllocated} sub="70–100% util." />
                  <StatTile icon={AlertIcon} tone="amber" label="Under Allocated" value={underAllocated} sub="&lt;70% util." />
                  <StatTile icon={AlertIcon} tone="red" label="Over Allocated" value={overAllocatedCount} sub="&gt;100% util." />
                </div>
              </div>
              <div className="ru-panel">
                <div className="ru-panel-title">{moduleAlloc.useManDays ? 'Allocation by Module' : 'Allocations by Module'}</div>
                <Donut segments={moduleAllocSegments} total={moduleAlloc.total} centerLabel={Math.round(moduleAlloc.total)} centerSub={moduleAlloc.useManDays ? "Man-days" : "Allocations"} />
              </div>
              <div className="ru-panel">
                <div className="ru-panel-title">Resource Workload</div>
                <div className="ru-upcoming-list">
                  {[...resourceRows].sort((a, b) => b.stats.utilizationPct - a.stats.utilizationPct).map((r) => (
                    <div className="ru-workload-row" key={r.resource.name}>
                      <div className="avatar-sm mono" style={{ background: avatarColor(r.resource.name) }}>{initialsOf(r.resource.name)}</div>
                      <span className="ru-workload-row-name">{r.resource.name}</span>
                      <span className="ru-workload-track sm"><span className="ru-workload-fill" style={{ width: `${Math.min(100, r.stats.utilizationPct)}%`, background: r.bucket.color }} /></span>
                      <span className="mono ru-workload-row-pct">{Math.round(r.stats.utilizationPct)}%</span>
                    </div>
                  ))}
                  {!resourceRows.length && <div className="major-tile-empty">No resources in range.</div>}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ---------------------------- Resource Summary ---------------------------- */}
        {view === 'summary' && (
          <>
            <div className="ru-summary-stats">
              <StatTile icon={UsersIcon} tone="blue" label="Total Resources" value={totalResources} />
              <StatTile icon={CheckCircleIcon} tone="green" label="Active Resources" value={activeResourcesCount} />
              <StatTile icon={BarChartIcon} tone="amber" label="Average Utilization" value={`${Math.round(avgUtilization)}%`} />
              <StatTile icon={LayersIcon} tone="purple" label="Total Allocations" value={totalAllocationsCount} />
            </div>

            <div className="ru-bottom-grid" style={{ marginBottom: 16 }}>
              <div className="ru-panel">
                <div className="ru-panel-title">Utilization Distribution</div>
                <Donut segments={utilDistribution} total={totalResources} centerLabel={totalResources} centerSub="Resources" />
              </div>
              <div className="ru-panel">
                <div className="ru-panel-title">{moduleAlloc.useManDays ? 'Allocation by Module' : 'Allocations by Module'}</div>
                <Donut segments={moduleAllocSegments} total={moduleAlloc.total} centerLabel={Math.round(moduleAlloc.total)} centerSub={moduleAlloc.useManDays ? "Man-days" : "Allocations"} />
              </div>
              <div className="ru-panel">
                <div className="ru-panel-title">Resource Status</div>
                <div className="ru-status-bars">
                  {['Active', 'Bench', 'Over Allocated'].map((s) => {
                    const meta = RESOURCE_STATUS_META[s];
                    const max = Math.max(1, ...Object.values(statusCounts));
                    return (
                      <div className="ru-status-bar-row" key={s}>
                        <span className="ru-status-bar-label">{s}</span>
                        <span className="ru-status-bar-track"><span className="ru-status-bar-fill" style={{ width: `${(statusCounts[s] / max) * 100}%`, background: meta.color }} /></span>
                        <span className="mono ru-status-bar-count">{statusCounts[s]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="search-by-id" style={{ marginBottom: 12, maxWidth: 320 }}>
              <SearchIcon size={14} />
              <input type="text" placeholder="Search resource by name, role, module…" value={summarySearch} onChange={(e) => setSummarySearch(e.target.value)} />
            </div>

            <div className="table-view-wrap">
              <table className="table-view">
                <thead>
                  <tr>
                    <th>Resource</th>
                    <th>Role</th>
                    <th>Overall Utilization</th>
                    <th>Active Assignments</th>
                    <th>Modules</th>
                    <th>Current Tasks</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryGroups.map((group) => (
                    <React.Fragment key={group.key || 'all'}>
                      {group.key && (
                        <tr className="ru-group-row" onClick={() => toggleGroup(group.key)}>
                          <td colSpan={7}>
                            <div className="ru-group-head">
                              <ChevronDownIcon size={13} className={collapsedGroups.has(group.key) ? 'ru-group-caret collapsed' : 'ru-group-caret'} />
                              <span className="ru-group-title">{group.key}</span>
                              <span className="ru-group-meta">{group.rows.length} resource{group.rows.length === 1 ? '' : 's'} · avg {Math.round(group.avgUtilization)}% utilization</span>
                            </div>
                          </td>
                        </tr>
                      )}
                      {(!group.key || !collapsedGroups.has(group.key)) && group.rows.map((r) => {
                        const meta = RESOURCE_STATUS_META[r.status];
                        return (
                          <tr key={r.resource.name}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div className="avatar-sm mono" style={{ background: avatarColor(r.resource.name) }}>{initialsOf(r.resource.name)}</div>
                                {r.resource.name}
                              </div>
                            </td>
                            <td>{r.role}<div className="ru-table-sub">{r.resource.primaryModule || '—'}</div></td>
                            <td>
                              <div className="ru-util-cell">
                                <span className="ru-workload-track sm"><span className="ru-workload-fill" style={{ width: `${Math.min(100, r.stats.utilizationPct)}%`, background: r.bucket.color }} /></span>
                                <span className="mono">{Math.round(r.stats.utilizationPct)}%</span>
                              </div>
                            </td>
                            <td className="mono">{r.stats.activeOverlapping.length}</td>
                            <td>{r.modules.length ? r.modules.map((m) => <span key={m} className="badge" style={{ background: (areaColors[m] || { softColor: 'var(--bg-alt)' }).softColor, color: (areaColors[m] || { color: 'var(--muted)' }).color, marginRight: 4 }}>{m}</span>) : '—'}</td>
                            <td className="table-remarks">{r.currentTaskAllocs.length ? `${r.currentTaskAllocs[0].item.devList}${r.currentTaskAllocs.length > 1 ? ` +${r.currentTaskAllocs.length - 1} more` : ''}` : '—'}</td>
                            <td><span className="priority-pill" style={{ background: meta.soft, color: meta.color }}>{r.status}</span></td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                  {!summaryFiltered.length && <tr><td colSpan={7} className="table-empty">No resources match the current filters.</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--muted)' }}>Showing 1 - {summaryFiltered.length} of {summaryFiltered.length} resources</div>
          </>
        )}

        <div style={{ marginTop: 16, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
          Every number on this page is calculated live from real assignment data for the selected range. Available capacity counts Mon–Fri plus odd (1st/3rd/5th) Saturdays, minus any date listed under Manage Master Data → Holidays.
        </div>
      </main>
    </div>
  );
}
