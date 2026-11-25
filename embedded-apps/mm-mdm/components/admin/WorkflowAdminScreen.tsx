'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { WfCfg, WfKey, WfMeta, WfSummary, emptyKey, wfApi } from '@/lib/admin/wfApi';
import { keyText, sameKey, visibleKeyFields } from '@/lib/admin/wfLogic';
import { IconCopy, IconPlus, IconSearch } from '../icons';
import { ErrorState, LoadingState } from '../ui';
import GroupEditor, { EditorTarget } from './wf/GroupEditor';
import LogPanel from './wf/LogPanel';
import { ConfirmDialog, MessageBox, VhInput } from './wf/parts';
import { CopyDialog, MassAgentPanel, WhereUsedPanel } from './wf/ToolsPanels';

type Top = 'groups' | 'user' | 'mass' | 'log';
const TOPS: [Top, string][] = [['groups', 'Combinations'], ['user', 'Where is a user used'], ['mass', 'Mass agent change'], ['log', 'Change History']];

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
      <section className="card wf-head">
        <form className="wf-form" onSubmit={(e) => { e.preventDefault(); search(appId, filter); }}>
          <div className="wf-form-fields">
            <div className="wf-frow">
              <label htmlFor="wf-app"><span className="req" aria-hidden>* </span>Application Id</label>
              <select id="wf-app" value={appId} onChange={(e) => chooseApp(e.target.value)}>
                <option value="">Choose…</option>
                {apps.map((a) => <option key={a.appId} value={a.appId}>{a.appId} - {a.text} ({a.groupCount})</option>)}
              </select>
            </div>
            {fields.map((f) => <VhInput key={f.field} id={`wf-f-${f.field}`} label={f.label} kind={f.vh} appId={appId} value={filter[f.field]} onChange={(v) => setFilter({ ...filter, [f.field]: v })} placeholder="any, * allowed" className="wf-frow" />)}
          </div>
          <div className="wf-form-btns">
            <button type="submit" className="btn btn-sm btn-primary" disabled={!appId || busy}><IconSearch size={14} /> Search</button>
            <button type="button" className="btn btn-sm" disabled={!appId} onClick={() => guard(() => { setTarget({ kind: 'new', appId }); setDirty(false); setTop('groups'); })}><IconPlus size={14} /> New</button>
            <button type="button" className="btn btn-sm" disabled={!appId || !filter.genType} title="Copy all combinations of the type in the filter" onClick={() => guard(() => setCopy({ key: { ...emptyKey(appId), genType: filter.genType }, mode: 'type' }))}><IconCopy size={14} /> Copy type</button>
            <button type="button" className={`btn btn-sm ${top === 'mass' ? 'btn-primary' : ''}`} onClick={() => setTop(top === 'mass' ? 'groups' : 'mass')}>Mass Agent Change</button>
            <span className="wf-form-sep" />
            {TOPS.filter(([id]) => id !== 'groups' && id !== 'mass').map(([id, label]) => <button key={id} type="button" className={`btn btn-sm btn-ghost ${top === id ? 'on' : ''}`} onClick={() => setTop(top === id ? 'groups' : id)}>{label}</button>)}
          </div>
        </form>
        {cfg && !cfg.wfId && <p className="wf-warn-text wf-appinfo">No workflow template (key WF_ID): requests cannot start</p>}
      </section>

      {top === 'groups' && (
        <div className="wf-board">
          <section className="card wf-list wf-pane" aria-label="General details">
            <div className="wf-pane-bar"><h2>General Details</h2><span className="muted">{list ? `${list.length} found` : ''}</span></div>
            <MessageBox error={err} />
            {!appId && <div className="empty"><p>Choose an application to see its combinations.</p></div>}
            {busy && <LoadingState text="Reading the combinations from SAP…" />}
            {!busy && list && list.length === 0 && <div className="empty"><p>No combination found. Create one with New.</p></div>}
            {!busy && list && list.length > 0 && (
              <div className="wf-list-scroll">
                <table className="wf-grid wf-list-grid">
                  <thead><tr><th className="wf-c-sel" />{fields.map((f) => <th key={f.field}>{f.label}</th>)}<th title="Reviewer / Approver levels">R / A</th><th>Agents</th><th /></tr></thead>
                  <tbody>
                    {list.map((g) => {
                      const sel = target?.kind === 'existing' && sameKey(target.key, g);
                      return (
                        <tr key={keyText(g)} className={sel ? 'wf-sel' : ''} tabIndex={0} aria-selected={sel} onClick={() => open(g)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(g); } }}>
                          <td className="wf-c-sel"><input type="radio" name="wf-grp" checked={sel} readOnly aria-label="Select" /></td>
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
              <section className="card wf-pane wf-placeholder"><div className="empty"><p>{appId ? 'Select a combination, or create a new one.' : 'Choose an application first.'}</p></div></section>
            )}
          </div>
        </div>
      )}

      {top === 'user' && <section className="card"><div className="card-bar"><h2>Where is a user used</h2></div><div className="tab-body"><WhereUsedPanel appId={appId} onOpen={(k) => { setAppId(k.appId); setFilter(emptyKey(k.appId)); search(k.appId, emptyKey(k.appId)); open(k); }} /></div></section>}
      {top === 'mass' && <section className="card"><div className="card-bar"><h2>Mass agent change</h2></div><div className="tab-body"><MassAgentPanel appId={appId} cfg={cfg} /></div></section>}
      {top === 'log' && <section className="card"><div className="card-bar"><h2>Change History</h2></div><div className="tab-body">{appId ? <LogPanel key={appId} appId={appId} cfg={cfg} /> : <p className="muted">Choose an application first.</p>}</div></section>}

      {pending && (
        <ConfirmDialog title="Discard unsaved changes?" confirmText="Discard" danger onCancel={() => setPending(null)} onConfirm={() => { const fn = pending; setPending(null); setDirty(false); fn(); }}>
          <p>Note : Before action kindly save the data otherwise modified data will be lost.</p>
        </ConfirmDialog>
      )}
      {copy && <CopyDialog source={copy.key} cfg={cfg} mode={copy.mode} onClose={() => setCopy(null)} onDone={(k) => { setCopy(null); refresh(); if (k) open(k); }} />}
    </div>
  );
}
