import React, { useEffect, useMemo, useState } from 'react';
import { landscapeOf } from '../../shared/masterData.js';
import * as XLSX from 'xlsx';
import { apiActivityLog } from '../../shared/api.js';
import { ccbApi } from '../../ccb/api.js';
import { STATUS_PROGRESS_ORDER } from '../../shared/constants.js';
import { issueKey, isEpic, splitPeople, parseLabels } from '../../shared/pm.js';
import { ROUTES } from '../../shared/routes.js';
import { fmtDate, revisedTarget, todayStr } from '../../shared/utils.js';

// Ageing report — end-to-end visibility of every issue, from the change request being logged in the
// CCB, through each tracker status, to completion. Time in each status comes from the status-change
// history (dev_tracker.item_history); issues with no history (imported, or older than the history)
// fall back to their stage dates and are marked "estimated". Calendar days throughout.

const DAY = 86400000;
const TERMINAL = ['Completed', 'Cancelled'];
const BUCKETS = [
  { key: 'b0', label: '0–7 d', max: 7, color: '#22A06B' },
  { key: 'b1', label: '8–15 d', max: 15, color: '#6CC24A' },
  { key: 'b2', label: '16–30 d', max: 30, color: '#E2B203' },
  { key: 'b3', label: '31–60 d', max: 60, color: '#F38A3F' },
  { key: 'b4', label: '61–90 d', max: 90, color: '#E2483D' },
  { key: 'b5', label: '90+ d', max: Infinity, color: '#AE2E24' },
];
const bucketOf = (d) => BUCKETS.find((b) => d <= b.max) || BUCKETS[BUCKETS.length - 1];

// Governance phases ahead of development, from the CCB request's own timestamps.
const GOV = [
  { key: 'CR · Draft', color: '#B3B9C4' },
  { key: 'CR · Review & CCB', color: '#8270DB' },
  { key: 'CR · Handover', color: '#C0B6F2' },
];
const STATUS_COLORS = {
  'Not Started': '#8993A4', 'Requirement Discussion': '#579DFF', 'FS Preparation': '#1D7AFC', 'In Progress': '#0C66E4',
  'IT Testing': '#9F8FEF', 'User Testing': '#6E5DC6', Hypercare: '#E2B203', 'On Hold': '#F38A3F', Completed: '#22A06B', Cancelled: '#C9372C',
};
const FALLBACK = ['#2898BD', '#94C748', '#E774BB', '#60C6D2', '#B38600', '#7F5F01'];
const colorOf = (s, i = 0) => STATUS_COLORS[s] || GOV.find((g) => g.key === s)?.color || FALLBACK[i % FALLBACK.length];

const STAGE_DATE_STATUS = [
  ['reqDiscussion', 'Requirement Discussion'], ['fsPrep', 'FS Preparation'], ['development', 'In Progress'], ['itTesting', 'IT Testing'],
  ['userTesting', 'User Testing'], ['hypercareDate', 'Hypercare'], ['onHoldDate', 'On Hold'], ['completedDate', 'Completed'], ['cancelledDate', 'Cancelled'],
];

const DIMENSIONS = [
  { key: 'status', label: 'Status' },
  { key: 'bucket', label: 'Age bucket' },
  { key: 'landscape', label: 'Landscape (SAP / Non-SAP)' },
  { key: 'changeType', label: 'SAP change type (Workbench / Customizing)' },
  { key: 'area', label: 'Module' },
  { key: 'priority', label: 'Priority' },
  { key: 'assignee', label: 'Task Assigned to' },
  { key: 'func', label: 'Functional area' },
  { key: 'spocFunction', label: 'Function Owner' },
  { key: 'devFactory', label: 'Dev Factory' },
  { key: 'impact', label: 'Business impact' },
  { key: 'complexity', label: 'Complexity' },
  { key: 'issueType', label: 'Issue type' },
  { key: 'source', label: 'Source (CCB / direct)' },
  { key: 'due', label: 'Due state' },
  { key: 'started', label: 'Start month' },
];

const MEASURES = [
  { key: 'inStatus', label: 'Days in current status', short: 'in status' },
  { key: 'age', label: 'Total age (since start)', short: 'age' },
  { key: 'e2e', label: 'End-to-end (since CR logged)', short: 'end-to-end' },
];

const fmtDays = (d) => (d == null || Number.isNaN(d) ? '—' : d < 1 ? '<1d' : `${Math.round(d)}d`);
const t = (v) => (v ? new Date(String(v).length === 10 ? `${v}T00:00:00` : v).getTime() : null);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]; };
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const progressIdx = (s) => { const i = STATUS_PROGRESS_ORDER.indexOf(s); return i === -1 ? null : i; };

/** Every issue's status segments (governance + tracker), dwell per status and the headline ages. */
export function buildModel(items, log, requests, now) {
  const events = new Map();
  const createdAt = new Map();
  for (const h of log || []) {
    if (h.field === '__created__') { createdAt.set(String(h.itemId), h.changedAt); continue; }
    if (h.field !== 'status') continue;
    const k = String(h.itemId);
    if (!events.has(k)) events.set(k, []);
    events.get(k).push(h);
  }
  const reqByItem = new Map();
  for (const r of requests || []) if (r.devTrackerItemId) reqByItem.set(String(r.devTrackerItemId), r);

  return items.filter((it) => !isEpic(it)).map((it) => {
    const id = String(it.id);
    const created = t(createdAt.get(id) || it.createdAt) || t(it.startDate) || now;
    const evs = (events.get(id) || []).filter((e) => e.oldValue !== e.newValue).sort((a, b) => t(a.changedAt) - t(b.changedAt));
    const segs = [];
    let estimated = false;
    if (evs.length) {
      let from = created;
      for (const e of evs) {
        const to = Math.max(from, t(e.changedAt));
        segs.push({ status: e.oldValue || 'Not Started', from, to });
        from = to;
      }
      segs.push({ status: it.status || evs[evs.length - 1].newValue, from, to: now, current: true });
    } else {
      estimated = true;
      const marks = STAGE_DATE_STATUS.map(([k, s]) => ({ s, at: t(it[k]) })).filter((m) => m.at).sort((a, b) => a.at - b.at);
      let from = created; let cur = 'Not Started';
      for (const m of marks) {
        if (m.at > from) segs.push({ status: cur, from, to: m.at });
        from = Math.max(from, m.at); cur = m.s;
      }
      segs.push({ status: it.status || cur, from, to: now, current: true });
    }
    const status = it.status || 'Not Started';
    const closed = TERMINAL.includes(status);
    const last = segs[segs.length - 1];
    if (closed) last.to = last.from; // a finished issue stops ageing the moment it closed

    // Governance prelude from the linked change request.
    const r = reqByItem.get(id);
    const gov = [];
    if (r) {
      const c = t(r.createdAt); const s = t(r.submittedAt) || c; const d = t(r.decidedAt) || s;
      if (c && s > c) gov.push({ status: GOV[0].key, from: c, to: s, gov: true });
      if (s && d > s) gov.push({ status: GOV[1].key, from: s, to: d, gov: true });
      if (d && created > d) gov.push({ status: GOV[2].key, from: d, to: created, gov: true });
    }

    const dwell = {}; const visits = {};
    for (const sg of [...gov, ...segs]) {
      const days = (sg.to - sg.from) / DAY;
      if (sg.current && closed) continue;
      dwell[sg.status] = (dwell[sg.status] || 0) + days;
      visits[sg.status] = (visits[sg.status] || 0) + 1;
    }
    const path = [];
    for (const sg of segs) if (path[path.length - 1] !== sg.status) path.push(sg.status);
    if (closed && path[path.length - 1] !== status) path.push(status);
    let back = 0;
    for (const e of evs) { const a = progressIdx(e.oldValue); const b = progressIdx(e.newValue); if (a != null && b != null && b < a) back++; }

    const startAt = t(it.startDate) || created;
    const endAt = closed ? last.from : now;
    const inStatus = closed ? 0 : (now - last.from) / DAY;
    const age = Math.max(0, (endAt - startAt) / DAY);
    const e2eStart = r ? t(r.createdAt) : startAt;
    const e2e = Math.max(0, (endAt - Math.min(e2eStart, startAt)) / DAY);
    const due = revisedTarget(it);
    const dueState = closed ? 'Closed' : !due ? 'No due date' : due < todayStr() ? 'Overdue' : (t(due) - now) / DAY <= 7 ? 'Due within 7 days' : 'On track';
    const lastMove = evs.length ? t(evs[evs.length - 1].changedAt) : last.from;

    return {
      it, id, key: issueKey(it), title: it.devList, status, closed, estimated, segs, gov, r, crNo: r?.crNo || null,
      dwell, visits, path, back, inStatus, age, e2e, due, dueState, idle: (now - lastMove) / DAY,
      startAt, endAt, e2eStart: Math.min(e2eStart || startAt, startAt),
    };
  });
}

function dimValue(row, dim, measure) {
  const it = row.it;
  switch (dim) {
    case 'status': return [row.status];
    case 'bucket': return [bucketOf(row[measure]).label];
    case 'assignee': { const p = splitPeople(it.developer); return p.length ? p : ['Unassigned']; }
    case 'source': return [row.r ? 'Via CCB' : 'Direct'];
    case 'due': return [row.dueState];
    case 'started': return [row.startAt ? new Date(row.startAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—'];
    case 'issueType': return [it.issueType || 'Task'];
    case 'landscape': return [row.landscape || '—'];
    case 'changeType': { const t = parseLabels(it.labels).filter((l) => l === 'Workbench' || l === 'Customizing'); return t.length ? t : ['—']; }
    default: return [String(it[dim] || '').trim() || '—'];
  }
}

export default function AgeingReport({ items, statusOrder, areaGroupOf, email, onOpen }) {
  const [log, setLog] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loadErr, setLoadErr] = useState('');
  const [tab, setTab] = useState('matrix');
  const [scope, setScope] = useState('open');
  const [measure, setMeasure] = useState('inStatus');
  const [drill, setDrill] = useState(null);

  useEffect(() => {
    let live = true;
    Promise.allSettled([apiActivityLog(email), ccbApi.requests()]).then(([l, r]) => {
      if (!live) return;
      if (l.status === 'fulfilled') setLog(l.value || []); else { setLog([]); setLoadErr('Status history could not be loaded — ages are estimated from stage dates.'); }
      if (r.status === 'fulfilled') setRequests(r.value.requests || []);
    });
    return () => { live = false; };
  }, [email]);

  const now = useMemo(() => Date.now(), [log]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = useMemo(
    () => (log ? buildModel(items, log, requests, now).map((r) => ({ ...r, landscape: landscapeOf(r.it.area, areaGroupOf) })) : []),
    [items, log, requests, now, areaGroupOf],
  );
  const rows = useMemo(() => all.filter((r) => (scope === 'open' ? !r.closed : scope === 'closed' ? r.closed : true)), [all, scope]);
  const statuses = useMemo(() => {
    const seen = new Set(all.flatMap((r) => r.segs.map((s) => s.status).concat(r.status)));
    const ordered = [...statusOrder.filter((s) => seen.has(s)), ...[...seen].filter((s) => !statusOrder.includes(s))];
    return ordered;
  }, [all, statusOrder]);
  const pending = useMemo(() => requests.filter((r) => !r.devTrackerItemId && !['rejected', 'withdrawn', 'terminated'].includes(r.status)), [requests]);

  useEffect(() => { setDrill(null); }, [tab, scope, measure]);

  if (!log) return <div className="pm-empty pm-report-empty">Loading status history…</div>;

  const open = all.filter((r) => !r.closed);
  const done = all.filter((r) => r.status === 'Completed');
  const oldest = open.reduce((m, r) => (!m || r.age > m.age ? r : m), null);
  const stale = open.filter((r) => r.idle > 14).length;
  const reworked = all.filter((r) => r.back > 0).length;
  const showDrill = (title, list) => setDrill({ title, list });

  return (
    <div className="pm-report ag">
      <div className="pm-report-head">
        <div>
          <h2>Ageing</h2>
          <p className="pm-muted">How long every issue has spent in each status, from the change request being logged in the CCB to go-live. Click any number to see the issues behind it.</p>
        </div>
        <div className="pm-report-controls">
          <div className="pm-seg" role="group" aria-label="Scope">
            {[['open', 'Open'], ['closed', 'Closed'], ['all', 'All']].map(([k, l]) => <button type="button" key={k} className={scope === k ? 'is-on' : ''} onClick={() => setScope(k)}>{l}</button>)}
          </div>
          <select value={measure} onChange={(e) => setMeasure(e.target.value)} aria-label="Measure age by">
            {MEASURES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <button type="button" className="pm-btn" onClick={() => exportAgeing(rows, statuses)}>Export Excel</button>
        </div>
      </div>
      {loadErr && <div className="pm-hint">{loadErr}</div>}

      <div className="ag-kpis">
        <Kpi label="Open issues" value={open.length} onClick={() => showDrill('Open issues', open)} />
        <Kpi label="Average age (open)" value={fmtDays(avg(open.map((r) => r.age)))} sub={`median ${fmtDays(median(open.map((r) => r.age)))}`} />
        <Kpi label="Avg end-to-end (completed)" value={fmtDays(avg(done.map((r) => r.e2e)))} sub={`${done.length} completed`} onClick={() => showDrill('Completed issues', done)} />
        <Kpi label="Older than 30 days" value={open.filter((r) => r.age > 30).length} tone="warn" onClick={() => showDrill('Open issues older than 30 days', open.filter((r) => r.age > 30))} />
        <Kpi label="No movement 14+ days" value={stale} tone="warn" onClick={() => showDrill('Open issues with no status change for 14+ days', open.filter((r) => r.idle > 14))} />
        <Kpi label="Overdue" value={open.filter((r) => r.dueState === 'Overdue').length} tone="bad" onClick={() => showDrill('Overdue issues', open.filter((r) => r.dueState === 'Overdue'))} />
        <Kpi label="Sent back (rework)" value={reworked} onClick={() => showDrill('Issues moved back to an earlier status', all.filter((r) => r.back > 0))} />
        <Kpi label="Oldest open" value={oldest ? fmtDays(oldest.age) : '—'} sub={oldest?.key} onClick={oldest ? () => onOpen(oldest.it) : undefined} />
        {pending.length > 0 && <Kpi label="CRs not yet in development" value={pending.length} sub="awaiting CCB steps" onClick={() => setTab('governance')} />}
      </div>

      <nav className="ag-tabs" aria-label="Ageing views">
        {[['matrix', 'Status × age'], ['dwell', 'Time per stage'], ['flow', 'Status flow'], ['pivot', 'Pivot'], ['timeline', 'End-to-end timeline'], ['register', 'Issue register'], ['governance', `CR pipeline${pending.length ? ` (${pending.length})` : ''}`]].map(([k, l]) => (
          <button type="button" key={k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>

      {!rows.length && tab !== 'governance' ? <div className="pm-empty pm-report-empty">No issues match these filters.</div> : (
        <>
          {tab === 'matrix' && <StatusMatrix rows={rows} statuses={statuses} measure={measure} onDrill={showDrill} />}
          {tab === 'dwell' && <Dwell rows={rows} statuses={statuses} onDrill={showDrill} />}
          {tab === 'flow' && <Flow rows={rows} statuses={statuses} onDrill={showDrill} />}
          {tab === 'pivot' && <Pivot rows={rows} measure={measure} onDrill={showDrill} />}
          {tab === 'timeline' && <Timeline rows={rows} statuses={statuses} onOpen={onOpen} />}
          {tab === 'register' && <Register rows={rows} statuses={statuses} onOpen={onOpen} />}
        </>
      )}
      {tab === 'governance' && <Governance requests={requests} pending={pending} now={now} />}

      {drill && (
        <div className="ag-drill">
          <div className="ag-drill-head">
            <b>{drill.title}</b> <span className="pm-muted">· {drill.list.length} issue{drill.list.length === 1 ? '' : 's'}</span>
            <button type="button" className="pm-link-btn" onClick={() => setDrill(null)}>Close</button>
          </div>
          <IssueTable rows={drill.list} onOpen={onOpen} />
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, tone, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className={`ag-kpi${tone ? ` is-${tone}` : ''}${onClick ? ' is-link' : ''}`} onClick={onClick}>
      <span>{label}</span><b>{value}</b>{sub && <small>{sub}</small>}
    </Tag>
  );
}

function Heat({ n, max, color, onClick, title, children }) {
  if (!n) return <td className="ag-cell is-zero">·</td>;
  const a = 0.12 + 0.6 * (n / Math.max(1, max));
  return (
    <td className="ag-cell">
      <button type="button" title={title} onClick={onClick} style={{ background: `color-mix(in srgb, ${color} ${Math.round(a * 100)}%, transparent)` }}>{children ?? n}</button>
    </td>
  );
}

/** Rows = status, columns = age bucket of the chosen measure. */
function StatusMatrix({ rows, statuses, measure, onDrill }) {
  const m = MEASURES.find((x) => x.key === measure);
  const present = statuses.filter((s) => rows.some((r) => r.status === s));
  const cell = (s, b) => rows.filter((r) => r.status === s && bucketOf(r[measure]).key === b.key);
  const max = Math.max(1, ...present.flatMap((s) => BUCKETS.map((b) => cell(s, b).length)));
  return (
    <div className="ag-scroll">
      <p className="pm-muted ag-note">Issues by current status and {m.short} ({m.label.toLowerCase()}).</p>
      <table className="ag-table ag-matrix">
        <thead><tr><th>Status</th>{BUCKETS.map((b) => <th key={b.key}><i style={{ background: b.color }} />{b.label}</th>)}<th>Total</th><th>Avg</th><th>Oldest</th></tr></thead>
        <tbody>
          {present.map((s) => {
            const list = rows.filter((r) => r.status === s);
            const vals = list.map((r) => r[measure]);
            return (
              <tr key={s}>
                <th><Dot c={colorOf(s)} />{s}</th>
                {BUCKETS.map((b) => { const c = cell(s, b); return <Heat key={b.key} n={c.length} max={max} color={b.color} onClick={() => onDrill(`${s} · ${b.label} ${m.short}`, c)} />; })}
                <td className="ag-num"><button type="button" className="pm-link-btn" onClick={() => onDrill(s, list)}>{list.length}</button></td>
                <td className="ag-num">{fmtDays(avg(vals))}</td>
                <td className="ag-num">{fmtDays(Math.max(...vals))}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr><th>Total</th>{BUCKETS.map((b) => { const c = rows.filter((r) => bucketOf(r[measure]).key === b.key); return <td key={b.key} className="ag-num"><button type="button" className="pm-link-btn" onClick={() => onDrill(`${b.label} ${m.short}`, c)}>{c.length}</button></td>; })}
            <td className="ag-num">{rows.length}</td><td className="ag-num">{fmtDays(avg(rows.map((r) => r[measure])))}</td><td className="ag-num">{fmtDays(Math.max(...rows.map((r) => r[measure])))}</td></tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Days spent in each status (including the CCB phases), across every issue that passed through it. */
function Dwell({ rows, statuses, onDrill }) {
  const keys = [...GOV.map((g) => g.key), ...statuses.filter((s) => !TERMINAL.includes(s))];
  const stats = keys.map((s) => {
    const through = rows.filter((r) => r.dwell[s] != null);
    const vals = through.map((r) => r.dwell[s]);
    return { s, through, n: through.length, avg: avg(vals), med: median(vals), p90: pct(vals, 90), max: vals.length ? Math.max(...vals) : null, total: vals.reduce((a, b) => a + b, 0), revisits: through.filter((r) => r.visits[s] > 1).length };
  }).filter((x) => x.n);
  const top = Math.max(1, ...stats.map((x) => x.p90 || 0), ...stats.map((x) => x.avg || 0));
  const bottleneck = stats.reduce((m, x) => (!m || x.total > m.total ? x : m), null);
  return (
    <div className="ag-scroll">
      <p className="pm-muted ag-note">
        Average, median and 90th-percentile days per stage. {bottleneck && <>The biggest share of total waiting time sits in <b>{bottleneck.s}</b> ({fmtDays(bottleneck.total)} across {bottleneck.n} issues).</>}
      </p>
      <table className="ag-table">
        <thead><tr><th>Stage</th><th className="ag-bar-col">Average · <span className="ag-p90-key" /> 90th percentile</th><th>Issues</th><th>Avg</th><th>Median</th><th>P90</th><th>Max</th><th>Re-entered</th></tr></thead>
        <tbody>
          {stats.map((x) => (
            <tr key={x.s}>
              <th><Dot c={colorOf(x.s)} />{x.s}</th>
              <td className="ag-bar-col">
                <span className="ag-bar"><span style={{ width: `${((x.avg || 0) / top) * 100}%`, background: colorOf(x.s) }} /><i style={{ left: `${((x.p90 || 0) / top) * 100}%` }} title={`90% of issues within ${fmtDays(x.p90)}`} /></span>
              </td>
              <td className="ag-num"><button type="button" className="pm-link-btn" onClick={() => onDrill(`Passed through ${x.s}`, x.through)}>{x.n}</button></td>
              <td className="ag-num">{fmtDays(x.avg)}</td><td className="ag-num">{fmtDays(x.med)}</td><td className="ag-num">{fmtDays(x.p90)}</td><td className="ag-num">{fmtDays(x.max)}</td>
              <td className="ag-num">{x.revisits ? <button type="button" className="pm-link-btn" onClick={() => onDrill(`Re-entered ${x.s}`, x.through.filter((r) => r.visits[x.s] > 1))}>{x.revisits}</button> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Every from → to status move that has happened, plus the most common end-to-end paths. */
function Flow({ rows, statuses, onDrill }) {
  const moves = new Map();
  for (const r of rows) for (let i = 1; i < r.path.length; i++) {
    const k = `${r.path[i - 1]}→${r.path[i]}`;
    if (!moves.has(k)) moves.set(k, new Set());
    moves.get(k).add(r);
  }
  const used = statuses.filter((s) => [...moves.keys()].some((k) => k.startsWith(`${s}→`) || k.endsWith(`→${s}`)));
  const max = Math.max(1, ...[...moves.values()].map((v) => v.size));
  const paths = new Map();
  for (const r of rows) { const k = r.path.join(' → '); if (!paths.has(k)) paths.set(k, []); paths.get(k).push(r); }
  const topPaths = [...paths.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 15);
  return (
    <div className="ag-scroll">
      <p className="pm-muted ag-note">Rows are the status an issue left, columns the status it moved to. <span className="ag-key is-back" /> marks moves back to an earlier stage (rework); <span className="ag-key is-fwd" /> forward moves.</p>
      {!used.length ? <div className="pm-empty">No status changes recorded yet for these issues.</div> : (
        <table className="ag-table ag-matrix ag-flow">
          <thead><tr><th>From \ To</th>{used.map((s) => <th key={s} title={s}>{s}</th>)}</tr></thead>
          <tbody>
            {used.map((a) => (
              <tr key={a}>
                <th><Dot c={colorOf(a)} />{a}</th>
                {used.map((b) => {
                  const set = moves.get(`${a}→${b}`);
                  const ia = progressIdx(a); const ib = progressIdx(b);
                  const backward = ia != null && ib != null && ib < ia;
                  return a === b ? <td key={b} className="ag-cell is-self" /> : <Heat key={b} n={set?.size || 0} max={max} color={backward ? '#E2483D' : '#22A06B'} title={`${a} → ${b}`} onClick={() => onDrill(`${a} → ${b}`, [...(set || [])])} />;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3 className="ag-h3">Most common journeys</h3>
      <ul className="ag-paths">
        {topPaths.map(([p, list]) => (
          <li key={p}>
            <button type="button" className="ag-path" onClick={() => onDrill(`Journey: ${p}`, list)}>
              <span className="ag-path-steps">{p.split(' → ').map((s, i) => <span key={i} className="ag-step" style={{ borderColor: colorOf(s), color: colorOf(s) }}>{s}</span>)}</span>
              <span className="ag-path-meta"><b>{list.length}</b> issue{list.length === 1 ? '' : 's'} · avg {fmtDays(avg(list.map((r) => r.e2e)))} end-to-end</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Any two dimensions against each other — count or average days in each combination. */
function Pivot({ rows, measure, onDrill }) {
  const [rowDim, setRowDim] = useState('area');
  const [colDim, setColDim] = useState('bucket');
  const [metric, setMetric] = useState('count');
  const m = MEASURES.find((x) => x.key === measure);
  const grid = new Map(); const rk = new Set(); const ck = new Set();
  for (const r of rows) for (const a of dimValue(r, rowDim, measure)) for (const b of dimValue(r, colDim, measure)) {
    rk.add(a); ck.add(b);
    const k = `${a}\u0000${b}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(r);
  }
  const order = (dim, set) => {
    if (dim === 'bucket') return BUCKETS.map((b) => b.label).filter((l) => set.has(l));
    if (dim === 'started') return [...set].sort((a, b) => t(`01 ${a}`) - t(`01 ${b}`));
    return [...set].sort((a, b) => (a === '—' || a === 'Unassigned' ? 1 : b === '—' || b === 'Unassigned' ? -1 : a.localeCompare(b)));
  };
  const R = order(rowDim, rk); const Cc = order(colDim, ck);
  const val = (list) => (metric === 'count' ? list.length : avg(list.map((r) => r[measure])) || 0);
  const max = Math.max(1, ...[...grid.values()].map(val));
  const sel = (v, set, label) => (
    <label className="ag-pick">{label}
      <select value={v} onChange={(e) => set(e.target.value)}>{DIMENSIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</select>
    </label>
  );
  return (
    <div className="ag-scroll">
      <div className="ag-pivot-controls">
        {sel(rowDim, setRowDim, 'Rows')}
        <button type="button" className="pm-link-btn" onClick={() => { setRowDim(colDim); setColDim(rowDim); }} title="Swap rows and columns">⇄</button>
        {sel(colDim, setColDim, 'Columns')}
        <div className="pm-seg">
          <button type="button" className={metric === 'count' ? 'is-on' : ''} onClick={() => setMetric('count')}>Issue count</button>
          <button type="button" className={metric === 'avg' ? 'is-on' : ''} onClick={() => setMetric('avg')}>Avg days ({m.short})</button>
        </div>
      </div>
      <table className="ag-table ag-matrix">
        <thead><tr><th>{DIMENSIONS.find((d) => d.key === rowDim).label} \ {DIMENSIONS.find((d) => d.key === colDim).label}</th>{Cc.map((c) => <th key={c}>{c}</th>)}<th>Total</th></tr></thead>
        <tbody>
          {R.map((a) => {
            const rowList = rows.filter((r) => dimValue(r, rowDim, measure).includes(a));
            return (
              <tr key={a}>
                <th>{a}</th>
                {Cc.map((b) => { const list = grid.get(`${a}\u0000${b}`) || []; return <Heat key={b} n={list.length} max={metric === 'count' ? max : list.length} color={metric === 'count' ? '#1D7AFC' : bucketOf(val(list)).color} onClick={() => onDrill(`${a} · ${b}`, list)}>{metric === 'count' ? list.length : fmtDays(val(list))}</Heat>; })}
                <td className="ag-num"><button type="button" className="pm-link-btn" onClick={() => onDrill(a, rowList)}>{metric === 'count' ? rowList.length : fmtDays(val(rowList))}</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** One bar per issue from the CR being logged to today (or closure), split into its statuses. */
function Timeline({ rows, statuses, onOpen }) {
  const [sort, setSort] = useState('e2e');
  const list = [...rows].sort((a, b) => (sort === 'e2e' ? b.e2e - a.e2e : sort === 'inStatus' ? b.inStatus - a.inStatus : a.key.localeCompare(b.key, undefined, { numeric: true }))).slice(0, 150);
  const max = Math.max(1, ...list.map((r) => r.endAt - r.e2eStart));
  const legend = [...GOV.map((g) => g.key), ...statuses];
  return (
    <div>
      <div className="ag-pivot-controls">
        <label className="ag-pick">Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="e2e">Longest end-to-end</option><option value="inStatus">Longest in current status</option><option value="key">Issue key</option></select>
        </label>
        <span className="pm-muted">{rows.length > 150 ? `Top 150 of ${rows.length}` : `${rows.length} issues`} · bars share one scale ({fmtDays(max / DAY)} = full width)</span>
      </div>
      <div className="pm-legend">{legend.map((s) => <span key={s}><i style={{ background: colorOf(s) }} />{s}</span>)}</div>
      <div className="ag-tl">
        {list.map((r) => (
          <div className="ag-tl-row" key={r.id}>
            <button type="button" className="ag-tl-label" onClick={() => onOpen(r.it)} title={r.title}><b>{r.key}</b> {r.title}</button>
            <div className="ag-tl-track">
              {[...r.gov, ...r.segs].filter((s) => s.to > s.from).map((s, i) => (
                <span key={i} className={s.gov ? 'is-gov' : ''} style={{ left: `${((s.from - r.e2eStart) / max) * 100}%`, width: `${Math.max(0.4, ((s.to - s.from) / max) * 100)}%`, background: colorOf(s.status) }}
                  title={`${s.status}: ${fmtDays((s.to - s.from) / DAY)} (${new Date(s.from).toLocaleDateString('en-GB')} → ${s.current && !r.closed ? 'now' : new Date(s.to).toLocaleDateString('en-GB')})`} />
              ))}
            </div>
            <span className="ag-tl-val">{fmtDays(r.e2e)}{r.estimated && <sup title="No status history — estimated from stage dates">≈</sup>}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const SORTS = { key: (r) => r.key, title: (r) => r.title, status: (r) => r.status, inStatus: (r) => r.inStatus, age: (r) => r.age, e2e: (r) => r.e2e, idle: (r) => r.idle, back: (r) => r.back };

/** Every issue with its days in each status. */
function Register({ rows, statuses, onOpen }) {
  const [sort, setSort] = useState({ k: 'e2e', dir: -1 });
  const [q, setQ] = useState('');
  const cols = [...GOV.map((g) => g.key), ...statuses.filter((s) => !TERMINAL.includes(s))].filter((s) => rows.some((r) => r.dwell[s] != null));
  const ql = q.trim().toLowerCase();
  const list = rows.filter((r) => !ql || `${r.key} ${r.title} ${r.crNo || ''} ${r.it.developer || ''}`.toLowerCase().includes(ql)).sort((a, b) => {
    const f = SORTS[sort.k] || ((r) => r.dwell[sort.k] ?? -1);
    const x = f(a); const y = f(b);
    return (typeof x === 'string' ? x.localeCompare(y, undefined, { numeric: true }) : x - y) * sort.dir;
  });
  const th = (k, label) => <th key={k} className="ag-sort" onClick={() => setSort((s) => ({ k, dir: s.k === k ? -s.dir : -1 }))}>{label}{sort.k === k ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}</th>;
  return (
    <div>
      <div className="ag-pivot-controls"><input className="ag-search" placeholder="Search key, title, CR no. or person…" value={q} onChange={(e) => setQ(e.target.value)} /><span className="pm-muted">{list.length} issues · days per status; ≈ = estimated from stage dates</span></div>
      <div className="ag-scroll">
        <table className="ag-table ag-register">
          <thead><tr>{th('key', 'Key')}{th('title', 'Title')}{th('status', 'Status')}{th('inStatus', 'In status')}{th('age', 'Age')}{th('e2e', 'End-to-end')}{th('idle', 'Idle')}{th('back', 'Sent back')}{cols.map((s) => th(s, s))}</tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} onClick={() => onOpen(r.it)} className="ag-row-link">
                <td className="ag-key-cell">{r.key}{r.crNo && <small>{r.crNo}</small>}</td>
                <td className="ag-title-cell" title={r.title}>{r.title}</td>
                <td><Dot c={colorOf(r.status)} />{r.status}</td>
                <td className="ag-num"><Age d={r.inStatus} hide={r.closed} /></td>
                <td className="ag-num"><Age d={r.age} /></td>
                <td className="ag-num"><Age d={r.e2e} />{r.estimated && <sup>≈</sup>}</td>
                <td className="ag-num">{r.closed ? '—' : fmtDays(r.idle)}</td>
                <td className="ag-num">{r.back || '—'}</td>
                {cols.map((s) => <td key={s} className="ag-num">{r.dwell[s] != null ? fmtDays(r.dwell[s]) : ''}{r.visits[s] > 1 && <sup title={`${r.visits[s]} visits`}>×{r.visits[s]}</sup>}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Change requests still in governance (not yet an issue), aged by their current CCB step. */
function Governance({ requests, pending, now }) {
  const LABEL = { draft: 'Draft', module_lead_review: 'Module Lead review', feasibility_review: 'Feasibility review', awaiting_ccb: 'Awaiting CCB', approved: 'Approved — awaiting assignment' };
  const since = (r) => t(r.status === 'draft' ? r.createdAt : r.status === 'module_lead_review' ? r.submittedAt : r.status === 'approved' ? r.decidedAt : r.reviewedAt || r.submittedAt) || t(r.createdAt);
  const rows = pending.map((r) => ({ r, step: LABEL[r.status] || r.status, inStep: (now - since(r)) / DAY, total: (now - t(r.createdAt)) / DAY }));
  const steps = Object.values(LABEL).filter((s) => rows.some((x) => x.step === s));
  const decided = requests.filter((r) => r.decidedAt && r.createdAt);
  if (!requests.length) return <div className="pm-empty pm-report-empty">No change requests found (or the CCB is not available on this server).</div>;
  return (
    <div className="ag-scroll">
      <div className="ag-kpis">
        <Kpi label="CRs in governance" value={rows.length} />
        <Kpi label="Avg logged → decision" value={fmtDays(avg(decided.map((r) => (t(r.decidedAt) - t(r.createdAt)) / DAY)))} sub={`${decided.length} decided`} />
        <Kpi label="Waiting 15+ days" value={rows.filter((x) => x.inStep > 15).length} tone="warn" />
      </div>
      {!rows.length ? <div className="pm-empty">Every open change request is already in development.</div> : (
        <>
          <table className="ag-table ag-matrix">
            <thead><tr><th>CCB step</th>{BUCKETS.map((b) => <th key={b.key}><i style={{ background: b.color }} />{b.label}</th>)}<th>Total</th></tr></thead>
            <tbody>
              {steps.map((s) => (
                <tr key={s}><th>{s}</th>{BUCKETS.map((b) => { const n = rows.filter((x) => x.step === s && bucketOf(x.inStep).key === b.key).length; return <Heat key={b.key} n={n} max={rows.length} color={b.color} />; })}<td className="ag-num">{rows.filter((x) => x.step === s).length}</td></tr>
              ))}
            </tbody>
          </table>
          <table className="ag-table ag-register" style={{ marginTop: 14 }}>
            <thead><tr><th>CR</th><th>Title</th><th>Step</th><th>In step</th><th>Since logged</th><th>Required by</th></tr></thead>
            <tbody>
              {rows.sort((a, b) => b.inStep - a.inStep).map((x) => (
                <tr key={x.r.id} className="ag-row-link" onClick={() => { window.location.href = `${ROUTES.ccbRequests}?cr=${encodeURIComponent(x.r.crNo)}`; }}>
                  <td className="ag-key-cell">{x.r.crNo}</td><td className="ag-title-cell">{x.r.title}</td><td>{x.step}</td>
                  <td className="ag-num"><Age d={x.inStep} /></td><td className="ag-num">{fmtDays(x.total)}</td><td>{x.r.requiredBy ? fmtDate(String(x.r.requiredBy).slice(0, 10)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function IssueTable({ rows, onOpen }) {
  return (
    <div className="ag-scroll">
      <table className="ag-table ag-register">
        <thead><tr><th>Key</th><th>Title</th><th>Status</th><th>In status</th><th>Age</th><th>End-to-end</th><th>Task Assigned to</th><th>Due</th></tr></thead>
        <tbody>
          {[...rows].sort((a, b) => b.e2e - a.e2e).map((r) => (
            <tr key={r.id} className="ag-row-link" onClick={() => onOpen(r.it)}>
              <td className="ag-key-cell">{r.key}{r.crNo && <small>{r.crNo}</small>}</td>
              <td className="ag-title-cell" title={r.title}>{r.title}</td>
              <td><Dot c={colorOf(r.status)} />{r.status}</td>
              <td className="ag-num"><Age d={r.inStatus} hide={r.closed} /></td>
              <td className="ag-num"><Age d={r.age} /></td>
              <td className="ag-num"><Age d={r.e2e} /></td>
              <td>{r.it.developer || <span className="pm-muted">Unassigned</span>}</td>
              <td className={r.dueState === 'Overdue' ? 'ag-bad' : ''}>{r.due ? fmtDate(r.due) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Age({ d, hide }) {
  if (hide) return <span className="pm-muted">—</span>;
  return <span className="ag-age" style={{ color: bucketOf(d).key >= 'b3' ? bucketOf(d).color : undefined }}>{fmtDays(d)}</span>;
}
function Dot({ c }) { return <i className="ag-dot" style={{ background: c }} />; }

function exportAgeing(rows, statuses) {
  const cols = [...GOV.map((g) => g.key), ...statuses.filter((s) => !TERMINAL.includes(s))];
  const r1 = (d) => (d == null ? '' : Math.round(d * 10) / 10);
  const head = ['Key', 'CR no.', 'Title', 'Status', 'Landscape', 'Module', 'Priority', 'Task Assigned to', 'Function Owner', 'Start', 'Due', 'Due state', 'Days in status', 'Age (days)', 'End-to-end (days)', 'Days since last move', 'Sent back', 'Journey', 'Estimated', ...cols.map((c) => `${c} (days)`)];
  const body = rows.map((r) => [r.key, r.crNo || '', r.title, r.status, r.landscape || '', r.it.area || '', r.it.priority || '', r.it.developer || '', r.it.spocFunction || '', r.startAt ? new Date(r.startAt).toISOString().slice(0, 10) : '', r.due || '', r.dueState,
    r.closed ? '' : r1(r.inStatus), r1(r.age), r1(r.e2e), r.closed ? '' : r1(r.idle), r.back, r.path.join(' → '), r.estimated ? 'Yes' : '', ...cols.map((c) => r1(r.dwell[c]))]);
  const seg = [['Key', 'CR no.', 'Title', 'Phase / status', 'From', 'To', 'Days']];
  for (const r of rows) for (const s of [...r.gov, ...r.segs]) {
    if (s.to <= s.from && !s.current) continue;
    seg.push([r.key, r.crNo || '', r.title, s.status, new Date(s.from).toISOString().replace('T', ' ').slice(0, 16), s.current && !r.closed ? 'now' : new Date(s.to).toISOString().replace('T', ' ').slice(0, 16), r1((s.to - s.from) / DAY)]);
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ...body]), 'Ageing');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(seg), 'Status segments');
  XLSX.writeFile(wb, `cr-tracker-ageing-${todayStr()}.xlsx`);
}

