'use client';

import { useMemo, useState } from 'react';
import { useMdm } from '@/lib/store';
import { MdmRequest, StatusCode } from '@/lib/types';
import { MATERIAL_TYPES } from '@/lib/valueHelps';
import { STATUS } from '@/lib/workflowConfig';
import { waitingFor } from '@/lib/service';
import { RequestTable } from '../ui';
import { IconFilter, IconX } from '../icons';

type Scope = 'all' | 'waiting' | 'mine';

/** Search by scope, status, material type and text (replaces V_SEARCH) */
export default function RequestSearch() {
  const { db, user } = useMdm();
  const [scope, setScope] = useState<Scope>('all');
  const [status, setStatus] = useState<StatusCode | ''>('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');

  // Everything except the status filter, so the chips can show counts per status
  const base = useMemo(() => {
    const waiting = new Set(waitingFor(db, user).map((r) => r.transId));
    const s = q.trim().toLowerCase();
    return db.requests
      .filter((r) => scope === 'all' || (scope === 'waiting' ? waiting.has(r.transId) : user.level === null ? r.initiator === user.id : r.history.some((h) => h.by === user.name)))
      .filter((r) => !type || r.data.materialType === type)
      .filter((r) => !s || [r.transId, r.materialNumber, r.data.description].some((x) => x.toLowerCase().includes(s)))
      .sort((a, b) => b.changedOn.localeCompare(a.changedOn));
  }, [db, user, scope, type, q]);

  const rows = status ? base.filter((r) => r.status === status) : base;
  const count = (st: StatusCode) => base.filter((r: MdmRequest) => r.status === st).length;
  const filtered = !!(q || type || status || scope !== 'all');

  function clear() {
    setQ('');
    setType('');
    setStatus('');
    setScope('all');
  }

  return (
    <section className="card card-flush">
      <div className="search-head">
        <input className="search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search request, material number or description" aria-label="Search text" />
        <div className="search-selects">
          <span className="filter-icon" aria-hidden><IconFilter size={15} /></span>
          <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} aria-label="Scope">
            <option value="all">All requests</option>
            <option value="waiting">Waiting for me</option>
            <option value="mine">{user.level === null ? 'My requests' : 'Worked on by me'}</option>
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Material type">
            <option value="">All material types</option>
            {MATERIAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.value} – {t.label}</option>)}
          </select>
          {filtered && <button className="btn btn-ghost btn-sm" onClick={clear}><IconX size={14} /> Clear</button>}
        </div>
      </div>
      <div className="status-chips" role="group" aria-label="Status">
        <button className={`schip ${status === '' ? 'on' : ''}`} onClick={() => setStatus('')}>All <span>{base.length}</span></button>
        {(Object.keys(STATUS) as StatusCode[]).map((s) => (
          <button key={s} className={`schip schip-${STATUS[s].cls} ${status === s ? 'on' : ''}`} onClick={() => setStatus(status === s ? '' : s)} aria-pressed={status === s}>
            <i aria-hidden /> {STATUS[s].label} <span>{count(s)}</span>
          </button>
        ))}
        <span className="muted count">{rows.length} of {db.requests.length} requests</span>
      </div>
      <RequestTable requests={rows} empty="No requests match these filters." />
    </section>
  );
}
