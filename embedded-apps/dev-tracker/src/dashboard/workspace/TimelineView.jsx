import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TypeIcon, epicColor, ProgressBar, IssueKey } from './ui.jsx';
import { CATEGORY_META, statusCategory, isEpic, typeOf, byRank, issueKey, shiftDate } from '../../shared/pm.js';
import { todayStr, revisedTarget, isOverdue, fmtDate, daysBetween } from '../../shared/utils.js';
import { ChevronRightIcon } from '../../shared/icons.jsx';

const ZOOMS = [
  { key: 'weeks', label: 'Weeks', px: 26 },
  { key: 'months', label: 'Months', px: 6 },
  { key: 'quarters', label: 'Quarters', px: 2.2 },
];
const NO_EPIC = '__none__';

// Only real YYYY-MM-DD values count — imported items carry text like "Done"/"TBD" in date
// fields, and one of those reaching the range math below throws and blanks the whole page.
const isIso = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '').trim());
const iso = (v) => (isIso(v) ? String(v).trim() : '');

function startOf(it) {
  return iso(it.startDate) || iso(String(it.createdAt || '').slice(0, 10));
}
function endOf(it) {
  return (isIso(it.targetDate) ? revisedTarget({ ...it, targetDate: String(it.targetDate).trim() }) : '') || iso(it.completedDate);
}

// Jira-style timeline (roadmap): epics with their issues as bars on a calendar, from start date
// to (revised) due date. Drag a bar to move it, drag its right edge to change the due date.
export default function TimelineView({ ws, items, onOpen, onError }) {
  const { byId, updateItem, pmReady } = ws;
  const [zoom, setZoom] = useState('months');
  const [expanded, setExpanded] = useState(() => new Set());
  const [drag, setDrag] = useState(null); // { id, mode, x0, dStart, dEnd, delta }
  const scrollRef = useRef(null);
  const px = ZOOMS.find((z) => z.key === zoom).px;

  const groups = useMemo(() => {
    const itemIds = new Set(items.map((i) => String(i.id)));
    const epicList = pmReady ? ws.epics.filter((e) => itemIds.has(String(e.id)) || items.some((i) => String(i.epicId) === String(e.id))) : [];
    const byEpic = new Map(epicList.map((e) => [String(e.id), []]));
    const loose = [];
    for (const it of items) {
      if (isEpic(it)) continue;
      const k = it.epicId && byEpic.has(String(it.epicId)) ? String(it.epicId) : null;
      if (k) byEpic.get(k).push(it); else loose.push(it);
    }
    const out = epicList.sort(byRank).map((e) => ({ key: String(e.id), epic: e, children: byEpic.get(String(e.id)).sort(byRank) }));
    if (loose.length) {
      out.push({
        key: NO_EPIC,
        epic: null,
        children: loose.sort((a, b) => (startOf(a) || '9999').localeCompare(startOf(b) || '9999')),
      });
    }
    return out;
  }, [items, ws.epics, pmReady]);

  // Epics and the no-epic group start expanded when there are few of them.
  useEffect(() => {
    setExpanded(new Set(groups.length <= 4 ? groups.map((g) => g.key) : groups.filter((g) => g.key !== NO_EPIC).slice(0, 3).map((g) => g.key)));
  }, [groups.length]);

  const range = useMemo(() => {
    let min = shiftDate(todayStr(), -30);
    let max = shiftDate(todayStr(), 90);
    for (const it of items) {
      const s = startOf(it); const e = endOf(it);
      if (s && s < min) min = s;
      if (e && e > max) max = e;
    }
    // Snap to month boundaries so the header starts on a clean edge.
    const start = `${min.slice(0, 7)}-01`;
    const endD = new Date(`${max.slice(0, 7)}-01T00:00:00`);
    endD.setMonth(endD.getMonth() + 2);
    const end = endD.toISOString().slice(0, 10);
    return { start, end, days: daysBetween(start, end) };
  }, [items]);

  const width = range.days * px;
  const x = (date) => daysBetween(range.start, date) * px;
  const todayX = x(todayStr());

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = Math.max(0, todayX - el.clientWidth * 0.3);
  }, [zoom, range.start]);

  const months = useMemo(() => {
    const out = [];
    const d = new Date(`${range.start}T00:00:00`);
    while (d.toISOString().slice(0, 10) < range.end) {
      const s = d.toISOString().slice(0, 10);
      const next = new Date(d); next.setMonth(next.getMonth() + 1);
      const e = next.toISOString().slice(0, 10) < range.end ? next.toISOString().slice(0, 10) : range.end;
      out.push({ s, e, label: d.toLocaleDateString('en-GB', { month: zoom === 'quarters' ? 'short' : 'long', year: d.getMonth() === 0 || !out.length ? 'numeric' : undefined }) });
      d.setMonth(d.getMonth() + 1);
    }
    return out;
  }, [range, zoom]);
  const weeks = useMemo(() => {
    if (zoom !== 'weeks') return [];
    const out = [];
    const d = new Date(`${range.start}T00:00:00`);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    while (d.toISOString().slice(0, 10) < range.end) {
      out.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 7);
    }
    return out;
  }, [range, zoom]);

  function barFor(it, fallbackFromChildren = []) {
    let s = startOf(it); let e = endOf(it);
    if ((!s || !e) && fallbackFromChildren.length) {
      const ss = fallbackFromChildren.map(startOf).filter(Boolean).sort();
      const es = fallbackFromChildren.map(endOf).filter(Boolean).sort();
      s = s || ss[0]; e = e || es[es.length - 1];
    }
    if (!s || !e || e < s) return null;
    return { s, e };
  }

  function onPointerDown(ev, it, mode, bar) {
    if (!bar) return;
    ev.preventDefault(); ev.stopPropagation();
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
    setDrag({ id: it.id, mode, x0: ev.clientX, bar, delta: 0, moved: false });
  }
  function onPointerMove(ev) {
    if (!drag) return;
    const delta = Math.round((ev.clientX - drag.x0) / px);
    if (delta !== drag.delta) setDrag((d) => ({ ...d, delta, moved: d.moved || delta !== 0 }));
  }
  async function onPointerUp() {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    const it = byId.get(String(d.id));
    if (!it) return;
    if (!d.moved) { onOpen(it); return; }
    const rework = Number(it.rework) || 0;
    const patch = {};
    if (d.mode === 'move') {
      patch.startDate = shiftDate(d.bar.s, d.delta);
      patch.targetDate = shiftDate(iso(it.targetDate) || shiftDate(d.bar.e, -rework), d.delta);
    } else {
      const newEnd = shiftDate(d.bar.e, d.delta);
      if (newEnd < d.bar.s) return;
      patch.targetDate = shiftDate(newEnd, -rework);
      if (!iso(it.startDate)) patch.startDate = d.bar.s;
    }
    try { await updateItem(it.id, patch); } catch (e) { onError(e.message || 'Could not update dates'); }
  }

  function renderBar(it, bar, { epic = false, color } = {}) {
    if (!bar) return <span className="pm-tl-nodate">No dates</span>;
    let { s, e } = bar;
    if (drag && String(drag.id) === String(it.id)) {
      if (drag.mode === 'move') { s = shiftDate(s, drag.delta); e = shiftDate(e, drag.delta); }
      else e = shiftDate(e, drag.delta) < s ? s : shiftDate(e, drag.delta);
    }
    const cat = statusCategory(it.status);
    const left = x(s);
    const w = Math.max(px, (daysBetween(s, e) + 1) * px);
    const overdue = isOverdue(it);
    const bg = color || CATEGORY_META[cat].bar;
    return (
      <div
        className={`pm-tl-bar${epic ? ' is-epic' : ''}${overdue ? ' is-overdue' : ''}${drag && String(drag.id) === String(it.id) ? ' is-dragging' : ''}`}
        style={{ left, width: w, '--bar': bg }}
        title={`${issueKey(it)} ${it.devList}\n${fmtDate(s)} → ${fmtDate(e)}${overdue ? ' (overdue)' : ''}`}
        onPointerDown={(ev) => onPointerDown(ev, it, 'move', bar)}
      >
        {w > 70 && <span className="pm-tl-bar-label">{it.devList}</span>}
        <span className="pm-tl-handle" onPointerDown={(ev) => onPointerDown(ev, it, 'resize', bar)} />
      </div>
    );
  }

  function toggle(k) {
    setExpanded((cur) => { const n = new Set(cur); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }

  return (
    <div className="pm-timeline">
      <div className="pm-view-bar">
        <div className="pm-view-bar-left">
          <span className="pm-muted">Drag a bar to reschedule, or its right edge to change the due date.</span>
        </div>
        <div className="pm-view-bar-right">
          <button type="button" className="pm-btn pm-btn-subtle pm-btn-sm" onClick={() => { const el = scrollRef.current; if (el) el.scrollLeft = Math.max(0, todayX - el.clientWidth * 0.3); }}>Today</button>
          <div className="pm-seg">
            {ZOOMS.map((z) => <button type="button" key={z.key} className={zoom === z.key ? 'is-on' : ''} onClick={() => setZoom(z.key)}>{z.label}</button>)}
          </div>
        </div>
      </div>

      <div className="pm-tl-scroll" ref={scrollRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)}>
        <div className="pm-tl-inner" style={{ width: width + 320 }}>
          <div className="pm-tl-header">
            <div className="pm-tl-left pm-tl-corner">{pmReady ? 'Epics & issues' : 'Issues'}</div>
            <div className="pm-tl-track pm-tl-scale" style={{ width }}>
              {months.map((m) => (
                <div className="pm-tl-month" key={m.s} style={{ left: x(m.s), width: x(m.e) - x(m.s) }}>{m.label}</div>
              ))}
              {weeks.map((w) => <div className="pm-tl-week" key={w} style={{ left: x(w) }}>{fmtDate(w, { withYear: false })}</div>)}
            </div>
          </div>

          <div className="pm-tl-body">
            <div className="pm-tl-grid" style={{ left: 320, width }} aria-hidden="true">
              {months.map((m) => <span key={m.s} style={{ left: x(m.s) }} />)}
              <i className="pm-tl-today" style={{ left: todayX }} />
            </div>

            {groups.map((g) => {
              const open = expanded.has(g.key);
              const done = g.children.filter((c) => statusCategory(c.status) === 'done').length;
              const inprog = g.children.filter((c) => statusCategory(c.status) === 'inprogress').length;
              return (
                <React.Fragment key={g.key}>
                  <div className="pm-tl-row pm-tl-group">
                    <div className="pm-tl-left">
                      <button type="button" className="pm-tl-toggle" onClick={() => toggle(g.key)} aria-expanded={open} aria-label={open ? 'Collapse' : 'Expand'}>
                        <span className={`pm-caret${open ? ' is-open' : ''}`}><ChevronRightIcon size={11} /></span>
                      </button>
                      {g.epic ? <TypeIcon type="Epic" /> : null}
                      {g.epic ? (
                        <button type="button" className="pm-tl-name" onClick={() => onOpen(g.epic)}>{g.epic.devList}</button>
                      ) : (
                        <span className="pm-tl-name pm-muted">Issues without epic</span>
                      )}
                      <span className="pm-tl-progress"><ProgressBar done={done} inprogress={inprog} total={g.children.length} height={5} /></span>
                    </div>
                    <div className="pm-tl-track" style={{ width }}>
                      {g.epic && renderBar(g.epic, barFor(g.epic, g.children), { epic: true, color: epicColor(g.epic) })}
                    </div>
                  </div>
                  {open && g.children.map((it) => (
                    <div className="pm-tl-row" key={it.id}>
                      <div className="pm-tl-left pm-tl-child">
                        <TypeIcon type={typeOf(it)} />
                        <IssueKey item={it} onOpen={onOpen} />
                        <button type="button" className="pm-tl-name" onClick={() => onOpen(it)} title={it.devList}>{it.devList}</button>
                      </div>
                      <div className="pm-tl-track" style={{ width }}>{renderBar(it, barFor(it))}</div>
                    </div>
                  ))}
                </React.Fragment>
              );
            })}
            {!groups.length && <div className="pm-empty">No issues match these filters.</div>}
          </div>
        </div>
      </div>
      <div className="pm-tl-legend">
        {['todo', 'inprogress', 'done'].map((c) => <span key={c}><i style={{ background: CATEGORY_META[c].bar }} />{CATEGORY_META[c].label}</span>)}
        <span><i className="pm-tl-legend-overdue" />Overdue</span>
        <span><i className="pm-tl-legend-today" />Today</span>
      </div>
    </div>
  );
}

