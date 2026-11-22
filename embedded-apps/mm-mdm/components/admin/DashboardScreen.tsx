'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APPROX_NOTE, DashMeta, DashPage, DashQuery, DashRow, Overview, STATUS_CLS, dashList, dashMeta, dashOverview, daysAgo, exportRowsCsv, fmtAge, fmtDur, fmtTs, isoDay,
} from '@/lib/admin/dashApi';
import { ErrorState, LoadingState } from '../ui';
import { IconAlert, IconCheck, IconChart, IconClock, IconDraft, IconFile, IconFlow, IconInbox, IconRefresh, IconSearch, IconUndo, IconUsers, IconX } from '../icons';
import { AgentRanking, AgingStrip, BrokenList, Focus, StageFunnel } from './dash/Charts';
import DetailDrawer from './dash/DetailDrawer';

const PAGE = 25;
const MATERIAL = ['MC', 'MX', 'ME'];
const MATERIAL_NAMES: Record<string, string> = { MC: 'Material Creation', MX: 'Material Change', ME: 'Material Extension' };

interface Form { transId: string; user: string; status: string; mtype: string; plant: string; genField2: string; objValue: string; text: string; duplicate: '' | 'Y' | 'N' }
const emptyForm = (): Form => ({ transId: '', user: '', status: '', mtype: '', plant: '', genField2: '', objValue: '', text: '', duplicate: '' });

type SortKey = 'transId' | 'created' | 'status' | 'app' | 'age';

/** MDM dashboard (rebuild of Web Dynpro /INOWITS/MDM_DB): where every request is waiting, who holds it, how long, and what changed. Live from SAP, read only. */
export default function DashboardScreen() {
  const [meta, setMeta] = useState<DashMeta | null>(null);
  const [metaErr, setMetaErr] = useState('');
  const [apps, setApps] = useState<string[]>(MATERIAL);
  const [win, setWin] = useState({ from: daysAgo(30), to: isoDay(new Date()), all: false });
  const [showStale, setShowStale] = useState(false);
  const [chartApp, setChartApp] = useState('');

  const [ov, setOv] = useState<Overview | null>(null);
  const [ovState, setOvState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [ovErr, setOvErr] = useState('');

  const [form, setForm] = useState<Form>(emptyForm);
  const [applied, setApplied] = useState<Form>(emptyForm);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [sort, setSort] = useState<{ k: SortKey; dir: 'asc' | 'desc' }>({ k: 'transId', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DashPage | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [err, setErr] = useState('');
  const [openId, setOpenId] = useState('');
  const listRef = useRef<HTMLElement>(null);
  const ovSeq = useRef(0);
  const listSeq = useRef(0);

  useEffect(() => { dashMeta().then(setMeta).catch((e: Error) => setMetaErr(e.message)); }, []);

  const base = useMemo<DashQuery>(() => ({ apps, ...(win.all ? { allDates: true } : { dateFrom: win.from, dateTo: win.to }) }), [apps, win]);

  const loadOverview = useCallback(() => {
    const n = ++ovSeq.current;
    setOvState('loading');
    dashOverview(base).then((o) => { if (n === ovSeq.current) { setOv(o); setOvErr(''); setOvState('ready'); } })
      .catch((e: Error) => { if (n === ovSeq.current) { setOvErr(e.message); setOvState('error'); } });
  }, [base]);
  useEffect(() => { loadOverview(); }, [loadOverview]);

  const query = useMemo<DashQuery>(() => {
    const q: DashQuery = { ...base, page, pageSize: PAGE, sort: sort.k, dir: sort.dir };
    if (applied.transId) q.transId = applied.transId;
    if (applied.user) q.user = applied.user;
    if (applied.status === 'inprogress') q.statusGroup = 'inprogress'; else if (applied.status) q.status = applied.status;
    if (applied.mtype) q.mtype = applied.mtype;
    if (applied.plant) q.plant = applied.plant;
    if (applied.genField2) q.genField2 = applied.genField2;
    if (applied.objValue) q.objValue = applied.objValue;
    if (applied.text) q.text = applied.text;
    if (applied.duplicate) q.duplicate = applied.duplicate;
    if (applied.transId || applied.objValue) {
      // a T-ID or SAP code search finds the request whatever its creation date
      delete q.dateFrom; delete q.dateTo; q.allDates = true;
    }
    if (focus) {
      // the waiting state is not bound to the creation date: the list then looks at all dates
      delete q.dateFrom; delete q.dateTo; q.allDates = true;
      if (focus.statusGroup) q.statusGroup = focus.statusGroup;
      if (focus.level) q.level = focus.level;
      if (focus.roleType) q.roleType = focus.roleType;
      if (focus.dept) q.dept = focus.dept;
      if (focus.agent) q.agent = focus.agent;
      if (focus.ageBucket) q.ageBucket = focus.ageBucket;
      if (focus.flag) q.flag = focus.flag;
    }
    return q;
  }, [base, page, sort, applied, focus]);

  const loadList = useCallback(() => {
    const n = ++listSeq.current;
    setState('loading');
    dashList(query).then((p) => { if (n === listSeq.current) { setData(p); setErr(''); setState('ready'); } })
      .catch((e: Error) => { if (n === listSeq.current) { setErr(e.message); setState('error'); } });
  }, [query]);
  useEffect(() => { loadList(); }, [loadList]);

  const statusLabel = useCallback((c: string) => meta?.statuses.find((s) => s.code === c)?.label ?? c, [meta]);
  const toggleApp = (id: string) => { setPage(1); setApps((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id])); };
  const goList = () => setTimeout(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  const doFocus = (f: Focus) => { setFocus(f); setApplied(emptyForm()); setForm(emptyForm()); setPage(1); goList(); };
  const pickStatus = (status: string, dup?: boolean) => {
    setFocus(null); setPage(1);
    const f = { ...emptyForm(), status, duplicate: dup ? ('Y' as const) : ('' as const) };
    setForm(f); setApplied(f); goList();
  };
  const submit = (e?: React.FormEvent) => { e?.preventDefault(); setPage(1); setApplied(form); };
  const reset = () => { setForm(emptyForm()); setApplied(emptyForm()); setFocus(null); setPage(1); };
  const onSort = (k: SortKey) => { setPage(1); setSort((s) => (s.k === k ? { k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { k, dir: k === 'transId' || k === 'created' || k === 'age' ? 'desc' : 'asc' })); };
  const setF = <K extends keyof Form>(k: K, v: Form[K]) => setForm((o) => ({ ...o, [k]: v }));

  const scope = meta?.scope;
  const winCount = (c: string) => ov?.window.byStatus.find((s) => s.code === c)?.count ?? 0;
  const appOptions = useMemo(() => {
    const groups = new Map<string, DashMeta['apps']>();
    for (const a of meta?.apps ?? []) groups.set(a.group, [...(groups.get(a.group) ?? []), a]);
    return [...groups.entries()];
  }, [meta]);

  if (metaErr) return <section className="card"><ErrorState title="The dashboard is not available" message={metaErr} onRetry={() => { setMetaErr(''); dashMeta().then(setMeta).catch((e: Error) => setMetaErr(e.message)); }} /></section>;

  const w = ov?.window;
  const total = data?.total ?? 0;
  const first = total ? (data!.page - 1) * data!.pageSize + 1 : 0;
  const last = data ? Math.min(data.page * data.pageSize, total) : 0;
  const pages = data ? Math.max(1, Math.ceil(total / data.pageSize)) : 1;
  const sortMark = (k: SortKey) => (sort.k === k ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '');
  const th = (k: SortKey, text: string) => (
    <th aria-sort={sort.k === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="dd-th" onClick={() => onSort(k)}>{text}{sortMark(k)}</button>
    </th>
  );

  return (
    <>
      <section className="card">
        <div className="card-bar">
          <div className="block-head"><span className="block-icon"><IconChart size={16} /></span><h2>MDM dashboard</h2></div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { loadOverview(); loadList(); }}><IconRefresh size={14} /> Refresh</button>
        </div>
        <p className="muted dd-lead">
          Where every master data request is waiting, with whom and for how long. Read live from SAP and read only: nothing here approves, forwards, repairs or changes a request.
          {scope && <> <strong>{scope.message}</strong></>}
        </p>

        <div className="dd-ctrl">
          <fieldset className="dd-apps">
            <legend>Applications</legend>
            <div className="dd-chips">
              {MATERIAL.map((id) => {
                const a = meta?.apps.find((x) => x.appId === id);
                return (
                  <label key={id} className={`dd-appchip ${apps.includes(id) ? 'on' : ''}`}>
                    <input type="checkbox" checked={apps.includes(id)} onChange={() => toggleApp(id)} />
                    <strong>{id}</strong> {a?.label ?? MATERIAL_NAMES[id] ?? id}{a && <span>{a.total}</span>}
                  </label>
                );
              })}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setApps(MATERIAL); setPage(1); }}>Material only</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setApps([]); setPage(1); }} title="No app selected means all apps">All apps</button>
            </div>
            <details className="dd-more-apps">
              <summary>Other applications{apps.filter((a) => !MATERIAL.includes(a)).length > 0 ? ` (${apps.filter((a) => !MATERIAL.includes(a)).length} selected)` : ''}</summary>
              <div className="dd-app-groups">
                {appOptions.map(([g, list]) => (
                  <div key={g}>
                    <h5>{g}</h5>
                    {list.filter((a) => !MATERIAL.includes(a.appId)).map((a) => (
                      <label key={a.appId} className="dd-check"><input type="checkbox" checked={apps.includes(a.appId)} onChange={() => toggleApp(a.appId)} /> <strong>{a.appId}</strong> {a.label} <span className="muted">({a.total})</span></label>
                    ))}
                  </div>
                ))}
              </div>
            </details>
          </fieldset>
          <fieldset className="dd-window">
            <legend>Created in window</legend>
            <label>From<input type="date" value={win.from} disabled={win.all} max={win.to} onChange={(e) => { setPage(1); setWin((o) => ({ ...o, from: e.target.value })); }} /></label>
            <label>To<input type="date" value={win.to} disabled={win.all} min={win.from} onChange={(e) => { setPage(1); setWin((o) => ({ ...o, to: e.target.value })); }} /></label>
            <label className="dd-check"><input type="checkbox" checked={win.all} onChange={(e) => { setPage(1); setWin((o) => ({ ...o, all: e.target.checked })); }} /> All dates</label>
            <small className="muted">The window is the creation date of the request (the old board&apos;s start date). It limits the counts of created requests and the list; the waiting picture below is always live.</small>
          </fieldset>
        </div>
      </section>

      {ovState === 'error' && <section className="card"><ErrorState message={ovErr} onRetry={loadOverview} /></section>}
      {ovState === 'loading' && !ov && <section className="card"><LoadingState text="Counting requests in SAP…" /></section>}

      {ov && ovState !== 'error' && (
        <>
          <h3 className="dd-h">Right now, whatever the date</h3>
          <div className="dd-cards">
            <Card tone="blue" icon={<IconInbox />} value={ov.now.openReal} label="Open and waiting" note={`${ov.now.openFresh} recent · ${ov.now.openStale} stale`} onClick={() => doFocus({ label: 'Open and waiting', statusGroup: 'open' })} />
            <Card tone="violet" icon={<IconClock />} value={ov.now.openStale} label={`Stale (over ${meta?.staleDays ?? 90} days)`} note="open but untouched for months" onClick={() => doFocus({ label: 'Stale open requests', statusGroup: 'stale' })} />
            <Card tone="amber" icon={<IconAlert />} value={ov.now.broken} label="Status and workflow disagree" note="reported only, never repaired" onClick={() => doFocus({ label: 'Status and workflow disagree', statusGroup: 'broken' })} />
          </div>
          <h3 className="dd-h">Created in the window{w && w.dateFrom ? `: ${fmtTs(w.dateFrom, false)} to ${fmtTs(w.dateTo, false)}` : ': all dates'} <span className="muted">({w?.total ?? 0} requests)</span></h3>
          <div className="dd-cards">
            <Card tone="violet" icon={<IconDraft />} value={winCount('00')} label="Saved as draft (00)" onClick={() => pickStatus('00')} />
            <Card tone="blue" icon={<IconFlow />} value={winCount('01')} label="Requested (01)" onClick={() => pickStatus('01')} />
            <Card tone="blue" icon={<IconClock />} value={winCount('02')} label="In progress (02)" onClick={() => pickStatus('02')} />
            <Card tone="amber" icon={<IconUndo />} value={winCount('04')} label="Sent back (04)" onClick={() => pickStatus('04')} />
            <Card tone="green" icon={<IconCheck />} value={winCount('03')} label="Completed (03)" onClick={() => pickStatus('03')} />
            <Card tone="amber" icon={<IconX />} value={winCount('05')} label="Rejected (05)" onClick={() => pickStatus('05')} />
            <Card tone="blue" icon={<IconFlow />} value={w?.inProgressOld ?? 0} label="01 + 02 + 04 together" note="what the old board called In progress" onClick={() => pickStatus('inprogress')} />
            <Card tone="violet" icon={<IconFile />} value={w?.duplicates ?? 0} label="Flagged duplicate" onClick={() => pickStatus('', true)} />
            <Card tone="green" icon={<IconClock />} value={w && w.tatSamples ? fmtDur(w.avgTatSeconds) : '—'} label="Average turnaround" note={w && w.tatSamples ? `completed, first to last step, median ${fmtDur(w.medianTatSeconds)} (${w.tatSamples} requests)` : 'no completed request with two steps'} />
          </div>

          <section className="card dd-charts">
            <div className="card-bar">
              <div className="block-head"><span className="block-icon"><IconFlow size={16} /></span><h3>Where the open requests wait</h3></div>
              <div className="dd-chart-ctl">
                <label className="dd-check"><input type="checkbox" checked={showStale} onChange={(e) => setShowStale(e.target.checked)} /> Draw stale requests in the bars</label>
                <label>App
                  <select value={chartApp} onChange={(e) => setChartApp(e.target.value)}>
                    <option value="">All selected</option>
                    {[...new Set(ov.stages.map((s) => s.appId))].map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
              </div>
            </div>
            <div className="dd-legend" aria-hidden><span><i className="dd-sw dd-sw-fresh" /> recent (up to {meta?.staleDays ?? 90} days)</span><span><i className="dd-sw dd-sw-stale" /> stale (striped)</span></div>
            <div className="dd-chart-grid">
              <div>
                <h4 className="dd-sub">By level and kind of step</h4>
                <StageFunnel overview={ov} meta={meta} onFocus={doFocus} appFilter={chartApp} showStale={showStale} />
              </div>
              <div>
                <h4 className="dd-sub"><IconUsers size={14} /> Agents holding the most requests</h4>
                <AgentRanking overview={ov} meta={meta} onFocus={doFocus} showStale={showStale} />
              </div>
              <div>
                <h4 className="dd-sub">How long they have been waiting</h4>
                <AgingStrip overview={ov} meta={meta} onFocus={doFocus} appFilter={chartApp} />
              </div>
              <div>
                <h4 className="dd-sub"><IconAlert size={14} /> Broken workflows</h4>
                <p className="muted dd-note">The request status and the workflow disagree. The old board repaired some of these on page load; this one only reports them.</p>
                <BrokenList flags={ov.now.byFlag} onFocus={doFocus} />
              </div>
            </div>
            <details className="dd-approx"><summary>How &quot;waiting&quot; is worked out</summary><p className="muted dd-note">{APPROX_NOTE}</p></details>
          </section>
        </>
      )}

      <section className="card card-flush" ref={listRef} id="dd-list">
        <div className="card-bar">
          <div className="block-head"><span className="block-icon"><IconSearch size={16} /></span><h3>Requests</h3>{data && <span className="count-chip">{total}</span>}</div>
          <div className="dd-actions">
            {data && data.rows.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => exportRowsCsv(data.rows, statusLabel)}><IconFile size={14} /> Export page (CSV)</button>}
          </div>
        </div>

        {focus && (
          <div className="dd-focus" role="status">
            <span>Showing: <strong>{focus.label}</strong> (all dates, selected applications)</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setFocus(null); setPage(1); }}><IconX size={13} /> Clear</button>
          </div>
        )}

        <form className="dd-filters" onSubmit={submit}>
          <label>T-ID<input inputMode="numeric" value={form.transId} onChange={(e) => setF('transId', e.target.value)} placeholder="e.g. 26713" /></label>
          {scope?.admin !== false && <label>Initiator<input value={form.user} onChange={(e) => setF('user', e.target.value)} placeholder="SAP user or e-mail" disabled={scope?.restricted} /></label>}
          <label>Status
            <select value={form.status} onChange={(e) => setF('status', e.target.value)}>
              <option value="">Any</option>
              {(meta?.statuses ?? []).map((s) => <option key={s.code} value={s.code}>{s.code} {s.label}</option>)}
              <option value="inprogress">01 + 02 + 04 (old &quot;In progress&quot;)</option>
            </select>
          </label>
          <label>Material type<input value={form.mtype} onChange={(e) => setF('mtype', e.target.value)} placeholder="e.g. FERT" /></label>
          <label>Plant<input value={form.plant} onChange={(e) => setF('plant', e.target.value)} placeholder="e.g. UN13" /></label>
          <label>Second routing field<input value={form.genField2} onChange={(e) => setF('genField2', e.target.value)} placeholder="GEN_FIELD2" /></label>
          <label>SAP code<input value={form.objValue} onChange={(e) => setF('objValue', e.target.value)} placeholder="Material number" /></label>
          <label>Description<input value={form.text} onChange={(e) => setF('text', e.target.value)} placeholder="Text in the description" /></label>
          <label>Duplicate flag
            <select value={form.duplicate} onChange={(e) => setF('duplicate', e.target.value as Form['duplicate'])}>
              <option value="">All</option><option value="Y">Duplicates only</option><option value="N">No duplicates</option>
            </select>
          </label>
          <div className="dd-factions">
            <button type="submit" className="btn btn-primary btn-sm"><IconSearch size={14} /> Search</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>Clear</button>
          </div>
          <p className="muted dd-fnote">All filled fields apply together. A T-ID or SAP code search ignores the date window.</p>
        </form>

        {state === 'loading' && !data && <LoadingState />}
        {state === 'error' && <ErrorState message={err} onRetry={loadList} />}
        {data && state !== 'error' && (
          <div className={state === 'loading' ? 'dd-busy' : ''} aria-busy={state === 'loading'}>
            {data.message && <p className="alert alert-warn dd-pad">{data.message}</p>}
            {data.rows.length === 0 ? (
              <div className="empty"><span className="empty-icon" aria-hidden><IconInbox size={22} /></span><p><strong>No request found.</strong><br /><span className="muted">Change the filters or widen the date window.</span></p></div>
            ) : (
              <div className="table-wrap">
                <table className="table table-click dd-table">
                  <thead>
                    <tr>
                      {th('status', 'Status')}{th('transId', 'T-ID')}{th('app', 'Application')}<th className="dd-hide-sm">SAP code</th><th>Description</th><th className="dd-hide-sm">Type / plant</th>
                      <th className="dd-hide-sm">Initiator</th>{th('created', 'Created')}<th>Waiting at</th><th>Pending with</th>{th('age', 'Waiting for')}<th className="dd-hide-sm">Turnaround</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => <Row key={`${r.transId}-${r.appId}`} r={r} open={() => setOpenId(r.transId)} />)}
                  </tbody>
                </table>
              </div>
            )}
            {total > 0 && (
              <div className="dd-pager">
                <span className="muted">{first}–{last} of {total}</span>
                <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
                <span className="muted">Page {page} of {pages}</span>
                <button type="button" className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            )}
          </div>
        )}
      </section>

      {openId && <DetailDrawer transId={openId} onClose={() => setOpenId('')} />}
    </>
  );
}

function Card({ tone, icon, value, label, note, onClick }: { tone: 'blue' | 'amber' | 'violet' | 'green'; icon: React.ReactNode; value: number | string; label: string; note?: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className="stat-icon" aria-hidden>{icon}</span>
      <span className="stat-text"><strong>{value}</strong><span>{label}</span>{note && <small>{note}</small>}</span>
    </>
  );
  return onClick
    ? <button type="button" className={`stat-card tone-${tone} dd-card`} onClick={onClick} aria-label={`${label}: ${value}. Show these requests.`}>{inner}</button>
    : <div className={`stat-card tone-${tone} dd-card`}>{inner}</div>;
}

function Row({ r, open }: { r: DashRow; open: () => void }) {
  const waiting = r.pendingItems > 0
    ? <><strong>{r.pendingLevel || '?'}</strong> <span className="muted">{r.pendingType}{r.pendingDept ? ` · ${r.pendingDept}` : ''}</span></>
    : <span className="muted">—</span>;
  return (
    <tr onClick={open}>
      <td>
        <span className={`badge ${STATUS_CLS[r.status] ?? 'badge-neutral'}`}>{r.statusText}</span>
        {r.flags.length > 0 && <span className="dd-flag" title={r.flags.join(', ').replace(/_/g, ' ').toLowerCase()}><span aria-hidden>!</span><span className="dd-sr"> status and workflow disagree: {r.flags.join(', ').replace(/_/g, ' ').toLowerCase()}</span></span>}
        {r.stale && <span className="pill dd-stale-pill">stale</span>}
      </td>
      <td className="nowrap"><button type="button" className="dd-linkbtn matno" onClick={(e) => { e.stopPropagation(); open(); }}>{r.transId.replace(/^0+/, '')}</button>{r.duplicate && <span className="pill dd-dup" title="Flagged as duplicate">dup</span>}</td>
      <td><span className="pill">{r.appId}</span> <span className="muted dd-hide-sm">{r.appText}</span></td>
      <td className="dd-hide-sm matno">{r.objValue || <span className="muted">—</span>}</td>
      <td className="dd-desc">{r.description || <span className="muted">—</span>}</td>
      <td className="dd-hide-sm nowrap">{r.materialType || '—'}{r.plant ? ` / ${r.plant}` : ''}</td>
      <td className="dd-hide-sm">{r.initiatorName || r.initiator}</td>
      <td className="nowrap">{fmtTs(r.created)}</td>
      <td>{waiting}</td>
      <td className="dd-agentcell">{r.pendingNames || (r.pendingItems > 0 ? <span className="muted">no agent</span> : <span className="muted">—</span>)}</td>
      <td className="nowrap">{r.pendingItems > 0 ? <span title={`Waiting since ${fmtTs(r.pendingSince)}`}>{fmtAge(r.ageSeconds)}</span> : <span className="muted">—</span>}</td>
      <td className="dd-hide-sm nowrap">{r.tatSeconds > 0 ? fmtDur(r.tatSeconds) : <span className="muted">—</span>}</td>
    </tr>
  );
}
