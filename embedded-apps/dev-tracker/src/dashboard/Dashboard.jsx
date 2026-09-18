import React, { useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from '../shared/Sidebar.jsx';
import Topbar from '../shared/Topbar.jsx';
import { useDevTrackerSession } from '../shared/useDevTrackerSession.js';
import { useNotifications } from '../shared/useNotifications.js';
import ItemPanel from './ItemPanel.jsx';
import { apiList, apiMasterData, apiAiCommand, apiUpdate, getCurrentUserEmail } from '../shared/api.js';
import { groupMasterData, activeValues, areaColorMap } from '../shared/masterData.js';
import { statusProgress, revisedTarget, isOverdue, fmtDate, riskLevel, daysSinceUpdate, daysBetween, todayStr } from '../shared/utils.js';
import { KANBAN_COLUMNS, FIELDS, FIELD_LABELS, STAGE_PIPELINE, RISK_META } from '../shared/constants.js';
import { ROUTES } from '../shared/routes.js';

const AREA_FALLBACK = { color: 'var(--mod-fallback)', softColor: 'var(--mod-fallback-soft)' };
const PRIORITY_STYLE = {
  P1: { bg: 'var(--st-red-soft)', fg: 'var(--st-red)' },
  P2: { bg: 'var(--st-amber-soft)', fg: 'var(--st-amber)' },
  P3: { bg: 'var(--st-gray-soft)', fg: 'var(--st-gray)' },
};

function initialsOf(name) {
  return (name || '').slice(0, 2).toUpperCase() || null;
}

export default function Dashboard() {
  const [items, setItems] = useState([]);
  const [masterData, setMasterData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [moduleArea, setModuleArea] = useState('');
  const [moduleMenuOpen, setModuleMenuOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [search, setSearch] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [panel, setPanel] = useState(null); // { mode, item }
  const [command, setCommand] = useState('');
  const [commandResponse, setCommandResponse] = useState(null);
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [dragError, setDragError] = useState(null);
  const flipTimersRef = useRef({});
  const [flipped, setFlipped] = useState({});
  const email = getCurrentUserEmail();
  const { isAdmin, roleLabel, profileName } = useDevTrackerSession(email);
  // No activity feed loaded here, so this only ever surfaces real due-date reminders,
  // not the "someone else changed X" kind (see useNotifications.js).
  const { visibleNotifications, markAllRead, clear } = useNotifications(email, items, [], profileName);
  const loadedRef = useRef(false);

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
  }, []);

  // Handle the Home page's AI handoff (?aiArea/aiStatus/aiPriority/aiOverdue/aiSearch)
  // and the ?action=new draft handoff, exactly like the original app.js init().
  useEffect(() => {
    if (loadedRef.current || loading) return;
    loadedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    let touched = false;
    if (params.get('aiArea')) { setModuleArea(params.get('aiArea')); touched = true; }
    if (params.get('aiStatus')) { setFilterStatus(params.get('aiStatus')); touched = true; }
    if (params.get('aiPriority')) { setFilterPriority(params.get('aiPriority')); touched = true; }
    if (params.get('aiOverdue') === '1') { setOverdueOnly(true); touched = true; }
    if (params.get('aiSearch')) { setSearch(params.get('aiSearch')); touched = true; }
    if (touched) setCommandResponse({ text: 'Filters applied from your last question.', clearable: true });
    if (params.get('action') === 'new') {
      setPanel({ mode: 'new', item: null });
    }
    if (touched || params.has('action')) {
      window.history.replaceState({}, '', ROUTES.dashboard);
    }
  }, [loading]);

  const options = useMemo(() => {
    const grouped = groupMasterData(masterData);
    const out = {};
    for (const key of Object.keys(grouped)) out[key] = activeValues(masterData, key);
    return out;
  }, [masterData]);
  const areaColors = useMemo(() => areaColorMap(masterData), [masterData]);

  const scopedRows = useMemo(() => (moduleArea ? items.filter((it) => it.area === moduleArea) : items), [items, moduleArea]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (moduleArea && it.area !== moduleArea) return false;
      if (filterStatus && it.status !== filterStatus) return false;
      if (filterPriority && it.priority !== filterPriority) return false;
      if (overdueOnly && !isOverdue(it)) return false;
      if (q) {
        const hay = [it.devList, it.func, it.developer, it.remarks, it.spocFunction, it.spocIT].map((v) => (v || '').toLowerCase()).join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, moduleArea, filterStatus, filterPriority, overdueOnly, search]);

  const stats = useMemo(() => {
    const total = scopedRows.length;
    const done = scopedRows.filter((i) => i.status === 'Completed').length;
    const active = scopedRows.filter((i) => !['Completed', 'Cancelled'].includes(i.status)).length;
    const overdue = scopedRows.filter(isOverdue).length;
    const critical = scopedRows.filter((i) => riskLevel(i) === 'critical').length;
    const stalled = scopedRows.filter((i) => riskLevel(i) === 'stalled').length;
    const atRisk = scopedRows.filter((i) => riskLevel(i) === 'atRisk').length;
    return { total, done, active, overdue, critical, stalled, atRisk };
  }, [scopedRows]);

  const areaCounts = useMemo(() => {
    const counts = {};
    for (const it of items) counts[it.area] = (counts[it.area] || 0) + 1;
    return counts;
  }, [items]);

  // Escalation strip — the riskiest items across the current module scope, worst first
  // (critical > stalled > atRisk), independent of the board's own status/priority/search
  // filters below so a narrowed board view never hides something that needs attention.
  const SEVERITY_RANK = { critical: 0, stalled: 1, atRisk: 2 };
  const escalations = useMemo(() => {
    return scopedRows
      .map((it) => ({ item: it, level: riskLevel(it) }))
      .filter((e) => e.level in SEVERITY_RANK)
      .sort((a, b) => {
        if (SEVERITY_RANK[a.level] !== SEVERITY_RANK[b.level]) return SEVERITY_RANK[a.level] - SEVERITY_RANK[b.level];
        // Within a severity, worst-first: most days overdue, most days stalled, or fewest days left for atRisk.
        const severityDays = (e) => {
          const rt = revisedTarget(e.item);
          if (e.level === 'critical') return rt ? daysBetween(rt, todayStr()) : 0;
          if (e.level === 'atRisk') return rt ? -daysBetween(todayStr(), rt) : 0;
          return daysSinceUpdate(e.item) ?? 0;
        };
        return severityDays(b) - severityDays(a);
      })
      .slice(0, 8);
  }, [scopedRows]);

  const columns = useMemo(() => KANBAN_COLUMNS.map((col) => ({
    ...col,
    cards: filtered.filter((it) => col.statuses.includes(it.status)),
  })), [filtered]);

  async function handleCommand() {
    const message = command.trim();
    if (!message) return;
    setCommandResponse({ text: 'Thinking…' });
    try {
      const data = await apiAiCommand(message, email);
      if (data.intent === 'filter') {
        // Matches the original: every filter field is overwritten (not merged) on each
        // response, so an earlier AI-set filter doesn't silently linger into the next one.
        const f = data.filters || {};
        setModuleArea(f.area || '');
        setFilterStatus(f.status || '');
        setFilterPriority(f.priority || '');
        setOverdueOnly(!!f.overdueOnly);
        setSearch(f.search || '');
        setCommandResponse({ text: 'Filters applied.', clearable: true });
      } else if (data.intent === 'create_draft') {
        sessionStorage.setItem('aiPendingDraft', JSON.stringify(data.draft || {}));
        setPanel({ mode: 'new', item: null });
        setCommandResponse(null);
      } else {
        setCommandResponse({ text: data.text || "I didn't quite catch that." });
      }
    } catch (e) {
      setCommandResponse({ text: e.message || 'Something went wrong.' });
    }
    setCommand('');
  }

  function clearAiFilters() {
    setModuleArea(''); setFilterStatus(''); setFilterPriority(''); setOverdueOnly(false); setSearch('');
    setCommandResponse(null);
  }

  function exportCsv() {
    const header = FIELDS.map((f) => FIELD_LABELS[f] || f);
    const rows = items.map((it) => FIELDS.map((f) => {
      const v = it[f] == null ? '' : String(it[f]);
      return `"${v.replace(/"/g, '""')}"`;
    }));
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dev-tracker-items.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function onSaved(row, opts) {
    setPanel(null);
    reload();
  }

  // Drag-and-drop between Kanban columns — new feature, no original vanilla-JS
  // equivalent to match. A column can span several underlying statuses (e.g. "In
  // Discussion" covers both Requirement Discussion and FS Preparation), so a drop
  // only changes status when the card isn't already in one of the target column's
  // statuses; otherwise it resolves to that column's first/primary status. Updates
  // optimistically (instant reorder) and rolls back if the save fails.
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
  function toggleFlip(id) {
    clearTimeout(flipTimersRef.current[id]);
    delete flipTimersRef.current[id];
    setFlipped((f) => ({ ...f, [id]: !f[id] }));
  }
  // Auto-revert to the front face 3.5s after the pointer leaves a flipped card (cancelled if
  // it comes back in time) — matches the flip-card pattern already established for Resource
  // Utilization's resource cards, just with a 3.5s delay here instead of that one's 3s.
  function scheduleAutoFlipBack(id) {
    clearTimeout(flipTimersRef.current[id]);
    flipTimersRef.current[id] = setTimeout(() => {
      setFlipped((f) => (f[id] ? { ...f, [id]: false } : f));
      delete flipTimersRef.current[id];
    }, 3500);
  }
  function cancelAutoFlipBack(id) {
    clearTimeout(flipTimersRef.current[id]);
    delete flipTimersRef.current[id];
  }

  useEffect(() => () => {
    Object.values(flipTimersRef.current).forEach(clearTimeout);
  }, []);

  async function handleColDrop(e, col) {
    e.preventDefault();
    setDragOverCol(null);
    const id = draggedId ?? e.dataTransfer.getData('text/plain');
    setDraggedId(null);
    const it = items.find((row) => String(row.id) === String(id));
    if (!it || col.statuses.includes(it.status)) return;
    const targetStatus = col.statuses[0];
    const prevItems = items;
    setItems((cur) => cur.map((row) => (String(row.id) === String(id) ? { ...row, status: targetStatus } : row)));
    try {
      // PUT /items/:id is a full-row replace (see backend/devTracker.js's normalize(), which
      // nulls out any field missing from the body) — sending only { status } would null every
      // other field, including NOT NULL ones, and the write would be rejected outright. Send
      // the item's existing values for every field, same as ItemPanel's handleSave, with just
      // status overridden.
      const payload = {};
      for (const key of FIELDS) payload[key] = it[key] ?? '';
      payload.status = targetStatus;
      await apiUpdate(it.id, payload, email);
    } catch (e2) {
      setItems(prevItems);
      setDragError(e2.message || 'Failed to move item');
    }
  }

  if (!email) return null;

  return (
    <div className="app-shell">
      <Sidebar active="dashboard" isAdmin={isAdmin} email={email} name={profileName} identityInTopbar />
      <main className="shell-main">
        <Topbar email={email} name={profileName} roleLabel={roleLabel} notifications={visibleNotifications} onMarkAllRead={markAllRead} onClear={clear} />

      <div className="dash-header">
        <div>
          <div className="eyebrow">SAP Change &amp; Development Log</div>
          <h1 className="h1">Delivery Command Centre</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost" onClick={exportCsv}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M4 21h16" /></svg>
            Export CSV
          </button>
          <button className="btn btn-primary" onClick={() => setPanel({ mode: 'new', item: null })}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            New Item
          </button>
        </div>
      </div>

      <div className="dash-toolbar-row">
        <div className="command-bar" style={{ flex: 1 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /><circle cx="12" cy="12" r="3" />
          </svg>
          <input value={command} onChange={(e) => setCommand(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCommand()}
            placeholder='Ask anything — "show overdue FI-AR items", "create an SD item for vendor sync"' />
        </div>
        <div className="stats-card">
          <span className="stat-pill"><b>{stats.total}</b>&nbsp;total</span>
          <span className="stat-sep" />
          <span className="stat-pill"><b style={{ color: 'var(--st-blue)' }}>{stats.active}</b>&nbsp;active</span>
          <span className="stat-sep" />
          <span className="stat-pill"><b style={{ color: 'var(--st-green)' }}>{stats.done}</b>&nbsp;done</span>
          <span className="stat-sep" />
          <span className="stat-pill"><b style={{ color: 'var(--st-red)' }}>{stats.critical}</b>&nbsp;critical</span>
          <span className="stat-sep" />
          <span className="stat-pill"><b style={{ color: 'var(--st-amber)' }}>{stats.stalled}</b>&nbsp;stalled</span>
          <span className="stat-sep" />
          <span className="stat-pill"><b style={{ color: 'var(--st-indigo)' }}>{stats.atRisk}</b>&nbsp;due soon</span>
        </div>
      </div>
      {commandResponse && (
        <div className="command-response" style={{ marginTop: -6, marginBottom: 16 }}>
          <span>{commandResponse.text}</span>
          {commandResponse.clearable && <button onClick={clearAiFilters}>Clear filter</button>}
        </div>
      )}

      {moduleArea && (
        <div className="scope-banner">
          <span>Viewing <b>{moduleArea}</b> — {scopedRows.length} items, {stats.overdue} overdue</span>
          <button onClick={() => setModuleArea('')}>Clear view</button>
        </div>
      )}

      <div className="escalation-panel">
        <div className="escalation-head">
          <span className="escalation-title">Escalations</span>
          <span className="escalation-sub">
            {escalations.length
              ? `${stats.critical} critical · ${stats.stalled} stalled · ${stats.atRisk} due soon`
              : 'Nothing needs attention right now'}
          </span>
        </div>
        {escalations.length > 0 && (
          <div className="escalation-strip">
            {escalations.map(({ item: it, level }) => {
              const meta = RISK_META[level];
              const area = areaColors[it.area] || AREA_FALLBACK;
              const rt = revisedTarget(it);
              const detail = level === 'critical'
                ? `${daysBetween(rt, todayStr())}d overdue`
                : level === 'stalled'
                  ? `${daysSinceUpdate(it)}d no update`
                  : rt ? `due ${fmtDate(rt, { withYear: false })}` : 'due soon';
              return (
                <button
                  key={it.id}
                  type="button"
                  className="esc-card"
                  style={{ borderLeftColor: meta.color }}
                  onClick={() => setPanel({ mode: 'edit', item: it })}
                >
                  <div className="esc-card-top">
                    <span className="esc-badge" style={{ background: meta.soft, color: meta.color }}>{meta.label}</span>
                    <span className="badge" style={{ background: area.softColor, color: area.color }}>{it.area || '—'}</span>
                  </div>
                  <div className="esc-card-title">{it.devList}</div>
                  <div className="esc-card-bottom">
                    <span>{it.status}</span>
                    <span className="mono" style={{ color: meta.color, fontWeight: 600 }}>{detail}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="toolbar">
        <div className="module-dropdown">
          <button className="btn btn-ghost" onClick={() => setModuleMenuOpen((o) => !o)}>
            {moduleArea || 'All modules'} ({moduleArea ? areaCounts[moduleArea] || 0 : items.length})
          </button>
          {moduleMenuOpen && (
            <div className="module-menu" onMouseLeave={() => setModuleMenuOpen(false)}>
              <button onClick={() => { setModuleArea(''); setModuleMenuOpen(false); }}>All modules <span>{items.length}</span></button>
              {(options.area || []).filter((a) => areaCounts[a] > 0).map((a) => (
                <button key={a} onClick={() => { setModuleArea(a); setModuleMenuOpen(false); }}>{a} <span>{areaCounts[a]}</span></button>
              ))}
            </div>
          )}
        </div>
        <input type="text" placeholder="Search title, developer, remarks…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 220 }} />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          {(options.status || []).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
          <option value="">All priorities</option>
          {(options.priority || []).map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label><input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} /> Overdue only</label>
      </div>

      {dragError && (
        <div className="command-response" style={{ marginTop: -6, marginBottom: 16 }}>
          <span>{dragError}</span>
          <button onClick={() => setDragError(null)}>Dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="empty-state">Loading items…</div>
      ) : (
        <div className="board">
          {columns.map((col) => (
            <div
              className={`col${dragOverCol === col.key ? ' col-drag-over' : ''}`}
              key={col.key}
              onDragOver={(e) => handleColDragOver(e, col)}
              onDragLeave={() => handleColDragLeave(col)}
              onDrop={(e) => handleColDrop(e, col)}
            >
              <div className="col-head"><span className="dot" style={{ background: col.dot }} /><span className="name">{col.name}</span><span className="count">{col.cards.length}</span></div>
              {col.cards.map((it) => {
                const progress = statusProgress(it.status);
                const overdue = isOverdue(it);
                const lvl = riskLevel(it);
                const lvlMeta = RISK_META[lvl];
                const rt = revisedTarget(it);
                const pri = PRIORITY_STYLE[it.priority] || PRIORITY_STYLE.P3;
                const area = areaColors[it.area] || AREA_FALLBACK;
                const isFlipped = !!flipped[it.id];
                const timelineRows = STAGE_PIPELINE.filter((s) => it[s.key]).map((s) => ({ label: FIELD_LABELS[s.key], date: it[s.key] }));
                if (it.targetDate) timelineRows.push({ label: FIELD_LABELS.targetDate, date: it.targetDate });
                return (
                  <div
                    className={`kcard-flip${isFlipped ? ' flipped' : ''}${draggedId === it.id ? ' kcard-dragging' : ''}`}
                    key={it.id}
                    draggable
                    onDragStart={(e) => handleCardDragStart(e, it)}
                    onDragEnd={handleCardDragEnd}
                    onMouseEnter={() => cancelAutoFlipBack(it.id)}
                    onMouseLeave={() => isFlipped && scheduleAutoFlipBack(it.id)}
                  >
                    <div className="kcard-inner">
                      <div className="kcard-face kcard-front" onClick={() => setPanel({ mode: 'edit', item: it })}>
                        <button
                          type="button"
                          className="flip-hint"
                          title="Show timeline &amp; notes"
                          onClick={(e) => { e.stopPropagation(); toggleFlip(it.id); }}
                        >&#8635;</button>
                        <div className="kcard-top">
                          <span className="badge" style={{ background: area.softColor, color: area.color }}>{it.area || '—'}</span>
                          <span className="priority-pill" style={{ background: pri.bg, color: pri.fg }}>{it.priority || '—'}</span>
                        </div>
                        <div className="kcard-title">
                          {it.devList}
                          {lvl !== 'onTrack' && lvl !== 'done' && <span className="risk-dot" style={{ background: lvlMeta.color }} title={lvlMeta.label} />}
                        </div>
                        <div className="kcard-status">{it.status}</div>
                        <div className="kcard-track"><div className="kcard-fill" style={{ width: `${progress}%`, background: overdue ? 'var(--st-red)' : 'var(--st-blue)' }} /></div>
                        <div className="kcard-bottom">
                          {initialsOf(it.developer) ? (
                            <div className="avatar-sm mono" style={{ background: area.color }}>{initialsOf(it.developer)}</div>
                          ) : (
                            <div className="avatar-empty">—</div>
                          )}
                          <span className="mono" style={{ fontSize: 11, color: lvl === 'onTrack' || lvl === 'done' ? 'var(--muted)' : lvlMeta.color, fontWeight: lvl === 'onTrack' || lvl === 'done' ? 400 : 700 }}>
                            {rt ? fmtDate(rt, { withYear: false }) : '—'}{lvlMeta.shortLabel ? ` · ${lvlMeta.shortLabel}` : ''}
                          </span>
                        </div>
                      </div>
                      <div className="kcard-face kcard-back" onClick={() => setPanel({ mode: 'edit', item: it })}>
                        <div className="back-head">
                          <span className="kcard-title" style={{ WebkitLineClamp: 1 }}>{it.devList}</span>
                          <button
                            type="button"
                            className="back-close"
                            title="Back to card"
                            onClick={(e) => { e.stopPropagation(); toggleFlip(it.id); }}
                          >&#10005;</button>
                        </div>
                        <div className="back-row">
                          <span className="back-label">Functional SPOC</span>
                          <span className="back-value">{it.spocFunction || '—'}</span>
                        </div>
                        <div className="back-timeline">
                          {timelineRows.length ? timelineRows.map((row) => (
                            <div className="back-timeline-row" key={row.label}>
                              <span>{row.label}</span>
                              <span className="mono">{fmtDate(row.date, { withYear: false })}</span>
                            </div>
                          )) : <div className="back-timeline-row"><span>No dates recorded yet</span></div>}
                        </div>
                        <div className="back-remarks">
                          <div className="back-label">Remarks</div>
                          <div className="back-remarks-text">{it.remarks || 'No remarks.'}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!col.cards.length && <div style={{ fontSize: 11.5, color: 'var(--muted)', padding: '6px 4px' }}>No items</div>}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 11.5, color: 'var(--muted)' }}>
        Showing {filtered.length} of {items.length} items · board columns group the 10 underlying pipeline statuses (each card names its exact stage)
      </div>

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
