import React, { useMemo, useState } from 'react';
import AgeingReport from './AgeingReport.jsx';
import { CATEGORY_META, statusCategory, isDone, isEpic, points, fmtPoints, shiftDate, splitPeople } from '../../shared/pm.js';
import { todayStr, daysBetween, fmtDate } from '../../shared/utils.js';

// Chart colours: categorical slots 1–2 of the validated reference palette (blue, orange) plus a
// neutral for the "ideal" guide line. Status-category colours are only used where the series *is*
// a status category (workload), so they keep meaning the same thing as on the board.
const C1 = '#2a78d6';
const C2 = '#eb6834';
const GUIDE = '#8993A4';

const REPORTS = [
  { key: 'ageing', label: 'Ageing' },
  { key: 'burndown', label: 'Sprint burndown', pm: true },
  { key: 'velocity', label: 'Velocity', pm: true },
  { key: 'created', label: 'Created vs resolved' },
  { key: 'workload', label: 'Workload' },
];

function resolvedOn(it) {
  if (!isDone(it)) return null;
  return it.completedDate || it.cancelledDate || (it.updatedAt ? String(it.updatedAt).slice(0, 10) : null);
}

export default function ReportsView({ ws, items, email, onOpen }) {
  const { pmReady } = ws;
  const available = REPORTS.filter((r) => !r.pm || pmReady);
  const [report, setReport] = useState(available[0].key);
  return (
    <div className="pm-reports">
      <nav className="pm-report-tabs" aria-label="Reports">
        {available.map((r) => (
          <button type="button" key={r.key} className={report === r.key ? 'is-on' : ''} onClick={() => setReport(r.key)}>{r.label}</button>
        ))}
      </nav>
      <div className="pm-report-body">
        {report === 'ageing' && <AgeingReport items={items} statusOrder={ws.statusOrder} email={email} onOpen={onOpen} />}
        {report === 'burndown' && <Burndown ws={ws} />}
        {report === 'velocity' && <Velocity ws={ws} />}
        {report === 'created' && <CreatedResolved items={items} />}
        {report === 'workload' && <Workload items={items} />}
      </div>
      {!pmReady && <div className="pm-hint">Burndown and velocity appear once the updated API (with sprints) is deployed.</div>}
    </div>
  );
}

function UnitToggle({ unit, setUnit }) {
  return (
    <div className="pm-seg">
      <button type="button" className={unit === 'points' ? 'is-on' : ''} onClick={() => setUnit('points')}>Story points</button>
      <button type="button" className={unit === 'count' ? 'is-on' : ''} onClick={() => setUnit('count')}>Issue count</button>
    </div>
  );
}

function Burndown({ ws }) {
  const sprints = ws.sprints.filter((s) => s.state !== 'future' && s.startDate && s.endDate);
  const [sid, setSid] = useState(sprints[0]?.id || '');
  const sprint = sprints.find((s) => s.id === sid) || sprints[0];
  const members = useMemo(() => (sprint ? ws.items.filter((it) => String(it.sprintId) === String(sprint.id) && !isEpic(it)) : []), [ws.items, sprint]);
  const hasPoints = members.some((it) => points(it) > 0);
  const [unitPick, setUnit] = useState(null);
  const unit = unitPick || (hasPoints ? 'points' : 'count');
  const val = (it) => (unit === 'points' ? points(it) : 1);

  if (!sprint) return <Empty text="No started sprints yet. Start a sprint from the Backlog to see its burndown." />;

  const days = [];
  for (let d = sprint.startDate; d <= sprint.endDate; d = shiftDate(d, 1)) days.push(d);
  const total = members.reduce((s, it) => s + val(it), 0);
  const last = todayStr() < sprint.endDate ? todayStr() : sprint.endDate;
  const remaining = days.filter((d) => d <= last).map((d) => ({
    x: d,
    y: members.reduce((s, it) => { const r = resolvedOn(it); return s + (r && r <= d ? 0 : val(it)); }, 0),
  }));
  const ideal = days.map((d, i) => ({ x: d, y: days.length > 1 ? total - (total * i) / (days.length - 1) : 0 }));
  const doneNow = remaining.length ? total - remaining[remaining.length - 1].y : 0;
  const u = unit === 'points' ? 'pts' : 'issues';

  return (
    <div className="pm-report">
      <div className="pm-report-head">
        <div>
          <h2>{sprint.name} burndown</h2>
          <p className="pm-muted">{fmtDate(sprint.startDate)} – {fmtDate(sprint.endDate)}{sprint.goal ? ` · ${sprint.goal}` : ''}</p>
        </div>
        <div className="pm-report-controls">
          <select value={sprint.id} onChange={(e) => setSid(e.target.value)} aria-label="Sprint">
            {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}{s.state === 'active' ? ' (active)' : ''}</option>)}
          </select>
          <UnitToggle unit={unit} setUnit={setUnit} />
        </div>
      </div>
      <div className="pm-stat-row">
        <Stat label="Scope" value={`${fmtPoints(total)} ${u}`} />
        <Stat label="Completed" value={`${fmtPoints(doneNow)} ${u}`} />
        <Stat label="Remaining" value={`${fmtPoints(total - doneNow)} ${u}`} />
      </div>
      <LineChart
        xs={days}
        series={[
          { name: 'Remaining', color: C1, points: remaining },
          { name: 'Guideline', color: GUIDE, dash: true, points: ideal },
        ]}
        unit={u}
      />
      {sprint.state === 'closed' && <p className="pm-muted pm-note">Unfinished issues moved out when this sprint was completed aren't counted.</p>}
    </div>
  );
}

function Velocity({ ws }) {
  const closed = ws.sprints.filter((s) => s.state === 'closed').sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt)).slice(-8);
  const hasPoints = closed.some((s) => Number(s.committedPoints) > 0);
  const [unitPick, setUnit] = useState(null);
  const unit = unitPick || (hasPoints ? 'points' : 'count');
  if (!closed.length) return <Empty text="Velocity appears after your first sprint is completed." />;
  const rows = closed.map((s) => ({
    label: s.name,
    a: Number(unit === 'points' ? s.committedPoints : s.committedCount) || 0,
    b: Number(unit === 'points' ? s.completedPoints : s.completedCount) || 0,
  }));
  const avg = rows.reduce((s, r) => s + r.b, 0) / rows.length;
  const u = unit === 'points' ? 'pts' : 'issues';
  return (
    <div className="pm-report">
      <div className="pm-report-head">
        <div>
          <h2>Velocity</h2>
          <p className="pm-muted">Committed at sprint start vs completed at sprint end, last {rows.length} sprint{rows.length === 1 ? '' : 's'}.</p>
        </div>
        <div className="pm-report-controls"><UnitToggle unit={unit} setUnit={setUnit} /></div>
      </div>
      <div className="pm-stat-row">
        <Stat label="Average completed" value={`${fmtPoints(Math.round(avg * 10) / 10)} ${u}`} />
        <Stat label="Last sprint" value={`${fmtPoints(rows[rows.length - 1].b)} of ${fmtPoints(rows[rows.length - 1].a)} ${u}`} />
      </div>
      <GroupedBars rows={rows} series={[{ key: 'a', name: 'Commitment', color: C1 }, { key: 'b', name: 'Completed', color: C2 }]} unit={u} />
    </div>
  );
}

const WINDOWS = [{ days: 30, label: 'Last 30 days' }, { days: 90, label: 'Last 90 days' }, { days: 180, label: 'Last 6 months' }];

function CreatedResolved({ items }) {
  const [win, setWin] = useState(90);
  const end = todayStr();
  const start = shiftDate(end, -win + 1);
  const step = win > 45 ? 7 : 1;
  const xs = [];
  for (let d = start; d <= end; d = shiftDate(d, step)) xs.push(d);
  if (xs[xs.length - 1] !== end) xs.push(end);
  const created = items.map((it) => (it.createdAt ? String(it.createdAt).slice(0, 10) : null)).filter((d) => d && d >= start);
  const resolved = items.map(resolvedOn).filter((d) => d && d >= start && d <= end);
  const cum = (dates) => xs.map((x) => ({ x, y: dates.filter((d) => d <= x).length }));
  const c = cum(created); const r = cum(resolved);
  return (
    <div className="pm-report">
      <div className="pm-report-head">
        <div>
          <h2>Created vs resolved</h2>
          <p className="pm-muted">Cumulative issues created and resolved (completed or cancelled) over time. A widening gap means the backlog is growing.</p>
        </div>
        <div className="pm-report-controls">
          <div className="pm-seg">{WINDOWS.map((w) => <button type="button" key={w.days} className={win === w.days ? 'is-on' : ''} onClick={() => setWin(w.days)}>{w.label}</button>)}</div>
        </div>
      </div>
      <div className="pm-stat-row">
        <Stat label="Created" value={created.length} />
        <Stat label="Resolved" value={resolved.length} />
        <Stat label="Net change" value={`${created.length - resolved.length >= 0 ? '+' : ''}${created.length - resolved.length}`} />
      </div>
      <LineChart xs={xs} series={[{ name: 'Created', color: C2, points: c }, { name: 'Resolved', color: C1, points: r }]} unit="issues" />
    </div>
  );
}

function Workload({ items }) {
  const [hover, setHover] = useState(null);
  const rows = useMemo(() => {
    const m = new Map();
    for (const it of items) {
      if (isEpic(it)) continue;
      const cat = statusCategory(it.status);
      if (cat === 'done') continue;
      // Each person a task is assigned to carries it in their own workload.
      const who = splitPeople(it.developer);
      for (const k of who.length ? who : ['Unassigned']) {
        if (!m.has(k)) m.set(k, { label: k, todo: 0, inprogress: 0, pts: 0 });
        const r = m.get(k);
        r[cat]++;
        r.pts += points(it);
      }
    }
    return [...m.values()].sort((a, b) => (b.todo + b.inprogress) - (a.todo + a.inprogress)).slice(0, 20);
  }, [items]);
  if (!rows.length) return <Empty text="No open issues match these filters." />;
  const max = Math.max(...rows.map((r) => r.todo + r.inprogress));
  return (
    <div className="pm-report">
      <div className="pm-report-head">
        <div>
          <h2>Workload by assignee</h2>
          <p className="pm-muted">Open issues per person, split by status category. Top {rows.length}.</p>
        </div>
      </div>
      <Legend series={[{ name: CATEGORY_META.inprogress.label, color: CATEGORY_META.inprogress.bar }, { name: CATEGORY_META.todo.label, color: CATEGORY_META.todo.bar }]} />
      <div className="pm-hbars" role="table" aria-label="Workload by assignee">
        {rows.map((r) => (
          <div className="pm-hbar-row" role="row" key={r.label} onMouseEnter={() => setHover(r.label)} onMouseLeave={() => setHover(null)}>
            <span className="pm-hbar-label" role="cell">{r.label}</span>
            <span className="pm-hbar-track" role="cell">
              <span style={{ width: `${(r.inprogress / max) * 100}%`, background: CATEGORY_META.inprogress.bar }} />
              <span style={{ width: `${(r.todo / max) * 100}%`, background: CATEGORY_META.todo.bar }} />
              {hover === r.label && (
                <span className="pm-tip pm-tip-inline">{r.inprogress} in progress · {r.todo} to do{r.pts ? ` · ${fmtPoints(r.pts)} pts` : ''}</span>
              )}
            </span>
            <span className="pm-hbar-value" role="cell">{r.todo + r.inprogress}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return <div className="pm-stat"><span>{label}</span><b>{value}</b></div>;
}
function Empty({ text }) {
  return <div className="pm-empty pm-report-empty">{text}</div>;
}
function Legend({ series }) {
  return (
    <div className="pm-legend">
      {series.map((s) => (
        <span key={s.name}><i style={{ background: s.dash ? 'none' : s.color, borderTop: s.dash ? `2px dashed ${s.color}` : undefined, height: s.dash ? 0 : undefined }} />{s.name}</span>
      ))}
    </div>
  );
}

const W = 760; const H = 280; const PAD = { l: 44, r: 16, t: 14, b: 30 };

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

// Line chart with a crosshair tooltip. X is a list of ISO dates; each series has {x, y} points
// on (a subset of) those dates.
function LineChart({ xs, series, unit }) {
  const [hi, setHi] = useState(null);
  const ymax = niceMax(Math.max(4, ...series.flatMap((s) => s.points.map((p) => p.y))));
  const span = Math.max(1, daysBetween(xs[0], xs[xs.length - 1]));
  const sx = (d) => PAD.l + (daysBetween(xs[0], d) / span) * (W - PAD.l - PAD.r);
  const sy = (v) => PAD.t + (1 - v / ymax) * (H - PAD.t - PAD.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ymax * f);
  const xTicks = xs.filter((_, i) => i % Math.max(1, Math.ceil(xs.length / 7)) === 0);
  const hx = hi != null ? xs[hi] : null;
  return (
    <div className="pm-chart">
      <Legend series={series} />
      <div className="pm-chart-box">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map((s) => s.name).join(' vs ')}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            let best = 0; let bd = Infinity;
            xs.forEach((d, i) => { const dd = Math.abs(sx(d) - px); if (dd < bd) { bd = dd; best = i; } });
            setHi(best);
          }}
          onMouseLeave={() => setHi(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} className="pm-grid-line" />
              <text x={PAD.l - 8} y={sy(t) + 4} className="pm-axis-text" textAnchor="end">{fmtPoints(Math.round(t * 10) / 10)}</text>
            </g>
          ))}
          {xTicks.map((d) => <text key={d} x={sx(d)} y={H - 8} className="pm-axis-text" textAnchor="middle">{fmtDate(d, { withYear: false })}</text>)}
          {series.map((s) => (
            <polyline key={s.name} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash ? '5 5' : undefined} strokeLinejoin="round" strokeLinecap="round"
              points={s.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')} />
          ))}
          {hx && (
            <g>
              <line x1={sx(hx)} x2={sx(hx)} y1={PAD.t} y2={H - PAD.b} className="pm-crosshair" />
              {series.map((s) => {
                const p = s.points.find((q) => q.x === hx);
                return p ? <circle key={s.name} cx={sx(p.x)} cy={sy(p.y)} r="4.5" fill={s.color} stroke="#fff" strokeWidth="2" /> : null;
              })}
            </g>
          )}
        </svg>
        {hx && (
          <div className="pm-tip" style={{ left: `${(sx(hx) / W) * 100}%` }}>
            <b>{fmtDate(hx)}</b>
            {series.map((s) => {
              const p = s.points.find((q) => q.x === hx);
              return p ? <div key={s.name}><i style={{ background: s.color }} />{s.name}: <b>{fmtPoints(Math.round(p.y * 10) / 10)}</b> {unit}</div> : null;
            })}
          </div>
        )}
      </div>
      <details className="pm-table-toggle">
        <summary>Show data table</summary>
        <table className="pm-data-table">
          <thead><tr><th>Date</th>{series.map((s) => <th key={s.name}>{s.name}</th>)}</tr></thead>
          <tbody>
            {xs.map((d) => (
              <tr key={d}><td>{fmtDate(d)}</td>{series.map((s) => { const p = s.points.find((q) => q.x === d); return <td key={s.name}>{p ? fmtPoints(Math.round(p.y * 10) / 10) : '–'}</td>; })}</tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function GroupedBars({ rows, series, unit }) {
  const [hi, setHi] = useState(null);
  const ymax = niceMax(Math.max(4, ...rows.flatMap((r) => series.map((s) => r[s.key]))));
  const plotW = W - PAD.l - PAD.r;
  const groupW = plotW / rows.length;
  const barW = Math.min(28, (groupW - 16) / series.length);
  const sy = (v) => PAD.t + (1 - v / ymax) * (H - PAD.t - PAD.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ymax * f);
  return (
    <div className="pm-chart">
      <Legend series={series} />
      <div className="pm-chart-box">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Velocity chart">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} className="pm-grid-line" />
              <text x={PAD.l - 8} y={sy(t) + 4} className="pm-axis-text" textAnchor="end">{fmtPoints(Math.round(t * 10) / 10)}</text>
            </g>
          ))}
          {rows.map((r, i) => {
            const gx = PAD.l + i * groupW + (groupW - barW * series.length - 2 * (series.length - 1)) / 2;
            return (
              <g key={r.label} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}>
                <rect x={PAD.l + i * groupW} y={PAD.t} width={groupW} height={H - PAD.t - PAD.b} fill="transparent" />
                {series.map((s, j) => {
                  const v = r[s.key];
                  const y = sy(v); const h = H - PAD.b - y;
                  const bx = gx + j * (barW + 2);
                  return h > 0 ? <path key={s.key} fill={s.color} d={`M${bx},${H - PAD.b} V${y + Math.min(4, h)} Q${bx},${y} ${bx + Math.min(4, barW / 2)},${y} H${bx + barW - Math.min(4, barW / 2)} Q${bx + barW},${y} ${bx + barW},${y + Math.min(4, h)} V${H - PAD.b} Z`} /> : null;
                })}
                <text x={PAD.l + i * groupW + groupW / 2} y={H - 8} className="pm-axis-text" textAnchor="middle">{r.label.length > 14 ? `${r.label.slice(0, 13)}…` : r.label}</text>
              </g>
            );
          })}
        </svg>
        {hi != null && (
          <div className="pm-tip" style={{ left: `${((PAD.l + hi * groupW + groupW / 2) / W) * 100}%` }}>
            <b>{rows[hi].label}</b>
            {series.map((s) => <div key={s.key}><i style={{ background: s.color }} />{s.name}: <b>{fmtPoints(rows[hi][s.key])}</b> {unit}</div>)}
          </div>
        )}
      </div>
      <details className="pm-table-toggle">
        <summary>Show data table</summary>
        <table className="pm-data-table">
          <thead><tr><th>Sprint</th>{series.map((s) => <th key={s.key}>{s.name}</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}</td>{series.map((s) => <td key={s.key}>{fmtPoints(r[s.key])}</td>)}</tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}
