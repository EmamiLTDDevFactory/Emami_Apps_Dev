import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from '../shared/Sidebar.jsx';
import Topbar from '../shared/Topbar.jsx';
import { apiList, apiMasterData, apiActivity, apiMe, apiAccessMe, getCurrentUserEmail } from '../shared/api.js';
import { activeValues, areaColorMap } from '../shared/masterData.js';
import { isOverdue, relativeTime, initialsHome, revisedTarget, daysBetween, todayStr, fmtDate } from '../shared/utils.js';
import { KANBAN_COLUMNS, DIST_WINDOWS } from '../shared/constants.js';
import { buildRoster, computeConcurrency } from '../shared/roster.js';
import { ROUTES } from '../shared/routes.js';
import { BoardIcon, UsersIcon, BarChartIcon, PieChartIcon, ArrowRightIcon, AlertIcon, LayersIcon, CheckCircleIcon, ClockIcon, TrendUpIcon, TrendDownIcon } from '../shared/icons.jsx';

const AREA_FALLBACK = { color: 'var(--mod-fallback)', softColor: 'var(--mod-fallback-soft)' };
const DAY_MS = 86400000;

// Status buckets for the "Assignment Status" donut — an item lands in Overdue first
// (regardless of its raw status) since that's the thing worth calling out, then falls
// through to whichever stage bucket its actual status belongs to.
const STATUS_BUCKETS = [
  { key: 'overdue', label: 'Overdue', color: 'var(--st-red)', test: (it) => isOverdue(it) },
  { key: 'discussion', label: 'Discussion', color: 'var(--st-indigo)', test: (it) => ['Not Started', 'Requirement Discussion', 'FS Preparation'].includes(it.status) },
  { key: 'development', label: 'In Development', color: 'var(--st-blue)', test: (it) => it.status === 'In Progress' },
  { key: 'testing', label: 'QA / Testing', color: 'var(--st-teal)', test: (it) => ['IT Testing', 'User Testing'].includes(it.status) },
  { key: 'completed', label: 'Completed', color: 'var(--st-green)', test: (it) => it.status === 'Completed' },
  { key: 'other', label: 'Other', color: 'var(--st-gray)', test: () => true },
];

function distWindowCutoff(win) {
  if (win.days == null && !win.special) return null;
  const d = new Date();
  if (win.special === 'month') { d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); }
  if (win.special === 'today') { d.setHours(0, 0, 0, 0); return d.getTime(); }
  return Date.now() - win.days * DAY_MS;
}

// A month-over-month delta computed from data we actually have: how many of the items
// currently in this bucket already existed a month ago (by createdAt) vs the bucket's
// current size. Real numbers, not a fabricated trend — see Home's KpiTile usage.
function trendVsLastMonth(bucket, cutoffMs) {
  const past = bucket.filter((it) => it.createdAt && new Date(it.createdAt).getTime() <= cutoffMs).length;
  const current = bucket.length;
  if (past === 0) return current > 0 ? { pct: 100, up: true } : null;
  const diff = current - past;
  if (diff === 0) return null;
  return { pct: Math.round((Math.abs(diff) / past) * 100), up: diff > 0 };
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// Notification read/clear state has no backend of its own — the notifications themselves
// are computed fresh from real activity + item data every load (see myNotifications
// below), but which ones a person has seen/dismissed is tracked as two id sets in
// localStorage. IDs, not a timestamp cutoff, because a due-date reminder has no natural
// "changed at" to compare against — it's keyed to the item+target date instead.
function loadNotifState(email) {
  try {
    const raw = JSON.parse(localStorage.getItem(`devtracker_notif_${email}`));
    return { read: new Set(raw?.read || []), cleared: new Set(raw?.cleared || []) };
  } catch {
    return { read: new Set(), cleared: new Set() };
  }
}
function saveNotifState(email, state) {
  try {
    const cap = (set) => [...set].slice(-300); // don't grow the stored list forever
    localStorage.setItem(`devtracker_notif_${email}`, JSON.stringify({ read: cap(state.read), cleared: cap(state.cleared) }));
  } catch {
    /* ignore */
  }
}

export default function Home() {
  const [items, setItems] = useState([]);
  const [masterData, setMasterData] = useState([]);
  const [activity, setActivity] = useState([]);
  const [isAdmin, setIsAdmin] = useState(null);
  const [roleLabel, setRoleLabel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [distWindowIdx, setDistWindowIdx] = useState(0);
  const [profileName, setProfileName] = useState(null);
  const [notifState, setNotifState] = useState({ read: new Set(), cleared: new Set() });
  const now = useClock();
  const email = getCurrentUserEmail();

  useEffect(() => {
    if (!email) window.location.href = '/';
  }, [email]);

  useEffect(() => {
    if (!email) return;
    setNotifState(loadNotifState(email));
    let cancelled = false;
    Promise.all([apiList(email), apiMasterData(email), apiActivity(email)])
      .then(([itemRows, mdRows, activityRows]) => {
        if (cancelled) return;
        setItems(itemRows || []);
        setMasterData(mdRows || []);
        setActivity(activityRows || []);
      })
      .finally(() => !cancelled && setLoading(false));
    // Dev Tracker's per-app role from the hub's access API — "Admin" gates the sidebar's
    // Admin section; whatever the string actually is also shows under the name in the
    // Topbar (real data, not a fabricated title).
    apiAccessMe(email).then((data) => {
      if (cancelled) return;
      const role = data?.success ? data.apps?.find((a) => a.appId === 'dev-tracker')?.role : null;
      setIsAdmin(role === 'Admin');
      setRoleLabel(role || null);
    });
    // Resolve the real hub profile name for the Topbar's identity strip, matching the
    // original's resolveCurrentUserName() — falls back to the raw email if this fails.
    apiMe(email).then((data) => {
      if (!cancelled && data?.success && data.profile?.name) setProfileName(data.profile.name);
    });
    return () => {
      cancelled = true;
    };
  }, [email]);

  const areas = useMemo(() => activeValues(masterData, 'area'), [masterData]);
  const areaColors = useMemo(() => areaColorMap(masterData), [masterData]);

  const activeItems = useMemo(() => items.filter((i) => !['Completed', 'Cancelled'].includes(i.status)), [items]);
  const overdueItems = useMemo(() => items.filter(isOverdue), [items]);

  const oneMonthAgoMs = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.getTime();
  }, []);
  const totalTrend = useMemo(() => trendVsLastMonth(items, oneMonthAgoMs), [items, oneMonthAgoMs]);
  const activeTrend = useMemo(() => trendVsLastMonth(activeItems, oneMonthAgoMs), [activeItems, oneMonthAgoMs]);
  const overdueTrend = useMemo(() => trendVsLastMonth(overdueItems, oneMonthAgoMs), [overdueItems, oneMonthAgoMs]);

  const roster = useMemo(() => computeConcurrency(buildRoster(items), new Date(new Date().toDateString())), [items]);
  const stretchedCount = roster.filter((r) => r.band.label === 'Stretched').length;
  // Roster entries have no createdAt of their own (they're derived from concurrent items),
  // so this re-runs the same roster math with `asOf` set to a month ago instead of reusing
  // trendVsLastMonth — a direct count comparison, same real data either way.
  const stretchedTrend = useMemo(() => {
    const past = computeConcurrency(buildRoster(items), new Date(oneMonthAgoMs)).filter((r) => r.band.label === 'Stretched').length;
    if (past === stretchedCount) return null;
    const diff = stretchedCount - past;
    return { pct: past === 0 ? 100 : Math.round((Math.abs(diff) / past) * 100), up: diff > 0 };
  }, [items, stretchedCount, oneMonthAgoMs]);

  const statusBuckets = useMemo(() => {
    const rows = STATUS_BUCKETS.map((b) => ({ ...b, count: 0 }));
    for (const it of items) {
      const bucket = rows.find((b) => b.test(it));
      if (bucket) bucket.count += 1;
    }
    return rows.filter((b) => b.count > 0);
  }, [items]);
  const statusPctBase = items.length || 1;

  const moduleDistribution = useMemo(() => {
    const cutoff = distWindowCutoff(DIST_WINDOWS[distWindowIdx]);
    const scoped = cutoff == null ? items : items.filter((it) => it.createdAt && new Date(it.createdAt).getTime() >= cutoff);
    const rows = areas.map((area) => ({
      area,
      count: scoped.filter((it) => it.area === area).length,
      color: areaColors[area]?.color || AREA_FALLBACK.color,
    }));
    const max = Math.max(1, ...rows.map((r) => r.count));
    return rows.map((r) => ({ ...r, pct: Math.round((r.count / max) * 100) }));
  }, [areas, items, areaColors, distWindowIdx]);

  const kanbanPreview = useMemo(() => {
    // Looked up by key, not array index — KANBAN_COLUMNS' shape/order can change (e.g. the
    // Testing column split out from In Development) without silently breaking this preview.
    const previewKeys = ['discussion', 'development', 'completed'];
    const previewCols = previewKeys.map((key) => KANBAN_COLUMNS.find((c) => c.key === key)).filter(Boolean);
    return previewCols.map((col) => ({
      ...col,
      sample: items.filter((it) => col.statuses.includes(it.status)).slice(0, 2),
    }));
  }, [items]);

  // Personal notifications, two kinds, both real data — nothing fabricated:
  //  1. Someone ELSE changed something on one of my assignments (self-changes excluded —
  //     you don't need to be told about your own edit).
  //  2. One of my active assignments has its revised target date within the next 2 days
  //     (or already today) — a due-date reminder, not tied to any activity log entry.
  const myNotifications = useMemo(() => {
    if (!profileName) return [];
    const norm = (s) => (s || '').trim().toLowerCase();
    const myItems = items.filter((it) => norm(it.developer) === norm(profileName));
    const myTitles = new Set(myItems.map((it) => it.devList));

    const changesByOthers = activity
      .filter((a) => myTitles.has(a.devList) && norm(a.changedByUsername) !== norm(profileName))
      .map((a) => ({
        id: `activity-${a.changedAt}-${a.field}-${a.devList}`,
        text: `${a.changedByUsername || 'Someone'} updated ${a.field} on ${a.devList}`,
        time: a.changedAt,
        meta: relativeTime(a.changedAt),
      }));

    const today = todayStr();
    const dueSoon = myItems
      .filter((it) => !['Completed', 'Cancelled'].includes(it.status))
      .map((it) => {
        const rt = revisedTarget(it);
        if (!rt) return null;
        const daysLeft = daysBetween(today, rt);
        if (daysLeft < 0 || daysLeft > 2) return null;
        const when = daysLeft === 0 ? 'due today' : daysLeft === 1 ? 'due tomorrow' : `due in ${daysLeft} days`;
        return {
          id: `due-${it.id}-${rt}`,
          text: `${it.devList} is ${when}`,
          time: it.updatedAt || it.createdAt || new Date().toISOString(),
          meta: `Target ${fmtDate(rt, { withYear: false })}`,
        };
      })
      .filter(Boolean);

    return [...dueSoon, ...changesByOthers].sort((a, b) => new Date(b.time) - new Date(a.time));
  }, [activity, items, profileName]);

  const visibleNotifications = useMemo(
    () => myNotifications.filter((n) => !notifState.cleared.has(n.id)).map((n) => ({ ...n, unread: !notifState.read.has(n.id) })),
    [myNotifications, notifState]
  );

  function markAllNotificationsRead() {
    const read = new Set(notifState.read);
    visibleNotifications.forEach((n) => read.add(n.id));
    const next = { read, cleared: notifState.cleared };
    setNotifState(next);
    saveNotifState(email, next);
  }
  function clearNotifications() {
    const cleared = new Set(notifState.cleared);
    visibleNotifications.forEach((n) => cleared.add(n.id));
    const next = { read: notifState.read, cleared };
    setNotifState(next);
    saveNotifState(email, next);
  }

  if (!email) return null;

  return (
    <div className="app-shell">
      <Sidebar active="home" isAdmin={isAdmin} email={email} name={profileName} identityInTopbar />
      <main className="shell-main">
        <Topbar
          email={email}
          name={profileName}
          roleLabel={roleLabel}
          notifications={visibleNotifications}
          onMarkAllRead={markAllNotificationsRead}
          onClear={clearNotifications}
        />

        <div className="home-header-row">
          <div>
            <h1 className="home-title">Delivery Overview</h1>
            <p className="home-header-sub">
              {loading ? 'Loading your board…' : `${activeItems.length} of ${items.length} initiatives are in flight across ${areas.length} SAP modules — ${overdueItems.length} need attention today.`}
            </p>
          </div>
          <div className="home-clock">
            <div className="mono home-clock-time">{now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
            <div className="home-clock-date">{now.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}</div>
          </div>
        </div>

        <div className="kpi-row">
          <KpiTile icon={LayersIcon} tone="accent" label="Total initiatives" value={items.length} trend={totalTrend} />
          <KpiTile icon={CheckCircleIcon} tone="blue" label="Active" value={activeItems.length} trend={activeTrend} />
          <KpiTile icon={AlertIcon} tone="red" label="Overdue" value={overdueItems.length} trend={overdueTrend} invertTrend />
          <KpiTile icon={UsersIcon} tone="amber" label="Stretched people" value={stretchedCount} trend={stretchedTrend} invertTrend />
        </div>

        <div className="major-grid">
          <a className="major-tile tone-accent" href={ROUTES.dashboard}>
            <MajorTileHead icon={BoardIcon} tone="accent" title="Dashboard" desc="Status, timeline, every item" />
            <div className="major-tile-body kanban-preview">
              {kanbanPreview.map((col) => (
                <div key={col.key} className="kanban-preview-col">
                  <div className="mini-colhead"><span className="mini-dot" style={{ background: col.dot }} />{col.name}</div>
                  {col.sample.length === 0 && <div className="major-tile-empty">—</div>}
                  {col.sample.map((it) => (
                    <div className="mini-card" key={it.id}>
                      <div className="mini-card-title">{it.devList}</div>
                      <span className="mini-chip" style={{ background: (areaColors[it.area] || AREA_FALLBACK).softColor, color: (areaColors[it.area] || AREA_FALLBACK).color }}>{it.area}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </a>

          <a className="major-tile tone-teal" href={ROUTES.resourceUtilization}>
            <MajorTileHead icon={UsersIcon} tone="teal" title="Resource Utilization" desc={`${roster.length} people · ${stretchedCount} stretched`} />
            <div className="major-tile-body">
              <div className="ru-spectrum-track">
                {roster.slice(0, 8).map((r) => (
                  <span
                    key={`${r.role}::${r.name}`}
                    className="ru-spectrum-dot"
                    style={{ left: `${8 + r.spectrumFrac * 84}%`, background: r.band.label === 'Stretched' ? 'var(--st-red)' : r.band.label === 'Idle' ? 'var(--st-gray)' : 'var(--st-blue)' }}
                    title={`${r.name} — ${r.band.label}`}
                  />
                ))}
              </div>
              <div className="ru-spectrum-labels"><span>Idle</span><span>Balanced</span><span>Stretched</span></div>
              <div className="ru-top-people">
                {roster.slice(0, 3).map((r) => (
                  <div className="ru-person-row" key={`${r.role}::${r.name}`}>
                    <span className="dot" style={{ background: r.band.label === 'Stretched' ? 'var(--st-red)' : 'var(--st-blue)' }} />
                    <span className="ru-person-name">{r.name}</span>
                    <span className="ru-person-band">{r.concurrent} active</span>
                  </div>
                ))}
              </div>
            </div>
          </a>

          <div className="major-tile major-tile-static tone-gray">
            <MajorTileHead icon={PieChartIcon} tone="gray" title="Assignment Status" desc={`${items.length} total`} noArrow />
            <div className="major-tile-body assignment-status-body">
              <StatusDonut buckets={statusBuckets} total={items.length} />
              <div className="status-legend">
                {statusBuckets.map((b) => (
                  <div className="status-legend-row" key={b.key}>
                    <span className="dot" style={{ background: b.color }} />
                    <span className="status-legend-label">{b.label}</span>
                    <span className="status-legend-count mono">{b.count}</span>
                    <span className="status-legend-pct">{Math.round((b.count / statusPctBase) * 100)}%</span>
                  </div>
                ))}
                {!statusBuckets.length && <div className="major-tile-empty">No items yet.</div>}
              </div>
            </div>
          </div>
        </div>

        <div className="widget-grid">
          <div className="widget-card">
            <div className="widget-col-head">
              <div className="widget-icon tone-amber"><BarChartIcon size={14} /></div>
              <span className="widget-title">Module-wise distribution</span>
              <select className="widget-select" value={distWindowIdx} onChange={(e) => setDistWindowIdx(Number(e.target.value))}>
                {DIST_WINDOWS.map((w, i) => <option key={w.label} value={i}>{w.label}</option>)}
              </select>
            </div>
            <div className="widget-body-fill">
              <div className="dist-chart">
                {moduleDistribution.map((m) => (
                  <div className="dist-bar-col" key={m.area} title={`${m.area}: ${m.count}`}>
                    <span className="dist-bar-count mono">{m.count}</span>
                    <div className="dist-bar-track"><div className="dist-bar-fill" style={{ height: `${m.pct}%`, background: m.color }} /></div>
                    <span className="dist-bar-label">{m.area}</span>
                  </div>
                ))}
              </div>
              {!moduleDistribution.length && <div className="major-tile-empty">No module data yet.</div>}
            </div>
          </div>

          <div className="widget-card">
            <div className="widget-col-head">
              <div className="widget-icon tone-red"><AlertIcon size={14} /></div>
              <span className="widget-title">Needs attention</span>
            </div>
            <NeedsAttentionRing overdue={overdueItems.length} activeCount={activeItems.length || 1} />
            <span className="widget-foot">
              of {activeItems.length} active items — {activeItems.length ? Math.round((overdueItems.length / activeItems.length) * 100) : 0}%
            </span>
          </div>

          <div className="widget-card">
            <div className="widget-col-head">
              <div className="widget-icon tone-teal"><ClockIcon size={14} /></div>
              <span className="widget-title">Recent activity</span>
            </div>
            <div className="widget-body-fill activity-scroll">
              {activity.slice(0, 10).map((a, i) => (
                <div className="activity-row" key={i}>
                  <div className="avatar mono" style={{ background: 'var(--accent)', width: 22, height: 22, fontSize: 9 }}>{initialsHome(a.changedByUsername)}</div>
                  <div className="activity-text">
                    <b>{a.changedByUsername || 'Someone'}</b> updated {a.field} on {a.devList}
                    <div className="activity-time">{relativeTime(a.changedAt)}</div>
                  </div>
                </div>
              ))}
              {!activity.length && <div className="major-tile-empty">No recent activity.</div>}
            </div>
          </div>
        </div>

        <div className="home-footer">Emami Apps · Dev Tracker</div>
      </main>
    </div>
  );
}

function MajorTileHead({ icon: IconComp, title, desc, tone, noArrow }) {
  return (
    <div className="major-tile-head">
      <div className={`major-tile-icon tone-${tone}`}><IconComp size={18} /></div>
      <div className="major-tile-heading">
        <h2 className="major-tile-title">{title}</h2>
        <div className="major-tile-desc">{desc}</div>
      </div>
      {!noArrow && <ArrowRightIcon size={16} className="major-tile-arrow" />}
    </div>
  );
}

function KpiTile({ icon: IconComp, tone, label, value, trend, invertTrend }) {
  // For Overdue/Stretched, "up" is bad news — flip which arrow/color reads as good.
  const goodDirection = trend && (invertTrend ? !trend.up : trend.up);
  return (
    <div className={`kpi-tile tone-${tone}`}>
      <div className="kpi-tile-icon"><IconComp size={16} /></div>
      <div>
        <div className="kpi-tile-value mono">{value}</div>
        <div className="kpi-tile-label">{label}</div>
        {trend && (
          <div className={`kpi-tile-trend ${goodDirection ? 'is-good' : 'is-bad'}`}>
            {trend.up ? <TrendUpIcon size={11} /> : <TrendDownIcon size={11} />}
            {trend.pct}% vs last month
          </div>
        )}
      </div>
    </div>
  );
}

function StatusDonut({ buckets, total }) {
  const r = 40;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="status-donut">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="var(--bg-alt)" strokeWidth="12" />
        {buckets.map((b) => {
          const frac = b.count / total;
          const dash = frac * circumference;
          const seg = (
            <circle
              key={b.key}
              cx="48" cy="48" r={r} fill="none" stroke={b.color} strokeWidth="12"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 48 48)"
            />
          );
          offset += dash;
          return seg;
        })}
      </svg>
      <div className="status-donut-center">
        <span className="mono status-donut-total">{total}</span>
        <span className="status-donut-label">Total</span>
      </div>
    </div>
  );
}

function NeedsAttentionRing({ overdue, activeCount }) {
  const r = 45;
  const circumference = 2 * Math.PI * r;
  const frac = Math.min(1, overdue / activeCount);
  const dash = frac * circumference;
  return (
    <div className="needs-attention-ring">
      <svg width="108" height="108" viewBox="0 0 108 108">
        <circle cx="54" cy="54" r={r} fill="none" stroke="var(--bg-alt)" strokeWidth="9" />
        <circle cx="54" cy="54" r={r} fill="none" stroke="var(--st-red)" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`} transform="rotate(-90 54 54)" />
      </svg>
      <div className="needs-attention-ring-center">
        <span className="mono needs-attention-count">{overdue}</span>
        <span className="needs-attention-label">overdue</span>
      </div>
    </div>
  );
}
