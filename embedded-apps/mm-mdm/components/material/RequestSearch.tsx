'use client';

import { useCallback, useEffect, useState } from 'react';
import { RequestHeader, listRequests } from '@/lib/mmApi';
import { useValueHelp } from '@/lib/mmValueHelp';
import { STATUS, STATUS_CODES } from '@/lib/workflowConfig';
import { StatusCode } from '@/lib/types';
import { ErrorState, LoadingState, RequestTable } from '../ui';
import { IconFilter, IconX } from '../icons';

type Scope = '' | 'inbox' | 'mine';

/** Search by scope, status, material type and text, answered by SAP (GET /requests) */
export default function RequestSearch() {
  const [scope, setScope] = useState<Scope>('');
  const [status, setStatus] = useState<StatusCode | ''>('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [text, setText] = useState('');
  const [rows, setRows] = useState<RequestHeader[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const types = useValueHelp('MTART');

  // The text goes to SAP after a short pause; scope, status and type at once
  useEffect(() => { const t = window.setTimeout(() => setText(q.trim()), 350); return () => window.clearTimeout(t); }, [q]);

  const load = useCallback(() => {
    setState('loading');
    listRequests({ scope, materialType: type, text })
      .then((r) => { setRows(r); setError(''); setState('ready'); })
      .catch((e: Error) => { setError(e.message); setState('error'); });
  }, [scope, type, text]);
  useEffect(() => { load(); }, [load]);

  const shown = status ? rows.filter((r) => r.status === status) : rows;
  const count = (s: StatusCode) => rows.filter((r) => r.status === s).length;
  const filtered = !!(q || type || status || scope);
  const sorted = [...shown].sort((a, b) => b.startDate.localeCompare(a.startDate) || b.transId.localeCompare(a.transId));

  function clear() { setQ(''); setText(''); setType(''); setStatus(''); setScope(''); }

  return (
    <section className="card card-flush">
      <div className="search-head">
        <input className="search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search request, material number or description" aria-label="Search text" />
        <div className="search-selects">
          <span className="filter-icon" aria-hidden><IconFilter size={15} /></span>
          <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} aria-label="Scope">
            <option value="">All requests</option>
            <option value="inbox">Waiting for me</option>
            <option value="mine">My requests</option>
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Material type">
            <option value="">All material types</option>
            {types.options.map((t) => <option key={t.value} value={t.value}>{t.value}{t.label ? ` – ${t.label}` : ''}</option>)}
          </select>
          {filtered && <button className="btn btn-ghost btn-sm" onClick={clear}><IconX size={14} /> Clear</button>}
        </div>
      </div>
      <div className="status-chips" role="group" aria-label="Status">
        <button className={`schip ${status === '' ? 'on' : ''}`} onClick={() => setStatus('')}>All <span>{rows.length}</span></button>
        {STATUS_CODES.map((s) => (
          <button key={s} className={`schip schip-${STATUS[s].cls} ${status === s ? 'on' : ''}`} onClick={() => setStatus(status === s ? '' : s)} aria-pressed={status === s}>
            <i aria-hidden /> {STATUS[s].label} <span>{count(s)}</span>
          </button>
        ))}
        {state === 'ready' && <span className="muted count">{shown.length} request{shown.length === 1 ? '' : 's'}</span>}
      </div>
      {state === 'loading' && <LoadingState />}
      {state === 'error' && <ErrorState message={error} onRetry={load} />}
      {state === 'ready' && <RequestTable requests={sorted} empty="No requests match these filters." />}
    </section>
  );
}
