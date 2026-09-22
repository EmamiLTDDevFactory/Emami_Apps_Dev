'use client';

import { useState, type ReactNode } from 'react';
import type { WorklistEntry } from '../types';

export interface PageState {
  loading: boolean;
  error: string | null;
  items: WorklistEntry[];
  open: (e: WorklistEntry) => void;
  toast: (m: string) => void;
  /** Switches the visible section (Sidebar's nav ids) — lets a page's own KPI cards/links route
   * to a more relevant section, not just open the drawer in place. */
  navigate: (id: string) => void;
}

export function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

export function Head({ title, sub, children }: { title: string; sub: string; children?: ReactNode }) {
  return (
    <div className="head">
      <div>
        <h2>{title}</h2>
        <p>{sub}</p>
      </div>
      {children}
    </div>
  );
}

export function Kpi({ label, value, sub, tone, onClick }: { label: string; value: string; sub: string; tone?: string; onClick?: () => void }) {
  return (
    <div className={'kpi' + (tone ? ' ' + tone : '')} onClick={onClick}>
      <div className="lab">{label}</div>
      <div className="val">{value}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}

export function Kpis({ children }: { children: ReactNode }) {
  return <div className="kpis">{children}</div>;
}

export function Bars({ items }: { items: [string, number, string?][] }) {
  return (
    <div>
      {items.map(([label, v, color]) => (
        <div key={label} style={{ margin: '11px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span>{label}</span>
            <b>{v}</b>
          </div>
          <div className="bar">
            <i style={{ width: `${v}%`, background: color ?? '#2563eb' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function KV({ rows }: { rows: [string, string][] }) {
  return (
    <div>
      {rows.map(([k, v]) => (
        <div className="kv" key={k}>
          <span>{k}</span>
          <b>{v}</b>
        </div>
      ))}
    </div>
  );
}

/** `onSelect` is optional so a purely-illustrative tab strip still highlights on click even with
 * nothing wired up, but every caller in this app DOES pass one — a tab that only changed its own
 * highlight with no visible effect on the page below it is exactly the "looks clickable, does
 * nothing" bug this app had elsewhere (see Pages.tsx/Pages3.tsx's callers). */
export function Tabs({ labels, onSelect }: { labels: string[]; onSelect?: (index: number, label: string) => void }) {
  const [active, setActive] = useState(0);
  return (
    <div className="tabs">
      {labels.map((l, i) => (
        <button
          key={l}
          className={i === active ? 'active' : ''}
          onClick={() => {
            setActive(i);
            onSelect?.(i, l);
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div>
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-row" key={i} />
      ))}
    </div>
  );
}

export function ErrorNotice({ message, onRetry, sample }: { message: string; onRetry: () => void; sample?: boolean }) {
  return (
    <div className="errbox">
      {sample ? 'Live data unavailable — showing sample data. ' : ''}
      {message}
      <button className="btn" onClick={onRetry} style={{ marginLeft: 10 }}>
        Retry
      </button>
    </div>
  );
}

export function EntryTable({ items, open }: { items: WorklistEntry[]; open: (e: WorklistEntry) => void }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Document</th><th>CoCd</th><th>Period</th><th>User</th><th>GL Pair</th><th>Amount</th><th>Risk</th><th>Score</th><th>Scored</th><th>Key Signal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((e) => (
            <tr key={`${e.companyCode}-${e.document}`} className="click" onClick={() => open(e)}>
              <td>{e.document}</td>
              <td>{e.companyCode}</td>
              <td>{e.period ?? '—'}</td>
              <td>{e.userName}</td>
              <td>{e.glPair}</td>
              <td><b>{e.amount}</b></td>
              <td><span className={`badge ${e.risk.toLowerCase()}`}>{e.risk}</span></td>
              <td>{e.score}</td>
              <td>{e.scoredAt ? new Date(e.scoredAt).toLocaleString() : '—'}</td>
              <td>{e.signal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TableCard({ title, items, open, loading }: { title: string; items: WorklistEntry[]; open: (e: WorklistEntry) => void; loading?: boolean }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      {loading ? <SkeletonRows /> : items.length > 0 ? <EntryTable items={items} open={open} /> : <div className="muted">No entries match the active filters.</div>}
    </div>
  );
}
