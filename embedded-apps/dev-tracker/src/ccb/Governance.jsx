import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ccbApi } from './api.js';
import { Avatar, Blocker, Button, Card, CcbShell, Field, Loading, Modal, PageHeader, RoleBadge, useCcbMe, useToast } from './ui.jsx';
import { PROCESS_STEPS, ROLES, ROLE_META } from './model.js';
import { AlertIcon, BoltIcon, CalendarIcon, PlusIcon, SettingsIcon, UsersIcon, XIcon } from '../shared/icons.jsx';

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
  const [adding, setAdding] = useState(false);
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
    const rank = (p) => Math.min(...p.roles.map((r) => ['CCB Member', 'CCB Secretary', 'IT Application Head', 'SAP Module Lead', 'IT SPOC'].indexOf(r)));
    return [...map.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }, [data.roles]);
  const board = byPerson.filter((p) => p.roles.some((r) => ['CCB Member', 'CCB Secretary'].includes(r)));
  const others = byPerson.filter((p) => !board.includes(p));

  async function remove(email, role) {
    try {
      await ccbApi.removeRole(email, role);
      showToast(`${role} role removed.`);
      load();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

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
              {me.can.manageRoles && <button type="button" className="ccb-icon-btn" style={{ width: 18, height: 18 }} title={`Remove ${r}`} onClick={() => remove(p.email, r)}><XIcon size={10} /></button>}
            </span>
          ))}
        </div>
        {!p.hasAccess && <div className="warn">No SAP Change & Development access — grant it in Manage Access.</div>}
      </div>
    </div>
  );

  return (
    <>
      <PageHeader eyebrow="Change Control Board" title="Governance" sub="Composition of the board, who does what, what needs CCB approval, and how meetings run.">
        {me.can.manageRoles && <Button variant="primary" icon={PlusIcon} onClick={() => setAdding(true)}>Assign a role</Button>}
      </PageHeader>

      <Card title="CCB composition" sub={`${board.filter((p) => p.roles.includes('CCB Member')).length} members · quorum ${s.quorum} · meets on the 3rd Friday of every month or on an emergency basis, online or offline`}>
        {board.length === 0 ? (
          <p className="ccb-muted" style={{ margin: 0, fontSize: 12.5 }}>No board members assigned yet.{me.can.manageRoles ? ' Use “Assign a role” to add the CCB members and Secretary.' : ''}</p>
        ) : <div className="ccb-members">{board.map((p) => <PersonCard key={p.email} p={p} />)}</div>}
      </Card>

      <Card title="IT roles" sub="IT SPOCs, SAP Module Leads and the IT Application Head">
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

      <Card title="Change process with CCB" sub="Highlighted steps are the CCB controls added to the existing SAP change process" className="" >
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

      {adding && <AssignDialog onClose={() => setAdding(false)} onDone={(role) => { setAdding(false); showToast(`${role} assigned.`); load(); }} />}
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
      </div>
    </Card>
  );
}

function AssignDialog({ onClose, onDone }) {
  const [people, setPeople] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('CCB Member');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { ccbApi.people().then((d) => setPeople(d.people)).catch(() => {}); }, []);

  async function go() {
    setBusy(true);
    setError('');
    try {
      await ccbApi.assignRole(email.trim().toLowerCase(), role);
      onDone(role);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Assign a CCB role" sub="People need SAP Change & Development access (Manage Access) to sign in. A person can hold more than one role." onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={UsersIcon} busy={busy} disabled={!email || !role} onClick={go}>Assign</Button></>}>
      <Field label="Person" required hint="Pick from people with access, or type an Emami email.">
        <input className="ccb-input" list="ccb-people" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@emamigroup.com" />
        <datalist id="ccb-people">{people.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}</datalist>
      </Field>
      <Field label="Role" required group>
        <div className="ccb-chips">
          {ROLES.map((r) => <button key={r} type="button" className={`ccb-chip-toggle${role === r ? ' on' : ''}`} onClick={() => setRole(r)}>{r}</button>)}
        </div>
      </Field>
      <div className="ccb-callout tone-indigo"><CalendarIcon size={15} /><span>{ROLE_META[role].duty}</span></div>
      {error && <div className="ccb-error"><AlertIcon size={13} /> {error}</div>}
    </Modal>
  );
}
