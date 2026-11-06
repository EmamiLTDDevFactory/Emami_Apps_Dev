'use client';
import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { admin } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import type { Status } from '@/lib/types';
import { Button, Card, Field, Notice, Pill, Table, cx, inputCls } from '../ui';
import { checkboxCls, useAction } from './shared';

const CORE = [2, 4, 5];
const OPEN_ID = 2;
const isCustom = (s: Status) => s.id >= 100;

function NameCell({ s, busy, onSave }: { s: Status; busy: boolean; onSave: (name: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(s.name);
  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="font-semibold">{s.name}</span>
        {CORE.includes(s.id) && <Pill title="Built in: can be renamed and moved, keeps its meaning">Built in</Pill>}
        <button type="button" className="text-faint hover:text-accent" aria-label={`Rename ${s.name}`} onClick={() => { setName(s.name); setEditing(true); }}><Pencil size={12} /></button>
      </div>
    );
  }
  const submit = async () => { if (name.trim() && name.trim() !== s.name && (await onSave(name.trim()))) setEditing(false); };
  return (
    <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <input autoFocus className={cx(inputCls, 'h-8 min-w-[9rem] text-xs')} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} aria-label="Status name" onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }} />
      <Button type="submit" size="sm" variant="ghost" aria-label="Save name" disabled={busy || !name.trim()}><Check size={13} /></Button>
      <Button size="sm" variant="ghost" aria-label="Cancel" onClick={() => setEditing(false)}><X size={13} /></Button>
    </form>
  );
}

/** Admin > Statuses: rename, SLA pause, resolved meaning, order, custom statuses. */
export function StatusesTab() {
  const { meta, reloadMeta } = useSamadhan();
  const act = useAction();
  const [newName, setNewName] = useState('');
  const [newPauses, setNewPauses] = useState(true);
  const [newResolved, setNewResolved] = useState(false);
  const list = [...meta.statuses].sort((a, b) => a.position - b.position || a.id - b.id);

  const save = (s: Status, patch: Partial<Pick<Status, 'name' | 'pausesSla' | 'isResolved'>>, ok: string) =>
    act.run(async () => {
      const n = { ...s, ...patch };
      await admin.saveStatus({ id: s.id, name: n.name, pausesSla: n.pausesSla, ...(isCustom(s) ? { isResolved: n.isResolved } : {}) });
      await reloadMeta();
    }, ok);

  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    const ids = list.map((s) => s.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    act.run(async () => { await admin.orderStatuses(ids); await reloadMeta(); }, 'Order saved.');
  };

  const add = async () => {
    const ok = await act.run(async () => {
      await admin.saveStatus({ name: newName.trim(), pausesSla: newPauses, isResolved: newResolved });
      await reloadMeta();
    }, `Status "${newName.trim()}" added.`);
    if (ok) { setNewName(''); setNewPauses(true); setNewResolved(false); }
  };

  const remove = (s: Status) => {
    if (!confirm(`Delete the status "${s.name}"? Tickets in it must first be moved to another status.`)) return;
    act.run(async () => { await admin.deleteStatus(s.id); await reloadMeta(); }, `Status "${s.name}" deleted.`);
  };

  return (
    <div className="max-w-4xl space-y-4">
      <Card
        title="Ticket statuses"
        sub="The order here is the order in every status menu. Open, Resolved and Closed are built in: rename or move them, but their meaning is fixed."
        bodyClass="p-0"
      >
        {act.msg && <div className="p-4 pb-0"><Notice tone={act.msg.tone} onClose={() => act.setMsg(null)}>{act.msg.text}</Notice></div>}
        <Table head={['Order', 'Status', 'Pauses SLA', 'Counts as resolved', '']}>
          {list.map((s, i) => (
            <tr key={s.id}>
              <td className="whitespace-nowrap px-3 py-2">
                <Button size="sm" variant="ghost" className="h-7 px-1.5" disabled={i === 0 || act.busy} onClick={() => move(i, -1)} aria-label={`Move ${s.name} up`}><ArrowUp size={13} /></Button>
                <Button size="sm" variant="ghost" className="h-7 px-1.5" disabled={i === list.length - 1 || act.busy} onClick={() => move(i, 1)} aria-label={`Move ${s.name} down`}><ArrowDown size={13} /></Button>
              </td>
              <td className="px-3 py-2"><NameCell key={s.name} s={s} busy={act.busy} onSave={(name) => save(s, { name }, `Renamed to "${name}".`)} /></td>
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  className={checkboxCls}
                  checked={s.pausesSla}
                  disabled={s.id === OPEN_ID || act.busy}
                  title={s.id === OPEN_ID ? 'The SLA clock always runs while a ticket is Open' : 'The SLA clock stops while a ticket is in this status'}
                  aria-label={`${s.name} pauses SLA`}
                  onChange={(e) => save(s, { pausesSla: e.target.checked }, `${s.name}: SLA ${e.target.checked ? 'pauses' : 'keeps running'}.`)}
                />
              </td>
              <td className="px-3 py-2">
                {isCustom(s) ? (
                  <input
                    type="checkbox"
                    className={checkboxCls}
                    checked={s.isResolved}
                    disabled={act.busy}
                    aria-label={`${s.name} counts as resolved`}
                    onChange={(e) => save(s, { isResolved: e.target.checked }, `${s.name}: ${e.target.checked ? 'counts' : 'does not count'} as resolved.`)}
                  />
                ) : (
                  <span className="text-xs text-muted" title="Built-in statuses keep their meaning">{s.isResolved || s.isClosed ? 'Yes' : 'No'} <span className="text-faint">(fixed)</span></span>
                )}
              </td>
              <td className="px-3 py-2 text-right">
                {isCustom(s) && (
                  <Button size="sm" variant="ghost" disabled={act.busy} onClick={() => remove(s)} aria-label={`Delete ${s.name}`}><Trash2 size={13} /></Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title="Add a status" sub="For example 'Waiting on distributor' or 'Awaiting deployment'.">
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) add(); }}>
          <Field label="Name" required className="min-w-[12rem] flex-1">
            <input className={inputCls} maxLength={80} value={newName} onChange={(e) => setNewName(e.target.value)} />
          </Field>
          <label className="flex h-9 items-center gap-2 text-[13px]">
            <input type="checkbox" className={checkboxCls} checked={newPauses} onChange={(e) => setNewPauses(e.target.checked)} /> Pauses SLA
          </label>
          <label className="flex h-9 items-center gap-2 text-[13px]">
            <input type="checkbox" className={checkboxCls} checked={newResolved} onChange={(e) => setNewResolved(e.target.checked)} /> Counts as resolved
          </label>
          <Button type="submit" variant="primary" disabled={!newName.trim() || act.busy}><Plus size={13} /> Add status</Button>
        </form>
      </Card>
    </div>
  );
}
