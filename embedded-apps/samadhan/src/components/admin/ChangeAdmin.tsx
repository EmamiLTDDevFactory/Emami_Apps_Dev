'use client';
import { useCallback, useEffect, useState } from 'react';
import { Lock, Pencil, Plus, Save, Trash2, Wrench } from 'lucide-react';
import { changeAdmin } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import { fmtDateTime } from '@/lib/format';
import type { ApprovalChain, ApprovalStep, CatalogField, CatalogItem, ChangeWindow } from '@/lib/types';
import { RECORD_CLASS_LABEL } from '@/lib/workspaces';
import { Button, Card, Field, Notice, Pill, Skeleton, Table, cx, inputBase, inputCls, textareaCls } from '../ui';

/* v7 Phase 6 Admin (§N 10): Service catalog, Approval chains, Change calendar windows. */
const sel = cx('h-9 w-full', inputBase);
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Could not save.');
const STEP_LABEL: Record<ApprovalStep['type'], string> = { manager: "Requester's manager (email asked when it starts)", approver: 'Any approver (approval.decide)', email: 'A named person (email link)', agent: 'A named agent' };

function useList<T>(load: () => Promise<T[]>) {
  const [items, setItems] = useState<T[] | null>(null);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const reload = useCallback(() => { load().then(setItems).catch((e) => setMsg({ tone: 'bad', text: errText(e) })); }, [load]);
  useEffect(() => { reload(); }, [reload]);
  return { items, reload, msg, setMsg };
}

// ---------- approval chains ----------
export function ApprovalChainsTab() {
  const { meta } = useSamadhan();
  const { items, reload, msg, setMsg } = useList(changeAdmin.chains);
  const [edit, setEdit] = useState<Partial<ApprovalChain> | null>(null);
  const save = async () => {
    try { await changeAdmin.saveChain(edit!); setEdit(null); setMsg({ tone: 'good', text: 'Chain saved.' }); reload(); } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); }
  };
  const steps = edit?.steps ?? [];
  const setStep = (i: number, p: Partial<ApprovalStep>) => setEdit({ ...edit, steps: steps.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  return (
    <div className="space-y-4" data-testid="admin-approval-chains">
      {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
      {edit ? (
        <Card title={edit.id ? `Edit ${edit.name}` : 'New approval chain'} sub="Steps run in order; each must approve before the next is asked. The requester and the implementing agent never approve (SoD).">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" required><input className={inputCls} value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Service desk"><select className={sel} value={edit.workspaceId ?? ''} onChange={(e) => setEdit({ ...edit, workspaceId: e.target.value ? Number(e.target.value) : null })}><option value="">Every desk</option>{(meta.workspaces ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
            </div>
            {steps.map((s, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-line p-2.5 sm:grid-cols-[1fr_1.3fr_1fr_auto]">
                <Field label={`Step ${i + 1}`}><input className={inputCls} value={s.name} onChange={(e) => setStep(i, { name: e.target.value })} /></Field>
                <Field label="Approver"><select className={sel} value={s.type} onChange={(e) => setStep(i, { type: e.target.value as ApprovalStep['type'] })}>{Object.entries(STEP_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                <Field label="Email">{s.type === 'email' || s.type === 'agent' ? <input type="email" className={inputCls} value={s.email ?? ''} onChange={(e) => setStep(i, { email: e.target.value })} /> : <span className="text-2xs text-muted">—</span>}</Field>
                <div className="flex items-end"><button type="button" aria-label={`Remove step ${i + 1}`} className="p-2 text-muted hover:text-bad" onClick={() => setEdit({ ...edit, steps: steps.filter((_, j) => j !== i) })}><Trash2 size={14} /></button></div>
              </div>
            ))}
            <Button size="sm" onClick={() => setEdit({ ...edit, steps: [...steps, { name: '', type: 'approver' }] })}><Plus size={13} /> Add step</Button>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Active</label>
            <div className="flex gap-2"><Button variant="primary" onClick={save}><Save size={14} /> Save</Button><Button onClick={() => setEdit(null)}>Cancel</Button></div>
          </div>
        </Card>
      ) : <Button variant="primary" onClick={() => setEdit({ name: '', workspaceId: null, steps: [{ name: 'Manager', type: 'manager' }], active: true })}><Plus size={14} /> New chain</Button>}
      <Card title="Approval chains" bodyClass="p-0">
        {!items ? <div className="p-4"><Skeleton /></div> : (
          <Table head={['Chain', 'Desk', 'Steps', 'Used', '']}>
            {items.map((c) => (
              <tr key={c.id} className={cx(!c.active && 'opacity-50')}>
                <td className="px-3 py-2 font-semibold">{c.name}{!c.active && <Pill>inactive</Pill>}</td>
                <td className="px-3 py-2 text-xs">{meta.workspaces?.find((w) => w.id === c.workspaceId)?.name ?? 'Every desk'}</td>
                <td className="px-3 py-2 text-xs">{c.steps.map((s) => s.name).join(' → ')}</td>
                <td className="num px-3 py-2 text-xs">{c.used ?? 0}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <button type="button" aria-label={`Edit ${c.name}`} className="p-1 text-muted hover:text-accent" onClick={() => setEdit(c)}><Pencil size={14} /></button>
                  <button type="button" aria-label={`Delete ${c.name}`} className="p-1 text-muted hover:text-bad" onClick={async () => { if (!window.confirm(`Delete ${c.name}? A chain already used is deactivated instead.`)) return; try { await changeAdmin.deleteChain(c.id); reload(); } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); } }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

// ---------- service catalogue ----------
export function CatalogTab() {
  const { meta } = useSamadhan();
  const { items, reload, msg, setMsg } = useList(changeAdmin.catalog);
  const chains = useList(changeAdmin.chains).items ?? [];
  const [edit, setEdit] = useState<(Partial<CatalogItem> & { formText?: string }) | null>(null);
  const [desk, setDesk] = useState('');
  const toText = (f: CatalogField[] = []) => f.map((x) => [x.label, x.type, x.required ? 'required' : '', (x.options ?? []).join('|')].join('; ')).join('\n');
  const fromText = (t = '') => t.split('\n').map((l) => l.split(';').map((x) => x.trim())).filter((p) => p[0]).map(([label, type, req, opts]) => ({ label, type: (['text', 'textarea', 'date', 'select', 'checkbox'].includes(type) ? type : 'text') as CatalogField['type'], required: req === 'required', options: opts ? opts.split('|').map((o) => o.trim()).filter(Boolean) : undefined }));
  const save = async () => {
    try {
      const { formText, ...b } = edit!;
      await changeAdmin.saveItem({ ...b, formSchema: fromText(formText) });
      setEdit(null);
      setMsg({ tone: 'good', text: 'Item saved.' });
      reload();
    } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); }
  };
  const shown = (items ?? []).filter((i) => !desk || String(i.workspaceId) === desk);
  return (
    <div className="space-y-4" data-testid="admin-catalog">
      {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
      {edit ? (
        <Card title={edit.id ? `Edit ${edit.name}` : 'New catalogue item'}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" required><input className={inputCls} value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Service desk" required><select className={sel} value={edit.workspaceId ?? ''} onChange={(e) => setEdit({ ...edit, workspaceId: Number(e.target.value) })}><option value="">—</option>{(meta.workspaces ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
            <Field label="Description" className="sm:col-span-2"><input className={inputCls} value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Record class"><select className={sel} value={edit.recordClass ?? 'SERVICE_REQUEST'} onChange={(e) => setEdit({ ...edit, recordClass: e.target.value })}>{(meta.recordClasses ?? []).map((c) => <option key={c} value={c}>{RECORD_CLASS_LABEL[c] ?? c}</option>)}</select></Field>
            <Field label="Approval chain"><select className={sel} value={edit.approvalChainId ?? ''} onChange={(e) => setEdit({ ...edit, approvalChainId: e.target.value ? Number(e.target.value) : null })}><option value="">No approval</option>{chains.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Category"><input className={inputCls} value={edit.category ?? ''} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /></Field>
            <Field label="Sub-category"><input className={inputCls} value={edit.function ?? ''} onChange={(e) => setEdit({ ...edit, function: e.target.value })} /></Field>
            <Field label="Fulfilled by group"><select className={sel} value={edit.fulfilGroupId ?? ''} onChange={(e) => setEdit({ ...edit, fulfilGroupId: e.target.value ? Number(e.target.value) : null })}><option value="">Routing rules</option>{meta.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
            <Field label="Icon" hint="e.g. Laptop, KeyRound, Server"><input className={inputCls} value={edit.icon ?? ''} onChange={(e) => setEdit({ ...edit, icon: e.target.value })} /></Field>
            <Field label="Questions" hint="One per line: Label; text|textarea|date|select|checkbox; required; option1|option2" className="sm:col-span-2"><textarea rows={5} className={cx(textareaCls, 'font-mono text-xs')} value={edit.formText ?? ''} onChange={(e) => setEdit({ ...edit, formText: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!edit.portalVisible} onChange={(e) => setEdit({ ...edit, portalVisible: e.target.checked })} /> Visible on the portal</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Active</label>
          </div>
          <div className="mt-3 flex gap-2"><Button variant="primary" onClick={save}><Save size={14} /> Save</Button><Button onClick={() => setEdit(null)}>Cancel</Button></div>
        </Card>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => setEdit({ recordClass: 'SERVICE_REQUEST', active: true, portalVisible: false, formText: '' })}><Plus size={14} /> New item</Button>
          <select className={cx('h-9 w-56', inputBase)} value={desk} onChange={(e) => setDesk(e.target.value)} aria-label="Filter by desk"><option value="">All desks</option>{(meta.workspaces ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
        </div>
      )}
      <Card title="Service catalogue" sub={items ? `${shown.length} items` : undefined} bodyClass="p-0">
        {!items ? <div className="p-4"><Skeleton /></div> : (
          <Table head={['Item', 'Desk', 'Class', 'Approval', 'Portal', '']}>
            {shown.map((i) => (
              <tr key={i.id} className={cx(!i.active && 'opacity-50')}>
                <td className="px-3 py-2"><div className="font-semibold">{i.name}</div>{i.description && <div className="text-2xs text-muted">{i.description}</div>}</td>
                <td className="px-3 py-2 text-xs">{meta.workspaces?.find((w) => w.id === i.workspaceId)?.shortCode}</td>
                <td className="px-3 py-2 text-xs">{RECORD_CLASS_LABEL[i.recordClass as keyof typeof RECORD_CLASS_LABEL] ?? i.recordClass}</td>
                <td className="px-3 py-2 text-xs">{chains.find((c) => c.id === i.approvalChainId)?.name ?? '—'}</td>
                <td className="px-3 py-2">{i.portalVisible ? <Pill tone="good">Yes</Pill> : <Pill>No</Pill>}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <button type="button" aria-label={`Edit ${i.name}`} className="p-1 text-muted hover:text-accent" onClick={() => setEdit({ ...i, formText: toText(i.formSchema) })}><Pencil size={14} /></button>
                  {i.active && <button type="button" aria-label={`Deactivate ${i.name}`} className="p-1 text-muted hover:text-bad" onClick={async () => { if (window.confirm(`Deactivate ${i.name}?`)) { await changeAdmin.deleteItem(i.id); reload(); } }}><Trash2 size={14} /></button>}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

// ---------- change windows ----------
const toLocal = (iso?: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');
export function ChangeWindowsTab() {
  const { meta } = useSamadhan();
  const { items, reload, msg, setMsg } = useList(changeAdmin.windows);
  const [edit, setEdit] = useState<Partial<ChangeWindow> | null>(null);
  const save = async () => {
    try { await changeAdmin.saveWindow(edit!); setEdit(null); setMsg({ tone: 'good', text: 'Window saved.' }); reload(); } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); }
  };
  return (
    <div className="space-y-4" data-testid="admin-change-windows">
      {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
      {edit ? (
        <Card title={edit.id ? `Edit ${edit.name}` : 'New window'} sub="FREEZE: changes cannot be scheduled inside without 'change.freezeOverride' and a reason. MAINTENANCE: shown on the calendar.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" required><input className={inputCls} value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Kind"><select className={sel} value={edit.kind ?? 'FREEZE'} onChange={(e) => setEdit({ ...edit, kind: e.target.value as ChangeWindow['kind'] })}><option value="FREEZE">Freeze</option><option value="MAINTENANCE">Maintenance</option></select></Field>
            <Field label="Starts" required><input type="datetime-local" className={inputCls} value={toLocal(edit.startsAt)} onChange={(e) => setEdit({ ...edit, startsAt: e.target.value ? new Date(e.target.value).toISOString() : '' })} /></Field>
            <Field label="Ends" required><input type="datetime-local" className={inputCls} value={toLocal(edit.endsAt)} onChange={(e) => setEdit({ ...edit, endsAt: e.target.value ? new Date(e.target.value).toISOString() : '' })} /></Field>
            <Field label="Service desk"><select className={sel} value={edit.workspaceId ?? ''} onChange={(e) => setEdit({ ...edit, workspaceId: e.target.value ? Number(e.target.value) : null })}><option value="">Every desk</option>{(meta.workspaces ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
            <Field label="Note"><input className={inputCls} value={edit.note ?? ''} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></Field>
          </div>
          <div className="mt-3 flex gap-2"><Button variant="primary" onClick={save}><Save size={14} /> Save</Button><Button onClick={() => setEdit(null)}>Cancel</Button></div>
        </Card>
      ) : <Button variant="primary" onClick={() => setEdit({ kind: 'FREEZE', name: '' })}><Plus size={14} /> New window</Button>}
      <Card title="Freeze and maintenance windows" bodyClass="p-0">
        {!items ? <div className="p-4"><Skeleton /></div> : !items.length ? <p className="p-4 text-sm text-muted">No windows yet. Add month-end or quarter-close freezes here.</p> : (
          <Table head={['Window', 'Desk', 'From', 'To', '']}>
            {items.map((w) => (
              <tr key={w.id}>
                <td className="px-3 py-2 font-semibold"><span className="inline-flex items-center gap-1.5">{w.kind === 'FREEZE' ? <Lock size={13} className="text-bad" /> : <Wrench size={13} className="text-accent" />}{w.name}</span></td>
                <td className="px-3 py-2 text-xs">{meta.workspaces?.find((x) => x.id === w.workspaceId)?.name ?? 'Every desk'}</td>
                <td className="px-3 py-2 text-xs">{fmtDateTime(w.startsAt)}</td>
                <td className="px-3 py-2 text-xs">{fmtDateTime(w.endsAt)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <button type="button" aria-label={`Edit ${w.name}`} className="p-1 text-muted hover:text-accent" onClick={() => setEdit(w)}><Pencil size={14} /></button>
                  <button type="button" aria-label={`Delete ${w.name}`} className="p-1 text-muted hover:text-bad" onClick={async () => { if (window.confirm(`Delete ${w.name}?`)) { await changeAdmin.deleteWindow(w.id); reload(); } }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
