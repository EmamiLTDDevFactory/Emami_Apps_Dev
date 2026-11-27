'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminApiError, getAdminSession } from '@/lib/admin/adminApi';
import { UwlMeta, UwlPage, UwlQuery, uwlAll, uwlMeta, uwlMy, UwlItem } from '@/lib/admin/uwlApi';
import { ErrorState, LoadingState, StatCards } from '../ui';
import { IconAlert, IconClock, IconFile, IconInbox, IconRefresh, IconUsers } from '../icons';
import UwlTable, { SortKey } from './uwl/uwlTable';

const PAGE = 50;
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return isoDay(d); };

interface Filters { app: string; initiator: string; agent: string; from: string; to: string; status: string; level: string; q: string; breached: boolean; staleOnly: boolean; allDates: boolean }
const fresh = (): Filters => ({ app: '', initiator: '', agent: '', from: daysAgo(30), to: isoDay(new Date()), status: '', level: '', q: '', breached: false, staleOnly: false, allDates: false });

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
function exportCsv(items: UwlItem[]) {
  const head = ['Work item', 'Request', 'Object', 'App', 'Text', 'Level', 'Request status', 'Agents', 'Initiated by', 'Created', 'Age days', 'SLA breached', 'Stale'];
  const rows = items.map((i) => [i.wiId, i.transId, i.objValue, i.appId, i.text, i.level, i.statusText, i.agentNames, i.initiatorName, i.created, i.ageDays, i.slaBreached ? 'yes' : 'no', i.stale ? 'yes' : 'no']);
  const blob = new Blob(['﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `workflow-visibility-${isoDay(new Date())}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Work Inbox: my open work items, and (admins) every open work item of the MDM workflows. Live from SAP, read only. */
export default function WorklistScreen() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<'my' | 'all'>('my');
  const [meta, setMeta] = useState<UwlMeta | null>(null);
  const [f, setF] = useState<Filters>(fresh);
  const [applied, setApplied] = useState<Filters>(f);
  const [sort, setSort] = useState<{ k: SortKey; dir: 'asc' | 'desc' }>({ k: 'created', dir: 'desc' });
  const [skip, setSkip] = useState(0);
  const [page, setPage] = useState<UwlPage | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [msgs, setMsgs] = useState<string[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    getAdminSession().then((s) => setIsAdmin(!!s.isAdmin)).catch((e: Error) => { setIsAdmin(false); setError(e.message); });
    uwlMeta().then(setMeta).catch(() => { /* filter options only */ });
  }, []);

  const query = useMemo<UwlQuery>(() => {
    const q: UwlQuery = { sort: sort.k, dir: sort.dir, top: PAGE, skip };
    if (applied.app) q.app = applied.app;
    if (tab === 'all') {
      Object.assign(q, { initiator: applied.initiator, agent: applied.agent, status: applied.status, level: applied.level, q: applied.q, breached: applied.breached, staleOnly: applied.staleOnly });
      if (applied.allDates) q.allDates = true; else { q.from = applied.from; q.to = applied.to; }
    }
    return q;
  }, [applied, sort, skip, tab]);

  const load = useCallback(() => {
    const n = ++seq.current;
    setState('loading');
    (tab === 'all' ? uwlAll(query) : uwlMy(query))
      .then((p) => { if (n === seq.current) { setPage(p); setError(''); setMsgs([]); setState('ready'); } })
      .catch((e: Error) => {
        if (n !== seq.current) return;
        setError(e.message); setMsgs(e instanceof AdminApiError ? e.messages.map((m) => m.message) : []); setState('error');
      });
  }, [tab, query]);
  useEffect(() => { if (isAdmin !== null) load(); }, [isAdmin, load]);

  const apply = (e?: React.FormEvent) => { e?.preventDefault(); setSkip(0); setApplied(f); };
  const reset = () => { const n = fresh(); setF(n); setApplied(n); setSkip(0); };
  const onSort = (k: SortKey) => { setSkip(0); setSort((s) => (s.k === k ? { k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { k, dir: k === 'created' || k === 'age' ? 'desc' : 'asc' })); };
  const switchTab = (t: 'my' | 'all') => { setTab(t); setSkip(0); setPage(null); };
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((o) => ({ ...o, [k]: v }));

  if (isAdmin === null) return <section className="card"><LoadingState /></section>;
  const c = page?.counts;
  const from = page && page.total > 0 ? page.skip + 1 : 0;
  const to = page ? Math.min(page.skip + page.top, page.total) : 0;

  return (
    <>
      <section className="card">
        <div className="card-bar">
          <div className="block-head"><span className="block-icon"><IconInbox size={16} /></span><h2>Work Inbox</h2></div>
          <div className="wl-actions">
            {page && page.items.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => exportCsv(page.items)} title="Exports the rows of this page"><IconFile size={14} /> Export page (CSV)</button>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={load}><IconRefresh size={14} /> Refresh</button>
          </div>
        </div>
        <p className="muted wl-lead">Open work items of the master data workflows, read live from SAP. Read only: nothing here approves, forwards or changes a request.</p>
        <div className="status-chips" role="tablist" aria-label="View">
          <button role="tab" aria-selected={tab === 'my'} className={`schip ${tab === 'my' ? 'on' : ''}`} onClick={() => switchTab('my')}>My work</button>
          {isAdmin && <button role="tab" aria-selected={tab === 'all'} className={`schip ${tab === 'all' ? 'on' : ''}`} onClick={() => switchTab('all')}><IconUsers size={13} /> All users</button>}
        </div>
      </section>

      {c && state !== 'error' && (
        <StatCards items={[
          { label: tab === 'my' ? 'Waiting for me' : 'Open work items', value: c.open, icon: <IconInbox />, tone: 'blue' as const },
          { label: 'SLA breached', value: c.breached, icon: <IconAlert />, tone: 'amber' as const },
          { label: `Stale (over ${page!.staleDays} days)`, value: c.stale, icon: <IconClock />, tone: 'violet' as const },
          { label: 'Oldest (days)', value: c.oldestDays, icon: <IconClock />, tone: 'green' as const },
        ]} />
      )}

      <section className="card card-flush">
        <form className="wl-filters" onSubmit={apply}>
          <label>App
            <select value={f.app} onChange={(e) => { set('app', e.target.value); }}>
              <option value="">All apps</option>
              {(meta?.apps ?? []).map((a) => <option key={a.key} value={a.key}>{a.key} · {a.label} ({a.n})</option>)}
            </select>
          </label>
          {tab === 'all' && (
            <>
              <label>Initiated by<input value={f.initiator} onChange={(e) => set('initiator', e.target.value)} placeholder="User id or name" /></label>
              <label>Agent<input value={f.agent} onChange={(e) => set('agent', e.target.value)} placeholder="User id or name" /></label>
              <label>Request status
                <select value={f.status} onChange={(e) => set('status', e.target.value)}>
                  <option value="">Any</option>
                  {(meta?.statuses ?? []).map((s) => <option key={s.key} value={s.key}>{s.label} ({s.n})</option>)}
                </select>
              </label>
              <label>Level
                <select value={f.level} onChange={(e) => set('level', e.target.value)}>
                  <option value="">Any</option>
                  {(meta?.levels ?? []).filter((l) => l.key).map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
                </select>
              </label>
              <label>Created from<input type="date" value={f.from} disabled={f.allDates} onChange={(e) => set('from', e.target.value)} /></label>
              <label>Created to<input type="date" value={f.to} disabled={f.allDates} onChange={(e) => set('to', e.target.value)} /></label>
              <label>Search<input value={f.q} onChange={(e) => set('q', e.target.value)} placeholder="Request no., object or text" /></label>
              <div className="wl-checks">
                <label className="wl-check"><input type="checkbox" checked={f.allDates} onChange={(e) => set('allDates', e.target.checked)} /> All dates</label>
                <label className="wl-check"><input type="checkbox" checked={f.breached} onChange={(e) => set('breached', e.target.checked)} /> SLA breached only</label>
                <label className="wl-check"><input type="checkbox" checked={f.staleOnly} onChange={(e) => set('staleOnly', e.target.checked)} /> Stale only</label>
              </div>
            </>
          )}
          <div className="wl-filter-actions">
            <button type="submit" className="btn btn-sm">Apply</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>Reset</button>
          </div>
        </form>
        {tab === 'all' && !applied.allDates && <p className="muted wl-hint">Showing items created from {applied.from || 'the start'} to {applied.to || 'today'} (the old worklist defaulted to the last 30 days). Tick &quot;All dates&quot; to include the old backlog.</p>}
        {page?.note && <p className="wl-note" role="status">{page.note}</p>}

        {state === 'loading' && <LoadingState />}
        {state === 'error' && (
          <>
            <ErrorState message={error || 'SAP did not answer.'} onRetry={load} />
            {msgs.filter((m) => m !== error).map((m, i) => <p key={i} className="muted wl-note">{m}</p>)}
          </>
        )}
        {state === 'ready' && page && page.items.length === 0 && (
          <div className="empty"><span className="empty-icon" aria-hidden><IconInbox size={22} /></span><p><strong>No Record Found</strong><br /><span className="muted">{tab === 'my' ? 'Nothing is waiting for you.' : 'No open work item matches these filters.'}</span></p></div>
        )}
        {state === 'ready' && page && page.items.length > 0 && (
          <>
            <UwlTable items={page.items} sort={page.sort} dir={page.dir} onSort={onSort} showAgent={tab === 'all'} />
            <div className="wl-pager">
              <span className="muted">{from}-{to} of {page.total}</span>
              <button type="button" className="btn btn-ghost btn-sm" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - PAGE))}>Previous</button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={to >= page.total} onClick={() => setSkip(skip + PAGE)}>Next</button>
            </div>
          </>
        )}
      </section>

      {tab === 'all' && c && state === 'ready' && c.byAgent.length > 0 && (
        <section className="card">
          <h3>Open items by agent (top {c.byAgent.length}, current filter)</h3>
          <ul className="wl-bars">
            {c.byAgent.map((a) => (
              <li key={a.key}>
                <button type="button" className="wl-bar" onClick={() => { const n = { ...f, agent: a.key }; setF(n); setApplied(n); setSkip(0); }} title="Filter by this agent">
                  <span className="wl-bar-name">{a.label}{a.label !== a.key ? ` (${a.key})` : ''}</span>
                  <span className="wl-bar-track"><i style={{ width: `${Math.max(3, (a.n / c.byAgent[0].n) * 100)}%` }} /></span>
                  <span className="wl-bar-n">{a.n}{a.breached ? ` · ${a.breached} late` : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
