'use client';

import { useMemo, useState } from 'react';
import { AgentRow, Count, DashMeta, Overview, fmtAge } from '@/lib/admin/dashApi';

/** What a click on a chart sets as list filter. Pending state is not tied to a creation date, so the list then ignores the date window. */
export interface Focus {
  label: string;
  statusGroup?: 'inprogress' | 'open' | 'broken' | 'stale';
  level?: string; roleType?: string; dept?: string; agent?: string; ageBucket?: string; flag?: string;
}

const ROLE_ORDER: Record<string, number> = { Initiator: 0, Reviewer: 1, Approver: 2 };
const levelNo = (l: string) => { const n = parseInt(/^L(\d+)$/i.exec(l)?.[1] ?? '', 10); return Number.isFinite(n) ? n : 99; };

interface Props { overview: Overview; meta: DashMeta | null; onFocus: (f: Focus) => void }

/** Bar with a recent part (solid) and a stale part (striped, so the difference does not rely on colour) */
function Bar({ fresh, stale, max, showStale }: { fresh: number; stale: number; max: number; showStale: boolean }) {
  const f = max > 0 ? (fresh / max) * 100 : 0;
  const s = showStale && max > 0 ? (stale / max) * 100 : 0;
  return (
    <span className="dd-bar" aria-hidden>
      <i className="dd-bar-fresh" style={{ width: `${f}%` }} />
      {showStale && <i className="dd-bar-stale" style={{ width: `${s}%` }} />}
    </span>
  );
}

/** Funnel: how many requests wait at which level and for which kind of step (reviewer / approver), with the departments below */
export function StageFunnel({ overview, onFocus, appFilter, showStale }: Props & { appFilter: string; showStale: boolean }) {
  const rows = useMemo(() => {
    const m = new Map<string, { level: string; roleType: string; requests: number; fresh: number; stale: number; oldest: number; ageSum: number; agents: number; depts: Map<string, number> }>();
    for (const s of overview.stages) {
      if (appFilter && s.appId !== appFilter) continue;
      const k = `${s.level}|${s.roleType}`;
      const e = m.get(k) ?? { level: s.level, roleType: s.roleType, requests: 0, fresh: 0, stale: 0, oldest: 0, ageSum: 0, agents: 0, depts: new Map() };
      e.requests += s.requests; e.fresh += s.fresh; e.stale += s.stale; e.oldest = Math.max(e.oldest, s.oldestAge);
      e.ageSum += s.avgAge * s.requests; e.agents = Math.max(e.agents, s.agents);
      for (const d of s.depts) e.depts.set(d.dept, (e.depts.get(d.dept) ?? 0) + d.requests);
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => levelNo(a.level) - levelNo(b.level) || (ROLE_ORDER[a.roleType] ?? 9) - (ROLE_ORDER[b.roleType] ?? 9));
  }, [overview.stages, appFilter]);
  const max = Math.max(1, ...rows.map((r) => r.fresh + (showStale ? r.stale : 0)));
  if (!rows.length) return <div className="empty"><p>No request is waiting at any level.</p></div>;
  return (
    <ul className="dd-funnel">
      {rows.map((r) => {
        const lvl = r.level === 'L0' ? 'L0 · Initiator' : r.level === '?' ? 'Level unknown' : r.level;
        return (
          <li key={`${r.level}|${r.roleType}`}>
            <button type="button" className="dd-frow" onClick={() => onFocus({ label: `${lvl} ${r.roleType}`, statusGroup: 'open', level: r.level === '?' ? undefined : r.level, roleType: r.roleType })}
              aria-label={`${lvl}, ${r.roleType}: ${r.requests} requests waiting, ${r.stale} of them stale. Show these requests.`}>
              <span className="dd-flabel"><strong>{lvl}</strong><span className="pill">{r.roleType}</span></span>
              <Bar fresh={r.fresh} stale={r.stale} max={max} showStale={showStale} />
              <span className="dd-fnum">
                <strong>{r.fresh}</strong> recent{r.stale > 0 && <> · <span className="dd-stale-t">{r.stale} stale</span></>}
                <small className="muted"> · oldest {fmtAge(r.oldest)} · {r.agents} agent{r.agents === 1 ? '' : 's'}</small>
              </span>
            </button>
            {r.depts.size > 0 && (
              <div className="dd-depts">
                {[...r.depts.entries()].sort((a, b) => b[1] - a[1]).map(([d, n]) => (
                  <button key={d} type="button" className="dd-dept" onClick={() => onFocus({ label: `${lvl} ${r.roleType} · ${d}`, statusGroup: 'open', level: r.level === '?' ? undefined : r.level, roleType: r.roleType, dept: d.startsWith('(') ? undefined : d })}
                    disabled={d.startsWith('(')} title={d.startsWith('(') ? 'The task of the work item names no department' : `Show ${d} requests`}>
                    {d} <span>{n}</span>
                  </button>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Ranking of the agents holding the most waiting requests */
export function AgentRanking({ overview, onFocus, showStale }: Props & { showStale: boolean }) {
  const [all, setAll] = useState(false);
  const rows: AgentRow[] = [...overview.agents].sort((a, b) => (b.fresh + (showStale ? b.stale : 0)) - (a.fresh + (showStale ? a.stale : 0)) || b.requests - a.requests);
  const shown = all ? rows : rows.slice(0, 10);
  const max = Math.max(1, ...rows.map((r) => r.fresh + (showStale ? r.stale : 0)));
  if (!rows.length) return <div className="empty"><p>No agent has a waiting request.</p></div>;
  return (
    <>
      <ul className="dd-agents">
        {shown.map((a) => (
          <li key={a.agent}>
            <button type="button" className="dd-frow dd-arow" onClick={() => onFocus({ label: `Agent ${a.name || a.agent}`, statusGroup: 'open', agent: a.agent })}
              aria-label={`${a.name || a.agent}: ${a.requests} waiting requests, ${a.stale} stale. Show these requests.`}>
              <span className="dd-flabel"><strong>{a.name || a.agent}</strong><small className="muted">{a.agent} · {a.byApp.map((b) => `${b.appId} ${b.count}`).join(', ')}</small></span>
              <Bar fresh={a.fresh} stale={a.stale} max={max} showStale={showStale} />
              <span className="dd-fnum"><strong>{a.fresh}</strong> recent{a.stale > 0 && <> · <span className="dd-stale-t">{a.stale} stale</span></>}<small className="muted"> · oldest {fmtAge(a.oldestAge)}</small></span>
            </button>
          </li>
        ))}
      </ul>
      {rows.length > 10 && <div className="dd-more"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll((v) => !v)}>{all ? 'Show top 10' : `Show all ${rows.length} agents${overview.agentCount > rows.length ? ` (of ${overview.agentCount})` : ''}`}</button></div>}
    </>
  );
}

/** Aging of the waiting requests; stale (over the stale limit) is a separate group so it does not drown the recent picture */
export function AgingStrip({ overview, meta, appFilter, onFocus }: Props & { appFilter: string }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of overview.aging) if (!appFilter || a.appId === appFilter) m.set(a.bucket, (m.get(a.bucket) ?? 0) + a.requests);
    return m;
  }, [overview.aging, appFilter]);
  const buckets = meta?.buckets ?? [];
  const recent = buckets.filter((b) => !b.stale), stale = buckets.filter((b) => b.stale);
  const maxRecent = Math.max(1, ...recent.map((b) => counts.get(b.code) ?? 0));
  const maxStale = Math.max(1, ...stale.map((b) => counts.get(b.code) ?? 0));
  const group = (list: typeof buckets, max: number, isStale: boolean) => (
    <ul className="dd-aging">
      {list.map((b) => {
        const n = counts.get(b.code) ?? 0;
        return (
          <li key={b.code}>
            <button type="button" className="dd-frow dd-grow" disabled={n === 0} onClick={() => onFocus({ label: b.label, statusGroup: 'open', ageBucket: b.code })} aria-label={`${b.label}: ${n} requests. Show these requests.`}>
              <span className="dd-flabel">{b.label}</span>
              <Bar fresh={isStale ? 0 : n} stale={isStale ? n : 0} max={max} showStale={isStale} />
              <span className="dd-fnum"><strong>{n}</strong></span>
            </button>
          </li>
        );
      })}
    </ul>
  );
  if (!buckets.length) return null;
  return (
    <div className="dd-aging-wrap">
      <h4 className="dd-sub">Waiting up to {meta?.staleDays ?? 90} days</h4>
      {group(recent, maxRecent, false)}
      <h4 className="dd-sub dd-sub-stale">Stale: waiting more than {meta?.staleDays ?? 90} days</h4>
      {group(stale, maxStale, true)}
    </div>
  );
}

/** Status and workflow disagree: reported only. Nothing here repairs a request. */
export function BrokenList({ flags, onFocus }: { flags: Count[]; onFocus: (f: Focus) => void }) {
  if (!flags.length) return <div className="empty"><p>No request has a status that disagrees with its workflow.</p></div>;
  return (
    <ul className="dd-broken">
      {flags.map((f) => (
        <li key={f.code}>
          <button type="button" className="dd-frow dd-brow" onClick={() => onFocus({ label: f.label, flag: f.code })} aria-label={`${f.label}: ${f.count} requests. Show these requests.`}>
            <span className="dd-flabel"><span className="dd-warn-ic" aria-hidden>!</span>{f.label}</span>
            <span className="dd-fnum"><strong>{f.count}</strong></span>
          </button>
        </li>
      ))}
    </ul>
  );
}
