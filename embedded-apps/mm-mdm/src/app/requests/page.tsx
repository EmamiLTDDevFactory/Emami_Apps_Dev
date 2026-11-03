'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useT } from '@/i18n';
import { StatusChip } from '@/components/StatusChip';
import { FORM } from '@/lib/form';
import { STATUS_TEXT, type RequestHeader } from '@/lib/types';

export default function Requests() {
  const t = useT();
  const [rows, setRows] = useState<RequestHeader[]>([]);
  const [scope, setScope] = useState<'all' | 'mine' | 'inbox'>('all');
  const [status, setStatus] = useState('');
  const [materialType, setMaterialType] = useState('');
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const load = () => { setLoading(true); setErr(''); api.list({ scope, status, materialType, text }).then(setRows).catch((e) => setErr(e.message)).finally(() => setLoading(false)); };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <h1>{t('requests.title')}</h1>
      <form className="card row" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <div><label className="lbl" htmlFor="sc">{t('requests.show')}</label><select id="sc" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}><option value="all">{t('requests.scopeAll')}</option><option value="mine">{t('requests.scopeMine')}</option><option value="inbox">{t('requests.scopeInbox')}</option></select></div>
        <div><label className="lbl" htmlFor="st">{t('requests.status')}</label><select id="st" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{t('common.any')}</option>{Object.keys(STATUS_TEXT).map((k) => <option key={k} value={k}>{k} {t(`status.${k}` as 'status.00')}</option>)}</select></div>
        <div><label className="lbl" htmlFor="mt">{t('requests.type')}</label><select id="mt" value={materialType} onChange={(e) => setMaterialType(e.target.value)}><option value="">{t('common.any')}</option>{FORM.types.map((ty) => <option key={ty}>{ty}</option>)}</select></div>
        <div className="grow"><label className="lbl" htmlFor="tx">{t('requests.text')}</label><input id="tx" value={text} onChange={(e) => setText(e.target.value)} /></div>
        <div style={{ alignSelf: 'end' }}><button className="primary" type="submit" disabled={loading}>{t('requests.search')}</button></div>
      </form>
      {err && <p className="notice" role="alert">{err}</p>}
      <div className="card" aria-busy={loading}>
        <table>
          <thead><tr><th scope="col">{t('col.request')}</th><th scope="col">{t('col.application')}</th><th scope="col">{t('col.description')}</th><th scope="col">{t('col.type')}</th><th scope="col">{t('col.status')}</th><th scope="col">{t('col.initiator')}</th><th scope="col">{t('col.material')}</th><th scope="col">{t('col.started')}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.transId}-${r.appId}`}>
                <td><Link href={`/requests/view?id=${r.transId}`}>{r.transId}</Link></td><td>{r.appId}</td><td>{r.description}</td><td>{r.materialType}</td><td><StatusChip status={r.status} /></td><td>{r.initiator}</td><td>{r.objValue}</td><td>{r.startDate}</td>
              </tr>
            ))}
            {loading && !rows.length && <tr><td colSpan={8} className="muted" role="status">{t('requests.loading')}</td></tr>}
            {!rows.length && !loading && <tr><td colSpan={8} className="muted">{t('requests.empty')}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
