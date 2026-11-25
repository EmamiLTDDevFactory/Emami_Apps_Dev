'use client';

import { useMemo, useState } from 'react';
import { WfCfg, WfGroup, WfView } from '@/lib/admin/wfApi';
import { AREA_LABEL, flowOrder } from '@/lib/admin/wfLogic';
import { IconPlus, IconTrash } from '../../icons';
import { VhInput, useValueList } from './parts';

/** Which tabs of the request each step may see: Initiator (L0, the tabs the requester fills) and every level (per approver on parallel levels) */
export default function ViewsPanel({ group, cfg, onChange, scope, setScope }: {
  group: WfGroup; cfg: WfCfg | undefined; onChange: (g: WfGroup) => void; scope: string; setScope: (s: string) => void;
}) {
  const appId = group.appId;
  const { items: appViews, error } = useValueList('VIEW', appId, !!appId && cfg?.viewsEnabled !== false);
  const [pick, setPick] = useState('');
  const [agentSel, setAgentSel] = useState('');
  const [copyFrom, setCopyFrom] = useState('');
  const levels = useMemo(() => flowOrder(group.levels).filter((l) => l.typeLvl || l.views.length), [group.levels]);
  const isL0 = scope === 'L0';
  const level = isL0 ? undefined : group.levels.find((l) => l.lvl === scope);
  const parallel = !!level && level.type === '02';
  const approvers = useMemo(() => (level ? level.agents.filter((a) => a.isAppr && a.agent).map((a) => a.agent) : []), [level]);
  const rows: WfView[] = isL0 ? group.l0Views : level?.views || [];
  const agents = useMemo(() => Array.from(new Set([...approvers, ...rows.map((v) => v.agent).filter(Boolean)])), [approvers, rows]);
  const curAgent = parallel ? (agents.includes(agentSel) ? agentSel : agents[0] || '') : '';
  const shown = rows.map((v, i) => ({ v, i })).filter(({ v }) => !parallel || v.agent === curAgent);
  const desc = (name: string) => appViews?.find((x) => x.key === name)?.text || '';

  if (cfg && cfg.viewsEnabled === false) return <div className="alert alert-info">This application has no view visibility: it does not use tab sets per level.</div>;

  const write = (next: WfView[]) => {
    if (isL0) onChange({ ...group, l0Views: next });
    else onChange({ ...group, levels: group.levels.map((l) => (l.lvl === scope ? { ...l, views: next } : l)) });
  };
  const patch = (i: number, p: Partial<WfView>) => write(rows.map((v, k) => (k === i ? { ...v, ...p } : v)));
  const add = (name: string) => {
    const n = name.trim().toUpperCase();
    if (!n) return;
    if (rows.some((v) => v.viewName === n && (!parallel || v.agent === curAgent))) { setPick(''); return; }
    write([...rows, { agent: parallel ? curAgent : '', viewName: n, active: true, readOnly: false }]);
    setPick('');
  };
  const addAll = () => {
    const have = new Set(shown.map(({ v }) => v.viewName));
    const more = (appViews || []).filter((x) => !have.has(x.key)).map((x) => ({ agent: parallel ? curAgent : '', viewName: x.key, active: true, readOnly: false }));
    if (more.length) write([...rows, ...more]);
  };
  const sources = [{ id: 'L0', label: 'Initiator (L0)', views: group.l0Views }, ...levels.map((l) => ({ id: l.lvl, label: `${AREA_LABEL[l.typeLvl] || 'Level'} ${l.lvl}`, views: l.views }))].filter((s) => s.id !== scope && s.views.length);
  const doCopy = () => {
    const src = sources.find((s) => s.id === copyFrom);
    if (!src) return;
    const have = new Set(shown.map(({ v }) => v.viewName));
    const more = src.views.filter((v) => !have.has(v.viewName)).filter((v, i, a) => a.findIndex((x) => x.viewName === v.viewName) === i).map((v) => ({ agent: parallel ? curAgent : '', viewName: v.viewName, active: v.active, readOnly: v.readOnly }));
    if (more.length) write([...rows, ...more]);
    setCopyFrom('');
  };

  return (
    <div className="wf-views wf-views-pane">
      {!isL0 && !level && <p className="alert alert-warn">Select a level.</p>}
      {parallel && (
        <div className="field wf-agent-pick">
          <label className="field-label" htmlFor="wf-views-agent">Approver (parallel level: each approver has own tabs)</label>
          <select id="wf-views-agent" value={curAgent} onChange={(e) => setAgentSel(e.target.value)}>
            {agents.length === 0 && <option value="">No approver with a user yet</option>}
            {agents.map((a) => <option key={a} value={a}>{a}{approvers.includes(a) ? '' : ' (not an approver any more)'}</option>)}
          </select>
        </div>
      )}
      {(isL0 || level) && (
        <>
          <div className="wf-views-add">
            <VhInput id="wf-views-pick" label="Add a tab" kind="VIEW" appId={appId} value={pick} placeholder="view name" onChange={setPick} onPick={(it) => add(it.key)} />
            <button type="button" className="btn btn-sm" disabled={!pick.trim() || (parallel && !curAgent)} onClick={() => add(pick)}><IconPlus size={14} /> Add</button>
            <button type="button" className="btn btn-sm" disabled={!appViews?.length || (parallel && !curAgent)} onClick={addAll}>Add all</button>
            {sources.length > 0 && (
              <span className="wf-copyfrom">
                <label className="wf-sr" htmlFor="wf-views-copy">Copy tabs from</label>
                <select id="wf-views-copy" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                  <option value="">Copy tabs from…</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <button type="button" className="btn btn-sm" disabled={!copyFrom} onClick={doCopy}>Copy</button>
              </span>
            )}
          </div>
          {error && <p className="alert alert-error">{error}</p>}
          {shown.length === 0 ? <p className="muted wf-none">No tab yet.</p> : (
            <div>
              <table className="wf-grid">
                <thead><tr><th>View description</th><th>View name</th><th>Active</th><th>Read only</th><th /></tr></thead>
                <tbody>
                  {shown.map(({ v, i }) => (
                    <tr key={`${v.agent}-${v.viewName}-${i}`} className={v.active ? '' : 'wf-off'}>
                      <td>{desc(v.viewName) || v.description || <span className="muted">-</span>}</td>
                      <td><code>{v.viewName}</code>{appViews && !appViews.some((x) => x.key === v.viewName) && <span className="badge badge-error" title="not a tab of this application">?</span>}</td>
                      <td><input type="checkbox" checked={v.active} aria-label={`${v.viewName} active`} onChange={(e) => patch(i, { active: e.target.checked })} /></td>
                      <td><input type="checkbox" checked={v.readOnly} aria-label={`${v.viewName} read only`} onChange={(e) => patch(i, { readOnly: e.target.checked })} /></td>
                      <td><button type="button" className="btn btn-sm btn-danger-ghost" aria-label={`Remove ${v.viewName}`} onClick={() => write(rows.filter((_, k) => k !== i))}><IconTrash size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
