import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import Sidebar from '../shared/Sidebar.jsx';
import Topbar from '../shared/Topbar.jsx';
import { useDevTrackerSession } from '../shared/useDevTrackerSession.js';
import { useNotifications } from '../shared/useNotifications.js';
import ItemPanel from './ItemPanel.jsx';
import { apiList, apiMasterData, apiUpdate, apiDelete, getCurrentUserEmail, apiSavedViews, apiSavedViewCreate, apiSavedViewDelete } from '../shared/api.js';
import { groupMasterData, activeValues, categoryColorMap } from '../shared/masterData.js';
import { revisedTarget, isOverdue, fmtDate, daysBetween, todayStr, datesToAutoFillForStatus, shortId } from '../shared/utils.js';
import { KANBAN_COLUMNS, FIELDS, FIELD_LABELS, PRIORITY_RANK } from '../shared/constants.js';
import { ROUTES } from '../shared/routes.js';
import { CalendarIcon, FilterIcon, DownloadIcon, PlusIcon, GridIcon, TableIcon, MoreIcon, EyeIcon, PencilIcon, CaretUpDownIcon, ChevronLeftIcon, ChevronRightIcon, StarIcon, TrashIcon } from '../shared/icons.jsx';

const SORT_OPTIONS = [
  { key: 'priority', label: 'Priority' },
  { key: 'targetDate', label: 'Target Date' },
  { key: 'status', label: 'Status' },
  { key: 'title', label: 'Title' },
];
const PAGE_SIZES = [10, 15, 25, 50];
// Swimlanes, not alternative columns: the board's columns stay bound to status so dragging a
// card between them still means "move this to that status". Grouping adds a second axis on top
// of that rather than replacing it, which is the only arrangement where both gestures keep a
// single obvious meaning.
const GROUP_OPTIONS = [
  { key: '', label: 'No grouping' },
  { key: 'area', label: 'Module' },
  { key: 'developer', label: 'Developer' },
  { key: 'priority', label: 'Priority' },
  { key: 'impact', label: 'Business Impact' },
  { key: 'devFactory', label: 'Dev Factory' },
];
const GROUP_BLANK = '—';
const LANE_AUTO_COLLAPSE_OVER = 6;
// Sentinel for the owner filter meaning "whoever is signed in" — resolved against the session
// email at filter time, so a saved/shared link stays personal to whoever opens it.
const PRESET_MINE = '__me__';
const PRESET_LABELS = { active: 'active', completed: 'completed', overdue: 'overdue', mine: 'your' };

// Fallbacks used until someone picks a custom color for that value on the Master Data page
// (Status/Priority now carry hasColor: true there, same as Area) — priorityStyle/statusStyle
// below prefer a master-data color/softColor over these the moment one is set.
const PRIORITY_FALLBACK = {
  P1: { label: 'High', bg: 'var(--st-red-soft)', fg: 'var(--st-red)' },
  P2: { label: 'Medium', bg: 'var(--st-blue-soft)', fg: 'var(--st-blue)' },
  P3: { label: 'Low', bg: 'var(--st-green-soft)', fg: 'var(--st-green)' },
};
function priorityStyle(p, colorMap) {
  const fallback = PRIORITY_FALLBACK[p] || { label: p || '—', bg: 'var(--st-gray-soft)', fg: 'var(--st-gray)' };
  const custom = colorMap[p];
  return custom ? { label: fallback.label, bg: custom.softColor || fallback.bg, fg: custom.color || fallback.fg } : fallback;
}

const STATUS_FALLBACK = {
  'Not Started': { bg: 'var(--st-gray-soft)', fg: 'var(--st-gray)' },
  'Requirement Discussion': { bg: 'var(--st-indigo-soft)', fg: 'var(--st-indigo)' },
  'FS Preparation': { bg: 'var(--st-indigo-soft)', fg: 'var(--st-indigo)' },
  'In Progress': { bg: 'var(--st-blue-soft)', fg: 'var(--st-blue)' },
  'IT Testing': { bg: 'var(--st-teal-soft)', fg: 'var(--st-teal)' },
  'User Testing': { bg: 'var(--st-teal-soft)', fg: 'var(--st-teal)' },
  Hypercare: { bg: 'var(--st-amber-soft)', fg: 'var(--st-amber)' },
  'On Hold': { bg: 'var(--st-amber-soft)', fg: 'var(--st-amber)' },
  Completed: { bg: 'var(--st-green-soft)', fg: 'var(--st-green)' },
  Cancelled: { bg: 'var(--st-gray-soft)', fg: 'var(--st-gray)' },
};
function statusStyle(it, colorMap) {
  // Overdue always wins visually, regardless of the status's own color.
  if (isOverdue(it)) return { bg: 'var(--st-red-soft)', fg: 'var(--st-red)' };
  const fallback = STATUS_FALLBACK[it.status] || { bg: 'var(--st-gray-soft)', fg: 'var(--st-gray)' };
  const custom = colorMap[it.status];
  return custom ? { bg: custom.softColor || fallback.bg, fg: custom.color || fallback.fg } : fallback;
}

const AVATAR_PALETTE = ['var(--st-purple)', 'var(--st-blue)', 'var(--st-teal)', 'var(--st-green)', 'var(--st-indigo)', 'var(--st-amber)', 'var(--accent)'];
function avatarColor(name) {
  if (!name) return 'var(--st-gray)';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}
function initialsOf(name) {
  return (name || '').slice(0, 2).toUpperCase() || null;
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function compareItems(a, b, key) {
  switch (key) {
    case 'id': return a.id - b.id;
    case 'title': return (a.devList || '').localeCompare(b.devList || '');
    case 'module': return (a.area || '').localeCompare(b.area || '');
    case 'status': return (a.status || '').localeCompare(b.status || '');
    case 'priority': return (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    case 'owner': return (a.developer || '').localeCompare(b.developer || '');
    case 'startDate': return (a.startDate || '').localeCompare(b.startDate || '');
    case 'targetDate': {
      const ra = revisedTarget(a) || ''; const rb = revisedTarget(b) || '';
      if (!ra && !rb) return 0;
      if (!ra) return 1;
      if (!rb) return -1;
      return ra < rb ? -1 : ra > rb ? 1 : 0;
    }
    default: return 0;
  }
}
function sortItems(rows, key, dir) {
  const arr = [...rows];
  arr.sort((a, b) => compareItems(a, b, key) * (dir === 'desc' ? -1 : 1));
  return arr;
}
function pageList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [1];
  if (current > 3) pages.push('…');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current < total - 2) pages.push('…');
  pages.push(total);
  return pages;
}

export default function Dashboard() {
  const [items, setItems] = useState([]);
  const [masterData, setMasterData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [moduleArea, setModuleArea] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [search, setSearch] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  // '' | 'active' | 'completed' — the lifecycle buckets Home's KPI cards count, so clicking a
  // card can land here showing exactly the rows behind that number. Kept separate from
  // filterStatus because "Active" spans several statuses rather than being one of them.
  const [lifecycle, setLifecycle] = useState('');
  const [filterImpact, setFilterImpact] = useState('');
  const [filterComplexity, setFilterComplexity] = useState('');
  const [filterDevFactory, setFilterDevFactory] = useState('');
  const [filterReasonCategory, setFilterReasonCategory] = useState('');
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState('board');
  const [groupBy, setGroupBy] = useState('');
  const [collapsedLanes, setCollapsedLanes] = useState(() => new Set());
  const [savedViews, setSavedViews] = useState([]);
  const [activeViewId, setActiveViewId] = useState('');
  const viewApplyRef = useRef(false);
  const [sortBy, setSortBy] = useState('priority');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [rowMenuId, setRowMenuId] = useState(null);
  const [panel, setPanel] = useState(null); // { mode, item }
  const [commandResponse, setCommandResponse] = useState(null);
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [dragError, setDragError] = useState(null);
  const now = useClock();
  const email = getCurrentUserEmail();
  const { isAdmin, roleLabel, profileName } = useDevTrackerSession(email);
  const { visibleNotifications, markAllRead, clear } = useNotifications(email, items, [], profileName);

  async function reload() {
    const [itemRows, mdRows] = await Promise.all([apiList(email), apiMasterData(email)]);
    setItems(itemRows || []);
    setMasterData(mdRows || []);
  }

  useEffect(() => {
    if (!email) {
      window.location.href = '/';
      return;
    }
    reload().finally(() => setLoading(false));
    reloadViews();
  }, []);

  // Handle the Home page's search handoff (?aiSearch=…) and the ?action=new draft handoff.
  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has('aiArea') && !params.has('aiStatus') && !params.has('aiPriority') && !params.has('aiOverdue') && !params.has('aiSearch') && !params.has('preset') && !params.has('action')) return;
    let touched = false;
    // Home's KPI cards and hero tiles hand off which bucket was clicked, so the number on the
    // card and the rows listed here are always the same set.
    const preset = params.get('preset');
    if (preset === 'active' || preset === 'completed') { setLifecycle(preset); touched = true; }
    if (preset === 'overdue') { setOverdueOnly(true); touched = true; }
    if (preset === 'mine') { setOwnerFilter(PRESET_MINE); touched = true; }
    if (params.get('aiArea')) { setModuleArea(params.get('aiArea')); touched = true; }
    if (params.get('aiStatus')) { setFilterStatus(params.get('aiStatus')); touched = true; }
    if (params.get('aiPriority')) { setFilterPriority(params.get('aiPriority')); touched = true; }
    if (params.get('aiOverdue') === '1') { setOverdueOnly(true); touched = true; }
    if (params.get('aiSearch')) { setSearch(params.get('aiSearch')); touched = true; }
    if (touched) {
      setCommandResponse({
        text: preset ? `Showing ${PRESET_LABELS[preset] || 'the selected'} items.` : 'Filters applied from your last search.',
        clearable: true,
      });
    }
    if (params.get('action') === 'new') setPanel({ mode: 'new', item: null });
    window.history.replaceState({}, '', ROUTES.dashboard);
  }, [loading]);

  const options = useMemo(() => {
    const grouped = groupMasterData(masterData);
    const out = {};
    for (const key of Object.keys(grouped)) out[key] = activeValues(masterData, key);
    return out;
  }, [masterData]);
  const owners = useMemo(() => Array.from(new Set(items.map((it) => it.developer).filter(Boolean))).sort(), [items]);
  const priorityColors = useMemo(() => categoryColorMap(masterData, 'priority'), [masterData]);
  const statusColors = useMemo(() => categoryColorMap(masterData, 'status'), [masterData]);

  // "My Work": items where the signed-in person is the developer or either SPOC. The item
  // columns hold display names ("Indranil", "Anjani K"), not emails, so this matches on the
  // profile name and falls back to the local part of the address when no name is resolved.
  const myNames = useMemo(() => {
    const out = [];
    if (profileName) out.push(profileName.trim().toLowerCase());
    if (email) out.push(String(email).split('@')[0].replace(/[._]/g, ' ').trim().toLowerCase());
    return out.filter(Boolean);
  }, [profileName, email]);

  const isMine = useCallback((it) => {
    if (!myNames.length) return false;
    const fields = [it.developer, it.spocIT, it.spocFunction].map((v) => (v || '').trim().toLowerCase());
    return fields.some((f) => f && myNames.some((n) => f === n || f.startsWith(n) || n.startsWith(f)));
  }, [myNames]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = items.filter((it) => {
      if (moduleArea && it.area !== moduleArea) return false;
      if (ownerFilter === PRESET_MINE) {
        if (!isMine(it)) return false;
      } else if (ownerFilter && it.developer !== ownerFilter) return false;
      if (filterStatus && it.status !== filterStatus) return false;
      if (filterPriority && it.priority !== filterPriority) return false;
      if (overdueOnly && !isOverdue(it)) return false;
      if (lifecycle === 'active' && ['Completed', 'Cancelled'].includes(it.status)) return false;
      if (lifecycle === 'completed' && it.status !== 'Completed') return false;
      if (dateStart && (!it.targetDate || it.targetDate < dateStart)) return false;
      if (dateEnd && (!it.targetDate || it.targetDate > dateEnd)) return false;
      if (filterImpact && it.impact !== filterImpact) return false;
      if (filterComplexity && it.complexity !== filterComplexity) return false;
      if (filterDevFactory && it.devFactory !== filterDevFactory) return false;
      if (filterReasonCategory && it.reasonCategory !== filterReasonCategory) return false;
      if (q) {
        const hay = [it.devList, it.func, it.developer, it.remarks, it.spocFunction, it.spocIT].map((v) => (v || '').toLowerCase()).join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return sortItems(rows, sortBy, sortDir);
  }, [items, isMine, moduleArea, ownerFilter, filterStatus, filterPriority, overdueOnly, lifecycle, dateStart, dateEnd, filterImpact, filterComplexity, filterDevFactory, filterReasonCategory, search, sortBy, sortDir]);

  const moreFiltersCount = [filterImpact, filterComplexity, filterDevFactory, filterReasonCategory].filter(Boolean).length;

  useEffect(() => { setPage(1); }, [moduleArea, ownerFilter, filterStatus, filterPriority, overdueOnly, lifecycle, dateStart, dateEnd, filterImpact, filterComplexity, filterDevFactory, filterReasonCategory, search, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = useMemo(() => filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize), [filtered, pageSafe, pageSize]);

  // One lane when ungrouped, so the board renders through the same path either way.
  const swimlanes = useMemo(() => {
    const toColumns = (rows) => KANBAN_COLUMNS.map((col) => ({
      ...col,
      cards: rows.filter((it) => col.statuses.includes(it.status)),
    }));
    if (!groupBy) return [{ key: '__all__', label: null, count: filtered.length, columns: toColumns(filtered) }];
    const byValue = new Map();
    for (const it of filtered) {
      const v = String(it[groupBy] ?? '').trim() || GROUP_BLANK;
      if (!byValue.has(v)) byValue.set(v, []);
      byValue.get(v).push(it);
    }
    return Array.from(byValue.entries())
      // Unset values last: a lane of items missing the field being grouped on is the least
      // interesting one, and putting it first pushes the real groups below the fold.
      .sort(([a], [b]) => (a === GROUP_BLANK ? 1 : b === GROUP_BLANK ? -1 : a.localeCompare(b)))
      .map(([label, rows]) => ({ key: label, label, count: rows.length, columns: toColumns(rows) }));
  }, [filtered, groupBy]);

  // Grouping by Developer on the current data produces 47 lanes, 312 of the items sitting in
  // the unassigned one — expanded by default that is a page nobody can scan. Past a handful of
  // lanes, start them collapsed so the grouping reads as a summary that opens on demand.
  useEffect(() => {
    if (!groupBy) { setCollapsedLanes(new Set()); return; }
    const keys = swimlanes.map((l) => l.key);
    setCollapsedLanes(keys.length > LANE_AUTO_COLLAPSE_OVER ? new Set(keys) : new Set());
    // Deliberately keyed on the grouping field alone: recomputing this whenever `swimlanes`
    // changes would slam every lane shut again on each keystroke in the search box.
  }, [groupBy]);

  function toggleLane(key) {
    setCollapsedLanes((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // The filter set has grown twice already, so capture and restore are driven off one table
  // rather than two hand-written object literals that would silently stop matching.
  const VIEW_FILTERS = useMemo(() => ([
    ['moduleArea', moduleArea, setModuleArea], ['ownerFilter', ownerFilter, setOwnerFilter],
    ['filterStatus', filterStatus, setFilterStatus], ['filterPriority', filterPriority, setFilterPriority],
    ['filterImpact', filterImpact, setFilterImpact], ['filterComplexity', filterComplexity, setFilterComplexity],
    ['filterDevFactory', filterDevFactory, setFilterDevFactory], ['filterReasonCategory', filterReasonCategory, setFilterReasonCategory],
    ['dateStart', dateStart, setDateStart], ['dateEnd', dateEnd, setDateEnd],
    ['search', search, setSearch], ['lifecycle', lifecycle, setLifecycle],
    ['overdueOnly', overdueOnly, setOverdueOnly], ['sortBy', sortBy, setSortBy],
    ['sortDir', sortDir, setSortDir], ['groupBy', groupBy, setGroupBy], ['viewMode', viewMode, setViewMode],
  ]), [moduleArea, ownerFilter, filterStatus, filterPriority, filterImpact, filterComplexity,
       filterDevFactory, filterReasonCategory, dateStart, dateEnd, search, lifecycle, overdueOnly,
       sortBy, sortDir, groupBy, viewMode]);

  const currentConfig = useMemo(
    () => Object.fromEntries(VIEW_FILTERS.map(([k, v]) => [k, v])),
    [VIEW_FILTERS]
  );

  // Editing any filter by hand drops the saved-view selection: the dropdown would otherwise
  // keep naming a view whose filters are no longer what is on screen. Applying a view is itself
  // a filter change, so it arms this ref first to spend the resulting pass — without that, a
  // view would clear its own selection the instant it was chosen.
  useEffect(() => {
    if (viewApplyRef.current) { viewApplyRef.current = false; return; }
    setActiveViewId('');
  }, [currentConfig]);

  function applyConfig(config) {
    viewApplyRef.current = true;
    // Only keys the saved view actually carried are applied, and anything it omits is reset to
    // its default — otherwise a view saved before a filter existed would inherit whatever that
    // filter happened to be set to when it was opened.
    for (const [key, , setter] of VIEW_FILTERS) {
      const saved = config?.[key];
      if (key === 'overdueOnly') setter(saved === true);
      else if (key === 'sortBy') setter(saved || 'priority');
      else if (key === 'sortDir') setter(saved || 'asc');
      else if (key === 'viewMode') setter(saved === 'table' ? 'table' : 'board');
      else setter(typeof saved === 'string' ? saved : '');
    }
  }

  async function reloadViews() {
    try { setSavedViews(await apiSavedViews(email) || []); } catch { setSavedViews([]); }
  }

  async function handleSaveView() {
    const name = window.prompt('Name this view (e.g. "My overdue SAP items")');
    if (!name || !name.trim()) return;
    const shared = window.confirm('Share this view with the whole team?\n\nOK = shared, Cancel = keep it private to you.');
    try {
      const created = await apiSavedViewCreate(name.trim(), currentConfig, shared, email);
      await reloadViews();
      // Saving does not change any filter, so no pass is pending to suppress here.
      setActiveViewId(created?.id || '');
    } catch (e) {
      setDragError(e.message || 'Failed to save view');
    }
  }

  async function handleDeleteView() {
    const view = savedViews.find((v) => v.id === activeViewId);
    if (!view) return;
    if (!window.confirm(`Delete the saved view "${view.name}"?`)) return;
    try {
      await apiSavedViewDelete(view.id, email);
      setActiveViewId('');
      await reloadViews();
    } catch (e) {
      setDragError(e.message || 'Failed to delete view');
    }
  }

  function handleSelectView(id) {
    if (!id) { setActiveViewId(''); clearFilters(); return; }
    setActiveViewId(id);
    const view = savedViews.find((v) => v.id === id);
    if (view) applyConfig(view.config);
  }

  function handleSortClick(key) {
    if (sortBy === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(key); setSortDir('asc'); }
  }

  function clearFilters() {
    setModuleArea(''); setOwnerFilter(''); setFilterStatus(''); setFilterPriority('');
    setDateStart(''); setDateEnd(''); setOverdueOnly(false); setSearch(''); setLifecycle('');
    setFilterImpact(''); setFilterComplexity(''); setFilterDevFactory(''); setFilterReasonCategory('');
    setCommandResponse(null);
  }

  // Exports what is on screen — the filtered, sorted rows — not the whole table. Exporting
  // everything regardless of the filters made the button useless for the "send me just the
  // overdue MM items" case it exists for. Written as .xlsx with the same column order and
  // headers as the import template, so an export can be edited and fed straight back through
  // Import Center.
  function exportRows() {
    const header = FIELDS.map((f) => FIELD_LABELS[f] || f);
    const body = filtered.map((it) => FIELDS.map((f) => (it[f] == null ? '' : it[f])));
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    ws['!cols'] = header.map(() => ({ wch: 22 }));
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: body.length, c: header.length - 1 } }) };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Items');
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `dev-tracker-${filtered.length === items.length ? 'all' : 'filtered'}-${stamp}.xlsx`);
  }

  function onSaved() {
    setPanel(null);
    reload();
  }

  async function handleRowDelete(it) {
    if (!window.confirm(`Delete "${it.devList}"? This can't be undone.`)) return;
    setRowMenuId(null);
    try {
      await apiDelete(it.id, email);
      reload();
    } catch (e) {
      setDragError(e.message || 'Failed to delete item');
    }
  }

  function toggleRowSelected(id) {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAllSelected() {
    setSelectedIds((cur) => (cur.size === pageRows.length ? new Set() : new Set(pageRows.map((r) => r.id))));
  }

  // Drag-and-drop between Kanban columns. A column can span several underlying statuses
  // (e.g. "In Discussion" covers both Requirement Discussion and FS Preparation), so a drop
  // only changes status when the card isn't already in one of the target column's statuses.
  // Updates optimistically and rolls back if the save fails.
  function handleCardDragStart(e, it) {
    setDraggedId(it.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(it.id));
  }
  function handleCardDragEnd() {
    setDraggedId(null);
    setDragOverCol(null);
  }
  function handleColDragOver(e, col) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCol !== col.key) setDragOverCol(col.key);
  }
  function handleColDragLeave(col) {
    setDragOverCol((cur) => (cur === col.key ? null : cur));
  }
  async function handleColDrop(e, col) {
    e.preventDefault();
    setDragOverCol(null);
    const id = draggedId ?? e.dataTransfer.getData('text/plain');
    setDraggedId(null);
    const it = items.find((row) => String(row.id) === String(id));
    if (!it || col.statuses.includes(it.status)) return;
    const targetStatus = col.statuses[0];
    // Every status but Not Started has one or more corresponding date fields (see
    // datesToAutoFillForStatus) — a drag-drop bypasses the New/Edit form's own status-change
    // auto-fill, so replicate it here: default today's date into the target stage's own date
    // plus any earlier pipeline stage skipped over to get there, for whichever of those aren't
    // already set, rather than silently leaving the status/date pair inconsistent.
    const today = todayStr();
    const dateUpdates = {};
    for (const dateKey of datesToAutoFillForStatus(targetStatus)) {
      if (!it[dateKey]) dateUpdates[dateKey] = today;
    }
    const prevItems = items;
    setItems((cur) => cur.map((row) => (String(row.id) === String(id) ? { ...row, status: targetStatus, ...dateUpdates } : row)));
    try {
      // PUT /items/:id is a full-row replace (see backend/devTracker.js's normalize()), so
      // send the item's existing values for every field, with just status (and, if needed,
      // the stage dates) overridden.
      const payload = {};
      for (const key of FIELDS) payload[key] = it[key] ?? '';
      payload.status = targetStatus;
      Object.assign(payload, dateUpdates);
      await apiUpdate(it.id, payload, email);
    } catch (e2) {
      setItems(prevItems);
      setDragError(e2.message || 'Failed to move item');
    }
  }

  if (!email) return null;

  return (
    <div className="app-shell">
      <Sidebar active="dashboard" isAdmin={isAdmin} email={email} name={profileName} identityInTopbar visual="skyline" />
      <main className="shell-main">
        <Topbar email={email} name={profileName} roleLabel={roleLabel} notifications={visibleNotifications} onMarkAllRead={markAllRead} onClear={clear} />

        <div className="dash-header-row">
          <div>
            <h1 className="dash-title">Dashboard</h1>
            <p className="dash-header-sub">Manage assignments across all stages</p>
          </div>
          <div className="dash-clock">
            <span>{now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span>
            <span className="dash-clock-sep">|</span>
            <span>{now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>

        <div className="filters-row">
          <select value={moduleArea} onChange={(e) => setModuleArea(e.target.value)}>
            <option value="">All Modules</option>
            {(options.area || []).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
            <option value="">All Owners</option>
            {owners.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
            <option value="">All Priorities</option>
            {(options.priority || []).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {(options.status || []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="date-range">
            <CalendarIcon size={14} />
            <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} aria-label="Start date" />
            <span className="date-range-arrow">&rarr;</span>
            <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} aria-label="End date" />
          </div>
          <div className="more-filters-wrap" onMouseLeave={() => setMoreFiltersOpen(false)}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMoreFiltersOpen((o) => !o)}>
              <FilterIcon size={14} /> More Filters {moreFiltersCount > 0 && <span className="more-filters-count">{moreFiltersCount}</span>}
            </button>
            {moreFiltersOpen && (
              <div className="more-filters-panel">
                <div className="more-filters-panel-title">Additional filters</div>
                <div className="more-filters-grid">
                  <div>
                    <label>Business Impact</label>
                    <select value={filterImpact} onChange={(e) => setFilterImpact(e.target.value)}>
                      <option value="">Any</option>
                      {(options.impact || []).map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label>Technical Complexity</label>
                    <select value={filterComplexity} onChange={(e) => setFilterComplexity(e.target.value)}>
                      <option value="">Any</option>
                      {(options.complexity || []).map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label>Dev Factory</label>
                    <select value={filterDevFactory} onChange={(e) => setFilterDevFactory(e.target.value)}>
                      <option value="">Any</option>
                      {(options.devFactory || []).map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label>Reason for Delay</label>
                    <select value={filterReasonCategory} onChange={(e) => setFilterReasonCategory(e.target.value)}>
                      <option value="">Any</option>
                      {(options.reasonCategory || []).map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                </div>
                <div className="more-filters-foot">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setFilterImpact(''); setFilterComplexity(''); setFilterDevFactory(''); setFilterReasonCategory(''); }}>Reset these</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="filters-row2">
          <div className="search-by-id">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.2" y2="16.2" /></svg>
            <input type="text" placeholder="Search by ID, title, developer, remarks…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <label className="toggle-switch">
            <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
            Overdue only
          </label>
          <div className="filters-row2-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setMoreFiltersOpen(false)}>Apply</button>
          </div>
        </div>

        {commandResponse && (
          <div className="command-response" style={{ marginBottom: 16 }}>
            <span>{commandResponse.text}</span>
            {commandResponse.clearable && <button onClick={clearFilters}>Clear filter</button>}
          </div>
        )}

        <div className="view-toolbar">
          <div className="seg-toggle">
            <button type="button" className={viewMode === 'board' ? 'active' : ''} onClick={() => setViewMode('board')}>
              <GridIcon size={14} /> Board View
            </button>
            <button type="button" className={viewMode === 'table' ? 'active' : ''} onClick={() => setViewMode('table')}>
              <TableIcon size={14} /> Table View
            </button>
          </div>
          <div className="view-toolbar-right">
            <select
              className="saved-view-select"
              value={activeViewId}
              onChange={(e) => handleSelectView(e.target.value)}
              aria-label="Saved views"
              title="Apply a saved view"
            >
              <option value="">All items</option>
              {savedViews.filter((v) => v.mine).length > 0 && (
                <optgroup label="My views">
                  {savedViews.filter((v) => v.mine).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </optgroup>
              )}
              {savedViews.filter((v) => !v.mine).length > 0 && (
                <optgroup label="Shared with the team">
                  {savedViews.filter((v) => !v.mine).map((v) => (
                    <option key={v.id} value={v.id}>{v.name}{v.ownerName ? ` — ${v.ownerName}` : ''}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleSaveView} title="Save the current filters as a named view">
              <StarIcon size={14} /> Save view
            </button>
            {activeViewId && savedViews.find((v) => v.id === activeViewId)?.mine && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleDeleteView} title="Delete this saved view">
                <TrashIcon size={14} />
              </button>
            )}
            <span className="sort-label">Sort by</span>
            <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); setSortDir('asc'); }}>
              {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            {viewMode === 'board' && (
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value)}
                aria-label="Group board into swimlanes"
                title="Group the board into swimlanes"
              >
                {GROUP_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>{o.key ? `Group: ${o.label}` : o.label}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={exportRows}
              title={filtered.length === items.length ? 'Export all items to Excel' : `Export the ${filtered.length} filtered items to Excel`}
            >
              <DownloadIcon size={14} /> Export{filtered.length !== items.length ? ` (${filtered.length})` : ''}
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setPanel({ mode: 'new', item: null })}>
              <PlusIcon size={14} /> New Item
            </button>
          </div>
        </div>

        {dragError && (
          <div className="command-response" style={{ marginBottom: 16 }}>
            <span>{dragError}</span>
            <button onClick={() => setDragError(null)}>Dismiss</button>
          </div>
        )}

        {loading ? (
          <div className="empty-state">Loading items…</div>
        ) : viewMode === 'board' ? (
          <div className="board-lanes">
            {swimlanes.map((lane) => (
            <section className={`lane${lane.label === null ? ' lane-plain' : ''}`} key={lane.key}>
              {lane.label !== null && (
                <button type="button" className="lane-head" onClick={() => toggleLane(lane.key)} aria-expanded={!collapsedLanes.has(lane.key)}>
                  <span className={`lane-caret${collapsedLanes.has(lane.key) ? '' : ' is-open'}`}><ChevronRightIcon size={12} /></span>
                  <span className="lane-name">{lane.label}</span>
                  <span className="lane-count">{lane.count}</span>
                </button>
              )}
              {!collapsedLanes.has(lane.key) && (
              <div className="board">
            {lane.columns.map((col) => (
              <div
                className={`col${dragOverCol === col.key ? ' col-drag-over' : ''}`}
                key={col.key}
                onDragOver={(e) => handleColDragOver(e, col)}
                onDragLeave={() => handleColDragLeave(col)}
                onDrop={(e) => handleColDrop(e, col)}
              >
                <div className="col-head"><span className="dot" style={{ background: col.dot }} /><span className="name">{col.name}</span><span className="count">{col.cards.length}</span></div>
                {col.cards.length === 0 ? (
                  <div className="col-empty">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" /></svg>
                    <div className="col-empty-title">No assignments yet</div>
                    <div className="col-empty-sub">Drag &amp; drop items here to add one.</div>
                  </div>
                ) : (
                  col.cards.map((it) => {
                    const rt = revisedTarget(it);
                    const pri = priorityStyle(it.priority, priorityColors);
                    const overdue = isOverdue(it);
                    return (
                      <div
                        className={`kcard${draggedId === it.id ? ' kcard-dragging' : ''}`}
                        key={it.id}
                        draggable
                        onDragStart={(e) => handleCardDragStart(e, it)}
                        onDragEnd={handleCardDragEnd}
                        onClick={() => setPanel({ mode: 'edit', item: it })}
                      >
                        <div className="kcard-top">
                          <span className="kcard-idlabel mono">{it.area || 'GEN'}-{shortId(it.id)}</span>
                          <span className="kcard-modtag">{it.area || '—'}</span>
                        </div>
                        <div className="kcard-title">{it.devList}</div>
                        <div className="kcard-meta-row">
                          <span className="priority-pill" style={{ background: pri.bg, color: pri.fg }}>{pri.label}</span>
                          <span className={`kcard-date mono${overdue ? ' kcard-date-overdue' : ''}`}><CalendarIcon size={12} />{rt ? fmtDate(rt) : '—'}</span>
                        </div>
                        <div className="kcard-bottom">
                          {initialsOf(it.developer) ? (
                            <div className="avatar-sm mono" style={{ background: avatarColor(it.developer) }}>{initialsOf(it.developer)}</div>
                          ) : (
                            <div className="avatar-empty">—</div>
                          )}
                          <button type="button" className="kcard-more" onClick={(e) => { e.stopPropagation(); setPanel({ mode: 'edit', item: it }); }}>
                            <MoreIcon size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ))}
              </div>
              )}
            </section>
            ))}
          </div>
        ) : (
          <div className="table-view-wrap">
            <table className="table-view">
              <thead>
                <tr>
                  <th className="table-check-col"><input type="checkbox" checked={pageRows.length > 0 && selectedIds.size === pageRows.length} onChange={toggleAllSelected} /></th>
                  <th className="sortable" onClick={() => handleSortClick('id')}>ID <CaretUpDownIcon size={11} className={sortBy === 'id' ? 'caret-active' : ''} /></th>
                  <th className="sortable" onClick={() => handleSortClick('title')}>Title <CaretUpDownIcon size={11} className={sortBy === 'title' ? 'caret-active' : ''} /></th>
                  <th className="sortable" onClick={() => handleSortClick('module')}>Module <CaretUpDownIcon size={11} className={sortBy === 'module' ? 'caret-active' : ''} /></th>
                  <th className="sortable" onClick={() => handleSortClick('status')}>Status <CaretUpDownIcon size={11} className={sortBy === 'status' ? 'caret-active' : ''} /></th>
                  <th className="sortable" onClick={() => handleSortClick('priority')}>Priority <CaretUpDownIcon size={11} className={sortBy === 'priority' ? 'caret-active' : ''} /></th>
                  <th className="sortable" onClick={() => handleSortClick('owner')}>Owner <CaretUpDownIcon size={11} className={sortBy === 'owner' ? 'caret-active' : ''} /></th>
                  <th className="sortable" onClick={() => handleSortClick('startDate')}>Start Date <CaretUpDownIcon size={11} className={sortBy === 'startDate' ? 'caret-active' : ''} /></th>
                  <th className="sortable" onClick={() => handleSortClick('targetDate')}>Target Date <CaretUpDownIcon size={11} className={sortBy === 'targetDate' ? 'caret-active' : ''} /></th>
                  <th>Days Left</th>
                  <th>Remarks</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((it) => {
                  const rt = revisedTarget(it);
                  const pri = priorityStyle(it.priority, priorityColors);
                  const st = statusStyle(it, statusColors);
                  const daysLeft = rt ? daysBetween(todayStr(), rt) : null;
                  const overdue = isOverdue(it);
                  return (
                    <tr key={it.id}>
                      <td className="table-check-col" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.has(it.id)} onChange={() => toggleRowSelected(it.id)} />
                      </td>
                      <td className="mono" onClick={() => setPanel({ mode: 'edit', item: it })}>{it.area || 'GEN'}-{shortId(it.id)}</td>
                      <td onClick={() => setPanel({ mode: 'edit', item: it })}>{it.devList}</td>
                      <td onClick={() => setPanel({ mode: 'edit', item: it })}>{it.area || '—'}</td>
                      <td onClick={() => setPanel({ mode: 'edit', item: it })}><span className="priority-pill" style={{ background: st.bg, color: st.fg }}>{overdue ? 'Overdue' : it.status}</span></td>
                      <td onClick={() => setPanel({ mode: 'edit', item: it })}><span className="priority-pill" style={{ background: pri.bg, color: pri.fg }}>{pri.label}</span></td>
                      <td onClick={() => setPanel({ mode: 'edit', item: it })}>{it.developer || '—'}</td>
                      <td className="mono" onClick={() => setPanel({ mode: 'edit', item: it })}>{it.startDate ? fmtDate(it.startDate) : '—'}</td>
                      <td className="mono" onClick={() => setPanel({ mode: 'edit', item: it })}>{rt ? fmtDate(rt) : '—'}</td>
                      <td className={`mono${daysLeft != null && daysLeft < 0 ? ' days-left-neg' : ''}`} onClick={() => setPanel({ mode: 'edit', item: it })}>{daysLeft == null ? '—' : daysLeft}</td>
                      <td className="table-remarks" onClick={() => setPanel({ mode: 'edit', item: it })}>{it.remarks || '—'}</td>
                      <td className="table-actions">
                        <button type="button" className="row-action" title="View" onClick={() => setPanel({ mode: 'edit', item: it })}><EyeIcon size={14} /></button>
                        <button type="button" className="row-action" title="Edit" onClick={() => setPanel({ mode: 'edit', item: it })}><PencilIcon size={14} /></button>
                        <div className="row-menu-wrap" onMouseLeave={() => setRowMenuId(null)}>
                          <button type="button" className="row-action" title="More" onClick={() => setRowMenuId((cur) => (cur === it.id ? null : it.id))}><MoreIcon size={14} /></button>
                          {rowMenuId === it.id && (
                            <div className="row-menu">
                              <button onClick={() => handleRowDelete(it)}>Delete</button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!pageRows.length && (
                  <tr><td colSpan={12} className="table-empty">No items match the current filters.</td></tr>
                )}
              </tbody>
            </table>
            {filtered.length > 0 && (
              <div className="table-pagination">
                <span className="table-pagination-summary">
                  Showing {(pageSafe - 1) * pageSize + 1} - {Math.min(pageSafe * pageSize, filtered.length)} of {filtered.length} items
                </span>
                <div className="pager-controls">
                  <button type="button" disabled={pageSafe === 1} onClick={() => setPage(pageSafe - 1)}><ChevronLeftIcon size={14} /></button>
                  {pageList(pageSafe, totalPages).map((p, i) => p === '…' ? (
                    <span key={`e${i}`} className="pager-ellipsis">…</span>
                  ) : (
                    <button type="button" key={p} className={p === pageSafe ? 'active' : ''} onClick={() => setPage(p)}>{p}</button>
                  ))}
                  <button type="button" disabled={pageSafe === totalPages} onClick={() => setPage(pageSafe + 1)}><ChevronRightIcon size={14} /></button>
                </div>
                <div className="page-size">
                  Show
                  <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                    {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  per page
                </div>
              </div>
            )}
          </div>
        )}

        {viewMode === 'board' && (
          <div style={{ marginTop: 16, fontSize: 11.5, color: 'var(--muted)' }}>
            Showing {filtered.length} of {items.length} items
          </div>
        )}

        {panel && (
          <ItemPanel
            mode={panel.mode}
            item={panel.item}
            options={options}
            onClose={() => setPanel(null)}
            onSaved={onSaved}
          />
        )}
      </main>
    </div>
  );
}
