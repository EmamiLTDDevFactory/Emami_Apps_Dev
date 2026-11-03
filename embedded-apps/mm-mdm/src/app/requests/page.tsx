'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { StatusChip } from '@/components/StatusChip';
import { FORM } from '@/lib/form';
import { STATUS_TEXT, type RequestHeader } from '@/lib/types';

export default function Requests() {
  const [rows, setRows] = useState<RequestHeader[]>([]);
  const [scope, setScope] = useState<'all' | 'mine' | 'inbox'>('all');
  const [status, setStatus] = useState('');
  const [materialType, setMaterialType] = useState('');
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const load = () => { setLoading(true); setErr(''); api.list({ scope, status, materialType, text }).then(setRows).catch((e) => setErr(e.message)).finally(() => setLoading(false)); };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <h1>Requests</h1>
      <form className="card row" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <div><label className="lbl" htmlFor="sc">Show</label><select id="sc" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}><option value="all">All</option><option value="mine">My requests</option><option value="inbox">Waiting for me</option></select></div>
        <div><label className="lbl" htmlFor="st">Status</label><select id="st" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any</option>{Object.entries(STATUS_TEXT).map(([k, v]) => <option key={k} value={k}>{k} {v}</option>)}</select></div>
        <div><label className="lbl" htmlFor="mt">Material type</label><select id="mt" value={materialType} onChange={(e) => setMaterialType(e.target.value)}><option value="">Any</option>{FORM.types.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="grow"><label className="lbl" htmlFor="tx">Request, material or description</label><input id="tx" value={text} onChange={(e) => setText(e.target.value)} /></div>
        <div style={{ alignSelf: 'end' }}><button className="primary" type="submit" disabled={loading}>Search</button></div>
      </form>
      {err && <p className="notice">{err}</p>}
      <div className="card">
        <table>
          <thead><tr><th>Request</th><th>Application</th><th>Description</th><th>Type</th><th>Status</th><th>Initiator</th><th>Material</th><th>Started</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.transId}-${r.appId}`}>
                <td><Link href={`/requests/view?id=${r.transId}`}>{r.transId}</Link></td><td>{r.appId}</td><td>{r.description}</td><td>{r.materialType}</td><td><StatusChip status={r.status} /></td><td>{r.initiator}</td><td>{r.objValue}</td><td>{r.startDate}</td>
              </tr>
            ))}
            {!rows.length && !loading && <tr><td colSpan={8} className="muted">No requests found.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
