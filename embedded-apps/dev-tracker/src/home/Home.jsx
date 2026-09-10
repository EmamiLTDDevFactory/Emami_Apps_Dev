import React, { useEffect, useMemo, useRef, useState } from 'react';
import AccountBar from '../shared/AccountBar.jsx';
import { apiList, apiMasterData, apiActivity, apiAiCommand, apiMe, getCurrentUserEmail, isDevTrackerAdmin } from '../shared/api.js';
import { groupMasterData, activeValues, areaColorMap } from '../shared/masterData.js';
import { isOverdue, statusProgress, relativeTime, initialsHome, hexToRgba } from '../shared/utils.js';
import { STATUS_COLOR_HOME, KANBAN_COLUMNS, PULSE_WINDOWS } from '../shared/constants.js';
import { buildRoster, computeConcurrency } from '../shared/roster.js';
import { ROUTES } from '../shared/routes.js';

const AREA_FALLBACK = { color: 'var(--mod-fallback)', softColor: 'var(--mod-fallback-soft)' };

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function Home() {
  const [items, setItems] = useState([]);
  const [masterData, setMasterData] = useState([]);
  const [activity, setActivity] = useState([]);
  const [isAdmin, setIsAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [command, setCommand] = useState('');
  const [commandResponse, setCommandResponse] = useState(null);
  const [pulseIdx, setPulseIdx] = useState(0);
  const [pulsePaused, setPulsePaused] = useState(false);
  const [profileName, setProfileName] = useState(null);
  const now = useClock();
  const email = getCurrentUserEmail();

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiList(), apiMasterData(), apiActivity()])
      .then(([itemRows, mdRows, activityRows]) => {
        if (cancelled) return;
        setItems(itemRows || []);
        setMasterData(mdRows || []);
        setActivity(activityRows || []);
      })
      .finally(() => !cancelled && setLoading(false));
    isDevTrackerAdmin(email).then((ok) => !cancelled && setIsAdmin(ok));
    // Resolve the real hub profile name for the hero greeting, matching the original's
    // resolveCurrentUserName() — falls back to an email-derived name if this fails.
    apiMe(email).then((data) => {
      if (!cancelled && data?.success && data.profile?.name) setProfileName(data.profile.name);
    });
    return () => {
      cancelled = true;
    };
  }, [email]);

  // Pulse window auto-rotation, matches home.js: every 10s, paused on hover.
  useEffect(() => {
    if (pulsePaused) return;
    const id = setInterval(() => setPulseIdx((i) => (i + 1) % PULSE_WINDOWS.length), 10000);
    return () => clearInterval(id);
  }, [pulsePaused]);

  const areas = useMemo(() => activeValues(masterData, 'area'), [masterData]);
  const areaColors = useMemo(() => areaColorMap(masterData), [masterData]);
  const activeCategoryCount = useMemo(() => new Set((masterData || []).map((r) => r.category)).size, [masterData]);
  const activeValueCount = useMemo(() => (masterData || []).filter((r) => r.active).length, [masterData]);

  const activeItems = useMemo(() => items.filter((i) => !['Completed', 'Cancelled'].includes(i.status)), [items]);
  const overdueItems = useMemo(() => items.filter(isOverdue), [items]);

  const statusDist = useMemo(() => {
    const counts = {};
    for (const it of items) counts[it.status] = (counts[it.status] || 0) + 1;
    return Object.entries(counts)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }, [items]);
  const totalForDist = items.length || 1;

  const modulePulse = useMemo(() => {
    const win = PULSE_WINDOWS[pulseIdx];
    const cutoff = win.days == null ? null : Date.now() - win.days * 86400000;
    return areas.map((area) => {
      const areaItems = items.filter((it) => it.area === area && (!cutoff || new Date(it.createdAt).getTime() >= cutoff));
      const total = areaItems.length;
      const closed = areaItems.filter((it) => it.status === 'Completed').length;
      const held = areaItems.filter((it) => it.status === 'On Hold' || it.status === 'Cancelled').length;
      const color = areaColors[area]?.color || AREA_FALLBACK.color;
      const pct = total ? Math.round((closed / total) * 100) : 0;
      const heldPct = total ? Math.round((held / total) * 100) : 0;
      // Matches the original: whatever's left after closed/held is "active" (in progress but
      // not yet done) — drawn as a faded fill of the module's own color, so a module with real,
      // in-flight items still shows *something* instead of looking identical to an empty one.
      const activePct = total ? Math.max(0, 100 - pct - heldPct) : 0;
      return { area, pct, heldPct, activePct, color };
    });
  }, [areas, items, areaColors, pulseIdx]);

  const roster = useMemo(() => computeConcurrency(buildRoster(items), new Date(new Date().toDateString())), [items]);
  const stretchedCount = roster.filter((r) => r.band.label === 'Stretched').length;

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

  async function handleCommand() {
    const message = command.trim();
    if (!message) return;
    setCommandResponse({ text: 'Thinking…' });
    try {
      const data = await apiAiCommand(message);
      if (data.intent === 'filter') {
        const f = data.filters || {};
        const params = new URLSearchParams();
        if (f.area) params.set('aiArea', f.area);
        if (f.status) params.set('aiStatus', f.status);
        if (f.priority) params.set('aiPriority', f.priority);
        if (f.overdueOnly) params.set('aiOverdue', '1');
        if (f.search) params.set('aiSearch', f.search);
        window.location.href = `${ROUTES.dashboard}${params.toString() ? '?' + params.toString() : ''}`;
      } else if (data.intent === 'create_draft') {
        sessionStorage.setItem('aiPendingDraft', JSON.stringify(data.draft || {}));
        window.location.href = `${ROUTES.dashboard}?action=new`;
      } else {
        setCommandResponse({ text: data.text || "I didn't quite catch that." });
      }
    } catch (e) {
      setCommandResponse({ text: e.message || 'Something went wrong.' });
    }
  }

  const hour = now.getHours();
  const greeting = hour < 5 || hour >= 21 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const emailFirstName = (email || '').split('@')[0].split('.')[0];
  const displayFirstName = profileName
    ? profileName.split(' ')[0]
    : emailFirstName
      ? emailFirstName[0].toUpperCase() + emailFirstName.slice(1)
      : 'there';

  return (
    <div>
      <AccountBar showSignOut />
      <div className="home-content">
        <div className="home-hero">
          <div className="home-hero-blob-a" />
          <div className="home-hero-blob-b" />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 40, flexWrap: 'wrap' }}>
            <div>
              <div className="eyebrow">SAP Change &amp; Development Log</div>
              <h1 className="hero-h1">{greeting}, {displayFirstName}.</h1>
              <p style={{ fontSize: 14.5, color: 'var(--text-2)', marginTop: 10, maxWidth: 520, lineHeight: 1.6 }}>
                {loading ? 'Loading your board…' : `${activeItems.length} of ${items.length} initiatives are in flight across ${areas.length} SAP modules — ${overdueItems.length} need attention today.`}
              </p>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)' }}>
                {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                {now.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
          </div>
        </div>

        <div className="command-bar" style={{ marginBottom: 22 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCommand()}
            placeholder='Ask anything — "show overdue FI-AR items", "how many completed?", "create an SD item for vendor sync due next month"'
          />
          <button className="btn btn-primary" onClick={handleCommand} style={{ border: 'none' }}>Quick Ask</button>
        </div>
        {commandResponse && (
          <div className="command-response" style={{ marginTop: -12, marginBottom: 22 }}>
            <span>{commandResponse.text}</span>
            <button onClick={() => setCommandResponse(null)}>Dismiss</button>
          </div>
        )}

        <div className="bento">
          <a className="bcard" href={ROUTES.dashboard}
            style={{ gridColumn: '1/3', gridRow: '1/3', background: 'linear-gradient(155deg, oklch(97% 0.014 264), oklch(95% 0.022 270))', border: '1px solid oklch(85% 0.03 265)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <h2 className="bcard-title">Dashboard</h2>
                <div className="bcard-desc">The full board — status, charts, and every item</div>
              </div>
              <Arrow />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, flex: 1, minWidth: 0 }}>
              {kanbanPreview.map((col) => (
                <div key={col.key} style={{ minWidth: 0 }}>
                  <div className="mini-colhead"><span className="mini-dot" style={{ background: col.dot }} />{col.name}</div>
                  {col.sample.length === 0 && <div style={{ fontSize: 10, color: 'var(--muted)' }}>—</div>}
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

          <div className="bcard bcard-plain" style={{ gridColumn: '3/5', gridRow: '1/2', justifyContent: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9 }}>
              <span className="bcard-title-sm">Status distribution</span>
              <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{items.length} items</span>
            </div>
            <div className="dist-track">
              {statusDist.map(({ status, count }) => (
                <div key={status} className="dist-seg" style={{ width: `${(count / totalForDist) * 100}%`, background: (STATUS_COLOR_HOME[status] || {}).fg || 'var(--st-gray)' }} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 9 }}>
              {statusDist.slice(0, 4).map(({ status, count }) => (
                <div className="legend-row" key={status}>
                  <span className="dot" style={{ background: (STATUS_COLOR_HOME[status] || {}).fg || 'var(--st-gray)' }} />{status} {count}
                </div>
              ))}
            </div>
          </div>

          {isAdmin && (
            <a className="bcard bcard-plain" href={ROUTES.admin} style={{ gridColumn: '3/4', gridRow: '2/3' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <h2 className="bcard-title-sm">Master Data</h2>
                  <div className="bcard-desc">{activeCategoryCount} categories · {activeValueCount} values</div>
                </div>
                <Arrow small />
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                {areas.slice(0, 6).map((area) => (
                  <span key={area} style={{ width: 18, height: 18, borderRadius: '50%', background: (areaColors[area] || AREA_FALLBACK).color }} />
                ))}
              </div>
            </a>
          )}

          <a className="bcard bcard-plain" href={ROUTES.resourceUtilization} style={{ gridColumn: isAdmin ? '4/5' : '3/5', gridRow: '2/3' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <h2 className="bcard-title-sm">Resources</h2>
                <div className="bcard-desc">{roster.length} people · {stretchedCount} stretched</div>
              </div>
              <Arrow small />
            </div>
            <div style={{ position: 'relative', height: 18, marginTop: 'auto' }}>
              <div style={{ position: 'absolute', top: 6, left: 0, right: 0, height: 6, borderRadius: 99, background: 'linear-gradient(90deg, var(--st-gray-soft), var(--st-blue), var(--st-red))' }} />
              {roster.slice(0, 3).map((r, i) => (
                <div key={r.name} style={{ position: 'absolute', top: 0, left: `${10 + r.spectrumFrac * 80}%`, width: 14, height: 14, borderRadius: '50%', background: r.band.label === 'Stretched' ? 'var(--st-red)' : r.band.label === 'Idle' ? 'var(--st-gray)' : 'var(--st-blue)', border: '2px solid var(--surface)' }} />
              ))}
            </div>
          </a>

          <div className="bcard" style={{ gridColumn: '1/2', gridRow: '3/5', background: 'linear-gradient(155deg, oklch(96% 0.02 25), oklch(97% 0.01 25))', border: '1px solid oklch(88% 0.03 25)', justifyContent: 'space-between' }}>
            <span className="bcard-title-sm">Needs attention</span>
            <NeedsAttentionRing overdue={overdueItems.length} activeCount={activeItems.length || 1} />
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>
              of {activeItems.length} active items — {activeItems.length ? Math.round((overdueItems.length / activeItems.length) * 100) : 0}%
            </span>
          </div>

          <div className="bcard bcard-plain" style={{ gridColumn: '2/4', gridRow: '3/5' }}
            onMouseEnter={() => setPulsePaused(true)} onMouseLeave={() => setPulsePaused(false)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span className="bcard-title-sm">Module pulse</span>
              <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{PULSE_WINDOWS[pulseIdx].label}</span>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              {modulePulse.map((m) => (
                <div className="pulse-row" key={m.area}>
                  <span className="pulse-name"><span className="dot" style={{ background: m.color, marginRight: 5 }} />{m.area}</span>
                  <div className="pulse-track">
                    <div style={{ width: `${m.pct}%`, background: m.color }} />
                    <div style={{ width: `${m.heldPct}%`, background: '#c7ccd6' }} />
                    <div style={{ width: `${m.activePct}%`, background: hexToRgba(m.color, 0.28) }} />
                  </div>
                  <span className="pulse-pct">{m.pct}%</span>
                </div>
              ))}
              {!modulePulse.length && <div style={{ fontSize: 11, color: 'var(--muted)' }}>No module activity yet.</div>}
            </div>
          </div>

          <div className="bcard bcard-plain" style={{ gridColumn: '4/5', gridRow: '3/5' }}>
            <span className="bcard-title-sm" style={{ marginBottom: 4 }}>Recent activity</span>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              {activity.slice(0, 3).map((a, i) => (
                <div className="activity-row" key={i}>
                  <div className="avatar mono" style={{ background: 'var(--accent)', width: 22, height: 22, fontSize: 9 }}>{initialsHome(a.changedByUsername)}</div>
                  <div className="activity-text">
                    <b>{a.changedByUsername || 'Someone'}</b> updated {a.field} on {a.devList}
                    <div className="activity-time">{relativeTime(a.changedAt)}</div>
                  </div>
                </div>
              ))}
              {!activity.length && <div style={{ fontSize: 11, color: 'var(--muted)' }}>No recent activity.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Arrow({ small }) {
  const size = small ? 15 : 17;
  return (
    <svg className="bcard-arrow" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function NeedsAttentionRing({ overdue, activeCount }) {
  const r = 45;
  const circumference = 2 * Math.PI * r;
  const frac = Math.min(1, overdue / activeCount);
  const dash = frac * circumference;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', margin: '6px 0' }}>
      <svg width="108" height="108" viewBox="0 0 108 108">
        <circle cx="54" cy="54" r={r} fill="none" stroke="oklch(100% 0 0 / 0.5)" strokeWidth="9" />
        <circle cx="54" cy="54" r={r} fill="none" stroke="var(--st-red)" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`} transform="rotate(-90 54 54)" />
      </svg>
      <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span className="mono" style={{ fontSize: 32, fontWeight: 700, color: 'var(--st-red)', lineHeight: 1 }}>{overdue}</span>
        <span style={{ fontSize: 9.5, color: 'var(--muted)', marginTop: 2 }}>overdue</span>
      </div>
    </div>
  );
}
