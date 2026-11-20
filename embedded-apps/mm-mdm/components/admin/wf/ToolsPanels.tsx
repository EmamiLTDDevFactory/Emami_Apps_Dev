'use client';

import { useEffect, useState } from 'react';
import { WfCfg, WfKey, WfKeyRow, WfMassGroup, WfUse, emptyKey, wfApi } from '@/lib/admin/wfApi';
import { keyText, visibleKeyFields } from '@/lib/admin/wfLogic';
import { IconPlus, IconSearch, IconTrash } from '../../icons';
import { LoadingState } from '../../ui';
import { ConfirmDialog, FormDialog, MessageBox, OkBox, VhInput } from './parts';

/** Key points: the SAP workflow template (WF_ID) of the application */
export function KeyPointsPanel({ appId }: { appId: string }) {
  const [rows, setRows] = useState<WfKeyRow[] | null>(null);
  const [base, setBase] = useState('');
  const [err, setErr] = useState<unknown>(null);
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!appId) return;
    setRows(null); setErr(null); setOk('');
    wfApi.keys(appId).then((r) => { setRows(r.keys); setBase(JSON.stringify(r.keys)); }).catch((e) => setErr(e));
  }, [appId]);
  useEffect(() => {
    if (!rows || JSON.stringify(rows) === base) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [rows, base]);
  if (!appId) return <p className="muted">Choose an application first.</p>;
  const save = async () => {
    if (!rows) return;
    setBusy(true); setErr(null); setOk('');
    try { await wfApi.saveKeys(appId, rows); const r = await wfApi.keys(appId); setRows(r.keys); setBase(JSON.stringify(r.keys)); setOk('Successfully Key Points details has been saved'); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const patch = (i: number, p: Partial<WfKeyRow>) => setRows((rs) => (rs || []).map((r, k) => (k === i ? { ...r, ...p } : r)));
  return (
    <div className="wf-keys">
      <p className="muted">The key <code>WF_ID</code> names the SAP Business Workflow template that runs for {appId}. Exactly one active WF_ID is needed; without it no request of this application can start.</p>
      <MessageBox error={err} />
      {ok && <OkBox>{ok}</OkBox>}
      {!rows && !err && <LoadingState text="Reading the key points…" />}
      {rows && (
        <>
          <div className="table-wrap"><table className="table wf-table">
            <thead><tr><th>Key</th><th>Value</th><th>Active</th><th><span className="wf-sr">Remove</span></th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td><input aria-label="Key" value={r.keyName} maxLength={20} onChange={(e) => patch(i, { keyName: e.target.value.toUpperCase() })} /></td>
                  <td><input aria-label="Value" value={r.value} maxLength={20} onChange={(e) => patch(i, { value: e.target.value.toUpperCase() })} /></td>
                  <td><input type="checkbox" aria-label="Active" checked={r.active} onChange={(e) => patch(i, { active: e.target.checked })} /></td>
                  <td><button type="button" className="btn btn-sm btn-danger-ghost" aria-label="Remove key" onClick={() => setRows(rows.filter((_, k) => k !== i))}><IconTrash size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <div className="wf-actions">
            <button type="button" className="btn btn-sm" onClick={() => setRows([...rows, { keyName: rows.length ? '' : 'WF_ID', value: '', active: true }])}><IconPlus size={14} /> Add key</button>
            <button type="button" className="btn btn-primary" disabled={busy || JSON.stringify(rows) === base} onClick={save}>{busy ? 'Saving…' : 'Save key points'}</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Where is a user (or mail id) used: every level the user appears in, with validity */
export function WhereUsedPanel({ appId, onOpen }: { appId: string; onOpen: (k: WfKey) => void }) {
  const [user, setUser] = useState('');
  const [all, setAll] = useState(!appId);
  const [rows, setRows] = useState<WfUse[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const run = async () => {
    setBusy(true); setErr(null);
    try { setRows((await wfApi.whereUsed(user.trim(), all ? '' : appId)).uses); } catch (e) { setErr(e); setRows(null); } finally { setBusy(false); }
  };
  return (
    <div>
      <form className="wf-filter" onSubmit={(e) => { e.preventDefault(); if (user.trim()) run(); }}>
        <VhInput id="wf-wu-user" label="SAP user or mail id" kind="USER" appId={appId} value={user} onChange={setUser} placeholder="user id, name or e-mail" />
        <label className="wf-check"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> All applications</label>
        <button type="submit" className="btn btn-primary" disabled={busy || !user.trim()}><IconSearch size={14} /> Search</button>
      </form>
      <MessageBox error={err} />
      {busy && <LoadingState text="Searching the agent assignments…" />}
      {rows && rows.length === 0 && <div className="empty"><p>This user is not assigned anywhere.</p></div>}
      {rows && rows.length > 0 && (
        <div className="table-wrap"><table className="table wf-table">
          <thead><tr><th>Application</th><th>Combination</th><th>Level</th><th>Role</th><th>Valid</th><th>Gets</th><th /></tr></thead>
          <tbody>
            {rows.map((u, i) => (
              <tr key={i} className={u.receives === 'none' ? 'wf-off' : ''}>
                <td>{u.appId}</td>
                <td>{[u.genType, u.genField, u.genField2, u.genField3, u.genField4].filter(Boolean).join(' / ') || '-'}</td>
                <td>{u.roleLabel} {u.lvl}<br /><span className="muted">{u.type === '02' ? 'parallel' : u.type === '01' ? 'sequential' : ''} · seq {u.role}</span></td>
                <td>{u.name || u.agent || u.mailId}</td>
                <td>{u.startDate} → {u.endDate === '9999-12-31' ? 'open' : u.endDate}{!u.active && <span className="badge badge-neutral">inactive</span>}{u.expired && <span className="badge badge-error">expired</span>}</td>
                <td><span className={`badge ${u.receives === 'workitem' ? 'badge-info' : 'badge-neutral'}`}>{u.receives === 'workitem' ? 'work item' : u.receives === 'notification' ? 'notification only' : 'nothing now'}</span></td>
                <td><button type="button" className="btn btn-sm" onClick={() => onOpen(u)}>Open</button></td>
              </tr>
            ))}
          </tbody>
        </table><p className="muted wf-note">{rows.length} assignment(s)</p></div>
      )}
    </div>
  );
}

/** Replace one agent by another in one application (optionally limited to some combinations); preview first */
export function MassAgentPanel({ appId, cfg }: { appId: string; cfg: WfCfg | undefined }) {
  const [oldA, setOldA] = useState('');
  const [newA, setNewA] = useState('');
  const [f, setF] = useState<WfKey>(emptyKey(appId));
  const [inactive, setInactive] = useState(false);
  const [prev, setPrev] = useState<{ groups: WfMassGroup[]; roleRows: number; viewRows: number; changed: number; skipped: number } | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  useEffect(() => { setPrev(null); setOk(''); setF(emptyKey(appId)); }, [appId]);
  const fields = visibleKeyFields(cfg);
  const call = (dryRun: boolean) => wfApi.massAgent({ ...f, appId, oldAgent: oldA.trim(), newAgent: newA.trim(), dryRun, includeInactive: inactive });
  const preview = async () => {
    setBusy(true); setErr(null); setOk(''); setPrev(null);
    try { const r = await call(true); setPrev({ groups: r.groups, roleRows: r.roleRows, viewRows: r.viewRows, changed: r.changedGroups, skipped: r.skippedGroups }); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true); setErr(null);
    try { const r = await call(false); setOk(`Agent Updated Successfully: ${r.roleRows} assignment(s) and ${r.viewRows} tab row(s) in ${r.changedGroups} combination(s). ${r.note}`); setPrev(null); } catch (e) { setErr(e); } finally { setBusy(false); setAsk(false); }
  };
  if (!appId) return <p className="muted">Choose an application first.</p>;
  return (
    <div>
      <p className="muted">Replaces the old agent by the new one in the levels of {appId}. Only current assignments (active, not expired) change unless you include inactive ones. Running work items keep their agent.</p>
      <form className="wf-filter" onSubmit={(e) => { e.preventDefault(); preview(); }}>
        <VhInput id="wf-mass-old" label="Old agent" kind="USER" appId={appId} value={oldA} onChange={setOldA} required />
        <VhInput id="wf-mass-new" label="New agent" kind="USER" appId={appId} value={newA} onChange={setNewA} required />
        {fields.map((x) => <VhInput key={x.field} id={`wf-mass-${x.field}`} label={`Only ${x.label}`} kind={x.vh} appId={appId} value={f[x.field]} onChange={(v) => setF({ ...f, [x.field]: v })} placeholder="all" />)}
        <label className="wf-check"><input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} /> Include inactive and expired rows</label>
        <button type="submit" className="btn" disabled={busy || !oldA.trim() || !newA.trim()}>Preview</button>
      </form>
      <MessageBox error={err} />
      {ok && <OkBox>{ok}</OkBox>}
      {prev && (
        <>
          <div className="table-wrap"><table className="table wf-table">
            <thead><tr><th>Combination</th><th>Assignments</th><th>Tab rows</th><th>Result</th></tr></thead>
            <tbody>{prev.groups.map((g, i) => <tr key={i}><td>{keyText(g.key)}</td><td className="num">{g.roleRows}</td><td className="num">{g.viewRows}</td><td>{g.skipped ? <span className="badge badge-warn">skipped: {g.reason}</span> : 'will change'}</td></tr>)}</tbody>
          </table></div>
          <button type="button" className="btn btn-primary" disabled={busy || prev.changed === 0} onClick={() => setAsk(true)}>Change agent in {prev.changed} combination(s)</button>
        </>
      )}
      {ask && (
        <ConfirmDialog title="Change agent?" confirmText="Change agent" busy={busy} onCancel={() => setAsk(false)} onConfirm={apply}>
          <p>New agent - {newA.trim()} assigning to selected application {appId} (replacing {oldA.trim()}).</p>
          <p>Do you want to change agent? Please click YES to submit, NO to cancel. Every change is written to the change log.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Copy one combination to another key, or all combinations of a type to a new type */
export function CopyDialog({ source, cfg, mode, onClose, onDone }: { source: WfKey; cfg: WfCfg | undefined; mode: 'single' | 'type'; onClose: () => void; onDone: (k: WfKey | null) => void }) {
  const [t, setT] = useState<WfKey>({ ...source });
  const [ot, setOt] = useState(source.genType);
  const [nt, setNt] = useState('');
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const fields = visibleKeyFields(cfg, [source]);
  const go = async () => {
    setBusy(true); setErr(null);
    try {
      if (mode === 'single') { const r = await wfApi.copy(source, t); onDone(r.target); } else { await wfApi.copyType(source.appId, ot.trim(), nt.trim()); onDone(null); }
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <FormDialog title={mode === 'single' ? 'Copy the details' : 'Copy all combinations of a type'} onCancel={onClose}>
      {mode === 'single' ? (
        <>
          <p className="muted">Copies levels, agents and tabs of <strong>{keyText(source)}</strong> to the combination below. Agents start today, end dates stay. It must not exist yet.</p>
          <div className="wf-keyfields">{fields.map((f) => <VhInput key={f.field} id={`wf-cp-${f.field}`} label={f.label} kind={f.vh} appId={source.appId} value={t[f.field]} onChange={(v) => setT({ ...t, [f.field]: v })} />)}</div>
        </>
      ) : (
        <>
          <p className="muted">Copies every combination of the existing type in {source.appId} to a new type (other fields unchanged). The new type must not exist yet.</p>
          <div className="wf-keyfields">
            <VhInput id="wf-ct-old" label={`Existing ${cfg?.gtLabel || 'type'}`} kind={cfg?.gtVh || ''} appId={source.appId} value={ot} onChange={setOt} />
            <VhInput id="wf-ct-new" label={`New ${cfg?.gtLabel || 'type'}`} kind={cfg?.gtVh || ''} appId={source.appId} value={nt} onChange={setNt} />
          </div>
        </>
      )}
      <MessageBox error={err} />
      <div className="form-actions">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={go} disabled={busy || (mode === 'type' && (!ot.trim() || !nt.trim()))}>{busy ? 'Copying…' : 'Copy and save into SAP'}</button>
      </div>
    </FormDialog>
  );
}
