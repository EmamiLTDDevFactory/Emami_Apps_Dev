import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from '../shared/Sidebar.jsx';
import Topbar from '../shared/Topbar.jsx';
import { useDevTrackerSession } from '../shared/useDevTrackerSession.js';
import { useNotifications } from '../shared/useNotifications.js';
import { getCurrentUserEmail, apiSavedViews, apiSavedViewCreate, apiSavedViewDelete } from '../shared/api.js';
import { PROJECT_NAME, PROJECT_KEY, issueKey, namesForMe } from '../shared/pm.js';
import { StarIcon, TrashIcon } from '../shared/icons.jsx';
import { useWorkspace } from './workspace/useWorkspace.js';
import { EMPTY_FILTERS, applyFilters } from './workspace/filters.js';
import FilterBar from './workspace/FilterBar.jsx';
import BoardView from './workspace/BoardView.jsx';
import BacklogView from './workspace/BacklogView.jsx';
import ListView from './workspace/ListView.jsx';
import TimelineView from './workspace/TimelineView.jsx';
import ReportsView from './workspace/ReportsView.jsx';
import IssueView from './workspace/IssueView.jsx';
import CreateIssueModal from './workspace/CreateIssueModal.jsx';

// The project workspace, Jira style. Still served at /dashboard/ so every existing link into it
// (Home's KPI drill-downs, the AI command bar, Topbar search, "My Work") keeps working; the view
// lives in the URL hash (#board, #backlog, #list, #timeline, #reports) and an open issue in
// ?issue=DEV-12, so both survive a reload and can be shared as links.
const VIEWS = [
  { key: 'board', label: 'Board', nav: 'board' },
  { key: 'backlog', label: 'Backlog', nav: 'backlog' },
  { key: 'list', label: 'List', nav: 'issues' },
  { key: 'timeline', label: 'Timeline', nav: 'timeline' },
  { key: 'reports', label: 'Reports', nav: 'reports' },
];
const viewFromHash = () => {
  const h = window.location.hash.replace(/^#\/?/, '').split(/[?/]/)[0];
  return VIEWS.some((v) => v.key === h) ? h : null;
};
const HANDOFF_KEYS = ['preset', 'aiArea', 'aiStatus', 'aiPriority', 'aiOverdue', 'aiSearch', 'action'];

// Saved views from before the revamp stored the old Dashboard's individual filter keys.
function filtersFromViewConfig(cfg) {
  if (!cfg) return EMPTY_FILTERS;
  if (cfg.v === 2) return { ...EMPTY_FILTERS, ...cfg.filters };
  return {
    ...EMPTY_FILTERS,
    areas: cfg.moduleArea ? [cfg.moduleArea] : [],
    assignees: cfg.ownerFilter && cfg.ownerFilter !== '__me__' ? [cfg.ownerFilter] : [],
    onlyMine: cfg.ownerFilter === '__me__',
    status: cfg.filterStatus || '', priority: cfg.filterPriority || '',
    impact: cfg.filterImpact || '', complexity: cfg.filterComplexity || '',
    devFactory: cfg.filterDevFactory || '', reasonCategory: cfg.filterReasonCategory || '',
    dateStart: cfg.dateStart || '', dateEnd: cfg.dateEnd || '',
    search: cfg.search || '', lifecycle: cfg.lifecycle || '', overdueOnly: cfg.overdueOnly === true,
  };
}

export default function Dashboard() {
  const email = getCurrentUserEmail();
  const { isAdmin, roleLabel, profileName } = useDevTrackerSession(email);
  const ws = useWorkspace(email);
  const { visibleNotifications, markAllRead, clear } = useNotifications(email, ws.items, [], profileName);

  const initialParams = useRef(new URLSearchParams(window.location.search));
  const hasHandoff = HANDOFF_KEYS.some((k) => initialParams.current.has(k));
  const [view, setView] = useState(() => viewFromHash() || (hasHandoff && initialParams.current.get('action') !== 'new' ? 'list' : 'board'));
  const [fromMyWork] = useState(() => initialParams.current.get('preset') === 'mine');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [openId, setOpenId] = useState(null);
  const [pendingKey, setPendingKey] = useState(() => initialParams.current.get('issue'));
  const [create, setCreate] = useState(null); // preset fields or null
  const [toast, setToast] = useState(null);
  const [savedViews, setSavedViews] = useState([]);
  const [activeViewId, setActiveViewId] = useState('');
  const searchRef = useRef(null);

  useEffect(() => { if (!email) window.location.href = '/'; }, [email]);

  const showError = useCallback((msg) => {
    setToast({ kind: 'error', text: msg || 'Something went wrong' });
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), toast.kind === 'error' ? 7000 : 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Hash-driven view switching, so sidebar links (#backlog etc.) switch views without a reload.
  useEffect(() => {
    const onHash = () => { const v = viewFromHash(); if (v) setView(v); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  function goView(v) {
    setView(v);
    const url = new URL(window.location.href);
    url.hash = v;
    window.history.replaceState({}, '', url);
  }

  // Keep ?issue= in the address bar in step with the open issue.
  const syncIssueParam = useCallback((it) => {
    const url = new URL(window.location.href);
    if (it) url.searchParams.set('issue', issueKey(it)); else url.searchParams.delete('issue');
    url.hash = view;
    window.history.replaceState({}, '', url);
  }, [view]);
  const openIssue = useCallback((it) => { setOpenId(String(it.id)); syncIssueParam(it); }, [syncIssueParam]);
  const closeIssue = useCallback(() => { setOpenId(null); syncIssueParam(null); }, [syncIssueParam]);

  // One-time handoffs from other pages, applied once data has loaded.
  useEffect(() => {
    if (ws.loading) return;
    const p = initialParams.current;
    if (hasHandoff) {
      const f = { ...EMPTY_FILTERS };
      const preset = p.get('preset');
      if (preset === 'active' || preset === 'completed') f.lifecycle = preset;
      if (preset === 'overdue') f.overdueOnly = true;
      if (preset === 'mine') f.onlyMine = true;
      if (p.get('aiArea')) f.areas = [p.get('aiArea')];
      if (p.get('aiStatus')) f.status = p.get('aiStatus');
      if (p.get('aiPriority')) f.priority = p.get('aiPriority');
      if (p.get('aiOverdue') === '1') f.overdueOnly = true;
      if (p.get('aiSearch')) f.search = p.get('aiSearch');
      setFilters(f);
      if (p.get('action') === 'new') setCreate({});
    }
    const url = new URL(window.location.href);
    HANDOFF_KEYS.forEach((k) => url.searchParams.delete(k));
    url.hash = view;
    window.history.replaceState({}, '', url);
  }, [ws.loading]);

  // Resolve ?issue=DEV-12 (or a raw id) once items are in.
  useEffect(() => {
    if (!pendingKey || ws.loading) return;
    const k = pendingKey.toUpperCase();
    const hit = ws.items.find((it) => issueKey(it).toUpperCase() === k || String(it.id) === pendingKey);
    if (hit) setOpenId(String(hit.id));
    else setToast({ kind: 'error', text: `Issue ${pendingKey} was not found.` });
    setPendingKey(null);
  }, [pendingKey, ws.loading, ws.items]);

  // Keyboard shortcuts: c = create, / = search, 1–5 = switch view.
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (openId || create) return;
      if (e.key === 'c') { e.preventDefault(); setCreate({}); }
      else if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
      else if (/^[1-5]$/.test(e.key)) goView(VIEWS[Number(e.key) - 1].key);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openId, create]);

  // Saved views ("filters" in Jira): shared with the old Dashboard's saved_views table.
  async function reloadViews() {
    try { setSavedViews((await apiSavedViews(email)) || []); } catch { setSavedViews([]); }
  }
  useEffect(() => { if (email) reloadViews(); }, [email]);
  const appliedRef = useRef(false);
  useEffect(() => {
    if (appliedRef.current) { appliedRef.current = false; return; }
    setActiveViewId('');
  }, [filters]);
  function applySaved(id) {
    const v = savedViews.find((x) => x.id === id);
    if (!v) { setActiveViewId(''); setFilters(EMPTY_FILTERS); return; }
    appliedRef.current = true;
    setFilters(filtersFromViewConfig(v.config));
    setActiveViewId(id);
    if (v.config?.v === 2 && v.config.view) goView(v.config.view);
  }
  async function saveView() {
    const name = window.prompt('Name this filter (e.g. "My overdue MM issues")');
    if (!name || !name.trim()) return;
    const shared = window.confirm('Share this filter with the whole team?\n\nOK = shared, Cancel = private to you.');
    try {
      const created = await apiSavedViewCreate(name.trim(), { v: 2, filters, view }, shared, email);
      await reloadViews();
      setActiveViewId(created?.id || '');
      setToast({ kind: 'ok', text: `Saved filter "${name.trim()}"` });
    } catch (e) { showError(e.message); }
  }
  async function deleteView() {
    const v = savedViews.find((x) => x.id === activeViewId);
    if (!v || !window.confirm(`Delete the saved filter "${v.name}"?`)) return;
    try { await apiSavedViewDelete(v.id, email); setActiveViewId(''); await reloadViews(); } catch (e) { showError(e.message); }
  }

  const myNames = useMemo(() => namesForMe(profileName, email), [profileName, email]);
  const filtered = useMemo(() => applyFilters(ws.items, filters, { myNames }), [ws.items, filters, myNames]);
  const activeNav = fromMyWork && view === 'list' && filters.onlyMine ? 'myWork' : VIEWS.find((v) => v.key === view)?.nav;
  const viewMeta = VIEWS.find((v) => v.key === view);

  if (!email) return null;

  const common = { ws, items: filtered, filters, setFilters, onOpen: openIssue, onError: showError, pmReady: ws.pmReady, email };

  return (
    <div className="app-shell">
      <Sidebar active={activeNav} isAdmin={isAdmin} email={email} name={profileName} identityInTopbar />
      <main className="shell-main pm-shell">
        <Topbar
          email={email}
          name={profileName}
          roleLabel={roleLabel}
          notifications={visibleNotifications}
          onMarkAllRead={markAllRead}
          onClear={clear}
          onCreate={() => setCreate({})}
          onSearch={(q) => { setFilters((f) => ({ ...f, search: q })); if (view === 'reports') goView('list'); }}
        />

        <header className="pm-header">
          <div className="pm-crumbs pm-header-crumbs">
            <span>Projects</span><span aria-hidden="true">/</span><span>{PROJECT_NAME}</span>
          </div>
          <div className="pm-header-row">
            <div className="pm-header-title">
              <span className="pm-project-avatar" aria-hidden="true">{PROJECT_KEY}</span>
              <h1>{view === 'list' ? 'Issues' : viewMeta?.label}</h1>
            </div>
            <div className="pm-header-actions">
              <select className="pm-saved-select" value={activeViewId} onChange={(e) => applySaved(e.target.value)} aria-label="Saved filters">
                <option value="">Saved filters…</option>
                {savedViews.filter((v) => v.mine).length > 0 && (
                  <optgroup label="My filters">{savedViews.filter((v) => v.mine).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</optgroup>
                )}
                {savedViews.filter((v) => !v.mine).length > 0 && (
                  <optgroup label="Shared with the team">{savedViews.filter((v) => !v.mine).map((v) => <option key={v.id} value={v.id}>{v.name}{v.ownerName ? ` — ${v.ownerName}` : ''}</option>)}</optgroup>
                )}
              </select>
              <button type="button" className="pm-btn pm-btn-subtle" onClick={saveView} title="Save the current filters"><StarIcon size={13} /> Save filter</button>
              {activeViewId && savedViews.find((v) => v.id === activeViewId)?.mine && (
                <button type="button" className="pm-icon-btn" onClick={deleteView} aria-label="Delete saved filter" title="Delete saved filter"><TrashIcon size={15} /></button>
              )}
            </div>
          </div>
          <nav className="pm-tabs" aria-label="Project views">
            {VIEWS.map((v, i) => (
              <a key={v.key} href={`#${v.key}`} className={view === v.key ? 'is-on' : ''} aria-current={view === v.key ? 'page' : undefined}
                onClick={(e) => { e.preventDefault(); goView(v.key); }} title={`${v.label} (${i + 1})`}>
                {v.label}
              </a>
            ))}
          </nav>
        </header>

        {!ws.loading && !ws.pmReady && (
          <div className="pm-banner">
            Sprints, epics, issue keys and comments switch on once the updated Dev Tracker API is deployed. Everything else works now.
          </div>
        )}
        {ws.error && <div className="pm-banner pm-banner-error">{ws.error} <button type="button" className="pm-link-btn" onClick={ws.reload}>Retry</button></div>}

        <FilterBar filters={filters} setFilters={setFilters} items={ws.items} epics={ws.pmReady ? ws.epics : []} options={ws.options} searchRef={searchRef} />

        <div className="pm-view">
          {ws.loading ? (
            <div className="pm-empty">Loading issues…</div>
          ) : view === 'board' ? (
            <BoardView {...common} />
          ) : view === 'backlog' ? (
            <BacklogView {...common} onCreate={(preset) => setCreate(preset)} />
          ) : view === 'list' ? (
            <ListView {...common} />
          ) : view === 'timeline' ? (
            <TimelineView {...common} />
          ) : (
            <ReportsView ws={ws} items={filtered} />
          )}
        </div>

        {openId && (
          <IssueView
            id={openId}
            ws={ws}
            email={email}
            profileName={profileName}
            isAdmin={isAdmin}
            onClose={closeIssue}
            onOpen={openIssue}
            onError={showError}
            onCreate={(preset) => setCreate(preset)}
          />
        )}
        {create && (
          <CreateIssueModal
            ws={ws}
            preset={create}
            profileName={profileName}
            onClose={() => setCreate(null)}
            onError={showError}
            onCreated={(saved) => saved && setToast({ kind: 'ok', text: `${issueKey(saved)} created`, issue: saved })}
          />
        )}
        {toast && (
          <div className={`pm-toast${toast.kind === 'error' ? ' is-error' : ''}`} role="status">
            <span>{toast.text}</span>
            {toast.issue && <button type="button" className="pm-link-btn" onClick={() => { openIssue(toast.issue); setToast(null); }}>View issue</button>}
            <button type="button" className="pm-icon-btn" aria-label="Dismiss" onClick={() => setToast(null)}>×</button>
          </div>
        )}
      </main>
    </div>
  );
}
