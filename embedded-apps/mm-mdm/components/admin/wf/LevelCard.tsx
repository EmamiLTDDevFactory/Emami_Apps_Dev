'use client';

import { WfAgent, WfCfg, WfItem, WfLevel } from '@/lib/admin/wfApi';
import { AREA_LABEL, OPEN_END, isCounted, newAgent, recount, swapRoles, todayIso } from '@/lib/admin/wfLogic';
import { IconPlus, IconTrash } from '../../icons';
import { VhInput } from './parts';

const RECEIVES: Record<string, { text: string; cls: string }> = {
  workitem: { text: 'Gets a work item', cls: 'badge-info' },
  notification: { text: 'Notification only', cls: 'badge-neutral' },
  none: { text: 'Not used now', cls: 'badge-warn' },
};

/** One level of the flow: Reviewer or Approver, sequential or parallel, with its agents. */
export default function LevelCard({ level, cfg, appId, levelTexts, departments, pirTypes, flagged, onChange, onRemove }: {
  level: WfLevel; cfg: WfCfg | undefined; appId: string; levelTexts: WfItem[]; departments: WfItem[]; pirTypes: WfItem[];
  flagged: string[]; onChange: (l: WfLevel) => void; onRemove: () => void;
}) {
  const id = `wf-level-${level.lvl}`;
  const set = (p: Partial<WfLevel>) => onChange(recount({ ...level, ...p }));
  const setAgent = (i: number, p: Partial<WfAgent>) => set({ agents: level.agents.map((a, k) => (k === i ? { ...a, ...p, ...(p.isAppr ? { mailId: '' } : {}) } : a)) });
  const counted = level.agents.filter((a) => isCounted(a)).length;
  const area = AREA_LABEL[level.typeLvl] || 'Not defined';
  const orphan = !level.typeLvl && !level.active;
  const verb = level.typeLvl === 'A' ? 'approves' : 'reviews';

  return (
    <section className={`wf-level wf-area-${level.typeLvl || 'x'} ${level.active ? '' : 'wf-off'} ${flagged.some((t) => t === level.lvl || t.startsWith(`${level.lvl}#`)) ? 'wf-flag' : ''}`} id={id} aria-labelledby={`${id}-h`}>
      <header className="wf-level-head">
        <h3 id={`${id}-h`}>
          <span className={`wf-area-chip wf-chip-${level.typeLvl || 'x'}`}>{area}</span> <span className="wf-lvl-id">{level.lvl}</span>
          {!level.active && <span className="badge badge-neutral">Inactive</span>}
          {orphan && <span className="badge badge-warn">No definition</span>}
        </h3>
        <button type="button" className="btn btn-sm btn-danger-ghost" onClick={onRemove}><IconTrash size={14} /> Remove level</button>
      </header>
      {orphan && <p className="alert alert-warn">Agents or views exist for {level.lvl} but the level itself is not defined in SAP. Choose Area and Workflow type to keep them; otherwise they are removed on save.</p>}

      <div className="wf-level-grid">
        <div className="field">
          <label className="field-label" htmlFor={`${id}-area`}>Area</label>
          <select id={`${id}-area`} value={level.typeLvl} onChange={(e) => set({ typeLvl: e.target.value, active: orphan ? true : level.active })}>
            <option value="">Select…</option><option value="R">Reviewer (reviews before the approver)</option><option value="A">Approver (final decision)</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-type`}>Workflow type</label>
          <select id={`${id}-type`} value={level.type} onChange={(e) => set({ type: e.target.value, minAppr: e.target.value === '02' ? Math.max(1, level.minAppr) : level.minAppr, views: e.target.value === '02' ? level.views : level.views.map((v) => ({ ...v, agent: '' })) })}>
            <option value="">Select…</option><option value="01">Sequential (one after the other)</option><option value="02">Parallel (any n of them)</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-min`}>Approvals needed</label>
          {level.type === '02'
            ? <input id={`${id}-min`} type="number" min={1} max={99} value={level.minAppr || ''} onChange={(e) => set({ minAppr: Number(e.target.value) || 0 })} />
            : <input id={`${id}-min`} value={level.type === '01' ? `all ${counted}` : ''} disabled aria-readonly />}
          <small className="muted">{level.type === '02' ? `of ${counted} active approver${counted === 1 ? '' : 's'}` : 'sequential levels need every approver'}</small>
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-text`}>Level text</label>
          <input id={`${id}-text`} value={level.levelText} maxLength={30} onChange={(e) => set({ levelText: e.target.value })} placeholder="e.g. Quality review" />
        </div>
        {cfg?.pirVisible && (
          <div className="field">
            <label className="field-label" htmlFor={`${id}-pir`}>PIR type</label>
            <select id={`${id}-pir`} value={level.pirType} onChange={(e) => set({ pirType: e.target.value })}>
              <option value="">None</option>{pirTypes.map((p) => <option key={p.key} value={p.key}>{p.key} - {p.text}</option>)}
            </select>
          </div>
        )}
        <label className="wf-check wf-check-level"><input type="checkbox" checked={level.active} onChange={(e) => set({ active: e.target.checked })} /> Level is active</label>
      </div>

      <h4 className="wf-sub">Agents <span className="muted">({counted} {verb}, gets a work item)</span></h4>
      {level.agents.length === 0 && <p className="muted wf-none">No agent yet. Add the people who {verb} at this level.</p>}
      <ol className="wf-agents">
        {level.agents.map((a, i) => {
          const rc = a.isAppr && a.active && a.endDate && a.endDate < todayIso() ? 'none' : (isCounted(a) ? 'workitem' : a.active && !a.isAppr && (a.agent || a.mailId) ? 'notification' : 'none');
          const flag = flagged.includes(`${level.lvl}#${i + 1}`);
          const aid = `${id}-a${i}`;
          return (
            <li key={`${a.role}-${a.startDate}-${i}`} className={`wf-agent ${a.active ? '' : 'wf-off'} ${flag ? 'wf-flag' : ''}`}>
              <div className="wf-agent-top">
                <span className="wf-seq" title="Order of approval (sequential levels)">{a.role}</span>
                <span className="wf-order">
                  <button type="button" className="btn btn-sm btn-ghost" aria-label={`Move agent ${i + 1} up`} disabled={i === 0} onClick={() => onChange(recount(swapRoles(level, i, i - 1)))}>↑</button>
                  <button type="button" className="btn btn-sm btn-ghost" aria-label={`Move agent ${i + 1} down`} disabled={i === level.agents.length - 1} onClick={() => onChange(recount(swapRoles(level, i, i + 1)))}>↓</button>
                </span>
                <span className={`badge ${RECEIVES[rc].cls}`}>{RECEIVES[rc].text}</span>
                {a.expired || (a.active && a.endDate && a.endDate < todayIso()) ? <span className="badge badge-error">End date passed</span> : null}
                {a.locked && <span className="badge badge-warn">User locked in SAP</span>}
                <button type="button" className="btn btn-sm btn-danger-ghost wf-agent-rm" aria-label={`Remove agent ${i + 1}`} onClick={() => set({ agents: level.agents.filter((_, k) => k !== i) })}><IconTrash size={14} /></button>
              </div>
              <div className="wf-agent-grid">
                <VhInput id={`${aid}-user`} label="SAP user" kind="USER" appId={appId} value={a.agent} placeholder="user id or name" onChange={(v) => setAgent(i, { agent: v, name: v === a.agent ? a.name : '' })}
                  onPick={(it) => setAgent(i, { agent: it.key, name: it.text })} hint={a.name && a.name !== a.agent ? a.name : undefined} />
                <label className="wf-check wf-check-decide">
                  <input type="checkbox" checked={a.isAppr} onChange={(e) => setAgent(i, { isAppr: e.target.checked })} />
                  <span>{level.typeLvl === 'A' ? 'Approves' : level.typeLvl === 'R' ? 'Reviews' : 'Decides'}<small className="muted">{a.isAppr ? 'gets a work item and counts' : 'only informed by mail'}</small></span>
                </label>
                {!a.isAppr && (
                  <div className="field">
                    <label className="field-label" htmlFor={`${aid}-mail`}>Mail id (no SAP user)</label>
                    <input id={`${aid}-mail`} type="email" value={a.mailId} placeholder="name@company.com" onChange={(e) => setAgent(i, { mailId: e.target.value })} />
                    <small className="muted">Use either a user or a mail id</small>
                  </div>
                )}
                <div className="field">
                  <label className="field-label" htmlFor={`${aid}-from`}>From</label>
                  <input id={`${aid}-from`} type="date" value={a.startDate} onChange={(e) => setAgent(i, { startDate: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={`${aid}-to`}>Until</label>
                  <div className="wf-end">
                    <input id={`${aid}-to`} type="date" value={a.endDate} onChange={(e) => setAgent(i, { endDate: e.target.value })} />
                    {a.endDate !== OPEN_END && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAgent(i, { endDate: OPEN_END })}>Open end</button>}
                  </div>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={`${aid}-dep`}>Department{appId === 'MC' && <span className="req" aria-hidden> *</span>}</label>
                  <select id={`${aid}-dep`} value={a.levelText} onChange={(e) => setAgent(i, { levelText: e.target.value })}>
                    <option value="">None</option>
                    {levelTexts.map((t) => <option key={t.key} value={t.key}>{t.key} - {t.text}</option>)}
                    {a.levelText && !levelTexts.some((t) => t.key === a.levelText) && <option value={a.levelText}>{a.levelText}</option>}
                  </select>
                </div>
                {cfg?.deptVisible && (
                  <div className="field">
                    <label className="field-label" htmlFor={`${aid}-dept`}>Vendor department</label>
                    <select id={`${aid}-dept`} value={a.dept} onChange={(e) => setAgent(i, { dept: e.target.value })}>
                      <option value="">None</option>
                      {departments.map((t) => <option key={t.key} value={t.key}>{t.key} - {t.text}</option>)}
                      {a.dept && !departments.some((t) => t.key === a.dept) && <option value={a.dept}>{a.dept}</option>}
                    </select>
                  </div>
                )}
                <label className="wf-check"><input type="checkbox" checked={a.active} onChange={(e) => setAgent(i, { active: e.target.checked })} /> Active</label>
              </div>
            </li>
          );
        })}
      </ol>
      <button type="button" className="btn btn-sm" onClick={() => set({ agents: [...level.agents, newAgent(level)] })}><IconPlus size={14} /> Add agent</button>
    </section>
  );
}
