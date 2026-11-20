'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMdm } from '@/lib/store';
import { DOMAINS } from '@/lib/tcodes';
import { RequestHeader, listRequests } from '@/lib/mmApi';
import { StatusCode } from '@/lib/types';
import { STATUS, STATUS_CODES } from '@/lib/workflowConfig';
import { ErrorState, LoadingState, StatCards, StatusBadge, requestHref } from '@/components/ui';
import {
  DOMAIN_ICONS, IconArrowRight, IconBox, IconChart, IconCheck, IconClock, IconDraft, IconInbox, IconPlus, IconSparkle,
} from '@/components/icons';

/** Donut colours per status (match the badges) */
const STATUS_COLOR: Record<StatusCode, string> = {
  '00': '#94a3b8', '01': '#3157e8', '02': '#6d8cf5', '03': '#0f8a5f', '04': '#e0a12e', '05': '#d92d20',
};

export default function Overview() {
  const { user, waiting, inbox, sessionState, sessionError, retrySession } = useMdm();
  const [reqs, setReqs] = useState<RequestHeader[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setState('loading');
    listRequests()
      .then((r) => { setReqs(r); setError(''); setState('ready'); })
      .catch((e: Error) => { setError(e.message); setState('error'); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const count = (s: StatusCode) => reqs.filter((r) => r.status === s).length;
  const inProgress = count('01') + count('02');
  const drafts = count('00') + count('04');
  const completed = count('03');
  const myItems = useMemo(() => [...inbox].sort((a, b) => a.startDate.localeCompare(b.startDate)), [inbox]);

  const statusCounts = STATUS_CODES.map((s) => ({ s, n: count(s) }));
  const total = Math.max(1, reqs.length);
  let acc = 0;
  const donut = statusCounts.filter((x) => x.n > 0).map((x) => {
    const from = (acc / total) * 100;
    acc += x.n;
    return `${STATUS_COLOR[x.s]} ${from}% ${(acc / total) * 100}%`;
  }).join(', ');

  // Cycle time of completed requests, from the start and end dates SAP sets
  const done = reqs.filter((r) => r.status === '03' && r.startDate && r.endDate);
  const avgCycle = done.length ? done.reduce((s, r) => s + (new Date(r.endDate).getTime() - new Date(r.startDate).getTime()), 0) / done.length / 86_400_000 : 0;
  const decided = completed + count('05');
  const rejectRate = decided ? Math.round((count('05') / decided) * 100) : 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const material = DOMAINS.find((d) => d.id === 'material')!;
  const planned = DOMAINS.filter((d) => !d.enabled);
  const first = user.name.split(' ')[0];

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow"><IconSparkle size={13} /> Master data governance</p>
          <h1>{greeting}{first ? `, ${first}` : ''}</h1>
          <p className="muted">
            {sessionState === 'error' ? 'SAP is not reachable, so nothing can be shown.'
              : waiting > 0 ? `${waiting} request${waiting > 1 ? 's are' : ' is'} waiting for you.` : 'Your queue is clear.'}
          </p>
        </div>
        <div className="hero-actions">
          {myItems[0] && <Link href={requestHref(myItems[0].transId)} className="btn btn-lg btn-white">Open next work item <IconArrowRight size={16} /></Link>}
          <Link href="/master/material/new" className={`btn btn-lg ${myItems[0] ? 'btn-glass' : 'btn-white'}`}><IconPlus size={16} /> New material request</Link>
        </div>
      </header>

      {sessionState === 'error' && <section className="card"><ErrorState title="Material master is not available" message={sessionError} onRetry={retrySession} /></section>}

      <StatCards
        items={[
          { label: 'Waiting for me', value: waiting, icon: <IconInbox />, tone: 'blue' },
          { label: 'Requested / in progress', value: inProgress, icon: <IconClock />, tone: 'amber' },
          { label: 'Drafts or sent back', value: drafts, icon: <IconDraft />, tone: 'violet' },
          { label: 'Completed', value: completed, icon: <IconBox />, tone: 'green' },
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
              <span><strong>{inProgress}</strong><small>In progress</small></span>
              <span><strong>{drafts}</strong><small>With initiator</small></span>
              <span><strong>{completed}</strong><small>Completed</small></span>
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

          {state === 'loading' && <LoadingState />}
          {state === 'error' && <section className="card"><ErrorState message={error} onRetry={load} /></section>}
          {state === 'ready' && (
            <div className="ov-row">
              <section className="card">
                <div className="block-head"><span className="block-icon"><IconChart size={16} /></span><h3>Requests by status</h3></div>
                <div className="donut-wrap">
                  <span className="donut" style={{ background: reqs.length ? `conic-gradient(${donut})` : '#edf0f6' }} aria-hidden>
                    <span><strong>{reqs.length}</strong><small>requests</small></span>
                  </span>
                  <ul className="legend">
                    {statusCounts.map(({ s, n }) => (
                      <li key={s}><i style={{ background: STATUS_COLOR[s] }} aria-hidden /><span>{STATUS[s].label}</span><strong>{n}</strong></li>
                    ))}
                  </ul>
                </div>
              </section>
              <section className="card">
                <div className="block-head"><span className="block-icon"><IconCheck size={16} /></span><h3>Governance health</h3></div>
                <ul className="health">
                  <li><span className="health-k">Average cycle time</span><strong>{done.length ? `${avgCycle.toFixed(1)} days` : '—'}</strong><small className="muted">start to end, completed requests</small></li>
                  <li><span className="health-k">Rejection rate</span><strong>{decided ? `${rejectRate}%` : '—'}</strong><small className="muted">of completed and rejected requests</small></li>
                </ul>
              </section>
            </div>
          )}
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
                {myItems.slice(0, 5).map((r) => (
                  <li key={r.transId}>
                    <Link href={requestHref(r.transId)}>
                      <span className="mini-text">
                        <strong>{r.description || 'Untitled request'}</strong>
                        <small className="muted"><span className="matno">{r.transId}</span> · {r.appId}</small>
                      </span>
                      <StatusBadge status={r.status} text={r.statusText} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
