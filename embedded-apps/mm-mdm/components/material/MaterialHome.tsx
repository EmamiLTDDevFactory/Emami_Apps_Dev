'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMdm } from '@/lib/store';
import { RequestHeader, listRequests } from '@/lib/mmApi';
import { STATUS, STATUS_CODES, appLabel } from '@/lib/workflowConfig';
import { StatusCode } from '@/lib/types';
import { ErrorState, LoadingState, RequestTable, StatCards, StatusBadge, requestHref } from '../ui';
import { IconArrowRight, IconBox, IconCheck, IconClock, IconDraft, IconFlow, IconInbox, IconPlus, IconSearch, IconSparkle, IconUndo } from '../icons';

const byStarted = (a: RequestHeader, b: RequestHeader) => b.startDate.localeCompare(a.startDate) || b.transId.localeCompare(a.transId);

/** Home: what waits for me (SAP's inbox) and the requests I raised, both read live from SAP */
export default function MaterialHome() {
  const { user, sessionState, sessionError, retrySession, inbox, inboxState, inboxError, refreshInbox } = useMdm();
  const [mine, setMine] = useState<RequestHeader[]>([]);
  const [mineState, setMineState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [mineError, setMineError] = useState('');
  const [filter, setFilter] = useState<'all' | StatusCode>('all');

  const loadMine = useCallback(() => {
    setMineState('loading');
    listRequests({ scope: 'mine' })
      .then((rows) => { setMine(rows); setMineError(''); setMineState('ready'); })
      .catch((e: Error) => { setMineError(e.message); setMineState('error'); });
  }, []);
  useEffect(() => { loadMine(); }, [loadMine]);

  const waiting = useMemo(() => [...inbox].sort(byStarted), [inbox]);
  const mineSorted = useMemo(() => [...mine].sort(byStarted), [mine]);
  const count = (s: StatusCode) => mine.filter((r) => r.status === s).length;
  const shown = filter === 'all' ? mineSorted : mineSorted.filter((r) => r.status === filter);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const next = waiting[0];
  const first = user.name.split(' ')[0];

  if (sessionState === 'error') {
    return <section className="card"><ErrorState title="Material master is not available" message={sessionError} onRetry={retrySession} /></section>;
  }

  return (
    <>
      <section className="home-banner">
        <div className="home-banner-text">
          <p className="eyebrow"><IconSparkle size={13} /> {user.department || 'Material master'}</p>
          <h2>{greeting}{first ? `, ${first}` : ''}</h2>
          <p>
            {inboxState === 'error'
              ? 'The inbox could not be read from SAP.'
              : waiting.length === 0
                ? 'Nothing is waiting for your action. Start a new request or pick a posted material to change or extend.'
                : `${waiting.length} request${waiting.length > 1 ? 's are' : ' is'} waiting for your action.`}
          </p>
        </div>
        <div className="home-banner-actions">
          {next && (
            <Link href={requestHref(next.transId)} className="btn btn-lg btn-white">
              Open next work item <IconArrowRight size={16} />
            </Link>
          )}
          <Link href="/master/material/new" className={`btn btn-lg ${next ? 'btn-glass' : 'btn-white'}`}>
            <IconPlus size={16} /> New material request
          </Link>
        </div>
      </section>

      <StatCards
        items={[
          { label: 'Waiting for me', value: waiting.length, icon: <IconInbox />, tone: 'blue' as const },
          { label: 'My drafts', value: count('00'), icon: <IconDraft />, tone: 'violet' as const },
          { label: 'Requested / in progress', value: count('01') + count('02'), icon: <IconClock />, tone: 'amber' as const },
          { label: 'Sent back to me', value: count('04'), icon: <IconUndo />, tone: 'amber' as const },
          { label: 'Completed', value: count('03'), icon: <IconCheck />, tone: 'green' as const },
        ]}
      />

      <div className="home-grid home-grid-single">
        <div className="home-main">
          <section className="card card-flush">
            <div className="card-bar">
              <div className="block-head"><span className="block-icon"><IconInbox size={16} /></span><h3>Waiting for me</h3>{waiting.length > 0 && <span className="count-chip">{waiting.length}</span>}</div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void refreshInbox()}>Refresh</button>
            </div>
            {inboxState === 'loading' && <LoadingState />}
            {inboxState === 'error' && <ErrorState message={inboxError} onRetry={() => void refreshInbox()} />}
            {inboxState === 'ready' && waiting.length === 0 && (
              <div className="empty">
                <span className="empty-icon empty-ok" aria-hidden><IconCheck size={22} /></span>
                <p><strong>All caught up.</strong><br /><span className="muted">New work items for you appear here.</span></p>
              </div>
            )}
            {inboxState === 'ready' && waiting.length > 0 && (
              <ul className="tasks">
                {waiting.map((r) => (
                  <li key={r.transId}>
                    <Link href={requestHref(r.transId)} className="task">
                      <span className="task-icon tone-blue" aria-hidden><IconBox size={18} /></span>
                      <span className="task-text">
                        <span className="task-top">
                          <strong>{r.description || 'Untitled request'}</strong>
                          <StatusBadge status={r.status} text={r.statusText} />
                        </span>
                        <span className="task-meta">
                          <span className="matno">{r.transId}</span>
                          <span>·</span>
                          <span>{r.appId} · {appLabel(r.appId)}</span>
                          {r.initiator && <><span>·</span><span>by {r.initiator}</span></>}
                        </span>
                      </span>
                      <span className="task-cta">Open <IconArrowRight size={14} /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card card-flush">
            <div className="card-bar">
              <div className="block-head"><span className="block-icon"><IconFlow size={16} /></span><h3>My requests</h3></div>
              <Link href="/master/material/requests" className="btn btn-ghost btn-sm"><IconSearch size={14} /> Search all</Link>
            </div>
            {mineState === 'loading' && <LoadingState />}
            {mineState === 'error' && <ErrorState message={mineError} onRetry={loadMine} />}
            {mineState === 'ready' && (
              <>
                <div className="status-chips">
                  <button className={`schip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')} aria-pressed={filter === 'all'}>All <span>{mine.length}</span></button>
                  {STATUS_CODES.map((s) => count(s) > 0 && (
                    <button key={s} className={`schip schip-${STATUS[s].cls} ${filter === s ? 'on' : ''}`} onClick={() => setFilter(s)} aria-pressed={filter === s}>
                      <i aria-hidden /> {STATUS[s].label} <span>{count(s)}</span>
                    </button>
                  ))}
                </div>
                <RequestTable requests={shown} empty="No requests yet." />
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
