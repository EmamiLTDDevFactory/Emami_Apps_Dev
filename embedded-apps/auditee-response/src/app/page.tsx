'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { STATUS, TRACKS, type Track, type Workpaper } from '@/lib/types';
import { StatusBadge } from '@/components/StatusBadge';

const TRACK_LABEL: Record<Track, string> = { audit: 'Audit observations', mis: 'MIS observations' };
const STATUS_FILTERS = [
  { key: '', label: 'All statuses' },
  { key: STATUS.toAuditee, label: 'Awaiting response' },
  { key: STATUS.responded, label: 'Management responded' },
  { key: STATUS.closed, label: 'Closed' },
];
const isClosed = (s: string) => s === STATUS.closed || s === 'MIS Close';

function MyObservations() {
  const q = useSearchParams();
  const router = useRouter();
  const track: Track = q.get('track') === 'mis' ? 'mis' : 'audit';
  const [all, setAll] = useState<Workpaper[] | null>(null);
  const [error, setError] = useState('');
  const [fy, setFy] = useState('');
  const [status, setStatus] = useState('');
  const [text, setText] = useState('');

  const load = useCallback(() => {
    setAll(null);
    setError('');
    api.list(track).then(setAll).catch((e: Error) => { setError(e.message); setAll([]); });
  }, [track]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setFy(''); setStatus(''); setText(''); }, [track]);

  const years = useMemo(() => [...new Set((all ?? []).map((w) => w.fy))].sort().reverse(), [all]);
  const inYear = useMemo(() => (all ?? []).filter((w) => !fy || w.fy === fy), [all, fy]);
  const shown = useMemo(() => {
    const needle = text.trim().toLowerCase();
    return inYear.filter((w) => (!status || w.status === status || (status === STATUS.closed && isClosed(w.status)))
      && (!needle || [w.process, w.subProcess, w.location, w.city, w.period, ...w.observations.map((o) => o.title)].join(' ').toLowerCase().includes(needle)));
  }, [inYear, status, text]);
  // grouped by sub-process (process / sub-process), workpapers inside
  const groups = useMemo(() => {
    const m = new Map<string, Workpaper[]>();
    for (const w of shown) {
      const k = `${w.process} / ${w.subProcess}`;
      m.set(k, [...(m.get(k) ?? []), w]);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [shown]);
  const count = (pred: (w: Workpaper) => boolean) => (all === null ? '…' : inYear.filter(pred).length);

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = TRACKS[(i + (e.key === 'ArrowRight' ? 1 : TRACKS.length - 1)) % TRACKS.length];
    router.push(`/?track=${next}`);
    window.setTimeout(() => document.getElementById(`tab-${next}`)?.focus(), 0);
  };

  return (
    <>
      <h1>My observations</h1>
      <p className="muted" style={{ margin: '0 0 12px' }}>Observations from internal audit and MIS reviews where you are the person responsible or the owner. Write your response to each one and submit it to the reviewer.</p>
      <div className="tabs" role="tablist" aria-label="Track">
        {TRACKS.map((t, i) => (
          <button key={t} id={`tab-${t}`} type="button" role="tab" aria-selected={track === t} aria-controls="track-panel" tabIndex={track === t ? 0 : -1}
            onClick={() => router.push(`/?track=${t}`)} onKeyDown={(e) => onTabKey(e, i)}>
            {TRACK_LABEL[t]}
          </button>
        ))}
      </div>
      <div id="track-panel" role="tabpanel" aria-labelledby={`tab-${track}`}>
        <div className="counts">
          <div className="card stat"><b>{count((w) => w.status === STATUS.toAuditee && !w.mySubmitted)}</b>Awaiting my response</div>
          <div className="card stat"><b>{count((w) => w.status === STATUS.toAuditee && w.mySubmitted)}</b>Submitted, waiting for others</div>
          <div className="card stat"><b>{count((w) => w.status !== STATUS.toAuditee)}</b>Responded or closed</div>
        </div>
        <div className="card">
          <div className="filters">
            <div className="field">
              <label className="lbl" htmlFor="fy">Financial year</label>
              <select id="fy" value={fy} onChange={(e) => setFy(e.target.value)}>
                <option value="">All years</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="lbl" htmlFor="status">Status</label>
              <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS_FILTERS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div className="field grow">
              <label className="lbl" htmlFor="search">Search</label>
              <input id="search" type="search" placeholder="Process, sub-process, location or observation title" value={text} onChange={(e) => setText(e.target.value)} />
            </div>
            <button type="button" onClick={() => { setFy(''); setStatus(''); setText(''); }} disabled={!fy && !status && !text}>Clear filters</button>
            <button type="button" onClick={load} disabled={all === null}>Refresh</button>
          </div>
        </div>

        {error && <div className="banner err" role="alert"><p>{error}</p></div>}
        {all === null && <div role="status" aria-label="Loading observations"><div className="skeleton" /><div className="skeleton" style={{ marginTop: 10 }} /></div>}
        {all !== null && !error && !all.length && <div className="card"><p className="muted" style={{ margin: 0 }}>No {track === 'mis' ? 'MIS' : 'audit'} observations are assigned to you.</p></div>}
        {all !== null && !!all.length && !shown.length && <div className="card"><p className="muted" style={{ margin: 0 }}>No workpapers match the filters.</p></div>}

        {groups.map(([name, list]) => (
          <section key={name} className="card group" aria-label={name}>
            <h2>{name}</h2>
            <ul className="wplist">
              {list.map((w) => {
                const answered = w.observations.filter((o) => o.myResponse.trim()).length;
                return (
                  <li key={w.guid} className="wpitem">
                    <div className="grow">
                      <p className="title">{w.location}{w.city && w.city !== w.location ? `, ${w.city}` : ''}</p>
                      <div className="meta">FY {w.fy} · {w.scheduling} · {w.period} · {w.observations.length} observation{w.observations.length === 1 ? '' : 's'} for you · {answered} submitted</div>
                      {w.status === STATUS.toAuditee && w.mySubmitted && w.waitingFor.length > 0 && <div className="meta">Waiting for: {w.waitingFor.join(', ')}</div>}
                    </div>
                    <StatusBadge wp={w} />
                    <Link className="open" href={`/workpaper/?track=${track}&guid=${encodeURIComponent(w.guid)}`}>
                      {w.status === STATUS.toAuditee ? (w.mySubmitted ? 'View or change' : 'Respond') : 'View'}
                      <span className="sr-only">: {w.subProcess}, {w.location}, FY {w.fy}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<div role="status" className="skeleton" aria-label="Loading" />}><MyObservations /></Suspense>;
}
