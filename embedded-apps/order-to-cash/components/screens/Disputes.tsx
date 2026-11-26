'use client';
import { useMemo, useState } from 'react';
import { Button, Chip, ErrorBox, Field, Header, Input, Kpi, Modal, Select, TONE_CHIP, Table, Toolbar, type ScreenProps } from '../ui';
import { errText, listDisputes, openDispute, updateDispute } from '@/lib/api';
import { downloadXlsx } from '@/lib/files';
import { dateTime, money, short } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import type { Dispute } from '@/lib/types';

const STATUS: { value: Dispute['status']; label: string; tone: string }[] = [
  { value: 'open', label: 'Open', tone: TONE_CHIP.bad },
  { value: 'in_progress', label: 'In progress', tone: TONE_CHIP.warn },
  { value: 'waiting_customer', label: 'Waiting for customer', tone: TONE_CHIP.info },
  { value: 'resolved', label: 'Resolved (recovered)', tone: TONE_CHIP.good },
  { value: 'written_off', label: 'Written off', tone: TONE_CHIP.mute },
];
const REF_TYPES = ['invoice', 'deduction', 'grn', 'delivery', 'order', 'payment'].map((v) => ({ value: v, label: v }));
const ageDays = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

/** Every dispute from GRN gaps, short payments and debit notes, tracked to recovery or write-off with an owner and notes. */
export default function Disputes({ active, canWrite, notify }: ScreenProps) {
  const q = useLoad(() => listDisputes(), active, [] as Dispute[]);
  const [open, setOpen] = useState<Dispute | null>(null);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<Dispute['status']>('open');
  const [owner, setOwner] = useState('');
  const [creating, setCreating] = useState(false);
  const [nd, setNd] = useState({ ref_type: 'invoice', ref_no: '', kunnr: '', name1: '', amount: '', reason: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('active');

  const rows = useMemo(() => q.data.filter((d) => filter === 'all' || (filter === 'active' ? !['resolved', 'written_off'].includes(d.status) : d.status === filter)), [q.data, filter]);
  const k = useMemo(() => {
    const act = q.data.filter((d) => !['resolved', 'written_off'].includes(d.status));
    const sum = (l: Dispute[]) => l.reduce((s, d) => s + (d.amount ?? 0), 0);
    return { open: act.length, openAmt: sum(act), rec: sum(q.data.filter((d) => d.status === 'resolved')), wo: sum(q.data.filter((d) => d.status === 'written_off')), old: act.filter((d) => ageDays(d.created_at) > 30).length };
  }, [q.data]);

  const show = (d: Dispute) => { setOpen(d); setStatus(d.status); setOwner(d.owner); setNote(''); };
  const save = async () => {
    if (!open) return;
    setBusy(true);
    try { const d = await updateDispute(open.id, { status, owner, note }); setOpen(d); setNote(''); void q.reload(); notify('Dispute updated.', 'success'); }
    catch (e) { notify(errText(e), 'error'); } finally { setBusy(false); }
  };
  const create = async () => {
    setBusy(true);
    try { await openDispute({ ...nd, amount: nd.amount ? Number(nd.amount.replace(/,/g, '')) : null }); setCreating(false); setNd({ ref_type: 'invoice', ref_no: '', kunnr: '', name1: '', amount: '', reason: '', note: '' }); void q.reload(); notify('Dispute opened.', 'success'); }
    catch (e) { notify(errText(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <div>
      <Header title="Disputes" hint="One list for every claim against or by the customer, with owner, status and the conversation, until the money is recovered or written off." />
      <ErrorBox error={q.error} onRetry={() => void q.reload()} />
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Active disputes" value={k.open} sub={`₹ ${short(k.openAmt)}`} tone="red" />
        <Kpi label="Older than 30 days" value={k.old} tone="amber" />
        <Kpi label="Recovered" value={`₹ ${short(k.rec)}`} tone="green" />
        <Kpi label="Written off" value={`₹ ${short(k.wo)}`} tone="slate" />
      </div>
      <Toolbar>
        <Select value={filter} onChange={setFilter} label="Show" options={[{ value: 'active', label: 'Active' }, { value: 'all', label: 'All' }, ...STATUS]} />
        <div className="flex-1" />
        <Button onClick={() => void downloadXlsx('disputes.xlsx', q.data.map((d) => ({ ...d, notes: d.notes.map((n) => `${n.by}: ${n.text}`).join(' | ') })), [{ key: 'id', label: 'Id' }, { key: 'ref_type', label: 'Type' }, { key: 'ref_no', label: 'Document' }, { key: 'kunnr', label: 'Customer' }, { key: 'name1', label: 'Name' }, { key: 'amount', label: 'Amount' }, { key: 'reason', label: 'Reason' }, { key: 'status', label: 'Status' }, { key: 'owner', label: 'Owner' }, { key: 'created_at', label: 'Opened' }, { key: 'notes', label: 'Notes' }])} disabled={!q.data.length}>Excel</Button>
        <Button onClick={() => void q.reload()} disabled={q.loading}>Refresh</Button>
        {canWrite && <Button variant="primary" onClick={() => setCreating(true)}>New dispute</Button>}
      </Toolbar>
      <Table rows={rows} loading={q.loading} rowKey={(r) => String(r.id)} empty="No disputes." onRowClick={(r) => show(r as Dispute)}
        cols={[
          { key: 'id', label: '#', num: true },
          { key: 'ref_type', label: 'Type' },
          { key: 'ref_no', label: 'Document', render: (r) => <span className="font-mono">{r.ref_no}</span> },
          { key: 'name1', label: 'Customer', render: (r) => `${r.kunnr ?? ''} ${r.name1 ?? ''}` },
          { key: 'amount', label: 'Amount', num: true, render: (r) => money(r.amount) },
          { key: 'reason', label: 'Reason', render: (r) => <span className="block max-w-[360px] truncate" title={r.reason}>{r.reason}</span> },
          { key: 'status', label: 'Status', render: (r) => { const s = STATUS.find((x) => x.value === r.status); return <Chip cls={s?.tone}>{s?.label}</Chip>; } },
          { key: 'owner', label: 'Owner' },
          { key: 'age', label: 'Age (days)', num: true, render: (r) => ageDays(r.created_at), value: (r) => ageDays(r.created_at) },
        ]} />

      <Modal open={!!open} title={open ? `Dispute #${open.id} · ${open.ref_type} ${open.ref_no}` : ''} onClose={() => setOpen(null)} wide
        footer={canWrite ? <><Button onClick={() => setOpen(null)}>Close</Button><Button variant="primary" onClick={() => void save()} disabled={busy}>Save</Button></> : undefined}>
        {open && (
          <>
            <p className="mb-1 text-sm"><b>{money(open.amount)}</b> · {open.kunnr} {open.name1}</p>
            <p className="mb-3 text-sm">{open.reason}</p>
            {canWrite && (
              <div className="mb-3 grid grid-cols-2 gap-3">
                <Field label="Status"><Select value={status} onChange={(v) => setStatus(v as Dispute['status'])} options={STATUS} className="w-full" /></Field>
                <Field label="Owner"><Input value={owner} onChange={setOwner} className="w-full" /></Field>
                <div className="col-span-2"><Field label="Add a note"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="field !h-auto w-full py-2 normal-case" /></Field></div>
              </div>
            )}
            <ul className="space-y-1.5 text-xs">
              {[...open.notes].reverse().map((n, i) => <li key={i} className="rounded-xl bg-sap-head px-3 py-2"><span className="text-sap-muted">{dateTime(n.at)} · {n.by}</span><br />{n.text}</li>)}
              <li className="text-sap-muted">Opened {dateTime(open.created_at)} by {open.created_by}</li>
            </ul>
          </>
        )}
      </Modal>
      <Modal open={creating} title="New dispute" onClose={() => setCreating(false)} footer={<><Button onClick={() => setCreating(false)}>Cancel</Button><Button variant="primary" onClick={() => void create()} disabled={busy || !nd.ref_no || !nd.reason}>Open</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="About"><Select value={nd.ref_type} onChange={(v) => setNd({ ...nd, ref_type: v })} options={REF_TYPES} className="w-full" /></Field>
          <Field label="Document no."><Input value={nd.ref_no} onChange={(v) => setNd({ ...nd, ref_no: v })} className="w-full" /></Field>
          <Field label="Customer code"><Input value={nd.kunnr} onChange={(v) => setNd({ ...nd, kunnr: v })} className="w-full" /></Field>
          <Field label="Customer name"><Input value={nd.name1} onChange={(v) => setNd({ ...nd, name1: v })} className="w-full" /></Field>
          <Field label="Amount"><Input value={nd.amount} onChange={(v) => setNd({ ...nd, amount: v })} className="w-full" /></Field>
          <Field label="Reason"><Input value={nd.reason} onChange={(v) => setNd({ ...nd, reason: v })} className="w-full" /></Field>
          <div className="col-span-2"><Field label="Note"><textarea value={nd.note} onChange={(e) => setNd({ ...nd, note: e.target.value })} rows={2} className="field !h-auto w-full py-2 normal-case" /></Field></div>
        </div>
      </Modal>
    </div>
  );
}
