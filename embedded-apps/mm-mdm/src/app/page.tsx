'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { StatusChip } from '@/components/StatusChip';
import type { RequestHeader, SessionInfo } from '@/lib/types';

export default function Home() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [inbox, setInbox] = useState<RequestHeader[]>([]);
  const [mine, setMine] = useState<RequestHeader[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.session().then(setSession).catch((e) => setErr(e.message));
    api.list({ scope: 'inbox' }).then(setInbox).catch((e) => setErr(e.message));
    api.list({ scope: 'mine' }).then(setMine).catch(() => undefined);
  }, []);
  const count = (s: string) => mine.filter((r) => r.status === s).length;
  const table = (rows: RequestHeader[]) => (
    <table>
      <thead><tr><th>Request</th><th>Description</th><th>Type</th><th>Status</th><th>Material</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.transId}>
            <td><Link href={`/requests/view?id=${r.transId}`}>{r.transId}</Link></td><td>{r.description}</td><td>{r.materialType}</td><td><StatusChip status={r.status} /></td><td>{r.objValue}</td>
          </tr>
        ))}
        {!rows.length && <tr><td colSpan={5} className="muted">Nothing here.</td></tr>}
      </tbody>
    </table>
  );
  return (
    <>
      <h1>Welcome{session ? `, ${session.displayName}` : ''}</h1>
      {err && <p className="notice">{err}</p>}
      <div className="row" style={{ margin: '12px 0' }}>
        <Link href="/requests/new"><button className="primary">New material request</button></Link>
        <Link href="/requests"><button>All requests</button></Link>
      </div>
      <div className="grid3">
        <div className="card stat"><b>{inbox.length}</b>waiting for me</div>
        <div className="card stat"><b>{count('00') + count('01') + count('04')}</b>my open drafts and corrections</div>
        <div className="card stat"><b>{count('02')}</b>my requests in review</div>
      </div>
      <div className="card"><h2>Waiting for me</h2>{table(inbox)}</div>
      <div className="card"><h2>My requests</h2>{table(mine.slice(0, 10))}</div>
    </>
  );
}
