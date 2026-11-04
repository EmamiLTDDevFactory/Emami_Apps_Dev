'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMdm } from '@/lib/store';
import { waitingFor } from '@/lib/service';
import { MdmRequest, StatusCode } from '@/lib/types';
import { LEVELS, STATUS, levelDef } from '@/lib/workflowConfig';
import { fmtAgo } from '@/lib/format';
import { ActivityFeed, LevelBar, RequestTable, StatCards, StatusBadge, whereNow } from '../ui';
import {
  IconArrowRight, IconCheck, IconClock, IconDraft, IconFlow, IconInbox, IconPlus, IconSearch, IconShare, IconSparkle, IconUndo,
} from '../icons';

const byChanged = (a: { changedOn: string }, b: { changedOn: string }) => b.changedOn.localeCompare(a.changedOn);

/** What the user is expected to do with a work item */
function taskFor(r: MdmRequest, final: boolean) {
  if (r.status === '02') return { label: 'Correct and resubmit', Icon: IconUndo, tone: 'amber' };
  if (r.status === '04') return { label: 'Give your input', Icon: IconShare, tone: 'violet' };
  if (r.status === '00') return { label: 'Complete and submit', Icon: IconDraft, tone: 'blue' };
  return { label: final ? 'Review, approve and post' : 'Review and approve', Icon: IconCheck, tone: 'green' };
}

const MINE_FILTERS: { id: 'all' | StatusCode; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: '00', label: STATUS['00'].label },
  { id: '01', label: STATUS['01'].label },
  { id: '02', label: STATUS['02'].label },
  { id: '04', label: STATUS['04'].label },
  { id: '03', label: STATUS['03'].label },
  { id: '05', label: 'Posted' },
];

export default function MaterialHome() {
  const { db, user } = useMdm();
  const [mineFilter, setMineFilter] = useState<'all' | StatusCode>('all');
  const waiting = useMemo(() => waitingFor(db, user).sort(byChanged), [db, user]);
  const mine = useMemo(
    () =>
      db.requests
        .filter((r) => (user.level === null ? r.initiator === user.id : r.history.some((h) => h.by === user.name)))
        .sort(byChanged),
    [db, user],
  );
  const drafts = mine.filter((r) => r.status === '00').length;
  const inApproval = mine.filter((r) => r.status === '01' || r.status === '04').length;
  const posted = mine.filter((r) => r.status === '05').length;
  const isInit = user.level === null;
  const role = isInit ? 'Initiator' : `Level ${user.level} · ${levelDef(user.level!)?.team}`;
  const mineShown = mineFilter === 'all' ? mine : mine.filter((r) => r.status === mineFilter);

  // Pipeline: open requests per workflow level
  const open = db.requests.filter((r) => r.status === '01' || r.status === '04');
  const perLevel = LEVELS.map((l) => ({ ...l, count: open.filter((r) => r.level === l.level).length }));
  const maxCount = Math.max(1, ...perLevel.map((l) => l.count));
  const withInitiator = db.requests.filter((r) => r.status === '00' || r.status === '02').length;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const next = waiting[0];

  return (
    <>
      <section className="home-banner">
        <div className="home-banner-text">
          <p className="eyebrow"><IconSparkle size={13} /> {role}</p>
          <h2>{greeting}, {user.name.split(' ')[0]}</h2>
          <p>
            {waiting.length === 0
              ? isInit ? 'Nothing needs your attention right now. Start a new material request when you are ready.' : 'Your queue is clear – nothing is waiting at your level.'
              : `${waiting.length} request${waiting.length > 1 ? 's are' : ' is'} waiting for your action.`}
          </p>
        </div>
        <div className="home-banner-actions">
          {next && (
            <Link href={`/master/material/requests/view?id=${encodeURIComponent(next.transId)}`} className="btn btn-lg btn-white">
              Open next work item <IconArrowRight size={16} />
            </Link>
          )}
          {isInit && (
            <Link href="/master/material/new" className={`btn btn-lg ${next ? 'btn-glass' : 'btn-white'}`}>
              <IconPlus size={16} /> New material request
            </Link>
          )}
        </div>
      </section>

      <StatCards
        items={[
          { label: 'Waiting for me', value: waiting.length, icon: <IconInbox />, tone: 'blue' as const },
          ...(isInit ? [{ label: 'Drafts', value: drafts, icon: <IconDraft />, tone: 'violet' as const }] : []),
          { label: 'In approval', value: inApproval, icon: <IconClock />, tone: 'amber' as const },
          { label: 'Posted', value: posted, icon: <IconCheck />, tone: 'green' as const },
        ]}
      />

      <div className="home-grid">
        <div className="home-main">
          <section className="card card-flush">
            <div className="card-bar">
              <div className="block-head"><span className="block-icon"><IconInbox size={16} /></span><h3>Waiting for me</h3>{waiting.length > 0 && <span className="count-chip">{waiting.length}</span>}</div>
            </div>
            {waiting.length === 0 ? (
              <div className="empty">
                <span className="empty-icon empty-ok" aria-hidden><IconCheck size={22} /></span>
                <p><strong>All caught up.</strong><br /><span className="muted">{isInit ? 'Requests sent back to you appear here.' : 'New work items for your level appear here.'}</span></p>
              </div>
            ) : (
              <ul className="tasks">
                {waiting.map((r) => {
                  const t = taskFor(r, r.status === '01' && !!levelDef(r.level)?.final);
                  return (
                    <li key={r.transId}>
                      <Link href={`/master/material/requests/view?id=${encodeURIComponent(r.transId)}`} className="task">
                        <span className={`task-icon tone-${t.tone}`} aria-hidden><t.Icon size={18} /></span>
                        <span className="task-text">
                          <span className="task-top">
                            <strong>{r.data.description || 'Untitled request'}</strong>
                            <StatusBadge status={r.status} />
                          </span>
                          <span className="task-meta">
                            <span className="matno">{r.transId}</span>
                            <span>·</span>
                            <span>{whereNow(r)}</span>
                            <span>·</span>
                            <span>waiting {fmtAgo(r.changedOn)}</span>
                          </span>
                          <LevelBar r={r} />
                        </span>
                        <span className="task-cta">{t.label} <IconArrowRight size={14} /></span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card card-flush">
            <div className="card-bar">
              <div className="block-head"><span className="block-icon"><IconFlow size={16} /></span><h3>{isInit ? 'My requests' : 'Requests I have worked on'}</h3></div>
              <Link href="/master/material/requests" className="btn btn-ghost btn-sm"><IconSearch size={14} /> Search all</Link>
            </div>
            <div className="status-chips">
              {MINE_FILTERS.map((f) => {
                const n = f.id === 'all' ? mine.length : mine.filter((r) => r.status === f.id).length;
                if (f.id !== 'all' && n === 0) return null;
                return (
                  <button key={f.id} className={`schip ${f.id !== 'all' ? `schip-${STATUS[f.id].cls}` : ''} ${mineFilter === f.id ? 'on' : ''}`} onClick={() => setMineFilter(f.id)} aria-pressed={mineFilter === f.id}>
                    {f.id !== 'all' && <i aria-hidden />} {f.label} <span>{n}</span>
                  </button>
                );
              })}
            </div>
            <RequestTable requests={mineShown} empty="No requests yet." />
          </section>
        </div>

        <aside className="home-side">
          <section className="card">
            <div className="block-head"><span className="block-icon"><IconFlow size={16} /></span><h3>Workflow pipeline</h3></div>
            <ul className="pipeline">
              <li className={isInit ? 'me' : ''}>
                <span className="pl-lvl">INIT</span>
                <span className="pl-name">With initiator</span>
                <span className="pl-bar"><span style={{ width: `${(withInitiator / Math.max(maxCount, withInitiator)) * 100}%` }} /></span>
                <span className="pl-n">{withInitiator}</span>
              </li>
              {perLevel.map((l) => (
                <li key={l.level} className={user.level === l.level ? 'me' : ''}>
                  <span className="pl-lvl">L{l.level}</span>
                  <span className="pl-name">{l.team}</span>
                  <span className="pl-bar"><span style={{ width: `${(l.count / Math.max(maxCount, withInitiator)) * 100}%` }} /></span>
                  <span className="pl-n">{l.count}</span>
                </li>
              ))}
              <li className="pl-done">
                <span className="pl-lvl">✓</span>
                <span className="pl-name">Posted in SAP</span>
                <span className="pl-bar" />
                <span className="pl-n">{db.requests.filter((r) => r.status === '05').length}</span>
              </li>
            </ul>
          </section>

          <section className="card">
            <div className="block-head"><span className="block-icon"><IconClock size={16} /></span><h3>Recent activity</h3></div>
            <ActivityFeed requests={db.requests} />
          </section>
        </aside>
      </div>
    </>
  );
}
