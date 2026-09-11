import React, { useEffect, useMemo, useState } from 'react';
import AccountBar from '../shared/AccountBar.jsx';
import { apiList, apiMasterData, getCurrentUserEmail } from '../shared/api.js';
import { areaColorMap } from '../shared/masterData.js';
import { buildRoster, computeConcurrency, remainingDays } from '../shared/roster.js';
import { fmtDate, initialsRoster } from '../shared/utils.js';
import { ROUTES } from '../shared/routes.js';

const AREA_FALLBACK = { color: 'var(--mod-fallback)', softColor: 'var(--mod-fallback-soft)' };
const ROLE_ORDER = ['Developer', 'Functional SPOC'];

function todayLocalMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }

function computeAxis(roster, asOf) {
  let minDate = new Date(asOf);
  minDate.setDate(minDate.getDate() - 30);
  let maxDate = new Date(asOf);
  maxDate.setDate(maxDate.getDate() + 60);
  for (const entry of roster) {
    for (const it of entry.items) {
      if (it.start < minDate) minDate = it.start;
      if (it.end > maxDate) maxDate = it.end;
    }
  }
  const axisStart = startOfMonth(minDate);
  const axisEnd = addMonths(startOfMonth(maxDate), 1); // exclusive end of last month
  const months = [];
  let cursor = new Date(axisStart);
  while (cursor < axisEnd) {
    months.push(new Date(cursor));
    cursor = addMonths(cursor, 1);
  }
  const totalMs = axisEnd - axisStart;
  const pct = (d) => Math.max(0, Math.min(100, ((d - axisStart) / totalMs) * 100));
  return { axisStart, axisEnd, months, pct };
}

export default function ResourceUtilization() {
  const [items, setItems] = useState([]);
  const [masterData, setMasterData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [asOf, setAsOf] = useState(todayLocalMidnight());
  const [flipped, setFlipped] = useState({});
  const [generatedAt] = useState(new Date());
  const email = getCurrentUserEmail();

  useEffect(() => {
    if (!email) {
      window.location.href = '/';
      return;
    }
    Promise.all([apiList(email), apiMasterData(email)])
      .then(([itemRows, mdRows]) => {
        setItems(itemRows || []);
        setMasterData(mdRows || []);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  const areaColors = useMemo(() => areaColorMap(masterData), [masterData]);
  const roster = useMemo(() => buildRoster(items), [items]);
  const withConcurrency = useMemo(() => computeConcurrency(roster, asOf), [roster, asOf]);
  const axis = useMemo(() => computeAxis(roster, asOf), [roster, asOf]);
  const stretchedCount = withConcurrency.filter((r) => r.band.label === 'Stretched').length;

  const groups = ROLE_ORDER.map((role) => ({
    role,
    people: withConcurrency.filter((r) => r.role === role).sort((a, b) => b.concurrent - a.concurrent),
  }));

  function toggleFlip(key) {
    setFlipped((f) => ({ ...f, [key]: !f[key] }));
  }

  if (!email) return null;
  if (loading) return <div className="empty-state">Loading resource data…</div>;
  if (failed) return <div className="empty-state">Couldn't load live data — try refreshing the page.</div>;

  return (
    <div className="ru-stage">
      <AccountBar showSignOut />
      <div className="ru-header">
        <div>
          <a className="back-link" href={ROUTES.home}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            Home
          </a>
          <div className="eyebrow">SAP Change &amp; Development Log</div>
          <h1 className="h1">Resource Timeline</h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Report generated</div>
          <div className="mono" style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>
            {generatedAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, {generatedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="ru-asof" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
            <input type="date" value={toISO(asOf)} onChange={(e) => setAsOf(new Date(e.target.value + 'T00:00:00'))} />
            <button onClick={() => setAsOf(todayLocalMidnight())}>Today</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="axis-header">
          <div className="axis-side">{withConcurrency.length} resources &middot; {stretchedCount} stretched</div>
          <div className="axis-track">
            {axis.months.slice(1).map((m, i) => (
              <div className="month-div" key={i} style={{ left: `${axis.pct(m)}%` }} />
            ))}
            {axis.months.map((m, i) => {
              const next = axis.months[i + 1] || axis.axisEnd;
              const mid = new Date((m.getTime() + next.getTime()) / 2);
              return (
                <span className="axis-month-label" key={i} style={{ left: `${axis.pct(mid)}%` }}>
                  {m.toLocaleDateString('en-US', { month: 'long' })}
                </span>
              );
            })}
            <div className="today-line" style={{ left: `${axis.pct(asOf)}%` }} />
            <span className="today-tag" style={{ left: `${axis.pct(asOf)}%`, top: 26 }}>Today</span>
          </div>
        </div>

        {groups.map((group) => group.people.map((person) => {
          const rowHeight = Math.max(44, 14 + person.items.length * 30);
          const key = `${person.role}::${person.name}`;
          const bandVar = `var(--band-${person.band.cls})`;
          const bandVarSoft = `var(--band-${person.band.cls}-soft)`;
          return (
            <div className="row" key={key}>
              <div className="row-side">
                <div className="avatar mono" style={{ background: (areaColors[person.tag] || AREA_FALLBACK).color }}>{initialsRoster(person.name)}</div>
                <div>
                  <div className="row-name">{person.name}</div>
                  <div className="row-role">{person.role}</div>
                  <span className="band-pill" style={{ background: bandVarSoft, color: bandVar }}>{person.band.label}</span>
                </div>
              </div>
              <div className="row-track" style={{ height: rowHeight }}>
                {axis.months.slice(1).map((m, i) => <div className="month-div" key={i} style={{ left: `${axis.pct(m)}%`, opacity: 0.5 }} />)}
                <div className="today-line" style={{ left: `${axis.pct(asOf)}%`, opacity: 0.4 }} />
                {person.items.length === 0 && (
                  <span style={{ position: 'absolute', left: 12, top: 12, fontSize: 11, color: 'var(--muted)' }}>No active items as of this date</span>
                )}
                {person.items.map((it, idx) => {
                  const left = axis.pct(it.start);
                  const width = Math.max(1.2, axis.pct(it.end) - left);
                  const color = (areaColors[it.area] || AREA_FALLBACK).color;
                  return (
                    <div
                      key={idx}
                      className="bar"
                      style={{
                        left: `${left}%`, width: `${width}%`, top: 8 + idx * 30,
                        background: color,
                        opacity: it.completed ? 0.55 : 1,
                        borderBottom: it.overdue ? '3px solid var(--st-red)' : 'none',
                      }}
                      title={`${it.title} — target ${fmtDate(it.targetLabel)}${it.completed ? ' (completed)' : ''}`}
                    >
                      <span className="bar-label">{it.title}{it.completed ? ' ✓' : ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }))}
      </div>

      <div style={{ marginTop: 16, fontSize: 11, color: 'var(--muted)', lineHeight: 1.7 }}>
        <p style={{ margin: '2px 0' }}>
          Bars span each item's start date through its revised target date; a red bottom edge marks a bar that ended before today without being closed. Faded bars are completed.
        </p>
      </div>
    </div>
  );
}
