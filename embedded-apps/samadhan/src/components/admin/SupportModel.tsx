'use client';
import { useCallback, useEffect, useState } from 'react';
import { Building2, Cloud, Pencil, Plus, Save, ShieldAlert, Trash2, Users } from 'lucide-react';
import { supportAdmin } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import type { EscalationContact, PartnerKind, SupportModelData, SupportPartner } from '@/lib/types';
import { Button, Card, Field, Notice, Pill, Skeleton, Table, Tabs, cx, inputBase, inputCls } from '../ui';

/*
   Admin > Support model (ITSM support model, migration 7.11):
     1. Who is who: the client (Emami), the current ITSM support vendor (Allied Digital) and hyperscaler (Azure), and
        which service desks the vendor supports. A change of vendor can move the open tickets across.
     2. Escalation matrix: hierarchical escalation levels (vendor lead -> delivery manager -> client IT manager -> head
        of IT), each with the hours after the resolution due time when it is informed.
     3. Lists: ITSM support vendors, hyperscalers and clients, with contract details and the SLA target.
*/
const sel = cx('h-9 w-full', inputBase);
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Could not save.');
type Msg = { tone: 'good' | 'bad'; text: string } | null;
const KIND_ICON: Record<PartnerKind, typeof Users> = { ITSM_VENDOR: Users, HYPERSCALER: Cloud, CLIENT: Building2 };

export function SupportModelTab() {
  const { reloadMeta } = useSamadhan();
  const [data, setData] = useState<SupportModelData | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(() => { supportAdmin.get().then(setData).catch((e) => setMsg({ tone: 'bad', text: errText(e) })); }, []);
  useEffect(() => { load(); }, [load]);
  const done = (text: string) => { setMsg({ tone: 'good', text }); load(); reloadMeta().catch(() => {}); };
  if (!data) return msg ? <Notice>{msg.text}</Notice> : <Skeleton />;
  return (
    <div className="space-y-4" data-testid="admin-support-model">
      <p className="text-sm text-muted">
        Samadhan is generic: <b>the client</b> raises tickets, <b>the ITSM support vendor</b> works them and <b>the hyperscaler</b> hosts the servers.
        Pick today&apos;s choices here - if the vendor or the cloud changes, pick the new one; the history of every ticket stays as it was.
      </p>
      {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
      <WhoIsWho data={data} onDone={done} onError={(t) => setMsg({ tone: 'bad', text: t })} />
      <EscalationMatrix data={data} onDone={done} onError={(t) => setMsg({ tone: 'bad', text: t })} />
      <PartnerLists data={data} onDone={done} onError={(t) => setMsg({ tone: 'bad', text: t })} />
    </div>
  );
}

type Props = { data: SupportModelData; onDone: (t: string) => void; onError: (t: string) => void };

function WhoIsWho({ data, onDone, onError }: Props) {
  const [m, setM] = useState(data.model);
  useEffect(() => setM(data.model), [data.model]);
  const list = (k: PartnerKind) => data.partners.filter((p) => p.kind === k && (p.active || [m.clientId, m.vendorId, m.hyperscalerId].includes(p.id)));
  const openOf = (id: number | null) => data.openByVendor.find((o) => o.id === id)?.n ?? 0;
  const save = async () => {
    let moveOpenTickets = false;
    if (m.vendorId && m.vendorId !== data.model.vendorId && data.model.vendorId) {
      const from = data.partners.find((p) => p.id === data.model.vendorId)?.name;
      const to = data.partners.find((p) => p.id === m.vendorId)?.name;
      moveOpenTickets = window.confirm(`The ITSM support vendor changes from ${from} to ${to}.\n\nMove the ${openOf(data.model.vendorId)} open ticket(s) of the vendor's desks to ${to} as well?\n\nOK = move them, Cancel = only new tickets go to ${to}.`);
    }
    try {
      const r = await supportAdmin.save({ ...m, moveOpenTickets });
      onDone(r.moved ? `Saved. ${r.moved} open ticket(s) moved to the new vendor.` : 'Saved.');
    } catch (e) { onError(errText(e)); }
  };
  const pick = (k: 'clientId' | 'vendorId' | 'hyperscalerId', kind: PartnerKind, label: string, hint: string) => (
    <Field label={label} hint={hint}>
      <select className={sel} value={m[k] ?? ''} onChange={(e) => setM({ ...m, [k]: e.target.value ? Number(e.target.value) : null })} data-testid={`support-${k}`}>
        <option value="">— none —</option>
        {list(kind).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </Field>
  );
  return (
    <Card title={<span className="inline-flex items-center gap-1.5"><Building2 size={15} className="text-accent" /> Who is who</span>} sub="Today: Emami is the client, Allied Digital the ITSM support vendor, Azure the hyperscaler.">
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          {pick('clientId', 'CLIENT', 'Client / customer', 'The organisation that raises tickets')}
          {pick('vendorId', 'ITSM_VENDOR', 'ITSM support vendor', `New tickets of the desks below get this vendor · ${openOf(m.vendorId)} open now`)}
          {pick('hyperscalerId', 'HYPERSCALER', 'Hyperscaler / hosting', 'Where the servers, SAP and BW run')}
        </div>
        <Field label="Service desks the vendor supports" hint="Tickets of the other desks stay with the in-house team (no vendor).">
          <div className="flex flex-wrap gap-3 pt-1">
            {data.desks.map((d) => (
              <label key={d.key} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={m.vendorDesks.includes(d.key)} onChange={(e) => setM({ ...m, vendorDesks: e.target.checked ? [...m.vendorDesks, d.key] : m.vendorDesks.filter((k) => k !== d.key) })} /> {d.name}
              </label>
            ))}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={m.autoEscalate} onChange={(e) => setM({ ...m, autoEscalate: e.target.checked })} /> Escalate overdue tickets automatically (escalation matrix below)</label>
        <Button variant="primary" onClick={save}><Save size={14} /> Save</Button>
      </div>
    </Card>
  );
}

const PRIO: Record<number, string> = { 4: 'Urgent', 3: 'High', 2: 'Medium', 1: 'Low' };
const emptyContact = (level = 1): Partial<EscalationContact> => ({ level, party: level <= 2 ? 'VENDOR' : 'CLIENT', name: '', designation: '', email: '', phone: '', afterHours: 0, priorities: [], workspaceId: null, active: true });

function EscalationMatrix({ data, onDone, onError }: Props) {
  const [edit, setEdit] = useState<Partial<EscalationContact> | null>(null);
  const save = async () => {
    try { await supportAdmin.saveContact(edit!); setEdit(null); onDone('Escalation contact saved.'); } catch (e) { onError(errText(e)); }
  };
  const remove = async (c: EscalationContact) => {
    if (!window.confirm(`Remove ${c.name} from level ${c.level}?`)) return;
    try { await supportAdmin.deleteContact(c.id); onDone('Removed.'); } catch (e) { onError(errText(e)); }
  };
  const suggest = (level: number) => data.suggestions.find((s) => s.level === level);
  return (
    <Card title={<span className="inline-flex items-center gap-1.5"><ShieldAlert size={15} className="text-accent" /> Escalation matrix</span>}
      sub="Hierarchical escalation: when a ticket's resolution is overdue by a level's hours, that level is emailed and the ticket climbs. Agents can also escalate by hand with a reason."
      actions={!edit && <Button size="sm" variant="primary" onClick={() => setEdit(emptyContact((Math.max(0, ...data.contacts.map((c) => c.level)) % 6) + 1))}><Plus size={13} /> Add person</Button>}>
      <div className="space-y-3">
        {data.contacts.length === 0 && !edit && (
          <div className="rounded-xl border border-dashed border-line p-3 text-[13px] text-muted">
            No levels yet. A typical matrix:
            <ul className="mt-1 list-disc pl-5">{data.suggestions.map((s) => <li key={s.level}>Level {s.level}: {s.designation} - {s.afterHours ? `${s.afterHours} h after the due time` : 'as soon as it is overdue'}</li>)}</ul>
          </div>
        )}
        {edit && (
          <div className="space-y-3 rounded-xl border border-line p-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Level" required>
                <select className={sel} value={edit.level} onChange={(e) => { const l = Number(e.target.value); const s = suggest(l); setEdit({ ...edit, level: l, ...(s && !edit.id ? { party: s.party, designation: edit.designation || s.designation, afterHours: s.afterHours } : {}) }); }}>
                  {[1, 2, 3, 4, 5, 6].map((l) => <option key={l} value={l}>Level {l}</option>)}
                </select>
              </Field>
              <Field label="Side"><select className={sel} value={edit.party} onChange={(e) => setEdit({ ...edit, party: e.target.value as 'VENDOR' | 'CLIENT' })}><option value="VENDOR">Support vendor</option><option value="CLIENT">Client (Emami)</option></select></Field>
              <Field label="Hours after resolution due" hint="0 = as soon as it is overdue"><input type="number" min={0} step={0.5} className={inputCls} value={edit.afterHours ?? 0} onChange={(e) => setEdit({ ...edit, afterHours: Number(e.target.value) })} /></Field>
              <Field label="Name" required><input className={inputCls} value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Designation"><input className={inputCls} value={edit.designation ?? ''} onChange={(e) => setEdit({ ...edit, designation: e.target.value })} placeholder={suggest(edit.level ?? 1)?.designation} /></Field>
              <Field label="Email" required><input type="email" className={inputCls} value={edit.email ?? ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
              <Field label="Phone"><input className={inputCls} value={edit.phone ?? ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
              <Field label="Service desk"><select className={sel} value={edit.workspaceId ?? ''} onChange={(e) => setEdit({ ...edit, workspaceId: e.target.value ? Number(e.target.value) : null })}><option value="">Every desk</option>{data.desks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
              <Field label="Priorities" hint="None ticked = every priority">
                <div className="flex flex-wrap gap-2 pt-1">{[4, 3, 2, 1].map((p) => (
                  <label key={p} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={(edit.priorities ?? []).includes(p)} onChange={(e) => setEdit({ ...edit, priorities: e.target.checked ? [...(edit.priorities ?? []), p] : (edit.priorities ?? []).filter((x) => x !== p) })} /> {PRIO[p]}</label>
                ))}</div>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Active</label>
            <div className="flex gap-2"><Button variant="primary" onClick={save}><Save size={14} /> Save</Button><Button onClick={() => setEdit(null)}>Cancel</Button></div>
          </div>
        )}
        {data.contacts.length > 0 && (
          <Table head={['Level', 'Person', 'Side', 'When', 'Desk', 'Priorities', '']}>
            {data.contacts.map((c) => (
              <tr key={c.id} className={cx('border-b border-line last:border-0', !c.active && 'opacity-50')}>
                <td className="px-3 py-2"><Pill tone="bad">L{c.level}</Pill></td>
                <td className="px-3 py-2"><div className="font-semibold">{c.name}</div><div className="text-2xs text-muted">{[c.designation, c.email, c.phone].filter(Boolean).join(' · ')}</div></td>
                <td className="px-3 py-2">{c.party === 'VENDOR' ? 'Vendor' : 'Client'}</td>
                <td className="px-3 py-2 text-2xs">{c.afterHours ? `${c.afterHours} h after due` : 'when overdue'}</td>
                <td className="px-3 py-2 text-2xs">{c.workspaceName ?? 'Every desk'}</td>
                <td className="px-3 py-2 text-2xs">{c.priorities.length ? c.priorities.map((p) => PRIO[p]).join(', ') : 'All'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <button type="button" aria-label="Edit" className="p-1.5 text-muted hover:text-accent" onClick={() => setEdit(c)}><Pencil size={14} /></button>
                  <button type="button" aria-label="Remove" className="p-1.5 text-muted hover:text-bad" onClick={() => remove(c)}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </Card>
  );
}

function PartnerLists({ data, onDone, onError }: Props) {
  const [kind, setKind] = useState<PartnerKind>('ITSM_VENDOR');
  const [edit, setEdit] = useState<Partial<SupportPartner> | null>(null);
  const rows = data.partners.filter((p) => p.kind === kind);
  const current = { ITSM_VENDOR: data.model.vendorId, HYPERSCALER: data.model.hyperscalerId, CLIENT: data.model.clientId }[kind];
  const save = async (p: Partial<SupportPartner>) => {
    try { await supportAdmin.savePartner({ ...p, kind }); setEdit(null); onDone(`${p.name} saved.`); } catch (e) { onError(errText(e)); }
  };
  const Icon = KIND_ICON[kind];
  return (
    <Card title={<span className="inline-flex items-center gap-1.5"><Icon size={15} className="text-accent" /> Lists</span>} sub="The choices in the drop-downs. Add a new vendor or cloud here; switch off the ones you never want to see."
      actions={!edit && <Button size="sm" variant="primary" onClick={() => setEdit({ name: '', active: true })}><Plus size={13} /> Add</Button>}>
      <div className="space-y-3">
        <Tabs label="Lists" value={kind} onChange={(k) => { setKind(k); setEdit(null); }} tabs={[{ id: 'ITSM_VENDOR', label: data.kinds.ITSM_VENDOR }, { id: 'HYPERSCALER', label: data.kinds.HYPERSCALER }, { id: 'CLIENT', label: data.kinds.CLIENT }]} />
        {edit && (
          <div className="space-y-3 rounded-xl border border-line p-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Name" required><input className={inputCls} value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Short name"><input className={inputCls} value={edit.shortName ?? ''} onChange={(e) => setEdit({ ...edit, shortName: e.target.value })} /></Field>
              {kind !== 'CLIENT' && <Field label="Contract / PO reference"><input className={inputCls} value={edit.contractRef ?? ''} onChange={(e) => setEdit({ ...edit, contractRef: e.target.value })} /></Field>}
              {kind !== 'CLIENT' && <Field label="Contract start"><input type="date" className={inputCls} value={edit.contractStart ?? ''} onChange={(e) => setEdit({ ...edit, contractStart: e.target.value })} /></Field>}
              {kind !== 'CLIENT' && <Field label="Contract end" hint="The scorecard warns 60 days before"><input type="date" className={inputCls} value={edit.contractEnd ?? ''} onChange={(e) => setEdit({ ...edit, contractEnd: e.target.value })} /></Field>}
              {kind === 'ITSM_VENDOR' && <Field label="Resolution SLA target %" hint="From the contract, e.g. 95"><input type="number" min={0} max={100} step={0.5} className={inputCls} value={edit.slaTargetPct ?? ''} onChange={(e) => setEdit({ ...edit, slaTargetPct: e.target.value === '' ? null : Number(e.target.value) })} /></Field>}
              <Field label="Contact person"><input className={inputCls} value={edit.contactName ?? ''} onChange={(e) => setEdit({ ...edit, contactName: e.target.value })} /></Field>
              <Field label="Contact email"><input type="email" className={inputCls} value={edit.contactEmail ?? ''} onChange={(e) => setEdit({ ...edit, contactEmail: e.target.value })} /></Field>
              <Field label="Contact phone"><input className={inputCls} value={edit.contactPhone ?? ''} onChange={(e) => setEdit({ ...edit, contactPhone: e.target.value })} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Shown in the drop-downs</label>
            <div className="flex gap-2"><Button variant="primary" onClick={() => save(edit)}><Save size={14} /> Save</Button><Button onClick={() => setEdit(null)}>Cancel</Button></div>
          </div>
        )}
        <Table head={['Name', kind === 'CLIENT' ? '' : 'Contract', kind === 'ITSM_VENDOR' ? 'SLA target' : '', 'Contact', 'Shown', '']}>
          {rows.map((p) => (
            <tr key={p.id} className={cx('border-b border-line last:border-0', !p.active && 'opacity-50')}>
              <td className="px-3 py-2"><span className="font-semibold">{p.name}</span>{p.shortName && p.shortName !== p.name && <span className="text-faint"> · {p.shortName}</span>} {p.id === current && <Pill tone="good">Current</Pill>}</td>
              <td className="px-3 py-2 text-2xs">{kind === 'CLIENT' ? '' : [p.contractRef, p.contractStart && p.contractEnd ? `${p.contractStart} → ${p.contractEnd}` : p.contractEnd].filter(Boolean).join(' · ') || '—'}</td>
              <td className="num px-3 py-2 text-2xs">{kind === 'ITSM_VENDOR' ? (p.slaTargetPct === null ? '—' : `${p.slaTargetPct}%`) : ''}</td>
              <td className="px-3 py-2 text-2xs">{[p.contactName, p.contactEmail, p.contactPhone].filter(Boolean).join(' · ') || '—'}</td>
              <td className="px-3 py-2"><input type="checkbox" aria-label={`Show ${p.name}`} checked={p.active} disabled={p.id === current} onChange={(e) => save({ ...p, active: e.target.checked })} /></td>
              <td className="px-3 py-2 text-right"><button type="button" aria-label="Edit" className="p-1.5 text-muted hover:text-accent" onClick={() => setEdit(p)}><Pencil size={14} /></button></td>
            </tr>
          ))}
        </Table>
      </div>
    </Card>
  );
}
