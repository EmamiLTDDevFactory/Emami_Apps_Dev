import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ccbApi } from './api.js';
import RequestForm from './RequestForm.jsx';
import RequestDetail from './RequestDetail.jsx';
import { Blocker, Button, Card, CcbShell, Empty, Loading, Meta, PageHeader, Person, Pill, ScopePill, Tabs, useCcbMe, useToast } from './ui.jsx';
import { CATEGORY_META, PRIORITY_META, STATUS_META, fmtDate, isClosed, isDelivered, isInDelivery, relative, requestLink, stageLabel } from './model.js';
import { BoltIcon, ClipboardIcon, DownloadIcon, PlusIcon, SearchIcon } from '../shared/icons.jsx';

const TABS = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'draft', label: 'Drafts', test: (r) => r.status === 'draft' },
  { key: 'review', label: 'Feasibility review', test: (r) => r.status === 'feasibility_review' },
  { key: 'ccb', label: 'Awaiting CCB', test: (r) => r.status === 'awaiting_ccb' },
  { key: 'delivery', label: 'In delivery', test: isInDelivery },
  { key: 'delivered', label: 'Delivered', test: isDelivered },
  { key: 'closed', label: 'Closed', test: isClosed },
];

function readParams() {
  const p = new URLSearchParams(window.location.search);
  return { cr: p.get('cr'), action: p.get('action'), tab: p.get('tab') };
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
        <Register me={me} initialTab={params.tab} onOpen={go} onCreate={() => setCreating(true)} />
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

function Register({ me, initialTab, onOpen, onCreate }) {
  const [data, setData] = useState({ loading: true, requests: [], names: {}, error: null });
  const [tab, setTab] = useState(TABS.some((t) => t.key === initialTab) ? initialTab : 'all');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [fn, setFn] = useState('');
  const [mine, setMine] = useState(false);
  const [toast, showToast] = useToast();

  const load = useCallback(() => {
    ccbApi.requests()
      .then((d) => setData({ loading: false, requests: d.requests, names: d.names, error: null }))
      .catch((e) => setData((s) => ({ ...s, loading: false, error: e })));
  }, []);
  useEffect(load, [load]);

  const functions = useMemo(() => [...new Set(data.requests.map((r) => r.requestingFunction))].sort(), [data.requests]);
  const base = useMemo(() => data.requests.filter((r) => {
    if (category && r.category !== category) return false;
    if (fn && r.requestingFunction !== fn) return false;
    if (mine && r.loggedBy !== me.email) return false;
    const q = search.trim().toLowerCase();
    if (q && !`${r.crNo} ${r.title} ${r.requestingFunction} ${r.requestedBy} ${(r.sapModules || []).join(' ')}`.toLowerCase().includes(q)) return false;
    return true;
  }), [data.requests, category, fn, mine, search, me.email]);
  const rows = useMemo(() => base.filter(TABS.find((t) => t.key === tab).test), [base, tab]);
  const nameOf = (e) => (e ? data.names[e] || e : '');

  async function exportExcel() {
    try {
      const XLSX = await import('xlsx');
      const sheet = XLSX.utils.json_to_sheet(rows.map((r) => ({
        'CR No': r.crNo, Title: r.title, Function: r.requestingFunction, 'Raised by': r.requestedBy, 'BRD reference': r.brdReference,
        'SAP system': r.sapSystem, Modules: (r.sapModules || []).join(', '), Category: CATEGORY_META[r.category]?.label,
        'CCB scope': CATEGORY_META[r.category]?.inScope ? 'In scope' : 'Out of scope', Priority: PRIORITY_META[r.priority]?.label,
        Emergency: r.isEmergency ? 'Yes' : 'No', Status: STATUS_META[r.status]?.label, Stage: stageLabel(r), Feasibility: r.feasibility || '',
        Decision: r.decision || '', 'Decision notes': r.decisionNotes || '', Meeting: r.meetingNo || '', 'Decided on': r.decidedAt ? fmtDate(r.decidedAt) : '',
        'Dev Tracker': r.devTrackerIssueNo != null ? `Assignment-${r.devTrackerIssueNo}` : '', Developer: r.devDeveloper || '',
        'IT SPOC': nameOf(r.loggedBy), 'Logged on': fmtDate(r.createdAt), 'Required by': r.requiredBy ? fmtDate(r.requiredBy) : '',
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
      <PageHeader eyebrow="Change Control Board" title="Change Requests" sub="The CCB register: every SAP change request from logging through decision to delivery.">
        <Button icon={DownloadIcon} onClick={exportExcel} disabled={!rows.length}>Export Excel</Button>
        {me.can.log && <Button variant="primary" icon={PlusIcon} onClick={onCreate}>Log change request</Button>}
      </PageHeader>

      <Card pad={false}>
        <Tabs tabs={TABS.map((t) => ({ key: t.key, label: t.label, count: base.filter(t.test).length }))} value={tab} onChange={setTab} />
        <div className="ccb-toolbar">
          <div className="ccb-search">
            <SearchIcon size={14} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search CR number, title, function, module…" />
          </div>
          <select className="ccb-select" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {Object.entries(CATEGORY_META).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
          </select>
          <select className="ccb-select" value={fn} onChange={(e) => setFn(e.target.value)}>
            <option value="">All functions</option>
            {functions.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          {me.can.log && (
            <button type="button" className={`ccb-chip-toggle${mine ? ' on' : ''}`} onClick={() => setMine((m) => !m)}>Logged by me</button>
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
                      <small>{r.requestingFunction} · {r.sapSystem}{r.sapModules?.length ? ` · ${r.sapModules.join(', ')}` : ''}</small>
                    </td>
                    <td><ScopePill category={r.category} categories={CATEGORY_META} /></td>
                    <td><Meta meta={PRIORITY_META} value={r.priority} /></td>
                    <td><Meta meta={STATUS_META} value={r.status} /></td>
                    <td className="stage-cell">
                      {r.devTrackerIssueNo != null ? <span>{stageLabel(r)} <small className="ccb-muted ccb-mono">· A-{r.devTrackerIssueNo}</small></span> : <span className="ccb-muted">{stageLabel(r)}</span>}
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
      {!me.can.log && (
        <p className="ccb-muted" style={{ fontSize: 11.5, marginTop: 12 }}>
          You can view the register. Logging requests needs the IT SPOC, SAP Module Lead or IT Application Head role — see Governance.
        </p>
      )}
      {toast}
    </>
  );
}
