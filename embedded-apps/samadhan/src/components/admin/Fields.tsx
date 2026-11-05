'use client';
import { useMemo, useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { admin } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import { SEVERITY_LABEL } from '@/lib/format';
import type { AdminChoice, AdminField, Severity } from '@/lib/types';
import { SeverityPill } from '../badges';
import { Button, Card, Field, Notice, Pill, Skeleton, Table, cx, inputBase, inputCls, textareaCls } from '../ui';
import { checkboxCls, useAction, useLoad } from './shared';

export function SeverityTab() {
  const { meta } = useSamadhan();
  const { data, error, reload } = useLoad(admin.severityRules);
  const [category, setCategory] = useState('');
  const [fn, setFn] = useState('*');
  const [severity, setSeverity] = useState<Severity>('SERIOUS');
  const [filter, setFilter] = useState('');
  const act = useAction();
  const node = meta.categoryTree.find((c) => c.value === category);
  const rows = (data ?? []).filter((r) => !filter || `${r.category} ${r.function}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="space-y-4">
      <Card title="Add or change a rule" sub='A Category → Function pair maps to a severity; function "*" covers the whole category. Fatal = Urgent, Serious = High, Normal = Low priority.'>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_160px_auto] md:items-end">
          <Field label="Category">
            <input list="sev-cats" className={inputCls} value={category} onChange={(e) => { setCategory(e.target.value); setFn('*'); }} />
            <datalist id="sev-cats">{meta.categoryTree.map((c) => <option key={c.value} value={c.value} />)}</datalist>
          </Field>
          <Field label="Function">
            <input list="sev-fns" className={inputCls} value={fn} onChange={(e) => setFn(e.target.value)} />
            <datalist id="sev-fns"><option value="*" />{node?.children.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Severity">
            <select className={cx('h-9 w-full', inputBase)} value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
              {(['FATAL', 'SERIOUS', 'NORMAL'] as Severity[]).map((s) => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}
            </select>
          </Field>
          <Button variant="primary" disabled={!category.trim() || act.busy} onClick={async () => { if (await act.run(() => admin.saveSeverityRule({ category: category.trim(), function: fn.trim() || '*', severity }), 'Rule saved.')) reload(); }}>Save rule</Button>
        </div>
        {act.msg && <div className="mt-3"><Notice tone={act.msg.tone} onClose={() => act.setMsg(null)}>{act.msg.text}</Notice></div>}
      </Card>
      <Card title="Severity matrix" sub={data ? `${data.length} rules` : undefined} actions={<input className={cx(inputCls, 'h-8 w-56 text-xs')} placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter rules" />} bodyClass="p-0">
        {error && <div className="p-4"><Notice>{error}</Notice></div>}
        {!data ? <div className="p-4"><Skeleton /></div> : (
          <Table head={['Category', 'Function', 'Severity', '']}>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">{r.category}</td>
                <td className="px-3 py-2">{r.function === '*' ? <em className="text-muted">Any function</em> : r.function}</td>
                <td className="px-3 py-2"><SeverityPill severity={r.severity} /></td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" aria-label="Delete rule" onClick={async () => { if (confirm(`Delete the rule for ${r.category} → ${r.function}?`)) { await act.run(() => admin.deleteSeverityRule(r.id), 'Rule deleted.'); reload(); } }}><Trash2 size={13} /></Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function ChoiceItem({ c, onSaved, selected, onPick }: { c: AdminChoice; onSaved: () => void; selected?: boolean; onPick?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(c.value);
  const act = useAction();
  return (
    <li onClick={onPick} className={cx('flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] hover:bg-sunken', onPick && 'cursor-pointer', selected && 'bg-accent/10', !c.active && 'opacity-50')}>
      {editing ? (
        <>
          <input className={cx(inputCls, 'h-7 text-xs')} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          <Button size="sm" variant="ghost" aria-label="Save" onClick={async () => { if (await act.run(() => admin.saveChoice(c.id, { value }))) { setEditing(false); onSaved(); } }}><Check size={13} /></Button>
          <Button size="sm" variant="ghost" aria-label="Cancel" onClick={() => { setEditing(false); setValue(c.value); }}><X size={13} /></Button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">{c.value}</span>
          {!c.active && <Pill>Inactive</Pill>}
          <button type="button" className="text-faint hover:text-accent" aria-label="Rename" onClick={() => setEditing(true)}><Pencil size={12} /></button>
          <button type="button" className="text-2xs font-semibold text-accent hover:underline" onClick={async () => { await act.run(() => admin.saveChoice(c.id, { active: !c.active })); onSaved(); }}>{c.active ? 'Deactivate' : 'Activate'}</button>
        </>
      )}
    </li>
  );
}

function AddChoices({ fieldId, parentId, onSaved, placeholder }: { fieldId: number; parentId?: number | null; onSaved: () => void; placeholder: string }) {
  const [values, setValues] = useState('');
  const act = useAction();
  return (
    <div className="mt-2 space-y-1.5">
      <textarea rows={3} className={cx(textareaCls, 'text-xs')} placeholder={placeholder} value={values} onChange={(e) => setValues(e.target.value)} />
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!values.trim() || act.busy} onClick={async () => { if (await act.run(async () => { const r = await admin.addChoices(fieldId, values, parentId); act.setMsg(null); return r; })) { setValues(''); onSaved(); } }}>Add</Button>
        {act.msg?.tone === 'bad' && <span className="text-2xs font-semibold text-bad">{act.msg.text}</span>}
      </div>
    </div>
  );
}

function FieldEditor({ f, onSaved }: { f: AdminField; onSaved: () => void }) {
  const [label, setLabel] = useState(f.label);
  const [pick, setPick] = useState<number | null>(null);
  const act = useAction();
  const top = f.choices.filter((c) => c.parentId === null);
  const children = pick ? f.choices.filter((c) => c.parentId === pick) : [];
  const hasChoices = f.type === 'dropdown' || f.type === 'nested';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Label" className="min-w-[14rem] flex-1"><input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
        <label className="flex h-9 items-center gap-2 text-[13px] font-medium">
          <input type="checkbox" className={checkboxCls} checked={f.required} onChange={async (e) => { await act.run(() => admin.saveField(f.id, { required: e.target.checked })); onSaved(); }} />
          Required before resolving
        </label>
        <Button size="md" disabled={label === f.label || !label.trim() || act.busy} onClick={async () => { if (await act.run(() => admin.saveField(f.id, { label }))) onSaved(); }}>Save label</Button>
      </div>
      {act.msg && <Notice tone={act.msg.tone} onClose={() => act.setMsg(null)}>{act.msg.text}</Notice>}
      {hasChoices ? (
        <div className={cx('grid gap-4', f.type === 'nested' && 'md:grid-cols-2')}>
          <div>
            <div className="mb-1 text-2xs font-bold uppercase tracking-wide text-muted">{f.type === 'nested' ? 'Categories' : 'Choices'} ({top.length})</div>
            <ul className="scroll-thin max-h-80 overflow-y-auto rounded-xl border border-line p-1">
              {top.length === 0 && <li className="px-2 py-1 text-xs text-muted">None yet - agents type a value until you add choices.</li>}
              {top.map((c) => (
                <ChoiceItem key={c.id} c={c} onSaved={onSaved} selected={f.type === 'nested' && pick === c.id} onPick={f.type === 'nested' ? () => setPick(c.id) : undefined} />
              ))}
            </ul>
            <AddChoices fieldId={f.id} onSaved={onSaved} placeholder="One value per line" />
          </div>
          {f.type === 'nested' && (
            <div>
              <div className="mb-1 text-2xs font-bold uppercase tracking-wide text-muted">Functions {pick ? `under "${top.find((c) => c.id === pick)?.value}"` : ''}</div>
              {pick ? (
                <>
                  <ul className="scroll-thin max-h-80 overflow-y-auto rounded-xl border border-line p-1">
                    {children.length === 0 && <li className="px-2 py-1 text-xs text-muted">No functions yet.</li>}
                    {children.map((c) => <ChoiceItem key={c.id} c={c} onSaved={onSaved} />)}
                  </ul>
                  <AddChoices fieldId={f.id} parentId={pick} onSaved={onSaved} placeholder="One function per line" />
                </>
              ) : <p className="text-sm text-muted">Click a category to see and add its functions.</p>}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">A {f.type} field has no choices.</p>
      )}
    </div>
  );
}

export function FieldsTab() {
  const { reloadMeta } = useSamadhan();
  const { data, error, reload } = useLoad(admin.fields);
  const [sel, setSel] = useState<number | null>(null);
  const current = useMemo(() => data?.find((f) => f.id === sel) ?? data?.[0] ?? null, [data, sel]);
  const saved = async () => { await Promise.all([reload(), reloadMeta()]); };
  if (error) return <Notice>{error}</Notice>;
  if (!data) return <Card><Skeleton /></Card>;
  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <Card title="Ticket fields" bodyClass="p-1.5">
        <ul>
          {data.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => setSel(f.id)} className={cx('flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px]', current?.id === f.id ? 'bg-accent/10 font-semibold text-accent' : 'hover:bg-sunken')}>
                <span className="truncate">{f.label}{f.required && <span className="text-bad"> *</span>}</span>
                <span className="text-2xs text-muted">{f.type}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {current && (
        <Card title={current.label} sub={`Key ${current.key} · ${current.type}`}>
          <FieldEditor key={current.id + current.label} f={current} onSaved={saved} />
        </Card>
      )}
    </div>
  );
}
