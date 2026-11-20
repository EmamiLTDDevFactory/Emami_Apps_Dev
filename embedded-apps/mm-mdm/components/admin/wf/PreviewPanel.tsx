'use client';

import { useEffect, useMemo, useState } from 'react';
import { WfCfg, WfGroup, WfKey, WfSim, wfApi } from '@/lib/admin/wfApi';
import { previewFlow, visibleKeyFields } from '@/lib/admin/wfLogic';
import { IconCheck, IconFlow, IconAlert } from '../../icons';
import { ErrorLine, MessageBox, VhInput } from './parts';

export function FlowStrip({ group }: { group: WfGroup }) {
  const flow = useMemo(() => previewFlow(group), [group]);
  const l0 = group.l0Views.filter((v) => v.active).length;
  return (
    <ol className="wf-flow" aria-label="Flow of a request">
      <li className="wf-step wf-step-I"><strong>Initiator</strong><span>L0 · creates the request</span><small>{l0} editable tab{l0 === 1 ? '' : 's'}</small></li>
      {flow.map((l) => (
        <li key={l.lvl + l.typeLvl} className={`wf-step wf-step-${l.typeLvl || 'x'} ${l.active ? '' : 'wf-off'}`}>
          <strong>{l.area}</strong><span>{l.lvl} · {l.wfType || 'no type'}{l.active ? '' : ' · inactive'}</span><small>{l.rule}</small>
        </li>
      ))}
      {flow.length === 0 && <li className="wf-step wf-step-x"><strong>No level yet</strong><span>add a Reviewer or Approver</span></li>}
    </ol>
  );
}

/** Live preview of the draft (browser) and the SAP engine check of the saved version (/INOWITS/CL_WF=>MAT_START in simulation mode) */
export default function PreviewPanel({ group, cfg, saved, dirty }: { group: WfGroup; cfg: WfCfg | undefined; saved: boolean; dirty: boolean }) {
  const flow = useMemo(() => previewFlow(group), [group]);
  const [test, setTest] = useState<WfKey>({ ...group });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [res, setRes] = useState<WfSim | null>(null);
  const fields = visibleKeyFields(cfg, [group]);
  useEffect(() => { setTest({ ...group }); setRes(null); setErr(null); }, [group.appId, group.genType, group.genField, group.genField2, group.genField3, group.genField4]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run() {
    setBusy(true); setErr(null);
    try { setRes(await wfApi.simulate(test)); } catch (e) { setErr(e); setRes(null); } finally { setBusy(false); }
  }

  return (
    <div className="wf-preview">
      <h3 className="wf-sub">Who receives what (your current edits)</h3>
      <FlowStrip group={group} />
      <div className="wf-pv-levels">
        {flow.map((l) => (
          <div key={l.lvl + l.typeLvl} className={`wf-pv-level wf-area-${l.typeLvl || 'x'} ${l.active ? '' : 'wf-off'}`}>
            <h4><span className={`wf-area-chip wf-chip-${l.typeLvl || 'x'}`}>{l.area}</span> {l.lvl}{l.levelText ? ` · ${l.levelText}` : ''} <span className="muted">{l.rule}</span></h4>
            {l.agents.length === 0 ? <p className="muted">Nobody receives anything here.</p> : (
              <ul>
                {l.agents.map((a, i) => (
                  <li key={i}>
                    <span className="wf-pv-role">{l.wfType === 'Sequential' ? `${i + 1}.` : '•'}</span> {a.label}
                    <span className={`badge ${a.receives === 'workitem' ? 'badge-info' : 'badge-neutral'}`}>{a.receives === 'workitem' ? 'work item' : 'notification only'}</span>
                    {a.note && <small className="muted"> {a.note}</small>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <h3 className="wf-sub">Check with the SAP engine</h3>
      <p className="muted">Runs the real routing of a request for the values below, without starting anything. It reads what is <strong>saved</strong> in SAP{dirty ? ' - your unsaved edits are not included' : ''}. A request fails with the engine's message when this does not pass.</p>
      <div className="wf-testkey">
        {fields.map((f) => (
          <VhInput key={f.field} id={`wf-test-${f.field}`} label={f.label} kind={f.vh} appId={group.appId} value={test[f.field]} onChange={(v) => setTest({ ...test, [f.field]: v })} />
        ))}
        <button type="button" className="btn btn-primary" onClick={run} disabled={busy || !group.appId}><IconFlow size={14} /> {busy ? 'Checking…' : 'Check routing'}</button>
      </div>
      {!saved && <p className="muted">This combination is not saved yet; the check shows what SAP does today for these values.</p>}
      {Boolean(err) && <MessageBox error={err} />}
      {res && (
        <div className={`wf-sim ${res.wouldStart ? 'wf-sim-ok' : 'wf-sim-bad'}`} role="status">
          <p className="wf-sim-head">
            {res.wouldStart ? <><IconCheck size={16} /> The request would start (workflow template {res.workflowId || '-'})</> : <><IconAlert size={16} /> The request would fail</>}
          </p>
          {res.messages.map((m, i) => <ErrorLine key={i}>{m.message}</ErrorLine>)}
          {res.notes.map((n, i) => <p key={i} className="muted">{n}</p>)}
          {res.reviewerSkipped && <p className="muted">No Reviewer level: the engine goes straight to the Approver.</p>}
          {res.matched.length > 0 && <p className="muted">Uses: {res.matched.map((k) => [k.genType, k.genField, k.genField2, k.genField3, k.genField4].filter(Boolean).join(' / ') || '(no generic fields)').join('  |  ')}</p>}
          {res.levels.length > 0 && (
            <ol className="wf-sim-levels">
              {res.levels.map((l) => (
                <li key={l.lvl}>
                  <strong>{l.roleLabel} {l.lvl}</strong> · {l.typeText}{l.typeText === 'Parallel' ? `, ${l.minAppr} of ${l.counted}` : ''}{l.stale && <span className="badge badge-warn">stored count {l.maxRole} ≠ {l.counted}</span>}
                  <ul>
                    {l.agents.map((a, i) => <li key={i}>{a.name || a.agent || a.mailId} {a.agent && a.name !== a.agent ? <small className="muted">({a.agent})</small> : null} <span className={`badge ${a.receives === 'workitem' ? 'badge-info' : 'badge-neutral'}`}>{a.receives === 'workitem' ? 'work item' : 'notification only'}</span></li>)}
                  </ul>
                </li>
              ))}
            </ol>
          )}
          {res.initiatorViews.length > 0 && <p className="muted">Initiator tabs: {res.initiatorViews.filter((v) => v.active).map((v) => v.viewName).join(', ')}</p>}
        </div>
      )}
    </div>
  );
}
