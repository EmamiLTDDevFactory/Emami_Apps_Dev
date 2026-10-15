import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ccbApi } from './api.js';
import { Avatar, Blocker, Button, Card, CcbShell, Field, Loading, PageHeader, RoleBadge, useCcbMe, useToast } from './ui.jsx';
import { PROCESS_STEPS, ROLES, ROLE_META } from './model.js';
import { BoltIcon, ExternalIcon, SettingsIcon, UsersIcon } from '../shared/icons.jsx';

/** CCB roles are assigned in the Emami Apps Admin Center (hub Manage Access), not here. */
const ADMIN_CENTER = '/manage-access/';
const adminCenterUser = (email) => `${ADMIN_CENTER}?tab=people&user=${encodeURIComponent(email)}`;
const adminCenterApp = `${ADMIN_CENTER}?tab=people&app=dev-tracker`;

export default function Governance() {
  const { me, error, loading, reload } = useCcbMe();
  return (
    <CcbShell active="ccbGovernance">
      {loading ? <Loading /> : error ? <Blocker error={error} onRetry={reload} /> : <Content me={me} />}
    </CcbShell>
  );
}

function Content({ me }) {
  const [data, setData] = useState({ loading: true, roles: [], settings: null, error: null });
  const [toast, showToast] = useToast();

  const load = useCallback(() => {
    ccbApi.roles()
      .then((d) => setData({ loading: false, roles: d.roles, settings: d.settings, error: null }))
      .catch((e) => setData((s) => ({ ...s, loading: false, error: e })));
  }, []);
  useEffect(load, [load]);

  const byPerson = useMemo(() => {
    const map = new Map();
    data.roles.forEach((r) => {
      if (!map.has(r.email)) map.set(r.email, { email: r.email, name: r.name, hasAccess: r.hasAccess, roles: [] });
      map.get(r.email).roles.push(r.role);
    });
    const rank = (p) => Math.min(...p.roles.map((r) => ['CCB Member', 'CCB Secretary', 'IT Application Head', 'IT SPOC'].indexOf(r)));
    return [...map.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }, [data.roles]);
  const board = byPerson.filter((p) => p.roles.some((r) => ['CCB Member', 'CCB Secretary'].includes(r)));
  const others = byPerson.filter((p) => !board.includes(p));

  if (data.loading) return <Loading />;
  if (data.error) return <Blocker error={data.error} onRetry={load} />;
  const s = data.settings;

  const PersonCard = ({ p }) => (
    <div className="ccb-member">
      <Avatar name={p.name} size={38} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="name">{p.name}</div>
        <div className="mail">{p.email}</div>
        <div className="roles">
          {p.roles.map((r) => (
            <span key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <RoleBadge role={r} />
            </span>
          ))}
        </div>
        {!p.hasAccess && <div className="warn">No Change Control Board & CR Tracker access — grant it in the Emami Apps Admin Center.</div>}
        {me.can.manageRoles && <a href={adminCenterUser(p.email)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, marginTop: 4 }}>Change roles in Admin Center <ExternalIcon size={10} /></a>}
      </div>
    </div>
  );

  return (
    <>
      <PageHeader eyebrow="Change Control Board" title="Governance" sub="Composition of the board, who does what, what needs CCB approval, and how meetings run.">
        <a className="ccb-btn primary" style={{ textDecoration: 'none' }} href={adminCenterApp}><UsersIcon size={15} /> Assign roles in Admin Center</a>
      </PageHeader>

      <Card title="CCB composition" sub={`${board.filter((p) => p.roles.includes('CCB Member')).length} members · quorum ${s.quorum} · meets on the 3rd Friday of every month or on an emergency basis, online or offline`}>
        {board.length === 0 ? (
          <p className="ccb-muted" style={{ margin: 0, fontSize: 12.5 }}>No board members assigned yet. CCB roles are assigned in the Emami Apps Admin Center (Manage Access › person › Change Control Board & CR Tracker).</p>
        ) : <div className="ccb-members">{board.map((p) => <PersonCard key={p.email} p={p} />)}</div>}
      </Card>

      <Card title="IT roles" sub="IT SPOCs and the IT Application Head">
        {others.length === 0 ? <p className="ccb-muted" style={{ margin: 0, fontSize: 12.5 }}>No IT roles assigned yet.</p> : <div className="ccb-members">{others.map((p) => <PersonCard key={p.email} p={p} />)}</div>}
      </Card>

      <div className="ccb-grid halves" style={{ marginTop: 16 }}>
        <Card title="Scope of the CCB" sub="Decides the approval route when the IT SPOC categorises a request">
          <div className="ccb-scope-cols">
            <div className="ccb-scope-col in">
              <h4>Under CCB scope</h4>
              <ul>
                <li>Major CRs / projects not on the out-of-scope list</li>
                <li>CRs / projects with financial impact</li>
                <li>CRs / projects with a control-level change</li>
                <li>CRs / projects related to strategic changes</li>
              </ul>
            </div>
            <div className="ccb-scope-col out">
              <h4>Out of CCB scope</h4>
              <ul>
                <li>CRs for reports (new and modification)</li>
                <li>CRs for cosmetic changes</li>
              </ul>
              <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '8px 0 0' }}>Approved by the IT Application Head after the feasibility review.</p>
            </div>
          </div>
          <div className="ccb-callout tone-red" style={{ marginTop: 12 }}>
            <BoltIcon size={15} />
            <span><strong>Exception — urgent business need or critical system issue.</strong> The IT Application Head may approve and initiate without prior board approval. It must be justified in writing, informed to the CCB within <strong>{s.informDays} business days</strong>, and formally ratified at the next CCB meeting.</span>
          </div>
        </Card>

        <Card title="Roles and responsibilities">
          <table className="ccb-table ccb-roles-table">
            <tbody>
              {ROLES.map((r) => (
                <tr key={r} style={{ cursor: 'default' }}>
                  <td><RoleBadge role={r} /></td>
                  <td style={{ fontSize: 12, lineHeight: 1.5 }}>{ROLE_META[r].duty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card title="Change process with CCB" sub="Highlighted steps are the CCB controls added to the existing IT change process" className="" >
        <div className="ccb-process">
          {PROCESS_STEPS.map((st, i) => (
            <div key={st.key} className={`ccb-process-step${st.isNew ? ' is-new' : ''}`}>
              <b>{i + 1}</b>
              <div>{st.label}</div>
              <small>{st.sub}</small>
            </div>
          ))}
        </div>
      </Card>

      <SettingsCard settings={s} canEdit={me.can.manageRoles} onSaved={() => { showToast('Settings saved.'); load(); }} onError={(m) => showToast(m, 'error')} />

      <div className="ccb-callout tone-indigo" style={{ marginTop: 16 }}><UsersIcon size={15} /><span><strong>Role assignment is controlled from the Emami Apps Admin Center.</strong> A Super Admin or Admin opens the person in Manage Access and picks their CCB roles under Change Control Board &amp; CR Tracker. Every change is recorded in the Admin Center&apos;s change history and the CCB audit trail.</span></div>
      {toast}
    </>
  );
}

function SettingsCard({ settings, canEdit, onSaved, onError }) {
  const [form, setForm] = useState(settings);
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(settings), [settings]);
  const dirty = JSON.stringify(form) !== JSON.stringify(settings);
  async function save() {
    setBusy(true);
    try {
      await ccbApi.saveSettings(form);
      onSaved();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Card title="Board settings" sub={canEdit ? 'Dev Tracker admins can change these.' : 'Managed by Dev Tracker admins.'}
      actions={canEdit ? <Button size="sm" variant="primary" icon={SettingsIcon} disabled={!dirty} busy={busy} onClick={save}>Save</Button> : null}>
      <div className="ccb-settings">
        <Field label="Quorum (CCB members)" hint="Members who must be present for decisions.">
          <input className="ccb-input" type="number" min={1} max={20} value={form.quorum} onChange={set('quorum')} disabled={!canEdit} />
        </Field>
        <Field label="Inform window (business days)" hint="For emergency approvals.">
          <input className="ccb-input" type="number" min={1} max={30} value={form.informDays} onChange={set('informDays')} disabled={!canEdit} />
        </Field>
        <Field label="Default meeting time">
          <input className="ccb-input" type="time" value={form.meetingTime} onChange={set('meetingTime')} disabled={!canEdit} />
        </Field>
        <Field label="Default meeting mode">
          <select className="ccb-select" value={form.meetingMode} onChange={set('meetingMode')} disabled={!canEdit}>
            <option value="online">Online</option>
            <option value="offline">In person</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </Field>
        <Field label="Feasibility review target (business days)" hint="IT Application Head, from submission.">
          <input className="ccb-input" type="number" min={1} max={60} value={form.reviewSlaDays ?? 5} onChange={set('reviewSlaDays')} disabled={!canEdit} />
        </Field>
        <Field label="CCB decision target (days)" hint="From recommendation to the board's decision.">
          <input className="ccb-input" type="number" min={1} max={180} value={form.ccbSlaDays ?? 30} onChange={set('ccbSlaDays')} disabled={!canEdit} />
        </Field>
      </div>
    </Card>
  );
}
