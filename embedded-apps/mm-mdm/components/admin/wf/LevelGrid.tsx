'use client';

import { WfAgent, WfCfg, WfGroup, WfItem, WfLevel } from '@/lib/admin/wfApi';
import { AREA_LABEL, OPEN_END, agentSig, isCounted, levelSig, newAgent, recount, swapRoles, todayIso } from '@/lib/admin/wfLogic';
import { IconPlus, IconTrash } from '../../icons';
import { VhInput } from './parts';

const RECEIVES: Record<string, { text: string; cls: string }> = {
  workitem: { text: 'Work item', cls: 'badge-info' },
  notification: { text: 'Mail only', cls: 'badge-neutral' },
  none: { text: 'Not used', cls: 'badge-warn' },
};

/** Level Definition table (one row per level, click to select) */
export function LevelTable({ base, levels, cfg, flagged, scope, setScope, pirTypes, onChange, onAdd, onRemove }: {
  base: WfGroup; levels: WfLevel[]; cfg: WfCfg | undefined; flagged: string[]; scope: string; setScope: (s: string) => void; pirTypes: WfItem[];
  onChange: (i: number, l: WfLevel) => void; onAdd: () => void; onRemove: (lvl: string) => void;
}) {
  return (
    <details className="card wf-pane wf-fold" aria-label="Level definition" open>
      <summary className="wf-pane-bar"><h2>Level Definition</h2>
        <button type="button" className="btn btn-sm" onClick={onAdd}><IconPlus size={14} /> Add level</button>
      </summary>
      <div className="wf-pane-body">
        <table className="wf-grid">
          <thead><tr><th className="wf-c-sel" /><th>Level</th><th>Area</th><th>Type</th><th title="Approvals needed">Min. appr.</th>{cfg?.pirVisible && <th>PIR</th>}<th>Active</th><th /></tr></thead>
          <tbody>
            <tr className={scope === 'L0' ? 'on' : ''} onClick={() => setScope('L0')}>
              <td className="wf-c-sel"><input type="radio" name="wf-lvl" checked={scope === 'L0'} onChange={() => setScope('L0')} aria-label="Initiator L0" /></td>
              <td className="wf-lvl-id">L0</td><td colSpan={cfg?.pirVisible ? 7 : 6}>Initiator (creates the request)</td>
            </tr>
            {levels.map((level, i) => {
              const counted = level.agents.filter((a) => isCounted(a)).length;
              const set = (p: Partial<WfLevel>) => onChange(i, recount({ ...level, ...p }));
              const orphan = !level.typeLvl && !level.active;
              const flag = flagged.some((t) => t === level.lvl || t.startsWith(`${level.lvl}#`));
              const id = `wf-level-${level.lvl}`;
              const b = base.levels.find((x) => x.lvl === level.lvl);
              const chg = !b || levelSig(b) !== levelSig(level);
              return (
                <tr key={`${level.lvl}-${i}`} id={id} className={`${scope === level.lvl ? 'on' : ''} ${level.active ? '' : 'wf-off'} ${flag ? 'wf-flag' : ''} ${chg ? 'wf-chg' : ''}`} onClick={() => setScope(level.lvl)}>
                  <td className="wf-c-sel"><input type="radio" name="wf-lvl" checked={scope === level.lvl} onChange={() => setScope(level.lvl)} aria-label={`Select level ${level.lvl}`} /></td>
                  <td className="wf-lvl-id">{level.lvl}</td>
                  <td>
                    <select aria-label={`Area of ${level.lvl}`} value={level.typeLvl} onChange={(e) => set({ typeLvl: e.target.value, active: orphan ? true : level.active })}>
                      <option value="">Select…</option><option value="R">{AREA_LABEL.R || 'Reviewer'}</option><option value="A">{AREA_LABEL.A || 'Approver'}</option>
                    </select>
                  </td>
                  <td>
                    <select aria-label={`Type of ${level.lvl}`} value={level.type} onChange={(e) => set({ type: e.target.value, minAppr: e.target.value === '02' ? Math.max(1, level.minAppr) : level.minAppr, views: e.target.value === '02' ? level.views : level.views.map((v) => ({ ...v, agent: '' })) })}>
                      <option value="">Select…</option><option value="01">Sequential</option><option value="02">Parallel</option>
                    </select>
                  </td>
                  <td>{level.type === '02'
                    ? <input type="number" min={1} max={99} aria-label={`Approvals needed ${level.lvl}`} value={level.minAppr || ''} onChange={(e) => set({ minAppr: Number(e.target.value) || 0 })} />
                    : <span className="muted">{level.type === '01' ? `all ${counted}` : ''}</span>}</td>
                  {cfg?.pirVisible && (
                    <td><select aria-label={`PIR type ${level.lvl}`} value={level.pirType} onChange={(e) => set({ pirType: e.target.value })}>
                      <option value="">None</option>{pirTypes.map((p) => <option key={p.key} value={p.key}>{p.key}</option>)}
                    </select></td>
                  )}
                  <td className="wf-c-chk"><input type="checkbox" className="chk-active" aria-label={`Level ${level.lvl} active`} checked={level.active} onChange={(e) => set({ active: e.target.checked })} /></td>
                  <td className="wf-c-chk"><button type="button" className="btn btn-sm btn-danger-ghost" aria-label={`Remove level ${level.lvl}`} onClick={(e) => { e.stopPropagation(); onRemove(level.lvl); }}><IconTrash size={13} /></button></td>
                </tr>
              );
            })}
            {levels.length === 0 && <tr><td colSpan={9} className="muted wf-empty-row">No level yet. Without an Approver level SAP stops every request of this combination with "Please maintain Approver role".</td></tr>}
          </tbody>
        </table>
        {levels.some((l) => !l.typeLvl && !l.active) && <p className="alert alert-warn wf-mini-alert">A level without Area / Type is not defined in SAP: choose them to keep its agents and views, otherwise they are removed on save.</p>}
      </div>
    </details>
  );
}

/** Agent Assignment of the selected level */
export function AgentTable({ base, level, appId, levelTexts, departments, cfg, flagged, onChange }: {
  base: WfGroup; level: WfLevel | undefined; appId: string; levelTexts: WfItem[]; departments: WfItem[]; cfg: WfCfg | undefined; flagged: string[]; onChange: (l: WfLevel) => void;
}) {
  const set = (p: Partial<WfLevel>) => level && onChange(recount({ ...level, ...p }));
  const setAgent = (i: number, p: Partial<WfAgent>) => level && set({ agents: level.agents.map((a, k) => (k === i ? { ...a, ...p, ...(p.isAppr ? { mailId: '' } : {}) } : a)) });
  const counted = level ? level.agents.filter((a) => isCounted(a)).length : 0;
  const verb = level?.typeLvl === 'A' ? 'approve' : 'review';
  const byMail = level?.typeLvl === 'R'; // reviewers are chosen by e-mail id, SAP resolves the SAP user on save
  const baseSigs = new Set((base.levels.find((l) => l.lvl === level?.lvl)?.agents || []).map(agentSig));

  return (
    <details className="card wf-pane wf-fold" aria-label="Agent assignment" open>
      <summary className="wf-pane-bar"><h2>Agent Assignment{level ? <span className="wf-pane-sub"> · {level.lvl} {AREA_LABEL[level.typeLvl] || ''}</span> : ''}</h2>
        {level && <button type="button" className="btn btn-sm" onClick={() => set({ agents: [...level.agents, newAgent(level)] })}><IconPlus size={14} /> Add agent</button>}
      </summary>
      <div className="wf-pane-body">
        {!level && <p className="muted wf-empty-row">The Initiator has no agents. Select a Reviewer or Approver level.</p>}
        {level && (
          <>
            <table className="wf-grid wf-agents-grid">
              <thead><tr><th>Order</th><th>{byMail ? 'Email ID' : 'SAP user'}</th><th>Name</th><th title="Gets a work item and counts">{level.typeLvl === 'A' ? 'Approves' : 'Reviews'}</th>{!byMail && <th>Mail id</th>}<th>From</th><th>Until</th><th>Department</th>{cfg?.deptVisible && <th>Vendor dept.</th>}<th>Active</th><th /></tr></thead>
              <tbody>
                {level.agents.map((a, i) => {
                  const expired = a.expired || (a.active && a.endDate && a.endDate < todayIso());
                  const rc = a.isAppr && a.active && a.endDate && a.endDate < todayIso() ? 'none' : (isCounted(a) ? 'workitem' : a.active && !a.isAppr && (a.agent || a.mailId) ? 'notification' : 'none');
                  const aid = `wf-${level.lvl}-a${i}`;
                  return (
                    <tr key={`${a.role}-${a.startDate}-${i}`} className={`${baseSigs.has(agentSig(a)) ? '' : 'wf-chg'} ${a.active ? '' : 'wf-off'} ${flagged.includes(`${level.lvl}#${i + 1}`) ? 'wf-flag' : ''}`}>
                      <td className="wf-c-ord">
                        <span className="wf-seq">{a.role}</span>
                        <button type="button" className="btn btn-sm btn-ghost" aria-label={`Move agent ${i + 1} up`} disabled={i === 0} onClick={() => onChange(recount(swapRoles(level, i, i - 1)))}>↑</button>
                        <button type="button" className="btn btn-sm btn-ghost" aria-label={`Move agent ${i + 1} down`} disabled={i === level.agents.length - 1} onClick={() => onChange(recount(swapRoles(level, i, i + 1)))}>↓</button>
                      </td>
                      <td className="wf-c-user">
                        {byMail
                          ? <VhInput id={`${aid}-email`} label="Email ID" labelHidden keepCase kind="EMAIL" appId={appId} value={a.email || ''} placeholder="name@emamigroup.com"
                              onChange={(v) => setAgent(i, { email: v, agent: '', mailId: '', name: v === (a.email || '') ? a.name : '' })} onPick={(it) => setAgent(i, { email: it.key, agent: '', mailId: '', name: it.text })} />
                          : <VhInput id={`${aid}-user`} label="SAP user" labelHidden kind="USER" appId={appId} value={a.agent} placeholder="user id" onChange={(v) => setAgent(i, { agent: v, name: v === a.agent ? a.name : '' })} onPick={(it) => setAgent(i, { agent: it.key, name: it.text })} />}
                      </td>
                      <td className="wf-c-name">
                        {a.name && a.name !== a.agent ? a.name : <span className="muted">-</span>}
                        {byMail && a.agent && <small className="muted wf-sapid"> SAP user {a.agent}</small>}
                        <div className="wf-badges">
                          <span className={`badge ${RECEIVES[rc].cls}`}>{RECEIVES[rc].text}</span>
                          {expired ? <span className="badge badge-error">Ended</span> : null}
                          {a.locked && <span className="badge badge-warn">Locked</span>}
                        </div>
                      </td>
                      <td className="wf-c-chk"><input type="checkbox" aria-label={`Agent ${i + 1} ${verb}s`} checked={a.isAppr} onChange={(e) => setAgent(i, { isAppr: e.target.checked })} title={a.isAppr ? 'gets a work item and counts' : 'only informed by mail'} /></td>
                      {!byMail && <td><input type="email" aria-label={`Mail id of agent ${i + 1}`} value={a.mailId} disabled={a.isAppr} placeholder={a.isAppr ? '' : 'name@company.com'} onChange={(e) => setAgent(i, { mailId: e.target.value })} /></td>}
                      <td><input type="date" aria-label={`From of agent ${i + 1}`} value={a.startDate} onChange={(e) => setAgent(i, { startDate: e.target.value })} /></td>
                      <td className="wf-c-end">
                        <input type="date" aria-label={`Until of agent ${i + 1}`} value={a.endDate} onChange={(e) => setAgent(i, { endDate: e.target.value })} />
                        {a.endDate !== OPEN_END && <button type="button" className="btn btn-sm btn-ghost" title="Open end (31.12.9999)" onClick={() => setAgent(i, { endDate: OPEN_END })}>∞</button>}
                      </td>
                      <td>
                        <select aria-label={`Department of agent ${i + 1}`} value={a.levelText} onChange={(e) => setAgent(i, { levelText: e.target.value })}>
                          <option value="">None</option>
                          {levelTexts.map((t) => <option key={t.key} value={t.key}>{t.text || t.key}</option>)}
                          {a.levelText && !levelTexts.some((t) => t.key === a.levelText) && <option value={a.levelText}>{a.levelText}</option>}
                        </select>
                      </td>
                      {cfg?.deptVisible && (
                        <td><select aria-label={`Vendor department of agent ${i + 1}`} value={a.dept} onChange={(e) => setAgent(i, { dept: e.target.value })}>
                          <option value="">None</option>
                          {departments.map((t) => <option key={t.key} value={t.key}>{t.text || t.key}</option>)}
                          {a.dept && !departments.some((t) => t.key === a.dept) && <option value={a.dept}>{a.dept}</option>}
                        </select></td>
                      )}
                      <td className="wf-c-chk"><input type="checkbox" className="chk-active" aria-label={`Agent ${i + 1} active`} checked={a.active} onChange={(e) => setAgent(i, { active: e.target.checked })} /></td>
                      <td className="wf-c-chk"><button type="button" className="btn btn-sm btn-danger-ghost" aria-label={`Remove agent ${i + 1}`} onClick={() => set({ agents: level.agents.filter((_, k) => k !== i) })}><IconTrash size={13} /></button></td>
                    </tr>
                  );
                })}
                {level.agents.length === 0 && <tr><td colSpan={11} className="muted wf-empty-row">No agent yet. Add the people who {verb} at this level.</td></tr>}
              </tbody>
            </table>
            <p className="muted wf-note">{counted} {verb}{counted === 1 ? '' : 's'} get a work item; the others are only informed by mail.</p>
          </>
        )}
      </div>
    </details>
  );
}
