import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from '../shared/Sidebar.jsx';
import Topbar from '../shared/Topbar.jsx';
import { apiList, apiMasterData, apiActivity, getCurrentUserEmail } from '../shared/api.js';
import { useDevTrackerSession } from '../shared/useDevTrackerSession.js';
import { useNotifications } from '../shared/useNotifications.js';
import { LANDSCAPES, activeValues, areaColorMap, areaGroupMap, areasByLandscape, landscapeOf } from '../shared/masterData.js';
import { isOverdue, relativeTime, initialsHome, revisedTarget, daysBetween, daysSinceUpdate, riskLevel, todayStr } from '../shared/utils.js';
import { DIST_WINDOWS, RISK_META } from '../shared/constants.js';
import { ROUTES } from '../shared/routes.js';
import { BoardIcon, UsersIcon, BarChartIcon, PieChartIcon, ArrowRightIcon, AlertIcon, LayersIcon, CheckCircleIcon, ClockIcon, PlayIcon, TrendUpIcon, TrendDownIcon } from '../shared/icons.jsx';

const AREA_FALLBACK = { color: 'var(--mod-fallback)', softColor: 'var(--mod-fallback-soft)' };
const DAY_MS = 86400000;

// Status buckets for the "Assignment Status" donut — an item lands in Overdue first
// (regardless of its raw status) since that's the thing worth calling out, then falls
// through to whichever stage bucket its actual status belongs to. Hypercare/On Hold/
// Cancelled get their own buckets (amber, and a dark red for Cancelled so it stays distinct
// from Overdue's red) instead of collapsing into one opaque "Other" — the trailing catch-all
// stays only as a safety net for a future custom status value added via master data.
const STATUS_BUCKETS = [
  { key: 'overdue', label: 'Overdue', color: 'var(--st-red)', test: (it) => isOverdue(it) },
  { key: 'discussion', label: 'Discussion', color: 'var(--st-indigo)', test: (it) => ['Not Started', 'Requirement Discussion', 'FS Preparation'].includes(it.status) },
  { key: 'development', label: 'In Development', color: 'var(--st-blue)', test: (it) => it.status === 'In Progress' },
  { key: 'testing', label: 'QA / Testing', color: 'var(--st-teal)', test: (it) => ['IT Testing', 'User Testing'].includes(it.status) },
  { key: 'completed', label: 'Completed', color: 'var(--st-green)', test: (it) => it.status === 'Completed' },
  { key: 'hypercare', label: 'Hypercare', color: 'var(--st-amber)', test: (it) => it.status === 'Hypercare' },
  { key: 'onHold', label: 'On Hold', color: 'var(--st-amber)', test: (it) => it.status === 'On Hold' },
  { key: 'cancelled', label: 'Cancelled', color: '#7F1D1D', test: (it) => it.status === 'Cancelled' },
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
// current size. Real numbers, not a fabricated trend — see Home's KpiCard usage.
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

// Every KPI card is a link into the Dashboard filtered to the same rows it counted. Without
// this the cards all landed on an unfiltered board, so clicking "Overdue: 37" showed all 414
// items and the number had to be taken on trust.
const drillTo = (preset) => `${ROUTES.dashboard}?preset=${preset}`;

export default function Home() {
  const [items, setItems] = useState([]);
  const [masterData, setMasterData] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [distWindowIdx, setDistWindowIdx] = useState(0);
  const [statusWindowIdx, setStatusWindowIdx] = useState(0);
  const now = useClock();
  const email = getCurrentUserEmail();
  const { isAdmin, roleLabel, profileName } = useDevTrackerSession(email);
  const { visibleNotifications, markAllRead, clear } = useNotifications(email, items, activity, profileName);

  useEffect(() => {
    if (!email) window.location.href = '/';
  }, [email]);

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    Promise.all([apiList(email), apiMasterData(email), apiActivity(email)])
      .then(([itemRows, mdRows, activityRows]) => {
        if (cancelled) return;
        setItems(itemRows || []);
        setMasterData(mdRows || []);
        setActivity(activityRows || []);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [email]);

  const areas = useMemo(() => activeValues(masterData, 'area'), [masterData]);
  const areaColors = useMemo(() => areaColorMap(masterData), [masterData]);
  const areaGroupOf = useMemo(() => areaGroupMap(masterData), [masterData]);
  const [distLandscape, setDistLandscape] = useState(''); // '' = all, or 'SAP' / 'Non-SAP'

  const activeItems = useMemo(() => items.filter((i) => !['Completed', 'Cancelled'].includes(i.status)), [items]);
  const overdueItems = useMemo(() => items.filter(isOverdue), [items]);
  const completedItems = useMemo(() => items.filter((i) => i.status === 'Completed'), [items]);

  const oneMonthAgoMs = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.getTime();
  }, []);
  const totalTrend = useMemo(() => trendVsLastMonth(items, oneMonthAgoMs), [items, oneMonthAgoMs]);
  const activeTrend = useMemo(() => trendVsLastMonth(activeItems, oneMonthAgoMs), [activeItems, oneMonthAgoMs]);
  const overdueTrend = useMemo(() => trendVsLastMonth(overdueItems, oneMonthAgoMs), [overdueItems, oneMonthAgoMs]);
  const completedTrend = useMemo(() => trendVsLastMonth(completedItems, oneMonthAgoMs), [completedItems, oneMonthAgoMs]);

  // Assignment Status supports the same rolling time-window filter as Module-wise
  // distribution below, scoped by createdAt just like that chart.
  const statusScoped = useMemo(() => {
    const cutoff = distWindowCutoff(DIST_WINDOWS[statusWindowIdx]);
    return cutoff == null ? items : items.filter((it) => it.createdAt && new Date(it.createdAt).getTime() >= cutoff);
  }, [items, statusWindowIdx]);
  const statusBuckets = useMemo(() => {
    const rows = STATUS_BUCKETS.map((b) => ({ ...b, count: 0 }));
    for (const it of statusScoped) {
      const bucket = rows.find((b) => b.test(it));
      if (bucket) bucket.count += 1;
    }
    return rows.filter((b) => b.count > 0);
  }, [statusScoped]);
  const statusPctBase = statusScoped.length || 1;

  const moduleDistribution = useMemo(() => {
    const cutoff = distWindowCutoff(DIST_WINDOWS[distWindowIdx]);
    const scoped = cutoff == null ? items : items.filter((it) => it.createdAt && new Date(it.createdAt).getTime() >= cutoff);
    // SAP modules first, then Non-SAP (Master Data › Area groups); optionally only one landscape.
    const ordered = areasByLandscape(areas, areaGroupOf).flatMap(([, list]) => list).filter((a) => !distLandscape || landscapeOf(a, areaGroupOf) === distLandscape);
    const rows = ordered.map((area) => ({
      area,
      landscape: landscapeOf(area, areaGroupOf),
      count: scoped.filter((it) => it.area === area).length,
      color: areaColors[area]?.color || AREA_FALLBACK.color,
    }));
    const max = Math.max(1, ...rows.map((r) => r.count));
    return rows.map((r) => ({ ...r, pct: Math.round((r.count / max) * 100) }));
  }, [areas, items, areaColors, distWindowIdx, areaGroupOf, distLandscape]);

  // Needs-attention rows — every active item that isn't cleanly on-track, ranked worst
  // first: overdue (by how many days), then stalled (no field change in a while), then
  // due-soon. Same riskLevel()/RISK_META already used by Dashboard, so the label/color and
  // the day count are both real and consistent with what that page would show for the item.
  const attentionItems = useMemo(() => {
    const today = todayStr();
    const rows = [];
    for (const it of activeItems) {
      const level = riskLevel(it);
      if (level === 'onTrack' || level === 'done') continue;
      const meta = RISK_META[level];
      const rt = revisedTarget(it);
      const diff = rt ? daysBetween(today, rt) : null;
      let daysLabel = '';
      let sortKey = 0;
      if (level === 'critical') {
        const overdueBy = diff != null ? Math.abs(diff) : 0;
        daysLabel = `${overdueBy} day${overdueBy === 1 ? '' : 's'} overdue`;
        sortKey = 3000 + overdueBy;
      } else if (level === 'stalled') {
        const stale = daysSinceUpdate(it) || 0;
        daysLabel = `${stale} day${stale === 1 ? '' : 's'} idle`;
        sortKey = 2000 + stale;
      } else if (level === 'atRisk' && diff != null) {
        daysLabel = diff === 0 ? 'due today' : diff === 1 ? 'due tomorrow' : `due in ${diff} days`;
        sortKey = 1000 - diff;
      }
      rows.push({ id: it.id, title: it.devList, area: it.area, meta, daysLabel, sortKey });
    }
    return rows.sort((a, b) => b.sortKey - a.sortKey);
  }, [activeItems]);

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
          onMarkAllRead={markAllRead}
          onClear={clear}
        />

        <div className="home-header-row">
          <div>
            <h1 className="home-title">CR Tracker</h1>
            <p className="home-header-sub">Complete visibility. Better control. On-time delivery.</p>
          </div>
          <div className="home-clock">
            <span>{now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span>
            <span className="home-clock-sep">|</span>
            <span>{now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>

        <div className="kpi-row">
          <KpiCard icon={LayersIcon} tone="blue" label="Total Assignments" value={loading ? '—' : items.length} trend={totalTrend} href={ROUTES.dashboard} />
          <KpiCard icon={PlayIcon} tone="green" label="Active" value={loading ? '—' : activeItems.length} trend={activeTrend} href={drillTo('active')} />
          <KpiCard icon={CheckCircleIcon} tone="purple" label="Completed" value={loading ? '—' : completedItems.length} trend={completedTrend} href={drillTo('completed')} />
          <KpiCard icon={AlertIcon} tone="red" label="Overdue" value={loading ? '—' : overdueItems.length} trend={overdueTrend} invertTrend href={drillTo('overdue')} />
        </div>

        <div className="major-grid">
          <a className="hero-tile tone-blue" href={ROUTES.dashboard}>
            <BoardIcon size={88} className="hero-watermark" />
            <div className="hero-icon"><BoardIcon size={16} /></div>
            <h2 className="hero-title">Dashboard</h2>
            <p className="hero-desc">View and manage your assignments in detail</p>
            <span className="hero-cta"><span className="hero-cta-arrow"><ArrowRightIcon size={11} /></span>Go to Dashboard</span>
          </a>

          <a className="hero-tile tone-teal" href={ROUTES.resourceUtilization}>
            <UsersIcon size={88} className="hero-watermark" />
            <div className="hero-icon"><UsersIcon size={16} /></div>
            <h2 className="hero-title">Resource Utilization</h2>
            <p className="hero-desc">Track team workload and availability</p>
            <span className="hero-cta"><span className="hero-cta-arrow"><ArrowRightIcon size={11} /></span>View Resource Utilization</span>
          </a>

          <div className="status-tile">
            <div className="status-tile-head">
              <div className="status-tile-icon"><PieChartIcon size={17} /></div>
              <h2 className="status-tile-title">Assignment Status</h2>
              <select className="widget-select" value={statusWindowIdx} onChange={(e) => setStatusWindowIdx(Number(e.target.value))}>
                {DIST_WINDOWS.map((w, i) => <option key={w.label} value={i}>{w.label}</option>)}
              </select>
            </div>
            <div className="status-tile-body">
              <StatusDonut buckets={statusBuckets} total={statusScoped.length} size={110} />
              <div className="status-legend">
                {statusBuckets.map((b) => (
                  <div className="status-legend-row" key={b.key}>
                    <span className="dot" style={{ background: b.color }} />
                    <span className="status-legend-label">{b.label}</span>
                    <span className="status-legend-count">{b.count}</span>
                    <span className="status-legend-pct">({Math.round((b.count / statusPctBase) * 100)}%)</span>
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
              <select className="widget-select" value={distLandscape} onChange={(e) => setDistLandscape(e.target.value)} aria-label="Landscape">
                <option value="">SAP + Non-SAP</option>
                {LANDSCAPES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <select className="widget-select" value={distWindowIdx} onChange={(e) => setDistWindowIdx(Number(e.target.value))}>
                {DIST_WINDOWS.map((w, i) => <option key={w.label} value={i}>{w.label}</option>)}
              </select>
            </div>
            <div className="widget-body-fill">
              <div className="dist-chart">
                {moduleDistribution.map((m) => (
                  <div className="dist-bar-col" key={m.area} title={`${m.area} (${m.landscape}): ${m.count}`}>
                    <span className="dist-bar-count">{m.count}</span>
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
            <div className="attention-list">
              {attentionItems.map((row) => (
                <div className="attention-row" key={row.id}>
                  <div className="attention-icon" style={{ background: row.meta.soft, color: row.meta.color }}><AlertIcon size={13} /></div>
                  <div className="attention-main">
                    <div className="attention-title">{row.title}</div>
                    <div className="attention-sub">{row.area}</div>
                  </div>
                  <div className="attention-side">
                    <span className="attention-pill" style={{ background: row.meta.soft, color: row.meta.color }}>{row.meta.label}</span>
                    <span className="attention-days">{row.daysLabel}</span>
                  </div>
                </div>
              ))}
              {!attentionItems.length && <div className="major-tile-empty">Nothing needs attention right now.</div>}
            </div>
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
                  <div className="activity-text"><b>{a.changedByUsername || 'Someone'}</b> updated {a.field} on {a.devList}</div>
                  <div className="activity-time">{relativeTime(a.changedAt)}</div>
                </div>
              ))}
              {!activity.length && <div className="major-tile-empty">No recent activity.</div>}
            </div>
          </div>
        </div>

        <div className="home-footer">
          <span>Emami Apps | Dev Tracker</span>
          <span className="home-footer-tagline">Build | Automate | Deliver | A Brighter Tomorrow</span>
        </div>
      </main>
    </div>
  );
}

function KpiCard({ icon: IconComp, tone, label, value, trend, invertTrend, href }) {
  // For Overdue, "up" is bad news — flip which arrow/color reads as good.
  const goodDirection = trend && (invertTrend ? !trend.up : trend.up);
  return (
    <a className={`kpi-card tone-${tone}`} href={href}>
      <div className="kpi-card-top">
        <div className="kpi-card-icon"><IconComp size={19} /></div>
        <span className="kpi-card-corner"><ArrowRightIcon size={12} /></span>
      </div>
      <div className="kpi-card-label">{label}</div>
      <div className="kpi-card-value">{value}</div>
      <div className="kpi-card-foot">
        {trend ? (
          <span className={`kpi-card-trend ${goodDirection ? 'is-good' : 'is-bad'}`}>
            {trend.up ? <TrendUpIcon size={11} /> : <TrendDownIcon size={11} />}
            {trend.pct}% <span className="kpi-card-trend-sub">vs last month</span>
          </span>
        ) : <span className="kpi-card-trend-sub">vs last month</span>}
        <Sparkline up={trend ? trend.up : true} />
      </div>
    </a>
  );
}

function Sparkline({ up }) {
  const points = up ? '2,20 8,16 14,18 20,11 26,13 32,6 38,8' : '2,6 8,10 14,8 20,14 26,12 32,18 38,15';
  return (
    <svg className="kpi-sparkline" width="40" height="22" viewBox="0 0 40 22" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatusDonut({ buckets, total, size = 74 }) {
  const stroke = Math.round(size * 0.13);
  const r = size / 2 - stroke / 2 - 1;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="status-donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--bg-alt)" strokeWidth={stroke} />
        {buckets.map((b) => {
          const frac = b.count / total;
          const dash = frac * circumference;
          const seg = (
            <circle
              key={b.key}
              cx={c} cy={c} r={r} fill="none" stroke={b.color} strokeWidth={stroke}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${c} ${c})`}
            />
          );
          offset += dash;
          return seg;
        })}
      </svg>
      <div className="status-donut-center">
        <span className="status-donut-total" style={{ fontSize: Math.round(size * 0.22) }}>{total}</span>
        <span className="status-donut-label">Total</span>
      </div>
    </div>
  );
}
