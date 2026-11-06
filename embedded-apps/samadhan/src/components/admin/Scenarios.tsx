'use client';
import { useState } from 'react';
import { Pencil, Plus, Trash2, Wand2, X } from 'lucide-react';
import { admin } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import { EDITABLE_FIELDS, type Meta, type Scenario, type ScenarioAction } from '@/lib/types';
import { Button, Card, Empty, Field, Modal, Notice, Skeleton, Table, cx, inputBase, inputCls, textareaCls } from '../ui';
import { useAction, useLoad } from './shared';

type ActionType = ScenarioAction['type'];
const ACTION_LABEL: Record<ActionType, string> = {
  setStatus: 'Set status',
  setPriority: 'Set priority',
  setGroup: 'Set group',
  setAgent: 'Assign agent',
  setField: 'Set field',
  addTag: 'Add tag',
  reply: 'Send reply',
  note: 'Add private note',
};
const ACTION_TYPES = Object.keys(ACTION_LABEL) as ActionType[];
const MAX_ACTIONS = 10;
const PLACEHOLDERS = ['ticket.requester.name', 'ticket.id', 'ticket.subject', 'ticket.agent.name', 'ticket.distributor.code', 'ticket.distributor.name'];

/** Editor row: every value kept as a string while editing, converted on save. */
interface Row { type: ActionType; value: string; field: string; text: string }
interface Draft { id?: number; name: string; description: string; rows: Row[] }

const emptyRow = (type: ActionType = 'setStatus'): Row => ({ type, value: '', field: '', text: '' });
const selectCls = cx('h-9 w-full', inputBase);
const isEditable = (key: string) => (EDITABLE_FIELDS as readonly string[]).includes(key);

const toRow = (a: ScenarioAction): Row => ({ type: a.type, value: a.value === undefined || a.value === null ? '' : String(a.value), field: a.field ?? '', text: a.text ?? '' });

function toAction(r: Row): ScenarioAction {
  switch (r.type) {
    case 'reply':
    case 'note': return { type: r.type, text: r.text };
    case 'setField': return { type: r.type, field: r.field, value: r.value };
    case 'addTag': return { type: r.type, value: r.value.trim() };
    case 'setAgent': return { type: r.type, value: r.value === 'me' ? 'me' : Number(r.value) };
    default: return { type: r.type, value: Number(r.value) };
  }
}

function rowComplete(r: Row): boolean {
  if (r.type === 'reply' || r.type === 'note') return !!r.text.trim();
  if (r.type === 'setField') return !!r.field;
  return !!r.value.trim();
}

function summarize(a: ScenarioAction, meta: Meta): string {
  const v = a.value === undefined || a.value === null ? '' : String(a.value);
  const short = (s: string) => { const t = s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); return t.length > 40 ? `${t.slice(0, 40)}…` : t; };
  switch (a.type) {
    case 'setStatus': return `Status → ${meta.statuses.find((s) => String(s.id) === v)?.name ?? `#${v}`}`;
    case 'setPriority': return `Priority → ${meta.priorities[v] ?? v}`;
    case 'setGroup': return `Group → ${meta.groups.find((g) => String(g.id) === v)?.name ?? `#${v}`}`;
    case 'setAgent': return `Agent → ${v === 'me' ? 'Me (the agent running it)' : meta.agents.find((x) => String(x.id) === v)?.name ?? `#${v}`}`;
    case 'setField': return `${meta.fields.find((f) => f.key === a.field)?.label ?? a.field ?? 'Field'} → ${v || '(blank)'}`;
    case 'addTag': return `Tag + ${v}`;
    case 'reply': return `Reply: ${short(a.text ?? '')}`;
    case 'note': return `Note: ${short(a.text ?? '')}`;
  }
}

function ValueInput({ row, meta, onChange }: { row: Row; meta: Meta; onChange: (p: Partial<Row>) => void }) {
  switch (row.type) {
    case 'setStatus':
      return (
        <select className={selectCls} aria-label="Status" value={row.value} onChange={(e) => onChange({ value: e.target.value })}>
          <option value="">Choose a status</option>
          {meta.statuses.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
        </select>
      );
    case 'setPriority':
      return (
        <select className={selectCls} aria-label="Priority" value={row.value} onChange={(e) => onChange({ value: e.target.value })}>
          <option value="">Choose a priority</option>
          {Object.entries(meta.priorities).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      );
    case 'setGroup':
      return (
        <select className={selectCls} aria-label="Group" value={row.value} onChange={(e) => onChange({ value: e.target.value })}>
          <option value="">Choose a group</option>
          {meta.groups.map((g) => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
        </select>
      );
    case 'setAgent':
      return (
        <select className={selectCls} aria-label="Agent" value={row.value} onChange={(e) => onChange({ value: e.target.value })}>
          <option value="">Choose an agent</option>
          <option value="me">Me (the agent running it)</option>
          {meta.agents.filter((a) => a.active || String(a.id) === row.value).map((a) => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
        </select>
      );
    case 'setField': {
      const fields = meta.fields.filter((f) => isEditable(f.key));
      const def = fields.find((f) => f.key === row.field);
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <select className={selectCls} aria-label="Field" value={row.field} onChange={(e) => onChange({ field: e.target.value, value: '' })}>
            <option value="">Choose a field</option>
            {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          {def && def.choices.length > 0 ? (
            <select className={selectCls} aria-label="Value" value={row.value} onChange={(e) => onChange({ value: e.target.value })}>
              <option value="">(blank)</option>
              {def.choices.map((c) => <option key={c} value={c}>{c}</option>)}
              {row.value && !def.choices.includes(row.value) && <option value={row.value}>{row.value}</option>}
            </select>
          ) : (
            <input className={inputCls} aria-label="Value" placeholder="Value" value={row.value} maxLength={500} onChange={(e) => onChange({ value: e.target.value })} />
          )}
        </div>
      );
    }
    case 'addTag':
      return <input className={inputCls} aria-label="Tag" placeholder="Tag" value={row.value} maxLength={100} onChange={(e) => onChange({ value: e.target.value })} />;
    case 'reply':
    case 'note':
      return (
        <textarea
          rows={4}
          className={textareaCls}
          aria-label={row.type === 'reply' ? 'Reply text' : 'Note text'}
          placeholder={row.type === 'reply' ? 'Sent to the requester' : 'Private note, seen by agents only'}
          value={row.text}
          maxLength={5000}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      );
  }
}

/** Admin > Scenarios: named sets of actions an agent runs on a ticket in one click (Ticket > Scenarios). */
export default function ScenariosTab() {
  const { meta, reloadMeta } = useSamadhan();
  const { data, error, reload } = useLoad(admin.scenarios);
  const [edit, setEdit] = useState<Draft | null>(null);
  const act = useAction();

  const open = (s?: Scenario) => {
    act.setMsg(null);
    setEdit(s ? { id: s.id, name: s.name, description: s.description ?? '', rows: s.actions.map(toRow) } : { name: '', description: '', rows: [emptyRow()] });
  };
  const setRow = (i: number, p: Partial<Row>) => setEdit((d) => (d ? { ...d, rows: d.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) } : d));
  const after = async () => { await reload(); await reloadMeta(); };

  const save = async () => {
    if (!edit) return;
    const body = { ...(edit.id ? { id: edit.id } : {}), name: edit.name.trim(), description: edit.description.trim(), actions: edit.rows.map(toAction) };
    if (await act.run(() => admin.saveScenario(body), 'Scenario saved.')) {
      setEdit(null);
      await after();
    }
  };
  const remove = async (s: Scenario) => {
    if (!confirm(`Delete the scenario "${s.name}"?`)) return;
    if (await act.run(() => admin.deleteScenario(s.id), 'Scenario deleted.')) await after();
  };

  if (error) return <Notice>{error}</Notice>;
  if (!data) return <Card><Skeleton /></Card>;
  const ready = !!edit && !!edit.name.trim() && edit.rows.length > 0 && edit.rows.every(rowComplete);

  return (
    <Card
      title="Scenarios"
      sub="Named sets of actions an agent runs on a ticket in one click, from the Scenarios menu on the ticket."
      actions={<Button size="sm" variant="primary" onClick={() => open()}><Plus size={13} /> Add</Button>}
      bodyClass="p-0"
    >
      {act.msg && !edit && <div className="p-4 pb-0"><Notice tone={act.msg.tone} onClose={() => act.setMsg(null)}>{act.msg.text}</Notice></div>}
      {data.length === 0 ? <Empty title="No scenarios yet" icon={Wand2}>Add one to let agents set status, group, fields and send a reply in a single click.</Empty> : (
        <Table head={['Name', 'Actions', '']}>
          {data.map((s) => (
            <tr key={s.id}>
              <td className="px-3 py-2 align-top">
                <div className="font-semibold">{s.name}</div>
                {s.description && <div className="text-2xs text-muted">{s.description}</div>}
              </td>
              <td className="px-3 py-2 align-top">
                <ul className="space-y-0.5 text-xs">
                  {s.actions.map((a, i) => <li key={i} className="break-words">{summarize(a, meta)}</li>)}
                </ul>
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right align-top">
                <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => open(s)}><Pencil size={13} /></Button>
                <Button size="sm" variant="ghost" aria-label="Delete" disabled={act.busy} onClick={() => remove(s)}><Trash2 size={13} /></Button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit scenario' : 'Add scenario'} width={720}>
        {edit && (
          <div className="space-y-3">
            <Field label="Name" required><input className={inputCls} value={edit.name} maxLength={200} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Description" hint="Shown to agents in the Scenarios menu"><input className={inputCls} value={edit.description} maxLength={500} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <div>
              <div className="mb-1.5 text-2xs font-bold uppercase tracking-wide text-muted">Actions ({edit.rows.length}/{MAX_ACTIONS})</div>
              <div className="space-y-2">
                {edit.rows.map((r, i) => (
                  <div key={i} className="grid gap-2 rounded-xl border border-line bg-bg p-2.5 sm:grid-cols-[170px_minmax(0,1fr)_auto] sm:items-start">
                    <select className={selectCls} aria-label="Action" value={r.type} onChange={(e) => setRow(i, emptyRow(e.target.value as ActionType))}>
                      {ACTION_TYPES.map((t) => <option key={t} value={t}>{ACTION_LABEL[t]}</option>)}
                    </select>
                    <ValueInput row={r} meta={meta} onChange={(p) => setRow(i, p)} />
                    <Button size="sm" variant="ghost" aria-label="Remove action" className="h-9" onClick={() => setEdit({ ...edit, rows: edit.rows.filter((_, j) => j !== i) })}><X size={14} /></Button>
                  </div>
                ))}
              </div>
              <Button size="sm" className="mt-2" disabled={edit.rows.length >= MAX_ACTIONS} onClick={() => setEdit({ ...edit, rows: [...edit.rows, emptyRow()] })}><Plus size={13} /> Add action</Button>
            </div>
            <div>
              <div className="mb-1 text-2xs font-bold uppercase tracking-wide text-muted">Placeholders for reply and note text</div>
              <div className="flex flex-wrap gap-1">{PLACEHOLDERS.map((p) => <code key={p} className="rounded bg-sunken px-1.5 py-0.5 text-2xs">{`{{${p}}}`}</code>)}</div>
            </div>
            {act.msg && <Notice tone={act.msg.tone}>{act.msg.text}</Notice>}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setEdit(null)}>Cancel</Button>
              <Button variant="primary" onClick={save} disabled={act.busy || !ready}>Save</Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
