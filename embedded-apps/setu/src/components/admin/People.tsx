'use client';
import { useState } from 'react';
import { Pencil, Plus, Users } from 'lucide-react';
import { admin } from '@/lib/api';
import { useSetu } from '@/lib/context';
import { relative } from '@/lib/format';
import type { AdminAgent, AdminGroup } from '@/lib/types';
import { Button, Card, Empty, Field, Modal, Notice, Person, Pill, Skeleton, Table, cx, inputCls, textareaCls } from '../ui';
import { checkboxCls, useAction, useLoad } from './shared';

export function AgentsTab() {
  const { meta, reloadMeta, me } = useSetu();
  const { data, error, reload } = useLoad(admin.agents);
  const [edit, setEdit] = useState<{ email: string; name: string; active: boolean; groupIds: number[]; isNew: boolean } | null>(null);
  const act = useAction();

  const save = async () => {
    if (!edit) return;
    const ok = await act.run(() => admin.saveAgent({ email: edit.email, name: edit.name, active: edit.active, groupIds: edit.groupIds }), 'Agent saved.');
    if (ok) {
      setEdit(null);
      await Promise.all([reload(), reloadMeta()]);
    }
  };
  const open = (a?: AdminAgent) => {
    act.setMsg(null);
    setEdit(a ? { email: a.email, name: a.name, active: a.active, groupIds: a.groupIds, isNew: false } : { email: '', name: '', active: true, groupIds: [], isNew: true });
  };

  return (
    <Card
      title="Agents"
      sub="An agent appears here the first time they open Samadhan, or when you add them. Access and role come from Manage Access."
      actions={<Button size="sm" variant="primary" onClick={() => open()}><Plus size={13} /> Add agent</Button>}
      bodyClass="p-0"
    >
      {error && <div className="p-4"><Notice>{error}</Notice></div>}
      {act.msg && !edit && <div className="p-4 pb-0"><Notice tone={act.msg.tone} onClose={() => act.setMsg(null)}>{act.msg.text}</Notice></div>}
      {!data ? <div className="p-4"><Skeleton /></div> : data.length === 0 ? <Empty title="No agents yet" icon={Users} /> : (
        <Table head={['Agent', 'Role', 'Groups', 'Status', 'Samadhan access', 'Last seen', '']}>
          {data.map((a) => (
            <tr key={a.id} className={cx(!a.active && 'opacity-60')}>
              <td className="px-3 py-2"><Person email={a.email} name={a.name} /></td>
              <td className="px-3 py-2"><Pill tone={a.role === 'Admin' ? 'accent' : a.role === 'Supervisor' ? 'warn' : 'neutral'}>{a.role}</Pill></td>
              <td className="px-3 py-2 text-xs">{a.groupIds.map((g) => meta.groups.find((x) => x.id === g)?.name).filter(Boolean).join(', ') || '—'}</td>
              <td className="px-3 py-2 text-xs">{a.active ? meta.agentStatuses[a.availability] : <span className="font-semibold text-bad">Deactivated</span>}</td>
              <td className="px-3 py-2">{a.hasAccess ? <Pill tone="good">Granted</Pill> : <Pill tone="warn" title="Grant Samadhan in Emami Apps Manage Access so they can sign in">Not granted</Pill>}</td>
              <td className="px-3 py-2 text-xs text-muted">{a.lastSeenAt ? relative(a.lastSeenAt) : 'Never'}</td>
              <td className="px-3 py-2 text-right"><Button size="sm" variant="ghost" onClick={() => open(a)} aria-label={`Edit ${a.name}`}><Pencil size={13} /></Button></td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.isNew ? 'Add agent' : 'Edit agent'}>
        {edit && (
          <div className="space-y-3">
            <Field label="Name" required><input className={inputCls} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Email" required hint={edit.isNew ? 'Their Emami email - the one they sign in to Emami Apps with.' : undefined}>
              <input className={inputCls} value={edit.email} disabled={!edit.isNew} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            </Field>
            <div>
              <div className="mb-1 text-2xs font-bold uppercase tracking-wide text-muted">Groups</div>
              <div className="flex flex-wrap gap-3">
                {meta.groups.map((g) => (
                  <label key={g.id} className="flex items-center gap-1.5 text-[13px]">
                    <input type="checkbox" className={checkboxCls} checked={edit.groupIds.includes(g.id)} onChange={(e) => setEdit({ ...edit, groupIds: e.target.checked ? [...edit.groupIds, g.id] : edit.groupIds.filter((x) => x !== g.id) })} />
                    {g.name}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-[13px] font-medium">
              <input type="checkbox" className={checkboxCls} checked={edit.active} disabled={edit.email === me.email} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />
              Active (deactivated agents cannot open Samadhan and get no tickets)
            </label>
            <p className="text-2xs text-muted">The role (Agent, Supervisor, Admin) is the Samadhan role granted in Emami Apps Manage Access.</p>
            {act.msg && <Notice tone={act.msg.tone}>{act.msg.text}</Notice>}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setEdit(null)}>Cancel</Button>
              <Button variant="primary" onClick={save} disabled={act.busy || !edit.name.trim() || !edit.email.trim()}>Save</Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

export function GroupsTab() {
  const { meta, reloadMeta } = useSetu();
  const { data, error, reload } = useLoad(admin.groups);
  const [edit, setEdit] = useState<{ id?: number; name: string; description: string; assignment: string; agentIds: number[] } | null>(null);
  const act = useAction();

  const save = async () => {
    if (!edit) return;
    const ok = await act.run(() => admin.saveGroup(edit), 'Group saved.');
    if (ok) {
      setEdit(null);
      await Promise.all([reload(), reloadMeta()]);
    }
  };
  const open = (g?: AdminGroup) => {
    act.setMsg(null);
    setEdit(g ? { id: g.id, name: g.name, description: g.description ?? '', assignment: g.assignment, agentIds: g.agentIds } : { name: '', description: '', assignment: 'MANUAL', agentIds: [] });
  };

  return (
    <Card title="Groups" sub="Round robin gives each new ticket to the next Available member" actions={<Button size="sm" variant="primary" onClick={() => open()}><Plus size={13} /> Add group</Button>} bodyClass="p-0">
      {error && <div className="p-4"><Notice>{error}</Notice></div>}
      {!data ? <div className="p-4"><Skeleton /></div> : (
        <Table head={['Group', 'Assignment', 'Members', '']}>
          {data.map((g) => (
            <tr key={g.id}>
              <td className="px-3 py-2"><div className="font-semibold">{g.name}</div>{g.description && <div className="text-2xs text-muted">{g.description}</div>}</td>
              <td className="px-3 py-2"><Pill tone={g.assignment === 'ROUND_ROBIN' ? 'accent' : 'neutral'}>{g.assignment === 'ROUND_ROBIN' ? 'Round robin' : 'Manual'}</Pill></td>
              <td className="px-3 py-2 text-xs">{g.agentIds.map((id) => meta.agents.find((a) => a.id === id)?.name).filter(Boolean).join(', ') || '—'}</td>
              <td className="px-3 py-2 text-right"><Button size="sm" variant="ghost" onClick={() => open(g)} aria-label={`Edit ${g.name}`}><Pencil size={13} /></Button></td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit group' : 'Add group'}>
        {edit && (
          <div className="space-y-3">
            <Field label="Name" required><input className={inputCls} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Description"><textarea rows={2} className={textareaCls} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Assignment">
              <select className={inputCls} value={edit.assignment} onChange={(e) => setEdit({ ...edit, assignment: e.target.value })}>
                <option value="MANUAL">Manual</option>
                <option value="ROUND_ROBIN">Round robin</option>
              </select>
            </Field>
            <div>
              <div className="mb-1 text-2xs font-bold uppercase tracking-wide text-muted">Members</div>
              <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto">
                {meta.agents.filter((a) => a.active).map((a) => (
                  <label key={a.id} className="flex items-center gap-1.5 text-[13px]">
                    <input type="checkbox" className={checkboxCls} checked={edit.agentIds.includes(a.id)} onChange={(e) => setEdit({ ...edit, agentIds: e.target.checked ? [...edit.agentIds, a.id] : edit.agentIds.filter((x) => x !== a.id) })} />
                    <span className="truncate">{a.name}</span>
                  </label>
                ))}
              </div>
            </div>
            {act.msg && <Notice tone={act.msg.tone}>{act.msg.text}</Notice>}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setEdit(null)}>Cancel</Button>
              <Button variant="primary" onClick={save} disabled={act.busy || !edit.name.trim()}>Save</Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
