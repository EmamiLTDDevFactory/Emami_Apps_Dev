'use client';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Clock, Download, Eye, KeyRound, Search, ShieldCheck, Users } from 'lucide-react';
import { ApiError, authz, type AuthzAccess, type AuthzLogEntry, type AuthzProfile, type SodWarning, type UserAccessPatch } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import type { Visibility } from '@/lib/permissions';
import { Button, Card, Drawer, Empty, Field, Kpi, Modal, Notice, Person, Pill, Select, Skeleton, Table, Tabs, cx, inputCls, textareaCls } from '../ui';
import { checkboxCls, useLoad } from './shared';

/*
   Admin > Authorization cockpit (v7, master prompt §K 9.4). Admin only: the tab sits inside Admin, and every call is
   refused by the server for anyone else. Base roles stay in Roles & access (Manage Access); the cockpit adds profiles,
   data scope and per-person overrides on top. Every change asks for a reason and lands in the change log.
*/

type TabId = 'overview' | 'profiles' | 'matrix' | 'users' | 'review' | 'log';
const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'profiles', label: 'Role profiles' },
  { id: 'matrix', label: 'Permission matrix' },
  { id: 'users', label: 'User access' },
  { id: 'review', label: 'Access review' },
  { id: 'log', label: 'Change log' },
];
const SCREEN_LABEL: Record<string, string> = {
  'screen.dashboard': 'Dashboard', 'screen.helpdesk': 'Helpdesk dashboard', 'screen.tickets': 'Tickets', 'screen.board': 'Board',
  'screen.newTicket': 'New ticket', 'screen.contacts': 'Contacts', 'screen.solutions': 'Solutions', 'screen.analytics': 'Analytics',
  'screen.reports': 'Daily report', 'screen.changeCalendar': 'Change calendar', 'screen.approvals': 'Approvals',
};
const VIS_LABEL: Record<Visibility, string> = { all: 'All tickets', groups: "My groups' tickets + mine", own: 'Only mine (assigned or watched)' };
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
const sodOf = (e: unknown): SodWarning[] | null => (e instanceof ApiError && e.status === 409 && Array.isArray(e.data?.sod) ? (e.data.sod as SodWarning[]) : null);
const isoLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

async function toExcel(name: string, head: string[], rows: (string | number)[][]) {
  const XLSX = await import('xlsx');
  // Cells starting with = + - @ are written as text so a spreadsheet never runs them.
  const safe = rows.map((r) => r.map((v) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v)));
  const ws = XLSX.utils.aoa_to_sheet([head, ...safe]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  XLSX.writeFile(wb, `Samadhan_${name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/** Asks for the mandatory reason (and, when the server raised them, confirmation of SoD warnings). */
function ReasonModal({ open, title, sod, busy, error, onCancel, onConfirm }: {
  open: boolean; title: string; sod: SodWarning[] | null; busy: boolean; error: string; onCancel: () => void; onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className="space-y-3 p-4">
        {sod && sod.length > 0 && (
          <Notice tone="warn">
            <b>Segregation of duties:</b>
            <ul className="mt-1 list-disc pl-5">{sod.map((w, i) => <li key={`${w.id}-${i}`}>{w.email ? `${w.email}: ` : ''}{w.text}</li>)}</ul>
            Saving anyway records your reason with the warning.
          </Notice>
        )}
        {error && <Notice>{error}</Notice>}
        <Field label="Reason" required hint="Kept in the change log and the audit log.">
          <textarea className={cx(textareaCls, 'h-20')} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Covering for the SAP team during year-end close" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" disabled={busy || !reason.trim()} onClick={() => onConfirm(reason.trim())}>{sod?.length ? 'Accept warning and save' : 'Save'}</Button>
        </div>
      </div>
    </Modal>
  );
}

export function AuthzTab({ onOpenTab }: { onOpenTab: (tab: 'access' | 'agents') => void }) {
  const [tab, setTab] = useState<TabId>('overview');
  return (
    <div className="space-y-3">
      <Notice tone="warn">
        Base roles (Agent / Supervisor / Admin) come from Manage Access - change them under{' '}
        <button type="button" className="font-bold underline" onClick={() => onOpenTab('access')}>Roles &amp; access</button>; people and availability under{' '}
        <button type="button" className="font-bold underline" onClick={() => onOpenTab('agents')}>Agents</button>. The cockpit adds profiles, data scope and individual overrides on top. Changes apply within a minute.
      </Notice>
      <Tabs label="Authorization cockpit" tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'overview' && <Overview />}
      {tab === 'profiles' && <Profiles />}
      {tab === 'matrix' && <Matrix />}
      {tab === 'users' && <UserAccess />}
      {tab === 'review' && <Review />}
      {tab === 'log' && <ChangeLog />}
    </div>
  );
}

// ---------- 1. Overview ----------
function Overview() {
  const { data, error } = useLoad(authz.overview);
  if (error) return <Notice>{error}</Notice>;
  if (!data) return <Skeleton />;
  const roles = data.usersByRole;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Active users" value={(roles.Agent ?? 0) + (roles.Supervisor ?? 0) + (roles.Admin ?? 0)} sub={`${roles.Agent ?? 0} agents · ${roles.Supervisor ?? 0} supervisors · ${roles.Admin ?? 0} admins`} icon={Users} />
        <Kpi label="Custom profiles" value={data.customProfiles} icon={KeyRound} />
        <Kpi label="Temporary grants ending in 7 days" value={data.expiringIn7Days} icon={Clock} tone={data.expiringIn7Days ? 'warn' : 'accent'} />
        <Kpi label="Confidential access" value={data.confidentialUsers} icon={Eye} />
        <Kpi label="Open SoD warnings" value={data.sodWarnings.length} icon={AlertTriangle} tone={data.sodWarnings.length ? 'bad' : 'good'} />
      </div>
      {data.sodWarnings.length > 0 && (
        <Card title="Segregation-of-duties warnings">
          <Table head={['Person', 'Conflict']}>
            {data.sodWarnings.map((w, i) => (
              <tr key={`${w.agentId}-${w.id}-${i}`}><td className="px-3 py-2"><Person email={w.email ?? ''} name={w.name} /></td><td className="px-3 py-2 text-sm">{w.text}</td></tr>
            ))}
          </Table>
        </Card>
      )}
      <Card title="Last 10 changes">
        <LogTable entries={data.recentChanges} compact />
      </Card>
    </div>
  );
}

// ---------- 2. Role profiles ----------
function Profiles() {
  const { data, error, reload } = useLoad(authz.profiles);
  const [create, setCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', mode: 'add' as 'add' | 'restrict', copyOf: '' });
  const [pending, setPending] = useState<null | { title: string; save: (reason: string, acceptSod: boolean) => Promise<unknown> }>(null);
  const [sod, setSod] = useState<SodWarning[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const confirm = async (reason: string) => {
    if (!pending) return;
    setBusy(true);
    setErr('');
    try {
      await pending.save(reason, !!sod);
      setPending(null);
      setSod(null);
      setCreate(false);
      setOk('Saved.');
      reload();
    } catch (e) {
      const w = sodOf(e);
      if (w) setSod(w); else setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <Notice>{error}</Notice>;
  if (!data) return <Skeleton />;
  const all = [...data.system, ...data.profiles];
  return (
    <div className="space-y-3">
      {ok && <Notice tone="good" onClose={() => setOk('')}>{ok}</Notice>}
      <Card
        title="Role profiles"
        sub="System profiles mirror the base roles and are read-only (copy them to start a custom one). 'Adds' profiles add rights to a person's base role; 'Restricts' profiles (e.g. Auditor) cap them."
        actions={<Button variant="primary" onClick={() => { setForm({ name: '', description: '', mode: 'add', copyOf: '' }); setCreate(true); }}>New profile</Button>}
      >
        <Table head={['Profile', 'Type', 'Permissions', 'People', 'Status', '']}>
          {all.map((p) => (
            <tr key={p.code}>
              <td className="px-3 py-2"><div className="font-semibold">{p.name}</div><div className="text-2xs text-muted">{p.code}{p.description ? ` · ${p.description}` : ''}</div></td>
              <td className="px-3 py-2">{p.system ? <Pill>System</Pill> : <Pill tone={p.mode === 'restrict' ? 'warn' : 'accent'}>{p.mode === 'restrict' ? 'Restricts' : 'Adds'}</Pill>}</td>
              <td className="px-3 py-2 text-sm">{p.keys.length}</td>
              <td className="px-3 py-2 text-sm">{p.system ? 'by role' : p.users ?? 0}</td>
              <td className="px-3 py-2">{p.active ? <Pill tone="good">Active</Pill> : <Pill tone="bad">Inactive</Pill>}</td>
              <td className="px-3 py-2 text-right">
                {!p.system && p.id !== null && (
                  <Button size="sm" onClick={() => setPending({ title: `${p.active ? 'Deactivate' : 'Activate'} ${p.name}`, save: (reason, acceptSod) => authz.saveProfile(p.id as number, { active: !p.active, reason, acceptSod }) })}>
                    {p.active ? 'Deactivate' : 'Activate'}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      <Modal open={create} onClose={() => setCreate(false)} title="New custom profile">
        <div className="space-y-3 p-4">
          <Field label="Name" required><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Description"><input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Select label="Start from" value={form.copyOf} onChange={(v) => setForm({ ...form, copyOf: v })}
            options={[{ value: '', label: 'Empty (choose permissions in the matrix)' }, ...all.filter((p) => p.code !== 'ADMIN').map((p) => ({ value: p.system ? p.code : String(p.id), label: `Copy of ${p.name}` }))]} />
          <Select label="Type" value={form.mode} onChange={(v) => setForm({ ...form, mode: v as 'add' | 'restrict' })}
            options={[{ value: 'add', label: 'Adds to the base role' }, { value: 'restrict', label: 'Restricts (caps) the base role' }]} />
          <p className="text-2xs text-muted">admin.* permissions are never part of a profile - they come only with the Admin role.</p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setCreate(false)}>Cancel</Button>
            <Button variant="primary" disabled={!form.name.trim()} onClick={() => setPending({
              title: `Create ${form.name.trim()}`,
              save: (reason) => authz.createProfile({ name: form.name.trim(), description: form.description, mode: form.mode, keys: [], copyOf: form.copyOf ? (Number.isNaN(Number(form.copyOf)) ? form.copyOf : Number(form.copyOf)) : null, reason }),
            })}>Continue</Button>
          </div>
        </div>
      </Modal>
      <ReasonModal open={!!pending} title={pending?.title ?? ''} sod={sod} busy={busy} error={err} onCancel={() => { setPending(null); setSod(null); setErr(''); }} onConfirm={confirm} />
    </div>
  );
}

// ---------- 3. Permission matrix ----------
function Matrix() {
  const cat = useLoad(authz.catalogue);
  const prof = useLoad(authz.profiles);
  const [q, setQ] = useState('');
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<number, Set<string>>>({});
  const [diff, setDiff] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sod, setSod] = useState<SodWarning[] | null>(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [asking, setAsking] = useState(false);

  const cols: AuthzProfile[] = useMemo(() => (prof.data ? [...prof.data.system, ...prof.data.profiles.filter((p) => p.active)] : []), [prof.data]);
  const agentKeys = useMemo(() => new Set(prof.data?.system.find((p) => p.code === 'AGENT')?.keys ?? []), [prof.data]);
  if (cat.error || prof.error) return <Notice>{cat.error || prof.error}</Notice>;
  if (!cat.data || !prof.data) return <Skeleton />;

  const keysOf = (p: AuthzProfile) => (p.id !== null && edits[p.id]) || new Set(p.keys);
  const toggle = (p: AuthzProfile, key: string) => {
    if (p.system || p.id === null || key.startsWith('admin.')) return;
    const next = new Set(keysOf(p));
    if (next.has(key)) next.delete(key); else next.add(key);
    setEdits({ ...edits, [p.id]: next });
  };
  const changed = cols.filter((p) => p.id !== null && edits[p.id] && [...edits[p.id]].sort().join() !== [...p.keys].sort().join());
  const term = q.trim().toLowerCase();

  const save = async (reason: string) => {
    setSaving(true);
    setErr('');
    try {
      for (const p of changed) await authz.saveProfile(p.id as number, { keys: [...(edits[p.id as number] ?? [])], reason, acceptSod: !!sod });
      setEdits({});
      setSod(null);
      setOk(`Saved ${changed.length} profile(s).`);
      prof.reload();
    } catch (e) {
      const w = sodOf(e);
      if (w) setSod(w); else setErr(errText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {ok && <Notice tone="good" onClose={() => setOk('')}>{ok}</Notice>}
      <Card
        title="Permission matrix"
        sub="Rows are permissions, columns are profiles. System columns are read-only and the Admin column always has everything; admin.* rows cannot be given to custom profiles."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold"><input type="checkbox" className={checkboxCls} checked={diff} onChange={(e) => setDiff(e.target.checked)} /> Highlight difference vs Agent</label>
            <div className="relative"><Search size={14} className="absolute left-2.5 top-2.5 text-faint" /><input className={cx(inputCls, 'w-56 pl-8')} placeholder="Search permissions" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <Button variant="primary" disabled={!changed.length} onClick={() => { setErr(''); setAsking(true); }}>Save {changed.length ? `(${changed.length})` : ''}</Button>
          </div>
        )}
      >
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-2xs uppercase text-muted">
                <th className="sticky left-0 bg-panel px-3 py-2">Permission</th>
                {cols.map((p) => <th key={p.code} className="whitespace-nowrap px-2 py-2 text-center">{p.name}{p.system ? '' : p.mode === 'restrict' ? ' (caps)' : ''}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.entries(cat.data.catalogue).map(([group, keys]) => {
                const shown = keys.filter((k) => !term || k.toLowerCase().includes(term));
                if (!shown.length) return null;
                const isClosed = closed[group] && !term;
                return (
                  <Fragment key={group}>
                    <tr className="bg-sunken">
                      <td colSpan={cols.length + 1} className="px-3 py-1.5">
                        <button type="button" className="flex items-center gap-1 text-xs font-bold" onClick={() => setClosed({ ...closed, [group]: !closed[group] })}>
                          {isClosed ? <ChevronRight size={14} /> : <ChevronDown size={14} />} {group} <span className="font-normal text-muted">({keys.length})</span>
                        </button>
                      </td>
                    </tr>
                    {!isClosed && shown.map((k) => (
                      <tr key={k} className="border-b border-line/60">
                        <td className="sticky left-0 bg-panel px-3 py-1.5 font-mono text-xs">{k}</td>
                        {cols.map((p) => {
                          const has = p.code === 'ADMIN' || keysOf(p).has(k);
                          const locked = p.system || k.startsWith('admin.');
                          const differs = diff && !p.system && has !== agentKeys.has(k);
                          return (
                            <td key={p.code} className={cx('px-2 py-1.5 text-center', differs && 'bg-accent/10')}>
                              <input type="checkbox" aria-label={`${p.name}: ${k}`} className={checkboxCls} checked={has} disabled={locked} onChange={() => toggle(p, k)} />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <ReasonModal open={asking} title={`Save ${changed.length} profile(s)`} sod={sod} busy={saving} error={err} onCancel={() => { setAsking(false); setSod(null); }} onConfirm={async (r) => { await save(r); setAsking(false); }} />
    </div>
  );
}

// ---------- 4. User access ----------
function UserAccess() {
  const [q, setQ] = useState('');
  const list = useLoad(() => authz.users(''));
  const [openId, setOpenId] = useState<number | null>(null);
  const term = q.trim().toLowerCase();
  if (list.error) return <Notice>{list.error}</Notice>;
  if (!list.data) return <Skeleton />;
  const rows = list.data.filter((u) => !term || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term));
  return (
    <Card title="User access" sub="Pick a person to see and change their profiles, data scope and individual overrides." actions={<input className={cx(inputCls, 'w-64')} placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} />}>
      <Table head={['Person', 'Base role', 'Profiles', 'Overrides', 'Sees', 'Last seen', '']}>
        {rows.map((u) => (
          <tr key={u.id} className={cx(!u.active && 'opacity-60')}>
            <td className="px-3 py-2"><Person email={u.email} name={u.name} /></td>
            <td className="px-3 py-2"><Pill tone={u.role === 'Admin' ? 'accent' : 'neutral'}>{u.role}</Pill></td>
            <td className="px-3 py-2 text-sm">{u.profiles.join(', ') || '-'}</td>
            <td className="px-3 py-2 text-sm">{u.overrides || '-'}</td>
            <td className="px-3 py-2 text-sm">{VIS_LABEL[u.visibility]}</td>
            <td className="px-3 py-2 text-xs text-muted">{fmtDateTime(u.lastSeenAt)}</td>
            <td className="px-3 py-2 text-right"><Button size="sm" onClick={() => setOpenId(u.id)}>Open</Button></td>
          </tr>
        ))}
      </Table>
      {openId !== null && <UserDrawer id={openId} onClose={() => { setOpenId(null); list.reload(); }} />}
    </Card>
  );
}

function UserDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const access = useLoad(() => authz.user(id));
  const profiles = useLoad(authz.profiles);
  const cat = useLoad(authz.catalogue);
  const [draft, setDraft] = useState<null | { profiles: { profileId: number; validFrom: string; validTo: string }[]; overrides: { key: string; effect: 'grant' | 'deny'; expiresAt: string }[]; visibility: Visibility }>(null);
  const [asking, setAsking] = useState(false);
  const [sod, setSod] = useState<SodWarning[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const a: AuthzAccess | null = access.data;
  const d = draft ?? (a ? {
    profiles: a.profiles.map((p) => ({ profileId: p.profileId, validFrom: isoLocal(p.validFrom), validTo: isoLocal(p.validTo) })),
    overrides: a.overrides.map((o) => ({ key: o.key, effect: o.effect, expiresAt: isoLocal(o.expiresAt) })),
    visibility: a.scope.visibility,
  } : null);
  const allKeys = cat.data ? Object.values(cat.data.catalogue).flat().filter((k) => !k.startsWith('admin.')) : [];
  const isAdmin = a?.agent.role === 'Admin';

  const save = async (reason: string) => {
    if (!d) return;
    setBusy(true);
    setErr('');
    const body: UserAccessPatch = {
      profiles: d.profiles.map((p) => ({ profileId: p.profileId, validFrom: fromLocal(p.validFrom), validTo: fromLocal(p.validTo) })),
      overrides: d.overrides.filter((o) => o.key).map((o) => ({ key: o.key, effect: o.effect, expiresAt: fromLocal(o.expiresAt) })),
      scope: { visibility: d.visibility }, reason, acceptSod: !!sod,
    };
    try {
      await authz.saveUser(id, body);
      setAsking(false);
      setSod(null);
      setDraft(null);
      setOk('Saved - applies within a minute.');
      access.reload();
    } catch (e) {
      const w = sodOf(e);
      if (w) setSod(w); else setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open onClose={onClose} title={a ? <Person email={a.agent.email} name={a.agent.name} sub={`Base role: ${a.agent.role}`} /> : 'Loading...'} width={760}>
      {!a || !d || !profiles.data ? <Skeleton /> : (
        <div className="space-y-4 p-4">
          {ok && <Notice tone="good" onClose={() => setOk('')}>{ok}</Notice>}
          {isAdmin && <Notice tone="warn">Admins always have every permission and see every ticket; profiles and overrides do not change that.</Notice>}
          {a.sod.length > 0 && <Notice tone="warn">{a.sod.map((w) => w.text).join(' ')}</Notice>}

          <Card title="Profiles" sub="Temporary access: set 'valid to'. It ends by itself, and the person gets a hub notification.">
            <div className="space-y-2">
              {d.profiles.map((p, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_180px_180px_auto]">
                  <Select label="Profile" value={String(p.profileId)} onChange={(v) => { const n = [...d.profiles]; n[i] = { ...p, profileId: Number(v) }; setDraft({ ...d, profiles: n }); }}
                    options={profiles.data!.profiles.map((x) => ({ value: String(x.id), label: `${x.name}${x.active ? '' : ' (inactive)'}` }))} />
                  <input type="datetime-local" aria-label="Valid from" className={inputCls} value={p.validFrom} onChange={(e) => { const n = [...d.profiles]; n[i] = { ...p, validFrom: e.target.value }; setDraft({ ...d, profiles: n }); }} />
                  <input type="datetime-local" aria-label="Valid to" className={inputCls} value={p.validTo} onChange={(e) => { const n = [...d.profiles]; n[i] = { ...p, validTo: e.target.value }; setDraft({ ...d, profiles: n }); }} />
                  <Button size="sm" variant="danger" onClick={() => setDraft({ ...d, profiles: d.profiles.filter((_, j) => j !== i) })}>Remove</Button>
                </div>
              ))}
              <Button size="sm" disabled={!profiles.data.profiles.length} onClick={() => setDraft({ ...d, profiles: [...d.profiles, { profileId: profiles.data!.profiles[0].id as number, validFrom: '', validTo: '' }] })}>Add profile</Button>
            </div>
          </Card>

          <Card title="Data scope" sub="Which tickets this person sees in lists, counts, board, search, dashboards, reports and the bell.">
            <Select label="Sees" value={d.visibility} onChange={(v) => setDraft({ ...d, visibility: v as Visibility })}
              options={(Object.keys(VIS_LABEL) as Visibility[]).map((v) => ({ value: v, label: VIS_LABEL[v] }))} />
            <p className="mt-2 text-2xs text-muted">Workspace and application scope arrive with workspaces (next phase).</p>
          </Card>

          <Card title="Individual overrides" sub="Grant or deny one permission for this person, optionally until a date. A deny always wins.">
            <div className="space-y-2">
              {d.overrides.map((o, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_120px_180px_auto]">
                  <Select label="Permission" value={o.key} onChange={(v) => { const n = [...d.overrides]; n[i] = { ...o, key: v }; setDraft({ ...d, overrides: n }); }}
                    options={[{ value: '', label: 'Choose...' }, ...allKeys.map((k) => ({ value: k, label: k }))]} />
                  <Select label="Effect" value={o.effect} onChange={(v) => { const n = [...d.overrides]; n[i] = { ...o, effect: v as 'grant' | 'deny' }; setDraft({ ...d, overrides: n }); }}
                    options={[{ value: 'grant', label: 'Grant' }, { value: 'deny', label: 'Deny' }]} />
                  <input type="datetime-local" aria-label="Expires" className={inputCls} value={o.expiresAt} onChange={(e) => { const n = [...d.overrides]; n[i] = { ...o, expiresAt: e.target.value }; setDraft({ ...d, overrides: n }); }} />
                  <Button size="sm" variant="danger" onClick={() => setDraft({ ...d, overrides: d.overrides.filter((_, j) => j !== i) })}>Remove</Button>
                </div>
              ))}
              <Button size="sm" onClick={() => setDraft({ ...d, overrides: [...d.overrides, { key: '', effect: 'grant', expiresAt: '' }] })}>Add override</Button>
            </div>
          </Card>

          <Card title="Effective access (saved)" sub="Computed by the same server function that checks every request.">
            <div className="space-y-2 text-sm">
              <div><b>Menu:</b> {a.screens.map((s) => SCREEN_LABEL[s] ?? s).join(' · ') || '-'}</div>
              <div><b>Sees:</b> {VIS_LABEL[a.scope.visibility]}</div>
              <div><b>Added to the base role:</b> {a.added.length ? a.added.map((k) => <Pill key={k} tone="good">{k}</Pill>) : '-'}</div>
              <div><b>Removed from the base role:</b> {a.removed.length ? a.removed.map((k) => <Pill key={k} tone="bad">{k}</Pill>) : '-'}</div>
              <details><summary className="cursor-pointer font-semibold">All {a.effective.length} permissions</summary><div className="mt-1 font-mono text-xs leading-6">{a.effective.join(' · ')}</div></details>
            </div>
          </Card>

          <div className="flex justify-end gap-2">
            {draft && <Button onClick={() => setDraft(null)}>Discard changes</Button>}
            <Button variant="primary" disabled={!draft} onClick={() => { setErr(''); setAsking(true); }}><ShieldCheck size={14} /> Save access</Button>
          </div>
          <ReasonModal open={asking} title="Save access" sod={sod} busy={busy} error={err} onCancel={() => { setAsking(false); setSod(null); }} onConfirm={save} />
        </div>
      )}
    </Drawer>
  );
}

// ---------- 5. Access review ----------
function Review() {
  const { data, error, reload } = useLoad(authz.review);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  if (error) return <Notice>{error}</Notice>;
  if (!data) return <Skeleton />;
  const expired = data.reduce((n, u) => n + u.expired, 0);
  const revoke = async () => {
    try {
      const n = await authz.revokeExpired();
      setMsg({ tone: 'good', text: `Removed expired access for ${n} person(s).` });
      reload();
    } catch (e) {
      setMsg({ tone: 'bad', text: errText(e) });
    }
  };
  const exportXlsx = () => toExcel('Access review', ['Name', 'Email', 'Base role', 'Profiles', 'Sees', 'Last seen', 'Ending within 30 days', 'Expired', 'Not used in 90 days', 'SoD'],
    data.map((u) => [u.name, u.email, u.role, u.profiles.join(', '), VIS_LABEL[u.visibility], u.lastSeenAt ? fmtDateTime(u.lastSeenAt) : '', u.expiring.map((x) => `${x.what} (${fmtDateTime(x.at)})`).join('; '), u.expired, u.unused.join(', '), u.sod.join(', ')]));
  return (
    <Card
      title="Access review"
      sub="Who has what, what ends soon and what was not used in the last 90 days. Admins get a reminder in the hub inbox every quarter."
      actions={<div className="flex gap-2"><Button disabled={!expired} onClick={revoke}>Revoke expired ({expired})</Button><Button onClick={exportXlsx}><Download size={14} /> Excel</Button></div>}
    >
      {msg && <div className="mb-2"><Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice></div>}
      {!data.length ? <Empty title="No active people" /> : (
        <Table head={['Person', 'Base role', 'Profiles', 'Sees', 'Last seen', 'Ending soon', 'Unused (90 days)', 'SoD']}>
          {data.map((u) => (
            <tr key={u.id}>
              <td className="px-3 py-2"><Person email={u.email} name={u.name} /></td>
              <td className="px-3 py-2 text-sm">{u.role}</td>
              <td className="px-3 py-2 text-sm">{u.profiles.join(', ') || '-'}</td>
              <td className="px-3 py-2 text-sm">{VIS_LABEL[u.visibility]}</td>
              <td className="px-3 py-2 text-xs text-muted">{fmtDateTime(u.lastSeenAt)}</td>
              <td className="px-3 py-2 text-xs">{u.expiring.map((x) => <div key={x.what}>{x.what} · {fmtDateTime(x.at)}</div>)}{u.expired ? <Pill tone="bad">{u.expired} expired</Pill> : null}</td>
              <td className="px-3 py-2 text-xs" title={u.unused.join(', ')}>{u.role === 'Admin' ? '-' : `${u.unused.length} key(s)`}</td>
              <td className="px-3 py-2">{u.sod.length ? <Pill tone="bad">{u.sod.length}</Pill> : '-'}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

// ---------- 6. Change log ----------
function LogTable({ entries, compact = false }: { entries: AuthzLogEntry[]; compact?: boolean }) {
  if (!entries.length) return <Empty title="No changes yet" />;
  return (
    <Table head={['When', 'Who', 'What', 'Target', 'Reason', ...(compact ? [] : ['Before / after'])]}>
      {entries.map((e) => (
        <tr key={e.id}>
          <td className="whitespace-nowrap px-3 py-2 text-xs">{fmtDateTime(e.createdAt)}</td>
          <td className="px-3 py-2 text-xs">{e.actorEmail}</td>
          <td className="px-3 py-2 text-xs font-semibold">{e.action.replace(/_/g, ' ')}</td>
          <td className="px-3 py-2 text-xs">{e.target}</td>
          <td className="px-3 py-2 text-xs">{e.reason}</td>
          {!compact && (
            <td className="px-3 py-2 text-xs">
              <details><summary className="cursor-pointer text-accent">Show</summary>
                <pre className="mt-1 max-w-md whitespace-pre-wrap break-all text-[11px]">{JSON.stringify({ before: e.before, after: e.after }, null, 1)}</pre>
              </details>
            </td>
          )}
        </tr>
      ))}
    </Table>
  );
}

function ChangeLog() {
  const [f, setF] = useState({ q: '', from: '', to: '' });
  const [data, setData] = useState<AuthzLogEntry[] | null>(null);
  const [error, setError] = useState('');
  const go = useCallback(async (filters: { q: string; from: string; to: string }) => {
    try { setData(await authz.log(filters)); setError(''); } catch (e) { setError(errText(e)); }
  }, []);
  useEffect(() => { go({ q: '', from: '', to: '' }); }, [go]);
  const exportXlsx = () => data && toExcel('Access change log', ['When', 'Who', 'What', 'Target', 'Reason', 'Before', 'After'],
    data.map((e) => [fmtDateTime(e.createdAt), e.actorEmail ?? '', e.action, e.target ?? '', e.reason ?? '', JSON.stringify(e.before ?? ''), JSON.stringify(e.after ?? '')]));
  return (
    <Card
      title="Change log"
      sub="Every cockpit change with before / after, who and why. Also written to Admin > Audit log."
      actions={(
        <div className="flex flex-wrap items-end gap-2">
          <input className={cx(inputCls, 'w-48')} placeholder="Search" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && go(f)} />
          <input type="date" aria-label="From" className={cx(inputCls, 'w-40')} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
          <input type="date" aria-label="To" className={cx(inputCls, 'w-40')} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
          <Button onClick={() => go(f)}>Filter</Button>
          <Button onClick={exportXlsx} disabled={!data?.length}><Download size={14} /> Excel</Button>
        </div>
      )}
    >
      {error ? <Notice>{error}</Notice> : !data ? <Skeleton /> : <LogTable entries={data} />}
    </Card>
  );
}
