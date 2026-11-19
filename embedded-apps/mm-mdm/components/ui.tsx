'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { IconAlert, IconDoc, IconInbox, IconRefresh } from './icons';
import { RequestHeader } from '@/lib/mmApi';
import { appLabel, statusOf } from '@/lib/workflowConfig';
import { fmtDate } from '@/lib/format';

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

export function StatusBadge({ status, text }: { status: string; text?: string }) {
  const s = statusOf(status);
  return (
    <span className={`badge ${s.cls}`}>
      <span className="badge-code">{status}</span> {text || s.label}
    </span>
  );
}

export function MaterialNo({ value }: { value: string }) {
  return value ? <span className="matno">{value}</span> : <span className="muted">Assigned at posting</span>;
}

/** The request as a link target */
export const requestHref = (transId: string) => `/master/material/requests/view?id=${encodeURIComponent(transId)}`;

/** A clear error state: SAP / the backend could not be read. Never replaced by fake data. */
export function ErrorState({ title = 'Could not load data from SAP', message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div className="empty empty-error" role="alert">
      <span className="empty-icon" aria-hidden><IconAlert size={22} /></span>
      <p><strong>{title}</strong><br /><span className="muted">{message}</span></p>
      {onRetry && <button type="button" className="btn btn-sm" onClick={onRetry}><IconRefresh size={14} /> Try again</button>}
    </div>
  );
}

export function LoadingState({ text = 'Loading from SAP…' }: { text?: string }) {
  return (
    <div className="empty" role="status" aria-live="polite">
      <p className="muted">{text}</p>
    </div>
  );
}

export function RequestTable({ requests, empty }: { requests: RequestHeader[]; empty: string }) {
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
          <tr><th>Request</th><th>Request type</th><th>Material type</th><th>Initiator</th><th>Started</th><th>Status</th></tr>
        </thead>
        <tbody>
          {requests.map((r) => {
            const href = requestHref(r.transId);
            return (
              <tr key={r.transId} onClick={() => router.push(href)}>
                <td>
                  <div className="req-cell">
                    <span className="req-cell-icon" aria-hidden><IconDoc size={16} /></span>
                    <span className="req-cell-text">
                      <Link className="row-link" href={href} onClick={(e) => e.stopPropagation()}>{r.description || 'Untitled request'}</Link>
                      <span className="matno muted">{r.transId}{r.objValue && ` · ${r.objValue.replace(/^0+/, '')}`}</span>
                    </span>
                  </div>
                </td>
                <td><span className="pill">{r.appId} · {appLabel(r.appId)}</span></td>
                <td>{r.materialType ? <span className="pill">{r.materialType}</span> : <span className="muted">—</span>}</td>
                <td>{r.initiator || <span className="muted">—</span>}</td>
                <td className="nowrap">{r.startDate ? fmtDate(r.startDate) : '—'}</td>
                <td><StatusBadge status={r.status} text={r.statusText} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
