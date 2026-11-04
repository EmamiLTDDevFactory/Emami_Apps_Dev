'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useMdm } from '@/lib/store';
import { DOMAINS } from '@/lib/tcodes';
import { waitingFor } from '@/lib/service';
import { StatusCode } from '@/lib/types';
import { LEVELS, STATUS } from '@/lib/workflowConfig';
import { fmtAgo } from '@/lib/format';
import { ActivityFeed, StatCards, StatusBadge } from '@/components/ui';
import {
  DOMAIN_ICONS, IconArrowRight, IconBox, IconChart, IconCheck, IconClock, IconDraft, IconFlow, IconInbox, IconPlus, IconSparkle,
} from '@/components/icons';

/** Donut colours per status (match the badges) */
const STATUS_COLOR: Record<StatusCode, string> = {
  '00': '#94a3b8', '01': '#3157e8', '02': '#e0a12e', '03': '#d92d20', '04': '#6d3fd8', '05': '#0f8a5f',
};

const DAY = 86_400_000;

export default function Overview() {
  const { db, waiting, user } = useMdm();
  const reqs = db.requests;
  const inApproval = reqs.filter((r) => r.status === '01' || r.status === '04').length;
  const drafts = reqs.filter((r) => r.status === '00' || r.status === '02').length;
  const myItems = useMemo(() => waitingFor(db, user).sort((a, b) => a.changedOn.localeCompare(b.changedOn)), [db, user]);
  const isInit = user.level === null;

  // Status mix for the donut
  const statusCounts = (Object.keys(STATUS) as StatusCode[]).map((s) => ({ s, n: reqs.filter((r) => r.status === s).length }));
  const total = Math.max(1, reqs.length);
  let acc = 0;
  const donut = statusCounts
    .filter((x) => x.n > 0)
    .map((x) => {
      const from = (acc / total) * 100;
      acc += x.n;
      return `${STATUS_COLOR[x.s]} ${from}% ${(acc / total) * 100}%`;
    })
    .join(', ');

  // Governance health
  const posted = reqs.filter((r) => r.status === '05');
  const avgCycle = posted.length
    ? posted.reduce((sum, r) => sum + (new Date(r.changedOn).getTime() - new Date(r.history[0]?.at ?? r.createdOn).getTime()), 0) / posted.length / DAY
    : 0;
  const decided = reqs.filter((r) => r.status === '05' || r.status === '03').length;
  const rejectRate = decided ? Math.round((reqs.filter((r) => r.status === '03').length / decided) * 100) : 0;
  const open = reqs.filter((r) => r.status === '01' || r.status === '04');
  const oldest = [...open].sort((a, b) => a.changedOn.localeCompare(b.changedOn))[0];
  const busiest = LEVELS.map((l) => ({ l, n: open.filter((r) => r.level === l.level).length })).sort((a, b) => b.n - a.n)[0];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const material = DOMAINS.find((d) => d.id === 'material')!;
  const planned = DOMAINS.filter((d) => !d.enabled);

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow"><IconSparkle size={13} /> Master data governance</p>
          <h1>{greeting}, {user.name.split(' ')[0]}</h1>
          <p className="muted">
            {waiting > 0
              ? `${waiting} request${waiting > 1 ? 's are' : ' is'} waiting for you. ${inApproval} material request${inApproval === 1 ? ' is' : 's are'} moving through approval.`
              : `Your queue is clear. ${inApproval} material request${inApproval === 1 ? ' is' : 's are'} moving through approval.`}
          </p>
        </div>
        <div className="hero-actions">
          {myItems[0] && (
            <Link href={`/master/material/requests/view?id=${encodeURIComponent(myItems[0].transId)}`} className="btn btn-lg btn-white">Open next work item <IconArrowRight size={16} /></Link>
          )}
          {isInit ? (
            <Link href="/master/material/new" className={`btn btn-lg ${myItems[0] ? 'btn-glass' : 'btn-white'}`}><IconPlus size={16} /> New material request</Link>
          ) : (
            <Link href="/master/material" className={`btn btn-lg ${myItems[0] ? 'btn-glass' : 'btn-white'}`}>Open Material Master <IconArrowRight size={16} /></Link>
          )}
        </div>
      </header>

      <StatCards
        items={[
          { label: 'Waiting for me', value: waiting, icon: <IconInbox />, tone: 'blue' },
          { label: 'Requests in approval', value: inApproval, icon: <IconClock />, tone: 'amber' },
          { label: 'Drafts or sent back', value: drafts, icon: <IconDraft />, tone: 'violet' },
          { label: 'Materials posted', value: db.materials.length, icon: <IconBox />, tone: 'green' },
        ]}
      />

      <div className="home-grid">
        <div className="home-main">
          <h2 className="section-title section-title-first">Master data objects</h2>

          <Link href="/master/material" className="feature-tile">
            <span className="feature-left">
              <span className="tile-top">
                <span className="tile-icon tile-icon-lg"><IconBox size={24} /></span>
                <span className="tile-code">{material.tcode}</span>
                <span className="pill pill-ok"><i className="live-dot" aria-hidden /> Live</span>
              </span>
              <span className="feature-title">{material.label}</span>
              <span className="tile-desc">{material.description}</span>
              <span className="tile-foot">Open workflow <IconArrowRight size={14} /></span>
            </span>
            <span className="feature-stats">
              <span><strong>{inApproval}</strong><small>In approval</small></span>
              <span><strong>{drafts}</strong><small>With initiator</small></span>
              <span><strong>{db.materials.length}</strong><small>Posted</small></span>
              <span className="feature-levels" aria-label="Open requests per level">
                {LEVELS.map((l) => {
                  const n = open.filter((r) => r.level === l.level).length;
                  return (
                    <span key={l.level} className="fl" title={`L${l.level} ${l.team}: ${n}`}>
                      <span className="fl-bar"><span style={{ height: `${Math.min(100, n * 34 + (n ? 12 : 0))}%` }} /></span>
                      <small>L{l.level}</small>
                    </span>
                  );
                })}
              </span>
            </span>
          </Link>

          <div className="tiles tiles-compact">
            {planned.map((d) => {
              const Icon = DOMAIN_ICONS[d.id] ?? IconBox;
              return (
                <Link key={d.id} href={`/master/${d.id}`} className="tile tile-off">
                  <span className="tile-top">
                    <span className="tile-icon"><Icon size={20} /></span>
                    <span className="tile-code">{d.tcode}</span>
                  </span>
                  <span className="tile-title">{d.label}</span>
                  <span className="tile-desc">{d.description}</span>
                  <span className="tile-foot"><span className="pill">Planned</span></span>
                </Link>
              );
            })}
          </div>

          <div className="ov-row">
            <section className="card">
              <div className="block-head"><span className="block-icon"><IconChart size={16} /></span><h3>Requests by status</h3></div>
              <div className="donut-wrap">
                <span className="donut" style={{ background: reqs.length ? `conic-gradient(${donut})` : '#edf0f6' }} aria-hidden>
                  <span><strong>{reqs.length}</strong><small>requests</small></span>
                </span>
                <ul className="legend">
                  {statusCounts.map(({ s, n }) => (
                    <li key={s}>
                      <i style={{ background: STATUS_COLOR[s] }} aria-hidden />
                      <span>{STATUS[s].label}</span>
                      <strong>{n}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="card">
              <div className="block-head"><span className="block-icon"><IconFlow size={16} /></span><h3>Governance health</h3></div>
              <ul className="health">
                <li>
                  <span className="health-k">Average cycle time</span>
                  <strong>{posted.length ? `${avgCycle.toFixed(1)} days` : '—'}</strong>
                  <small className="muted">submit to posting</small>
                </li>
                <li>
                  <span className="health-k">Rejection rate</span>
                  <strong>{rejectRate}%</strong>
                  <small className="muted">of decided requests</small>
                </li>
                <li>
                  <span className="health-k">Busiest level</span>
                  <strong>{busiest && busiest.n > 0 ? `L${busiest.l.level} ${busiest.l.team}` : '—'}</strong>
                  <small className="muted">{busiest && busiest.n > 0 ? `${busiest.n} open` : 'no open requests'}</small>
                </li>
                <li>
                  <span className="health-k">Oldest open request</span>
                  <strong>{oldest ? fmtAgo(oldest.changedOn) : '—'}</strong>
                  <small className="muted">{oldest ? oldest.data.description : 'nothing open'}</small>
                </li>
              </ul>
            </section>
          </div>
        </div>

        <aside className="home-side">
          <section className="card">
            <div className="block-head">
              <span className="block-icon"><IconInbox size={16} /></span><h3>My work</h3>
              {myItems.length > 0 && <span className="count-chip">{myItems.length}</span>}
            </div>
            {myItems.length === 0 ? (
              <div className="mini-empty"><span className="empty-icon empty-ok" aria-hidden><IconCheck size={18} /></span><span><strong>All caught up</strong><br /><small className="muted">Nothing is waiting for you.</small></span></div>
            ) : (
              <ul className="mini-tasks">
                {myItems.slice(0, 4).map((r) => (
                  <li key={r.transId}>
                    <Link href={`/master/material/requests/view?id=${encodeURIComponent(r.transId)}`}>
                      <span className="mini-text">
                        <strong>{r.data.description}</strong>
                        <small className="muted"><span className="matno">{r.transId}</span> · {fmtAgo(r.changedOn)}</small>
                      </span>
                      <StatusBadge status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="block-head"><span className="block-icon"><IconClock size={16} /></span><h3>Recent activity</h3></div>
            <ActivityFeed requests={reqs} limit={6} />
          </section>
        </aside>
      </div>
    </div>
  );
}
