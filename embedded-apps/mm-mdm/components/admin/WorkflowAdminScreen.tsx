'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { WfCfg, WfKey, WfMeta, WfSummary, emptyKey, wfApi } from '@/lib/admin/wfApi';
import { keyText, sameKey, visibleKeyFields } from '@/lib/admin/wfLogic';
import { IconCopy, IconPlus, IconSearch } from '../icons';
import { ErrorState, LoadingState } from '../ui';
import GroupEditor, { EditorTarget } from './wf/GroupEditor';
import LogPanel from './wf/LogPanel';
import { ConfirmDialog, MessageBox, VhInput } from './wf/parts';
import { CopyDialog, KeyPointsPanel, MassAgentPanel, WhereUsedPanel } from './wf/ToolsPanels';

type Top = 'groups' | 'keys' | 'user' | 'mass' | 'log';
const TOPS: [Top, string][] = [['groups', 'Combinations'], ['keys', 'Key points'], ['user', 'Where is a user used'], ['mass', 'Mass agent change'], ['log', 'Change log']];

/** Workflow maintenance of the flow engine: approval levels (Initiator, Reviewer, Approver) per application and generic key */
export default function WorkflowAdminScreen() {
  const [meta, setMeta] = useState<WfMeta | null>(null);
  const [metaErr, setMetaErr] = useState('');
  const [appId, setAppId] = useState('');
  const [top, setTop] = useState<Top>('groups');
  const [filter, setFilter] = useState<WfKey>(emptyKey());
  const [list, setList] = useState<WfSummary[] | null>(null);
  const [listCfg, setListCfg] = useState<WfCfg | undefined>();
  const [truncated, setTruncated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<null | (() => void)>(null);
  const [copy, setCopy] = useState<null | { key: WfKey; mode: 'single' | 'type' }>(null);

  const loadMeta = useCallback(() => { setMetaErr(''); wfApi.meta().then(setMeta).catch((e: Error) => setMetaErr(e.message)); }, []);
  useEffect(loadMeta, [loadMeta]);

  const cfg = useMemo(() => meta?.apps.find((a) => a.appId === appId), [meta, appId]);
  const guard = (fn: () => void) => { if (dirty) setPending(() => fn); else fn(); };
  const used = list || [];

  const search = useCallback(async (app: string, f: WfKey) => {
    if (!app) return;
    setBusy(true); setErr(null);
    try { const r = await wfApi.search({ ...f, appId: app }); setList(r.groups); setListCfg(r.cfg); setTruncated(r.truncated); } catch (e) { setErr(e); setList(null); } finally { setBusy(false); }
  }, []);

  const chooseApp = (id: string) => guard(() => { setAppId(id); setFilter(emptyKey(id)); setList(null); setTarget(null); setDirty(false); if (id) search(id, emptyKey(id)); });
  const open = (k: WfKey) => guard(() => { setTarget({ kind: 'existing', key: k }); setDirty(false); setTop('groups'); });
  const refresh = () => search(appId, filter);

  if (metaErr) return <section className="card"><ErrorState title="Workflow maintenance is not available" message={metaErr} onRetry={loadMeta} /></section>;
  if (!meta) return <section className="card"><LoadingState text="Reading the applications from SAP…" /></section>;

  const fields = visibleKeyFields(listCfg || cfg, used);
  const apps = [...meta.apps].sort((a, b) => a.appId.localeCompare(b.appId));

  return (
    <div className="wf-page">
      <div className="page-header">
        <h1>Workflow maintenance</h1>
        <p className="muted">Who reviews and approves a request, per application and generic key (material type, group, business vertical, plant, brand). Changes act on new requests at once and are written to the change log.</p>
      </div>

      <section className="card wf-head">
        <div className="wf-app">
          <div className="field">
            <label className="field-label" htmlFor="wf-app">Application</label>
            <select id="wf-app" value={appId} onChange={(e) => chooseApp(e.target.value)}>
              <option value="">Choose an application…</option>
              {apps.map((a) => <option key={a.appId} value={a.appId}>{a.appId} - {a.text} ({a.groupCount})</option>)}
            </select>
          </div>
          {cfg && <p className="muted wf-appinfo">{cfg.wfId ? <>Workflow template <strong>{cfg.wfId}</strong></> : <span className="wf-warn-text">No workflow template (key WF_ID): requests cannot start</span>}</p>}
        </div>
        <div className="tabs wf-top" role="tablist" aria-label="Maintenance">
          {TOPS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={top === id} className={`tab ${top === id ? 'active' : ''}`} onClick={() => setTop(id)}>{label}</button>)}
        </div>
      </section>

      {top === 'groups' && (
        <div className="wf-split">
          <section className="card wf-list" aria-label="Combinations">
            <div className="card-bar"><h2>Combinations</h2>
              <div className="wf-actions">
                <button type="button" className="btn btn-sm btn-primary" disabled={!appId} onClick={() => guard(() => { setTarget({ kind: 'new', appId }); setDirty(false); })}><IconPlus size={14} /> New</button>
                <button type="button" className="btn btn-sm" disabled={!appId || !filter.genType} title="Copy all combinations of the type in the filter" onClick={() => guard(() => setCopy({ key: { ...emptyKey(appId), genType: filter.genType }, mode: 'type' }))}><IconCopy size={14} /> Copy type</button>
              </div>
            </div>
            <form className="wf-filter wf-filter-compact" onSubmit={(e) => { e.preventDefault(); search(appId, filter); }}>
              {fields.map((f) => <VhInput key={f.field} id={`wf-f-${f.field}`} label={f.label} kind={f.vh} appId={appId} value={filter[f.field]} onChange={(v) => setFilter({ ...filter, [f.field]: v })} placeholder="any, * allowed" />)}
              <button type="submit" className="btn btn-primary" disabled={!appId || busy}><IconSearch size={14} /> Search</button>
            </form>
            <MessageBox error={err} />
            {!appId && <div className="empty"><p>Choose an application to see its combinations.</p></div>}
            {busy && <LoadingState text="Reading the combinations from SAP…" />}
            {!busy && list && list.length === 0 && <div className="empty"><p>No combination found. Create one with New.</p></div>}
            {!busy && list && list.length > 0 && (
              <div className="table-wrap">
                <table className="table table-click wf-table">
                  <thead><tr>{fields.map((f) => <th key={f.field}>{f.label}</th>)}<th>R / A</th><th>Agents</th><th><span className="wf-sr">Status</span></th></tr></thead>
                  <tbody>
                    {list.map((g) => {
                      const sel = target?.kind === 'existing' && sameKey(target.key, g);
                      return (
                        <tr key={keyText(g)} className={sel ? 'wf-sel' : ''} tabIndex={0} aria-selected={sel} onClick={() => open(g)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(g); } }}>
                          {fields.map((f) => <td key={f.field}>{g[f.field] || <span className="muted">-</span>}</td>)}
                          <td className="num">{g.reviewerLevels} / {g.approverLevels}</td>
                          <td className="num">{g.countedAgents}</td>
                          <td>{g.issues.length ? <span className="badge badge-warn" title={g.issues.join('\n')}>{g.issues.length} issue{g.issues.length === 1 ? '' : 's'}</span> : <span className="badge badge-success">ok</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="muted wf-note">{list.length} combination(s){truncated ? ' (list cut at 3000, narrow the search)' : ''}. Hover an issue badge for details.</p>
              </div>
            )}
          </section>
          <div className="wf-edit">
            {target ? (
              <GroupEditor key={target.kind === 'new' ? `new-${target.appId}` : keyText(target.key)} target={target} cfg={cfg} meta={meta} onDirty={setDirty}
                onSaved={(k) => { setTarget({ kind: 'existing', key: k }); refresh(); }}
                onDeleted={() => { setTarget(null); setDirty(false); refresh(); }}
                onCopy={(k) => setCopy({ key: k, mode: 'single' })} onCancelNew={() => { setTarget(null); setDirty(false); }} />
            ) : (
              <section className="card"><div className="empty"><p>{appId ? 'Select a combination, or create a new one.' : 'Choose an application first.'}</p></div></section>
            )}
          </div>
        </div>
      )}

      {top === 'keys' && <section className="card"><div className="card-bar"><h2>Key points</h2></div><div className="tab-body"><KeyPointsPanel appId={appId} /></div></section>}
      {top === 'user' && <section className="card"><div className="card-bar"><h2>Where is a user used</h2></div><div className="tab-body"><WhereUsedPanel appId={appId} onOpen={(k) => { setAppId(k.appId); setFilter(emptyKey(k.appId)); search(k.appId, emptyKey(k.appId)); open(k); }} /></div></section>}
      {top === 'mass' && <section className="card"><div className="card-bar"><h2>Mass agent change</h2></div><div className="tab-body"><MassAgentPanel appId={appId} cfg={cfg} /></div></section>}
      {top === 'log' && <section className="card"><div className="card-bar"><h2>Change log</h2></div><div className="tab-body">{appId ? <LogPanel key={appId} appId={appId} cfg={cfg} /> : <p className="muted">Choose an application first.</p>}</div></section>}

      {pending && (
        <ConfirmDialog title="Discard unsaved changes?" confirmText="Discard" danger onCancel={() => setPending(null)} onConfirm={() => { const fn = pending; setPending(null); setDirty(false); fn(); }}>
          <p>Note : Before action kindly save the data otherwise modified data will be lost.</p>
        </ConfirmDialog>
      )}
      {copy && <CopyDialog source={copy.key} cfg={cfg} mode={copy.mode} onClose={() => setCopy(null)} onDone={(k) => { setCopy(null); refresh(); if (k) open(k); }} />}
    </div>
  );
}
