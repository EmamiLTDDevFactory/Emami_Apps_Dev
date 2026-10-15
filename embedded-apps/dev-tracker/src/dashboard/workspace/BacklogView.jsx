import React, { useMemo, useState } from 'react';
import { Avatar, PriorityIcon, StatusLozenge, EpicLozenge, TypeAndKey, Popover, ProgressBar, TypeIcon, epicColor } from './ui.jsx';
import { SprintModal, CompleteSprintModal } from './SprintModals.jsx';
import { statusCategory, isEpic, isDone, points, fmtPoints, byRank, rankBetween, CATEGORY_META } from '../../shared/pm.js';
import { apiSprintCreate, apiSprintUpdate, apiSprintStart, apiSprintComplete, apiSprintDelete } from '../../shared/api.js';
import { fmtDate } from '../../shared/utils.js';
import { ChevronRightIcon, MoreIcon, PlusIcon } from '../../shared/icons.jsx';
import { UNASSIGNED } from './filters.js';

const BACKLOG = '__backlog__';

// Jira backlog: the active sprint, then planned sprints, then the backlog, each a ranked list.
// Drag rows between sections to plan, drag within a section to rank, or tick several rows and
// move them in one go. Epics live in their own side panel rather than as rows.
export default function BacklogView({ ws, items, filters, setFilters, onOpen, onError, onCreate, email }) {
  const { sprints, byId, updateItem, createItem, reloadSprints, epics, pmReady } = ws;
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [selected, setSelected] = useState(() => new Set());
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null); // { section, index }
  const [showDone, setShowDone] = useState(false);
  const [epicPanel, setEpicPanel] = useState(true);
  const [modal, setModal] = useState(null); // { kind, sprint }
  const [menuFor, setMenuFor] = useState(null);

  const openSprints = useMemo(() => (pmReady ? sprints.filter((s) => s.state !== 'closed') : []), [sprints, pmReady]);
  const sprintIds = useMemo(() => new Set(openSprints.map((s) => String(s.id))), [openSprints]);

  const rows = useMemo(() => items.filter((it) => !isEpic(it) && it.issueType !== 'Sub-task'), [items]);
  const sections = useMemo(() => {
    const bySection = new Map([[BACKLOG, []], ...openSprints.map((s) => [String(s.id), []])]);
    for (const it of rows) {
      const key = it.sprintId && sprintIds.has(String(it.sprintId)) ? String(it.sprintId) : BACKLOG;
      // Done work stays visible inside sprints (it's part of the sprint's story) but leaves the backlog.
      if (key === BACKLOG && isDone(it) && !showDone) continue;
      bySection.get(key).push(it);
    }
    for (const list of bySection.values()) list.sort(byRank);
    return [
      ...openSprints.map((s) => ({ key: String(s.id), sprint: s, rows: bySection.get(String(s.id)) })),
      { key: BACKLOG, sprint: null, rows: bySection.get(BACKLOG) },
    ];
  }, [rows, openSprints, sprintIds, showDone]);

  function toggle(setter, key) {
    setter((cur) => { const n = new Set(cur); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }

  async function moveIssues(ids, sectionKey, index = null) {
    const target = sections.find((s) => s.key === sectionKey);
    const stay = target.rows.filter((r) => !ids.includes(String(r.id)));
    const at = index == null ? stay.length : index;
    let before = stay[at - 1];
    const after = stay[at];
    for (const id of ids) {
      const it = byId.get(String(id));
      if (!it) continue;
      const rank = rankBetween(before, after);
      const patch = { rank };
      const newSprint = sectionKey === BACKLOG ? '' : sectionKey;
      if (String(it.sprintId || '') !== newSprint) patch.sprintId = newSprint;
      try { await updateItem(it.id, patch); } catch (e) { onError(e.message || 'Could not move issue'); return; }
      before = { ...it, rank };
    }
  }

  async function handleDrop(sectionKey) {
    const ids = drag ? (selected.has(String(drag)) ? [...selected] : [String(drag)]) : [];
    const index = over?.section === sectionKey ? over.index : null;
    setDrag(null); setOver(null);
    if (ids.length) await moveIssues(ids, sectionKey, index);
  }

  async function sprintAction(fn) {
    try { await fn(); await reloadSprints(); } catch (e) { onError(e.message || 'Sprint update failed'); throw e; }
  }

  async function quickCreate(sectionKey, summary, type) {
    const section = sections.find((s) => s.key === sectionKey);
    const last = section.rows[section.rows.length - 1];
    try {
      const saved = await createItem({
        devList: summary,
        issueType: type,
        status: 'Not Started',
        sprintId: sectionKey === BACKLOG ? '' : sectionKey,
        rank: rankBetween(last, null),
        epicId: filters.epics.length === 1 && filters.epics[0] !== UNASSIGNED ? filters.epics[0] : '',
      });
      return saved;
    } catch (e) {
      onError(e.message || 'Could not create issue');
      return null;
    }
  }

  const selCount = selected.size;

  return (
    <div className={`pm-backlog${epicPanel && pmReady ? ' has-epics' : ''}`}>
      {pmReady && epicPanel && (
        <EpicPanel
          epics={epics}
          items={ws.items}
          filters={filters}
          setFilters={setFilters}
          onOpen={onOpen}
          onClose={() => setEpicPanel(false)}
          onCreate={() => onCreate({ issueType: 'Epic' })}
        />
      )}

      <div className="pm-backlog-main">
        <div className="pm-view-bar">
          <div className="pm-view-bar-left">
            {pmReady && !epicPanel && <button type="button" className="pm-filter-btn" onClick={() => setEpicPanel(true)}>Show epics panel</button>}
            <label className="pm-check-label"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show done issues in backlog</label>
          </div>
          <div className="pm-view-bar-right">
            {pmReady && (
              <button type="button" className="pm-btn pm-btn-subtle" onClick={() => setModal({ kind: 'create' })}>Create sprint</button>
            )}
          </div>
        </div>

        {selCount > 0 && (
          <div className="pm-bulkbar">
            <span><b>{selCount}</b> selected</span>
            {pmReady && (
              <label className="pm-inline-label">Move to
                <select value="" onChange={async (e) => { const v = e.target.value; if (!v) return; await moveIssues([...selected], v); setSelected(new Set()); }}>
                  <option value="">Choose…</option>
                  {openSprints.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                  <option value={BACKLOG}>Backlog</option>
                </select>
              </label>
            )}
            <button type="button" className="pm-link-btn" onClick={() => setSelected(new Set())}>Clear selection</button>
          </div>
        )}

        {sections.map((sec) => {
          const isCollapsed = collapsed.has(sec.key);
          const s = sec.sprint;
          const byCat = { todo: 0, inprogress: 0, done: 0 };
          for (const it of sec.rows) byCat[statusCategory(it.status)] += points(it) || 0;
          const totalPts = byCat.todo + byCat.inprogress + byCat.done;
          const isOverSection = over?.section === sec.key;
          return (
            <section
              key={sec.key}
              className={`pm-section${s ? ' is-sprint' : ' is-backlog'}${isOverSection ? ' is-over' : ''}`}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                const els = [...e.currentTarget.querySelectorAll('.pm-row:not(.is-dragging)')];
                let index = els.length;
                for (let i = 0; i < els.length; i++) {
                  const r = els[i].getBoundingClientRect();
                  if (e.clientY < r.top + r.height / 2) { index = i; break; }
                }
                if (!isOverSection || over.index !== index) setOver({ section: sec.key, index });
              }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); }}
              onDrop={(e) => { e.preventDefault(); handleDrop(sec.key); }}
            >
              <header className="pm-section-head">
                <button type="button" className="pm-section-toggle" onClick={() => toggle(setCollapsed, sec.key)} aria-expanded={!isCollapsed}>
                  <span className={`pm-caret${isCollapsed ? '' : ' is-open'}`}><ChevronRightIcon size={12} /></span>
                  <span className="pm-section-name">{s ? s.name : 'Backlog'}</span>
                  {s && (s.startDate || s.endDate) && (
                    <span className="pm-muted">{s.startDate ? fmtDate(s.startDate, { withYear: false }) : '—'} – {s.endDate ? fmtDate(s.endDate, { withYear: false }) : '—'}</span>
                  )}
                  <span className="pm-muted">({sec.rows.length} issue{sec.rows.length === 1 ? '' : 's'})</span>
                  {s?.state === 'active' && <span className="pm-badge-active">Active</span>}
                </button>
                <div className="pm-section-actions">
                  {totalPts > 0 && (
                    <span className="pm-pts-strip" title="Story points: to do / in progress / done">
                      {['todo', 'inprogress', 'done'].map((c) => (
                        <span key={c} style={{ background: CATEGORY_META[c].bg, color: CATEGORY_META[c].fg }}>{fmtPoints(byCat[c])}</span>
                      ))}
                    </span>
                  )}
                  {s?.state === 'future' && (
                    <button type="button" className="pm-btn pm-btn-subtle pm-btn-sm" disabled={!!openSprints.find((x) => x.state === 'active')} title={openSprints.find((x) => x.state === 'active') ? 'Complete the active sprint first' : ''} onClick={() => setModal({ kind: 'start', sprint: s })}>Start sprint</button>
                  )}
                  {s?.state === 'active' && (
                    <button type="button" className="pm-btn pm-btn-subtle pm-btn-sm" onClick={() => setModal({ kind: 'complete', sprint: s })}>Complete sprint</button>
                  )}
                  {s && (
                    <span className="pm-rel">
                      <button type="button" className="pm-icon-btn" aria-label="Sprint actions" onClick={() => setMenuFor(menuFor === s.id ? null : s.id)}><MoreIcon size={16} /></button>
                      <Popover open={menuFor === s.id} onClose={() => setMenuFor(null)} align="right">
                        <button type="button" className="pm-pop-item" onClick={() => { setMenuFor(null); setModal({ kind: 'edit', sprint: s }); }}>Edit sprint</button>
                        <button type="button" className="pm-pop-item pm-danger" onClick={async () => {
                          setMenuFor(null);
                          if (!window.confirm(`Delete ${s.name}? Its ${sec.rows.length} issue(s) move to the backlog.`)) return;
                          await sprintAction(() => apiSprintDelete(s.id, email)).catch(() => {});
                          ws.setItems((cur) => cur.map((it) => (String(it.sprintId) === String(s.id) ? { ...it, sprintId: null } : it)));
                        }}>Delete sprint</button>
                      </Popover>
                    </span>
                  )}
                </div>
              </header>
              {s?.goal && !isCollapsed && <div className="pm-section-goal">{s.goal}</div>}

              {!isCollapsed && (
                <div className="pm-rows">
                  {(() => {
                    let j = 0;
                    const out = sec.rows.map((it) => {
                      const isDragged = drag === String(it.id);
                      const lineHere = isOverSection && !isDragged && over.index === j;
                      if (!isDragged) j++;
                      return (
                        <React.Fragment key={it.id}>
                          {lineHere && <div className="pm-drop-line" />}
                          <Row
                            it={it}
                            epic={it.epicId ? byId.get(String(it.epicId)) : null}
                            selected={selected.has(String(it.id))}
                            onSelect={() => toggle(setSelected, String(it.id))}
                            onOpen={onOpen}
                            dragging={isDragged}
                            setDrag={setDrag}
                          />
                        </React.Fragment>
                      );
                    });
                    if (isOverSection && over.index >= j) out.push(<div className="pm-drop-line" key="__end" />);
                    return out;
                  })()}
                  {!sec.rows.length && (
                    <div className="pm-section-empty">
                      {s ? 'Plan this sprint by dragging issues here from the backlog.' : 'Your backlog is empty.'}
                    </div>
                  )}
                  <QuickCreate onCreate={(summary, type) => quickCreate(sec.key, summary, type)} />
                </div>
              )}
            </section>
          );
        })}
        {!pmReady && (
          <div className="pm-hint">Sprints and epics become available once the updated Dev Tracker API is deployed.</div>
        )}
      </div>

      {modal?.kind === 'create' && (
        <SprintModal mode="create" onClose={() => setModal(null)} onSubmit={(f) => sprintAction(() => apiSprintCreate(f, email))} />
      )}
      {modal?.kind === 'edit' && (
        <SprintModal mode="edit" sprint={modal.sprint} onClose={() => setModal(null)} onSubmit={(f) => sprintAction(() => apiSprintUpdate(modal.sprint.id, f, email))} />
      )}
      {modal?.kind === 'start' && (
        <SprintModal
          mode="start"
          sprint={modal.sprint}
          issueCount={sections.find((x) => x.key === String(modal.sprint.id))?.rows.length || 0}
          onClose={() => setModal(null)}
          onSubmit={(f) => sprintAction(() => apiSprintStart(modal.sprint.id, f, email))}
        />
      )}
      {modal?.kind === 'complete' && (
        <CompleteSprintModal
          sprint={modal.sprint}
          items={ws.items}
          openSprints={openSprints}
          onClose={() => setModal(null)}
          onCreateSprint={() => apiSprintCreate({}, email)}
          onSubmit={async (moveTo) => {
            await sprintAction(() => apiSprintComplete(modal.sprint.id, moveTo, email));
            ws.setItems((cur) => cur.map((it) => (String(it.sprintId) === String(modal.sprint.id) && !isDone(it) ? { ...it, sprintId: moveTo } : it)));
          }}
        />
      )}
    </div>
  );
}

function Row({ it, epic, selected, onSelect, onOpen, dragging, setDrag }) {
  const pts = points(it);
  return (
    <div
      className={`pm-row${selected ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}${isDone(it) ? ' is-done' : ''}`}
      draggable
      onDragStart={(e) => { setDrag(String(it.id)); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(it.id)); }}
      onDragEnd={() => setDrag(null)}
      onClick={() => onOpen(it)}
    >
      <input type="checkbox" className="pm-row-check" checked={selected} onClick={(e) => e.stopPropagation()} onChange={onSelect} aria-label={`Select ${it.devList}`} />
      <TypeAndKey item={it} onOpen={onOpen} />
      <span className="pm-row-title">{it.devList}</span>
      <span className="pm-row-meta">
        {epic && <EpicLozenge epic={epic} />}
        <StatusLozenge status={it.status} />
        <span className="pm-points" title="Story points">{pts > 0 ? fmtPoints(pts) : '–'}</span>
        <PriorityIcon priority={it.priority} />
        <Avatar name={it.developer} size={24} />
      </span>
    </div>
  );
}

function QuickCreate({ onCreate }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [type, setType] = useState('Task');
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <button type="button" className="pm-quick-create-btn" onClick={() => setOpen(true)}>
        <PlusIcon size={14} /> Create issue
      </button>
    );
  }
  async function submit() {
    const s = summary.trim();
    if (!s) return;
    setBusy(true);
    const ok = await onCreate(s, type);
    setBusy(false);
    if (ok) setSummary('');
  }
  return (
    <div className="pm-quick-create">
      <span className="pm-rel pm-qc-type">
        <TypeIcon type={type} />
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Issue type">
          {['Story', 'Task', 'Bug'].map((t) => <option key={t}>{t}</option>)}
        </select>
      </span>
      <input
        autoFocus
        value={summary}
        disabled={busy}
        placeholder="What needs to be done?"
        onChange={(e) => setSummary(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setOpen(false); setSummary(''); } }}
        onBlur={() => { if (!summary.trim()) setOpen(false); }}
      />
      <span className="pm-muted pm-qc-hint">Enter to create · Esc to cancel</span>
    </div>
  );
}

function EpicPanel({ epics, items, filters, setFilters, onOpen, onClose, onCreate }) {
  const stats = useMemo(() => {
    const m = new Map();
    for (const e of epics) m.set(String(e.id), { total: 0, done: 0, inprogress: 0 });
    for (const it of items) {
      const s = it.epicId && m.get(String(it.epicId));
      if (!s) continue;
      s.total++;
      const c = statusCategory(it.status);
      if (c === 'done') s.done++; else if (c === 'inprogress') s.inprogress++;
    }
    return m;
  }, [epics, items]);
  const selectedEpic = filters.epics.length === 1 ? filters.epics[0] : null;
  const pick = (id) => setFilters((f) => ({ ...f, epics: selectedEpic === id ? [] : [id] }));
  return (
    <aside className="pm-epic-panel">
      <div className="pm-epic-panel-head">
        <span>Epics</span>
        <button type="button" className="pm-icon-btn" onClick={onClose} aria-label="Close epics panel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <button type="button" className={`pm-epic-item${!filters.epics.length ? ' is-on' : ''}`} onClick={() => setFilters((f) => ({ ...f, epics: [] }))}>All issues</button>
      <button type="button" className={`pm-epic-item${selectedEpic === UNASSIGNED ? ' is-on' : ''}`} onClick={() => pick(UNASSIGNED)}>Issues without epic</button>
      <div className="pm-epic-list">
        {epics.map((e) => {
          const s = stats.get(String(e.id)) || { total: 0, done: 0, inprogress: 0 };
          return (
            <div key={e.id} className={`pm-epic-card${selectedEpic === String(e.id) ? ' is-on' : ''}`} style={{ '--epic': epicColor(e) }}>
              <button type="button" className="pm-epic-card-main" onClick={() => pick(String(e.id))}>
                <span className="pm-epic-card-name">{e.devList}</span>
                <ProgressBar done={s.done} inprogress={s.inprogress} total={s.total} />
                <span className="pm-muted pm-epic-card-meta">{s.done}/{s.total} done{e.targetDate ? ` · due ${fmtDate(e.targetDate, { withYear: false })}` : ''}</span>
              </button>
              <button type="button" className="pm-link-btn pm-epic-details" onClick={() => onOpen(e)}>View details</button>
            </div>
          );
        })}
        {!epics.length && <div className="pm-muted pm-epic-empty">No epics yet. Epics group related stories and tasks, e.g. a whole system rollout.</div>}
      </div>
      <button type="button" className="pm-quick-create-btn" onClick={onCreate}><PlusIcon size={14} /> Create epic</button>
    </aside>
  );
}
