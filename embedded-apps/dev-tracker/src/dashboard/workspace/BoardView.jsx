import React, { useMemo, useState } from 'react';
import { Avatar, PriorityIcon, TypeIcon, EpicLozenge, IssueKey } from './ui.jsx';
import { CATEGORY_META, statusCategory, typeOf, isEpic, points, fmtPoints, byRank, rankBetween, dueDate, parseLabels } from '../../shared/pm.js';
import { KANBAN_COLUMNS } from '../../shared/constants.js';
import { isOverdue, fmtDate } from '../../shared/utils.js';
import { ChevronRightIcon, CalendarIcon } from '../../shared/icons.jsx';

const SWIMLANES = [
  { key: '', label: 'None' },
  { key: 'epic', label: 'Epics' },
  { key: 'developer', label: 'Assignees' },
  { key: 'area', label: 'Modules' },
  { key: 'priority', label: 'Priority' },
];

// Jira board: one column per workflow status (or the compact 6-column grouping the old
// Dashboard used), cards ranked within a column, drag to transition, optional swimlanes.
// Scope is the active sprint when one is running (Scrum board), otherwise every open issue
// (Kanban board) — epics are never cards, same as Jira.
export default function BoardView({ ws, items, onOpen, onError, pmReady }) {
  const { statusOrder, byId, activeSprint, updateItem } = ws;
  const [scope, setScope] = useState(activeSprint ? 'sprint' : 'all');
  const [layout, setLayout] = useState('status');
  const [lane, setLane] = useState('');
  const [hideDone, setHideDone] = useState(false);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [drag, setDrag] = useState(null); // { id }
  const [over, setOver] = useState(null); // { col, lane, index }

  const effectiveScope = activeSprint ? scope : 'all';
  const cards = useMemo(() => items.filter((it) => {
    if (isEpic(it)) return false;
    if (effectiveScope === 'sprint' && String(it.sprintId) !== String(activeSprint.id)) return false;
    if (hideDone && statusCategory(it.status) === 'done') return false;
    return true;
  }).sort(byRank), [items, effectiveScope, activeSprint, hideDone]);

  const columns = useMemo(() => {
    if (layout === 'compact') {
      return KANBAN_COLUMNS.map((c) => ({ key: c.key, name: c.name, statuses: c.statuses, category: statusCategory(c.statuses[0]) }));
    }
    return statusOrder
      .filter((s) => !(hideDone && statusCategory(s) === 'done'))
      .map((s) => ({ key: s, name: s, statuses: [s], category: statusCategory(s) }));
  }, [layout, statusOrder, hideDone]);

  const lanes = useMemo(() => {
    if (!lane) return [{ key: '__all__', label: null, cards }];
    const m = new Map();
    for (const it of cards) {
      let k; let label;
      if (lane === 'epic') {
        const epic = it.epicId ? byId.get(String(it.epicId)) : null;
        k = epic ? String(epic.id) : '__none__';
        label = epic ? epic.devList : 'Issues without epic';
      } else {
        k = (it[lane] || '').trim() || '__none__';
        label = k === '__none__' ? (lane === 'developer' ? 'Unassigned' : `No ${SWIMLANES.find((s) => s.key === lane).label.toLowerCase().replace(/s$/, '')}`) : k;
      }
      if (!m.has(k)) m.set(k, { key: k, label, cards: [] });
      m.get(k).cards.push(it);
    }
    return [...m.values()].sort((a, b) => (a.key === '__none__' ? 1 : b.key === '__none__' ? -1 : a.label.localeCompare(b.label)));
  }, [cards, lane, byId]);

  async function drop(col, laneKey, cardsInCell, index) {
    const id = drag?.id;
    setDrag(null); setOver(null);
    const it = byId.get(String(id));
    if (!it) return;
    const others = cardsInCell.filter((c) => String(c.id) !== String(id));
    const patch = { rank: rankBetween(others[index - 1], others[index]) };
    if (!col.statuses.includes(it.status)) patch.status = col.statuses[0];
    if (lane && laneKey !== '__none__' && laneKey !== '__all__') {
      if (lane === 'epic') { if (String(it.epicId) !== laneKey) patch.epicId = laneKey; }
      else if (it[lane] !== laneKey) patch[lane] = laneKey;
    } else if (lane && laneKey === '__none__') {
      if (lane === 'epic' && it.epicId) patch.epicId = '';
      else if (lane !== 'epic' && lane !== 'priority' && it[lane]) patch[lane] = '';
    }
    if (!pmReady) delete patch.rank;
    if (!Object.keys(patch).length) return;
    try { await updateItem(it.id, patch); } catch (e) { onError(e.message || 'Could not move issue'); }
  }

  function toggleLane(k) {
    setCollapsed((cur) => { const n = new Set(cur); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }

  const sprintDaysLeft = activeSprint?.endDate
    ? Math.ceil((new Date(`${activeSprint.endDate}T23:59:59`) - Date.now()) / 86400000)
    : null;

  return (
    <div className="pm-board-wrap">
      <div className="pm-view-bar">
        <div className="pm-view-bar-left">
          {activeSprint && (
            <div className="pm-seg">
              <button type="button" className={effectiveScope === 'sprint' ? 'is-on' : ''} onClick={() => setScope('sprint')}>{activeSprint.name}</button>
              <button type="button" className={effectiveScope === 'all' ? 'is-on' : ''} onClick={() => setScope('all')}>All issues</button>
            </div>
          )}
          {effectiveScope === 'sprint' && activeSprint && (
            <span className="pm-muted pm-sprint-meta">
              {activeSprint.goal ? <><b>Goal:</b> {activeSprint.goal} · </> : null}
              {sprintDaysLeft != null && (sprintDaysLeft >= 0 ? `${sprintDaysLeft} day${sprintDaysLeft === 1 ? '' : 's'} left` : `${-sprintDaysLeft} days past end`)}
            </span>
          )}
        </div>
        <div className="pm-view-bar-right">
          <label className="pm-inline-label">Group by
            <select value={lane} onChange={(e) => { setLane(e.target.value); setCollapsed(new Set()); }}>
              {SWIMLANES.filter((s) => s.key !== 'epic' || pmReady).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <label className="pm-inline-label">Columns
            <select value={layout} onChange={(e) => setLayout(e.target.value)}>
              <option value="status">Every status</option>
              <option value="compact">Grouped stages</option>
            </select>
          </label>
          <label className="pm-check-label"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Hide done</label>
        </div>
      </div>

      <div className="pm-board-scroll">
        <div className="pm-board" style={{ '--cols': columns.length }}>
          <div className="pm-board-heads">
            {columns.map((col) => {
              const n = cards.filter((c) => col.statuses.includes(c.status)).length;
              return (
                <div className="pm-col-head" key={col.key}>
                  <span className="pm-col-dot" style={{ background: CATEGORY_META[col.category].bar }} />
                  <span className="pm-col-name">{col.name}</span>
                  <span className="pm-col-count">{n}</span>
                </div>
              );
            })}
          </div>

          {lanes.map((ln) => {
            const isCollapsed = collapsed.has(ln.key);
            return (
              <div className="pm-lane" key={ln.key}>
                {ln.label !== null && (
                  <button type="button" className="pm-lane-head" onClick={() => toggleLane(ln.key)} aria-expanded={!isCollapsed}>
                    <span className={`pm-caret${isCollapsed ? '' : ' is-open'}`}><ChevronRightIcon size={12} /></span>
                    {lane === 'developer' && <Avatar name={ln.key === '__none__' ? '' : ln.label} size={20} />}
                    <span className="pm-lane-name">{ln.label}</span>
                    <span className="pm-lane-count">{ln.cards.length} issue{ln.cards.length === 1 ? '' : 's'}</span>
                  </button>
                )}
                {!isCollapsed && (
                  <div className="pm-lane-cells">
                    {columns.map((col) => {
                      const cell = ln.cards.filter((c) => col.statuses.includes(c.status));
                      const isOver = over && over.col === col.key && over.lane === ln.key;
                      return (
                        <div
                          key={col.key}
                          className={`pm-cell${isOver ? ' is-over' : ''}`}
                          onDragOver={(e) => {
                            if (!drag) return;
                            e.preventDefault();
                            const cardsEls = [...e.currentTarget.querySelectorAll('.pm-card:not(.is-dragging)')];
                            let index = cardsEls.length;
                            for (let i = 0; i < cardsEls.length; i++) {
                              const r = cardsEls[i].getBoundingClientRect();
                              if (e.clientY < r.top + r.height / 2) { index = i; break; }
                            }
                            if (!isOver || over.index !== index) setOver({ col: col.key, lane: ln.key, index });
                          }}
                          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); }}
                          onDrop={(e) => { e.preventDefault(); drop(col, ln.key, cell, over?.index ?? cell.length); }}
                        >
                          {(() => {
                            // Drop positions count only the cards that stay put, matching drop()'s `others`.
                            let j = 0;
                            return cell.map((it) => {
                              const isDragged = drag?.id === it.id;
                              const lineHere = isOver && !isDragged && over.index === j;
                              if (!isDragged) j++;
                              return (
                                <React.Fragment key={it.id}>
                                  {lineHere && <div className="pm-drop-line" />}
                                  <Card it={it} epic={it.epicId ? byId.get(String(it.epicId)) : null} onOpen={onOpen} dragging={isDragged} setDrag={setDrag} showEpic={lane !== 'epic'} />
                                </React.Fragment>
                              );
                            });
                          })()}
                          {isOver && over.index >= cell.filter((c) => c.id !== drag?.id).length && <div className="pm-drop-line" />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {!cards.length && (
            <div className="pm-empty">
              {effectiveScope === 'sprint' ? 'No issues in the active sprint yet — add some from the Backlog.' : 'No issues match these filters.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ it, epic, onOpen, dragging, setDrag, showEpic }) {
  const due = dueDate(it);
  const overdue = isOverdue(it);
  const pts = points(it);
  const labels = parseLabels(it.labels);
  return (
    <div
      className={`pm-card${dragging ? ' is-dragging' : ''}${statusCategory(it.status) === 'done' ? ' is-done' : ''}`}
      draggable
      onDragStart={(e) => { setDrag({ id: it.id }); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(it.id)); }}
      onDragEnd={() => setDrag(null)}
      onClick={() => onOpen(it)}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(it); }}
    >
      <div className="pm-card-title">{it.devList}</div>
      <div className="pm-card-tags">
        {showEpic && epic && <EpicLozenge epic={epic} />}
        {it.area && <span className="pm-tag">{it.area}</span>}
        {labels.slice(0, 2).map((l) => <span className="pm-tag pm-tag-label" key={l}>{l}</span>)}
      </div>
      {due && (
        <div className={`pm-card-due${overdue ? ' is-overdue' : ''}`} title={overdue ? 'Overdue' : 'Due date'}>
          <CalendarIcon size={12} /> {fmtDate(due, { withYear: false })}
        </div>
      )}
      <div className="pm-card-foot">
        <span className="pm-card-foot-left">
          <TypeIcon type={typeOf(it)} />
          <IssueKey item={it} onOpen={onOpen} />
        </span>
        <span className="pm-card-foot-right">
          {pts > 0 && <span className="pm-points" title="Story points">{fmtPoints(pts)}</span>}
          <PriorityIcon priority={it.priority} />
          <Avatar name={it.developer} size={22} />
        </span>
      </div>
    </div>
  );
}
