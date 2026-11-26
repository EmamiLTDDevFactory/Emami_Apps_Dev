'use client';
import { useMemo, useState } from 'react';
import { Button, Card, Chip, DataTable, ErrorBox, Field, Input, Modal, useAction, type Column } from '@/components/ui';
import { saveUser, validateUser, type AdminUser } from '@/lib/admin';

const blank = (): AdminUser => ({ userid: '', fullname: '', email: '', role: '', unit: '', isAdmin: false, isGlobal: false, active: true, plants: [] });
const parsePlants = (s: string) => Array.from(new Set(s.split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean)));

/** Users & Roles (ZCAPEX_USER + plants). A login must match exactly one ACTIVE user by e-mail; SAP re-checks everything. */
export default function UsersCard({ users, roles, loading, error, onRetry, onSaved }: { users: AdminUser[]; roles: string[]; loading: boolean; error: string; onRetry: () => void; onSaved: () => void }) {
  const [edit, setEdit] = useState<{ user: AdminUser; isNew: boolean } | null>(null);
  const [plants, setPlants] = useState('');
  const [problem, setProblem] = useState('');
  const [q, setQ] = useState('');
  const { busy, run } = useAction();
  const plantCodes = useMemo(() => Array.from(new Set(users.flatMap((u) => u.plants))).sort(), [users]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return users.filter((u) => !t || [u.userid, u.fullname, u.email, u.role].some((v) => v.toLowerCase().includes(t)));
  }, [users, q]);

  const open = (user: AdminUser, isNew: boolean) => { setEdit({ user: { ...user }, isNew }); setPlants(user.plants.join(', ')); setProblem(''); };
  const patch = (p: Partial<AdminUser>) => setEdit((e) => (e ? { ...e, user: { ...e.user, ...p } } : e));
  const save = async () => {
    if (!edit) return;
    const u = { ...edit.user, plants: parsePlants(plants) };
    const msg = validateUser(u, edit.isNew, users);
    if (msg) { setProblem(msg); return; }
    const ok = await run(() => saveUser(u), `${u.fullname} saved.`);
    if (ok !== undefined) { setEdit(null); onSaved(); }
  };

  const cols: Column<AdminUser>[] = [
    { key: 'id', header: 'User ID', render: (u) => <span className="font-bold text-plum">{u.userid}</span> },
    { key: 'name', header: 'Name', render: (u) => <>{u.fullname}<div className="text-[11px] text-sap-muted">{u.email}</div></> },
    { key: 'role', header: 'Role', hideBelow: 'md', render: (u) => u.role },
    { key: 'unit', header: 'Unit', hideBelow: 'lg', render: (u) => u.unit || '-' },
    { key: 'plants', header: 'Plants', hideBelow: 'lg', render: (u) => (u.isGlobal ? 'All plants' : u.plants.join(', ') || '-') },
    { key: 'flags', header: 'Access', align: 'right', render: (u) => <span className="inline-flex gap-1">{u.isAdmin && <Chip tone="warning">SAP admin</Chip>}<Chip tone={u.active ? 'success' : 'neutral'}>{u.active ? 'Active' : 'Inactive'}</Chip></span> },
  ];

  return (
    <Card title={<>Users &amp; Roles <span className="font-normal text-sap-muted">({users.length})</span></>} hint="Who can use the CAPEX Portal, with which role and plants. The e-mail must match the person's Emami Apps login."
      actions={<Button variant="primary" onClick={() => open(blank(), true)}>Add user</Button>}>
      <div className="mb-3 max-w-xs"><Input placeholder="Search name, e-mail, role" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" /></div>
      {error ? <ErrorBox message={error} onRetry={onRetry} /> : <DataTable columns={cols} rows={shown} rowKey={(u) => u.userid} loading={loading && !users.length} onRowClick={(u) => open(u, false)} empty="No users match." />}
      <Modal open={!!edit} wide title={edit?.isNew ? 'Add CAPEX user' : `Edit ${edit?.user.userid}`} onClose={() => setEdit(null)}
        footer={<><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" disabled={busy} onClick={save}>Save</Button></>}>
        {edit && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="User ID" hint="The SAP user id (approver id used in DOA chains)"><Input value={edit.user.userid} disabled={!edit.isNew} onChange={(e) => patch({ userid: e.target.value.toUpperCase() })} /></Field>
            <Field label="Full name"><Input value={edit.user.fullname} onChange={(e) => patch({ fullname: e.target.value })} /></Field>
            <Field label="E-mail" hint="Exactly the e-mail used to sign in to Emami Apps"><Input type="email" value={edit.user.email} onChange={(e) => patch({ email: e.target.value })} /></Field>
            <Field label="Role"><Input list="capex-roles" value={edit.user.role} onChange={(e) => patch({ role: e.target.value })} /><datalist id="capex-roles">{roles.map((r) => <option key={r} value={r} />)}</datalist></Field>
            <Field label="Unit"><Input value={edit.user.unit} onChange={(e) => patch({ unit: e.target.value.toUpperCase() })} /></Field>
            <Field label="Plants" hint="Plant codes, separated by comma"><Input list="capex-plants" value={plants} disabled={edit.user.isGlobal} onChange={(e) => setPlants(e.target.value)} /><datalist id="capex-plants">{plantCodes.map((p) => <option key={p} value={p} />)}</datalist></Field>
            <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={edit.user.isGlobal} onChange={(e) => patch({ isGlobal: e.target.checked })} /> All plants (head office)</label>
            <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={edit.user.active} onChange={(e) => patch({ active: e.target.checked })} /> Active</label>
            <label className="flex items-center gap-2 text-[12px] sm:col-span-2"><input type="checkbox" checked={edit.user.isAdmin} onChange={(e) => patch({ isAdmin: e.target.checked })} /> SAP admin (sees every document and may act as admin in approvals). Maintenance access comes from the Admin role in Emami Apps, not from this box.</label>
            {problem && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700 sm:col-span-2">{problem}</p>}
          </div>
        )}
      </Modal>
    </Card>
  );
}
