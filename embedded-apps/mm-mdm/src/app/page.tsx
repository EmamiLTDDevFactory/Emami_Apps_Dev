'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useT } from '@/i18n';
import { StatusChip } from '@/components/StatusChip';
import type { RequestHeader, SessionInfo } from '@/lib/types';

export default function Home() {
  const t = useT();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [inbox, setInbox] = useState<RequestHeader[] | null>(null);
  const [mine, setMine] = useState<RequestHeader[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.session().then(setSession).catch((e) => setErr(e.message));
    api.list({ scope: 'inbox' }).then(setInbox).catch((e) => { setErr(e.message); setInbox([]); });
    api.list({ scope: 'mine' }).then(setMine).catch(() => setMine([]));
  }, []);
  const count = (s: string) => (mine ?? []).filter((r) => r.status === s).length;
  const table = (rows: RequestHeader[] | null) => (
    <table>
      <thead><tr><th scope="col">{t('col.request')}</th><th scope="col">{t('col.description')}</th><th scope="col">{t('col.type')}</th><th scope="col">{t('col.status')}</th><th scope="col">{t('col.material')}</th></tr></thead>
      <tbody>
        {(rows ?? []).map((r) => (
          <tr key={r.transId}>
            <td><Link href={`/requests/view?id=${r.transId}`}>{r.transId}</Link></td><td>{r.description}</td><td>{r.materialType}</td><td><StatusChip status={r.status} /></td><td>{r.objValue}</td>
          </tr>
        ))}
        {rows === null && <tr><td colSpan={5} className="muted" role="status">{t('common.loading')}</td></tr>}
        {rows !== null && !rows.length && <tr><td colSpan={5} className="muted">{t('common.nothing')}</td></tr>}
      </tbody>
    </table>
  );
  return (
    <>
      <h1>{session ? t('home.welcome', { name: session.displayName }) : t('home.welcomeAnon')}</h1>
      {err && <p className="notice" role="alert">{err}</p>}
      <div className="row" style={{ margin: '12px 0' }}>
        <Link href="/requests/new"><button className="primary">{t('home.new')}</button></Link>
        <Link href="/requests"><button>{t('home.all')}</button></Link>
      </div>
      <div className="grid3">
        <div className="card stat"><b>{inbox?.length ?? '…'}</b>{t('home.statInbox')}</div>
        <div className="card stat"><b>{mine ? count('00') + count('01') + count('04') : '…'}</b>{t('home.statOpen')}</div>
        <div className="card stat"><b>{mine ? count('02') : '…'}</b>{t('home.statReview')}</div>
      </div>
      <div className="card"><h2>{t('home.inbox')}</h2>{table(inbox)}</div>
      <div className="card"><h2>{t('home.mine')}</h2>{table(mine ? mine.slice(0, 10) : null)}</div>
    </>
  );
}
