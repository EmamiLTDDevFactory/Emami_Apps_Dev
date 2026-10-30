import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ccbApi } from './api.js';
import RequestForm from './RequestForm.jsx';
import RequestDetail from './RequestDetail.jsx';
import { Blocker, Button, Card, CcbShell, ChangeTypePills, Empty, LandscapePill, Loading, Meta, PageHeader, Person, Pill, ScopePill, Tabs, useCcbMe, useToast } from './ui.jsx';
import { CATEGORY_META, CHANGE_TYPES, LANDSCAPES, PRIORITY_META, PROCESS_STEPS, SLA_TONE, STATUS_META, currentStepIndex, dateOnly, fmtDate, isClosed, isDelivered, isInDelivery, relative, requestLink, slaOf, stageLabel, todayIso } from './model.js';
import { BoltIcon, ClipboardIcon, ClockIcon, DownloadIcon, PlusIcon, SearchIcon } from '../shared/icons.jsx';

const TABS = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'draft', label: 'Drafts', test: (r) => r.status === 'draft' },
  { key: 'moduleLead', label: 'Module Lead review', test: (r) => r.status === 'module_lead_review' },
  { key: 'review', label: 'Feasibility review', test: (r) => r.status === 'feasibility_review' },
  { key: 'ccb', label: 'Awaiting CCB', test: (r) => r.status === 'awaiting_ccb' },
  { key: 'delivery', label: 'In delivery', test: isInDelivery },
  { key: 'delivered', label: 'Delivered', test: isDelivered },
  { key: 'closed', label: 'Closed', test: isClosed },
];

function readParams() {
  const p = new URLSearchParams(window.location.search);
  return { cr: p.get('cr'), action: p.get('action'), tab: p.get('tab'), view: p.get('view'), step: p.get('step') };
}

export default function Requests() {
  const { me, error, loading, reload } = useCcbMe();
  const [params, setParams] = useState(readParams);
  const [creating, setCreating] = useState(params.action === 'new');

  useEffect(() => {
    const onPop = () => setParams(readParams());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = useCallback((cr) => {
    const url = cr ? requestLink(cr) : window.location.pathname;
    window.history.pushState({}, '', url);
    setParams(readParams());
    window.scrollTo(0, 0);
  }, []);

  return (
    <CcbShell active="ccbRequests" onCreate={me?.can.log ? () => setCreating(true) : undefined}>
      {loading ? <Loading /> : error ? <Blocker error={error} onRetry={reload} /> : params.cr ? (
        <RequestDetail key={params.cr} crKey={params.cr} me={me} onBack={() => go(null)} />
      ) : (
        <Register me={me} initialTab={params.tab} initialView={params.view} initialStep={params.step} onOpen={go} onCreate={() => setCreating(true)} />
      )}
      {creating && me && (
        <RequestForm
          onClose={() => setCreating(false)}
          onSaved={(r) => { setCreating(false); go(r.crNo); }}
        />
      )}
    </CcbShell>
  );
}

function Register({ me, initialTab, initialView, initialStep, onOpen, onCreate }) {
  const [data, setData] = useState({ loading: true, requests: [], names: {}, settings: null, error: null });
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [tab, setTab] = useState(TABS.some((t) => t.key === initialTab) ? initialTab : 'all');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [fn, setFn] = useState('');
  const [landscape, setLandscape] = useState(''); // '' | 'SAP' | 'Non-SAP' | 'earlier'
  const [changeType, setChangeType] = useState(''); // '' | 'Workbench' | 'Customizing'
  const [mine, setMine] = useState(false);
  // ?step=<process step> (from the Overview "Process pipeline"): open requests currently at that step.
  const [step, setStep] = useState(PROCESS_STEPS.some((s) => s.key === initialStep) ? initialStep : '');
  const stepMeta = PROCESS_STEPS.find((s) => s.key === step);
  const [toast, showToast] = useToast();
  // People who log requests (IT SPOC / Module Lead) land on their own and their team's requests; everyone else on the register.
  const [view, setView] = useState(initialView === 'all' || initialView === 'mine' ? initialView : stepMeta ? 'all' : me.can.log ? 'mine' : 'all');

  const load = useCallback(() => {
    ccbApi.requests()
      .then((d) => setData({ loading: false, requests: d.requests, names: d.names, settings: d.settings || null, error: null }))
      .catch((e) => setData((s) => ({ ...s, loading: false, error: e })));
  }, []);
  useEffect(load, [load]);

  const functions = useMemo(() => [...new Set(data.requests.map((r) => r.requestingFunction))].sort(), [data.requests]);
  const base = useMemo(() => data.requests.filter((r) => {
    if (step && (isClosed(r) || PROCESS_STEPS[currentStepIndex(r)]?.key !== step)) return false;
    if (category && r.category !== category) return false;
    if (fn && r.requestingFunction !== fn) return false;
    if (changeType && !(r.changeTypes || []).includes(changeType)) return false;
    if (landscape && (landscape === 'earlier' ? LANDSCAPES.includes(r.sapSystem) : r.sapSystem !== landscape)) return false;
    if (mine && r.loggedBy !== me.email) return false;
    if (overdueOnly && slaOf(r, data.settings)?.state !== 'over') return false;
    const q = search.trim().toLowerCase();
    if (q && !`${r.crNo} ${r.title} ${r.requestingFunction} ${r.requestedBy} ${r.sapSystem} ${(r.changeTypes || []).join(' ')} ${(r.sapModules || []).join(' ')}`.toLowerCase().includes(q)) return false;
    return true;
  }), [data.requests, step, category, fn, landscape, changeType, mine, search, me.email, overdueOnly, data.settings]);
  const overdueCount = useMemo(() => data.requests.filter((r) => slaOf(r, data.settings)?.state === 'over').length, [data.requests, data.settings]);
  const rows = useMemo(() => base.filter(TABS.find((t) => t.key === tab).test), [base, tab]);
  const nameOf = (e) => (e ? data.names[e] || e : '');

  async function exportExcel() {
    try {
      const XLSX = await import('xlsx');
      const sheet = XLSX.utils.json_to_sheet(rows.map((r) => ({
        'CR No': r.crNo, Title: r.title, Function: r.requestingFunction, 'Raised by': r.requestedBy, 'BRD reference': r.brdReference,
        'IT landscape': r.sapSystem, 'SAP change type': (r.changeTypes || []).join(' + '), 'Areas affected': (r.sapModules || []).join(', '), Category: CATEGORY_META[r.category]?.label,
        'CCB scope': CATEGORY_META[r.category]?.inScope ? 'In scope' : 'Out of scope', Priority: PRIORITY_META[r.priority]?.label,
        Emergency: r.isEmergency ? 'Yes' : 'No', Status: STATUS_META[r.status]?.label, Stage: stageLabel(r), Feasibility: r.feasibility || '',
        Decision: r.decision || '', 'Decision notes': r.decisionNotes || '', Meeting: r.meetingNo || '', 'Decided on': r.decidedAt ? fmtDate(r.decidedAt) : '',
        'Dev Tracker': r.devTrackerIssueNo != null ? `Assignment-${r.devTrackerIssueNo}` : '', Developer: r.devDeveloper || '',
        'IT SPOC': nameOf(r.loggedBy), 'Logged on': fmtDate(r.createdAt), 'Required by': r.requiredBy ? fmtDate(r.requiredBy) : '',
        'Waiting on': slaOf(r, data.settings)?.who || '', 'Days in stage': slaOf(r, data.settings)?.used ?? '', 'Target': slaOf(r, data.settings) ? `${slaOf(r, data.settings).limit} ${slaOf(r, data.settings).unit}s` : '',
        'Service level': ({ ok: 'On track', due: 'Due soon', over: 'Over target' })[slaOf(r, data.settings)?.state] || '',
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, 'CCB register');
      XLSX.writeFile(wb, `CCB-register-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      showToast('Could not export the register.', 'error');
    }
  }

  return (
    <>
      <PageHeader eyebrow="Change Control Board" title="Change Requests" sub="The CCB register: every IT change request from logging through decision to delivery.">
        <Button icon={DownloadIcon} onClick={exportExcel} disabled={!rows.length}>Export Excel</Button>
        {me.can.log && <Button variant="primary" icon={PlusIcon} onClick={onCreate}>Log change request</Button>}
      </PageHeader>

      <div className="ccb-viewswitch" role="tablist">
        <button type="button" role="tab" aria-selected={view === 'mine'} className={view === 'mine' ? 'active' : ''} onClick={() => setView('mine')}>
          My requests <span>{data.requests.filter((r) => r.loggedBy === me.email || r.moduleLeadEmail === me.email).length}</span>
        </button>
        <button type="button" role="tab" aria-selected={view === 'all'} className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>
          All requests <span>{data.requests.length}</span>
        </button>
      </div>

      {view === 'mine' ? (
        data.loading ? <Loading /> : data.error ? <Blocker error={data.error} onRetry={load} /> : (
          <MyRequests me={me} requests={data.requests.filter((r) => r.loggedBy === me.email || r.moduleLeadEmail === me.email)} names={data.names} canLog={me.can.log} onOpen={onOpen} onCreate={onCreate} />
        )
      ) : (
      <Card pad={false}>
        <Tabs tabs={TABS.map((t) => ({ key: t.key, label: t.label, count: base.filter(t.test).length }))} value={tab} onChange={setTab} />
        <div className="ccb-toolbar">
          <div className="ccb-search">
            <SearchIcon size={14} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search CR number, title, function, SAP / Non-SAP, area…" />
          </div>
          <select className="ccb-select" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {Object.entries(CATEGORY_META).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
          </select>
          <select className="ccb-select" value={landscape} onChange={(e) => setLandscape(e.target.value)} aria-label="IT landscape">
            <option value="">SAP + Non-SAP</option>
            {LANDSCAPES.map((g) => <option key={g} value={g}>{g}</option>)}
            <option value="earlier">Earlier IT areas</option>
          </select>
          <select className="ccb-select" value={changeType} onChange={(e) => { setChangeType(e.target.value); if (e.target.value) setLandscape('SAP'); }} aria-label="SAP change type">
            <option value="">Workbench + Customizing</option>
            {CHANGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="ccb-select" value={fn} onChange={(e) => setFn(e.target.value)}>
            <option value="">All functions</option>
            {functions.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          {stepMeta && (
            <button type="button" className="ccb-chip-toggle on" title="Clear this filter" onClick={() => {
              setStep('');
              const url = new URL(window.location.href); url.searchParams.delete('step'); window.history.replaceState({}, '', url);
            }}>Step {PROCESS_STEPS.indexOf(stepMeta) + 1}: {stepMeta.label} ×</button>
          )}
          {me.can.log && (
            <button type="button" className={`ccb-chip-toggle${mine ? ' on' : ''}`} onClick={() => setMine((m) => !m)}>Logged by me</button>
          )}
          {(overdueCount > 0 || overdueOnly) && (
            <button type="button" className={`ccb-chip-toggle${overdueOnly ? ' on' : ''}`} onClick={() => setOverdueOnly((v) => !v)} title="Waiting longer than the targets set in Governance">
              <ClockIcon size={12} /> Over target ({overdueCount})
            </button>
          )}
        </div>
        {data.loading ? <Loading /> : data.error ? <Blocker error={data.error} onRetry={load} /> : rows.length === 0 ? (
          <Empty icon={ClipboardIcon} title={data.requests.length ? 'Nothing matches these filters' : 'No change requests yet'}
            action={!data.requests.length && me.can.log ? <Button variant="primary" icon={PlusIcon} onClick={onCreate}>Log the first request</Button> : null}>
            {data.requests.length ? 'Try another tab or clear the search.' : 'IT SPOCs log a request here once a function raises a requirement with its BRD.'}
          </Empty>
        ) : (
          <div className="ccb-table-wrap">
            <table className="ccb-table">
              <thead>
                <tr><th>CR No</th><th>Request</th><th>Category</th><th>Priority</th><th>Status</th><th>Where it is</th><th>IT SPOC</th><th>Updated</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => onOpen(r.crNo)}>
                    <td><a className="ccb-key" href={requestLink(r.crNo)} onClick={(e) => { e.preventDefault(); }}>{r.crNo}</a></td>
                    <td className="title-cell">
                      <strong>{r.isEmergency && <BoltIcon size={12} style={{ color: 'var(--st-red)', marginRight: 4, verticalAlign: '-1px' }} />}{r.title}</strong>
                      <small><LandscapePill system={r.sapSystem} /> <ChangeTypePills types={r.changeTypes} /> {r.requestingFunction}{r.sapModules?.length ? ` · ${r.sapModules.join(', ')}` : ''}</small>
                    </td>
                    <td><ScopePill category={r.category} categories={CATEGORY_META} /></td>
                    <td><Meta meta={PRIORITY_META} value={r.priority} /></td>
                    <td><Meta meta={STATUS_META} value={r.status} /></td>
                    <td className="stage-cell">
                      {r.devTrackerIssueNo != null ? <span>{stageLabel(r)} <small className="ccb-muted ccb-mono">· A-{r.devTrackerIssueNo}</small></span> : <span className="ccb-muted">{stageLabel(r)}</span>}
                      <SlaBadge sla={slaOf(r, data.settings)} />
                    </td>
                    <td className="nowrap"><Person name={nameOf(r.loggedBy)} size={20} /></td>
                    <td className="nowrap ccb-muted">{relative(r.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      )}
      {!me.can.log && (
        <p className="ccb-muted" style={{ fontSize: 11.5, marginTop: 12 }}>
          You can view the register. Logging requests needs the IT SPOC or Module Lead role, assigned in the Emami Apps Admin Center.
        </p>
      )}
      {toast}
    </>
  );
}

/** "4 of 5 business days" against the Governance target; red once over. */
export function SlaBadge({ sla }) {
  if (!sla) return null;
  return (
    <div style={{ marginTop: 3 }}>
      <Pill tone={SLA_TONE[sla.state]} title={`Waiting on ${sla.who} since ${fmtDate(sla.since)} · target ${sla.limit} ${sla.unit}s`}>
        <ClockIcon size={10} /> {sla.state === 'over' ? `${sla.used - sla.limit} ${sla.unit}${sla.used - sla.limit === 1 ? '' : 's'} over` : sla.label}
      </Pill>
    </div>
  );
}

/* ---------- My requests (IT SPOC view) ---------- */

const NEEDS_ME = (r, me) => (r.status === 'draft' && r.loggedBy === me.email) || (r.status === 'module_lead_review' && r.moduleLeadEmail === me.email) || (r.status === 'approved' && r.devStatus === 'User Testing' && r.loggedBy === me.email);
const DONE = (r) => isClosed(r) || isDelivered(r) || r.devStatus === 'Cancelled';

/** Who the request is with right now, in plain words. */
function withWhom(r, nameOf, me) {
  switch (r.status) {
    case 'draft': return r.loggedBy === me.email ? (r.returnNote ? 'You — returned for correction' : 'You — draft') : 'IT SPOC — draft';
    case 'module_lead_review': return r.moduleLeadEmail === me.email ? 'You — Module Lead review' : `Module Lead${r.moduleLeadName ? ` (${r.moduleLeadName})` : ''} — review`;
    case 'feasibility_review': return 'IT Application Head — feasibility review';
    case 'awaiting_ccb': return 'Change Control Board — next meeting';
    case 'approved':
      if (r.devStatus === 'User Testing') return `You & ${r.requestedBy} (${r.requestingFunction}) — UAT`;
      if (['Hypercare', 'Completed'].includes(r.devStatus)) return 'Live in production';
      if (r.devStatus === 'Cancelled') return 'Cancelled in Dev Tracker';
      if (!r.devDeveloper) return r.moduleLeadEmail === me.email ? 'You — assign a developer in Dev Tracker' : `Module Lead${r.moduleLeadEmail ? ` (${r.moduleLeadName || nameOf(r.moduleLeadEmail)})` : ''} — assign developer`;
      return `${r.devDeveloper} — ${r.devStatus || 'development'}`;
    default: return 'Closed';
  }
}

function isLate(r) {
  const today = todayIso();
  if (DONE(r)) return false;
  if (r.status === 'approved' && r.devTargetDate) return dateOnly(r.devTargetDate) < today;
  return !!r.requiredBy && dateOnly(r.requiredBy) < today;
}

function MyRequests({ me, requests, names, canLog, onOpen, onCreate }) {
  const nameOf = (e) => (e ? names[e] || e : '');
  const groups = [
    { key: 'action', title: 'Needs your action', items: requests.filter((r) => NEEDS_ME(r, me)) },
    { key: 'progress', title: 'In progress', items: requests.filter((r) => !NEEDS_ME(r, me) && !DONE(r)) },
    { key: 'done', title: 'Delivered & closed', items: requests.filter((r) => !NEEDS_ME(r, me) && DONE(r)) },
  ];
  if (!requests.length) {
    return (
      <div className="ccb-card"><Empty icon={ClipboardIcon} title="You have not logged any change requests"
        action={canLog ? <Button variant="primary" icon={PlusIcon} onClick={onCreate}>Log a change request</Button> : null}>
        Requests you log appear here with live progress, right through development, UAT and go-live.
      </Empty></div>
    );
  }
  return (
    <div className="ccb-my">
      {groups.filter((g) => g.items.length).map((g) => (
        <section key={g.key}>
          <h3 className="ccb-section-label">{g.title} <span className="ccb-muted">· {g.items.length}</span></h3>
          <div className="ccb-my-grid">
            {g.items.map((r) => {
              const step = Math.min(currentStepIndex(r), PROCESS_STEPS.length);
              const late = isLate(r);
              const target = r.status === 'approved' && r.devTargetDate ? r.devTargetDate : r.requiredBy;
              const updated = [r.updatedAt, r.devUpdatedAt].filter(Boolean).sort().pop();
              return (
                <a key={r.id} className={`ccb-my-card${late ? ' is-late' : ''}${g.key === 'action' ? ' is-action' : ''}`} href={requestLink(r.crNo)} onClick={(e) => { e.preventDefault(); onOpen(r.crNo); }}>
                  <div className="ccb-my-top">
                    <span className="ccb-key">{r.crNo}</span>
                    <Meta meta={STATUS_META} value={r.status} />
                    {r.isEmergency && <Pill tone="red"><BoltIcon size={11} /> Emergency</Pill>}
                    {late && <Pill tone="red" strong><ClockIcon size={11} /> Overdue</Pill>}
                  </div>
                  <strong className="ccb-my-title">{r.title}</strong>
                  <div className="ccb-my-stage">{stageLabel(r)}</div>
                  <div className="ccb-my-bar" title={`Step ${Math.min(step + 1, PROCESS_STEPS.length)} of ${PROCESS_STEPS.length}`}>
                    {PROCESS_STEPS.map((s, i) => <i key={s.key} className={i < step ? 'on' : i === step && !DONE(r) ? 'now' : ''} />)}
                  </div>
                  <dl className="ccb-my-meta">
                    <div><dt>With</dt><dd>{withWhom(r, nameOf, me)}</dd></div>
                    <div><dt>Target</dt><dd className={late ? 'late' : ''}>{target ? fmtDate(target) : '—'}</dd></div>
                    <div><dt>Updated</dt><dd>{relative(updated)}</dd></div>
                  </dl>
                </a>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
