'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { IconDoc, IconInbox } from './icons';
import { MdmRequest, StatusCode } from '@/lib/types';
import { LEVELS, STATUS, levelDef, userName } from '@/lib/workflowConfig';
import { fmtAgo, fmtDate, fmtShort } from '@/lib/format';

export interface StatItem {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: 'blue' | 'amber' | 'violet' | 'green';
}

/** Row of KPI cards (overview and material home) */
export function StatCards({ items, aside }: { items: StatItem[]; aside?: React.ReactNode }) {
  return (
    <div className="stat-cards">
      {items.map((s) => (
        <div key={s.label} className={`stat-card tone-${s.tone}`}>
          <span className="stat-icon">{s.icon}</span>
          <span className="stat-text">
            <strong>{s.value}</strong>
            <span>{s.label}</span>
          </span>
        </div>
      ))}
      {aside}
    </div>
  );
}

export function StatusBadge({ status }: { status: StatusCode }) {
  const s = STATUS[status];
  return (
    <span className={`badge ${s.cls}`}>
      <span className="badge-code">{status}</span> {s.label}
    </span>
  );
}

export function MaterialNo({ value }: { value: string }) {
  return value ? <span className="matno">{value}</span> : <span className="muted">Assigned at posting</span>;
}

/** Where the request is now, in plain words */
export function whereNow(r: MdmRequest): string {
  switch (r.status) {
    case '00': return `Draft with ${userName(r.initiator)}`;
    case '02': return `Sent back to ${userName(r.initiator)}`;
    case '01': return `Level ${r.level} – ${levelDef(r.level)?.team}`;
    case '04': return `With ${userName(r.forward!.to)} for input (level ${r.level})`;
    case '03': return `Rejected at level ${r.level}`;
    case '05': return 'Posted in SAP';
  }
}

/** Initiator → 7 levels → posted */
export function LevelStepper({ r }: { r: MdmRequest }) {
  const steps = [{ key: 0, label: 'Initiator' }, ...LEVELS.map((l) => ({ key: l.level, label: l.team })), { key: 8, label: 'Posted' }];
  const current = r.status === '05' ? 9 : r.status === '00' || r.status === '02' ? 0 : r.level;
  const initials = (name: string) => name.split(' ').map((p) => p[0]).join('');
  /** Last history entry that explains a step: submission, approval, posting, send back or rejection */
  const entryFor = (key: number, state: string) => {
    const h = [...r.history].reverse();
    if (key === 0) return h.find((x) => /^(Submitted|Resubmitted|Saved as draft)/.test(x.action));
    if (key === 8) return h.find((x) => x.department === 'System');
    if (state === 'rejected') return h.find((x) => x.status === '03');
    if (state === 'returned') return h.find((x) => x.status === '02');
    if (state === 'forwarded') return h.find((x) => x.status === '04');
    return h.find((x) => x.level === key && x.action.startsWith('Approved'));
  };
  return (
    <ol className="lstepper" aria-label="Workflow levels">
      {steps.map((s) => {
        let state = s.key < current ? 'done' : s.key === current ? 'active' : 'todo';
        if (r.status === '03' && s.key === r.level) state = 'rejected';
        if (r.status === '03' && s.key > r.level) state = 'todo';
        if (r.status === '02' && s.key === r.sentBackFrom) state = 'returned';
        if (r.status === '04' && s.key === r.level) state = 'forwarded';
        const e = state === 'todo' || (state === 'active' && s.key !== 0) ? undefined : entryFor(s.key, state);
        return (
          <li key={s.key} className={`ls ls-${state}`}>
            <span className="ls-dot" aria-hidden>{state === 'done' ? '✓' : state === 'rejected' ? '✕' : s.key === 0 ? 'I' : s.key === 8 ? 'P' : s.key}</span>
            <span className="ls-label">{s.key > 0 && s.key < 8 ? <><small>L{s.key}</small> {s.label}</> : s.label}</span>
            {e ? (
              <span className="ls-when" title={`${e.by} · ${e.action}`}>{e.department === 'System' ? 'SAP' : initials(e.by)} · {fmtShort(e.at)}</span>
            ) : state === 'active' && s.key !== 0 ? (
              <span className="ls-when ls-now">since {fmtShort(r.changedOn)}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Seven-segment mini progress for the workflow levels */
export function LevelBar({ r }: { r: MdmRequest }) {
  const n = LEVELS.length;
  const done = r.status === '05' ? n : r.status === '00' || r.status === '02' ? 0 : r.level - 1;
  return (
    <span className="lbar" aria-label={`${done} of ${n} levels approved`}>
      {LEVELS.map((l) => {
        let st = l.level <= done ? 'done' : '';
        if ((r.status === '01' || r.status === '04') && l.level === r.level) st = r.status === '04' ? 'fwd' : 'cur';
        if (r.status === '03' && l.level === r.level) st = 'rej';
        if (r.status === '02' && l.level === r.sentBackFrom) st = 'ret';
        return <span key={l.level} className={`lbar-seg ${st}`} />;
      })}
    </span>
  );
}

export function RequestTable({ requests, empty }: { requests: MdmRequest[]; empty: string }) {
  const router = useRouter();
  if (!requests.length) {
    return (
      <div className="empty">
        <span className="empty-icon" aria-hidden><IconInbox size={22} /></span>
        <p>{empty}</p>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table className="table table-click req-table">
        <thead>
          <tr><th>Request</th><th>Type</th><th>Plant</th><th>Progress</th><th>Changed</th><th>Status</th></tr>
        </thead>
        <tbody>
          {requests.map((r) => {
            const href = `/master/material/requests/view?id=${encodeURIComponent(r.transId)}`;
            return (
              <tr key={r.transId} onClick={() => router.push(href)}>
                <td>
                  <div className="req-cell">
                    <span className="req-cell-icon" aria-hidden><IconDoc size={16} /></span>
                    <span className="req-cell-text">
                      <Link className="row-link" href={href} onClick={(e) => e.stopPropagation()}>{r.data.description || 'Untitled request'}</Link>
                      <span className="matno muted">{r.transId}{r.materialNumber && ` · ${r.materialNumber}`}</span>
                    </span>
                  </div>
                </td>
                <td><span className="pill">{r.data.materialType}</span></td>
                <td>{r.data.plant}</td>
                <td>
                  <div className="prog-cell">
                    <LevelBar r={r} />
                    <span className="small muted">{whereNow(r)}</span>
                  </div>
                </td>
                <td className="nowrap">{fmtDate(r.changedOn)}</td>
                <td><StatusBadge status={r.status} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Latest history entries across all requests */
export function ActivityFeed({ requests, limit = 7 }: { requests: MdmRequest[]; limit?: number }) {
  const items = requests
    .flatMap((r) => r.history.map((h) => ({ ...h, r })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
  if (!items.length) return <p className="muted small">No activity yet.</p>;
  return (
    <ol className="feed">
      {items.map((a, i) => (
        <li key={i} className={`feed-${a.status === '03' ? 'rejected' : a.status === '02' ? 'returned' : a.department === 'System' ? 'system' : a.status === '04' ? 'forward' : 'normal'}`}>
          <span className="tl-avatar" aria-hidden>{a.department === 'System' ? 'SAP' : a.by.split(' ').map((p) => p[0]).join('')}</span>
          <span className="feed-text">
            <span><strong>{a.by}</strong> {a.action.charAt(0).toLowerCase() + a.action.slice(1)}</span>
            <Link href={`/master/material/requests/view?id=${encodeURIComponent(a.r.transId)}`} className="feed-link">{a.r.data.description || a.r.transId}</Link>
            <small className="muted">{fmtAgo(a.at)}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}
