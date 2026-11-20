'use client';

import React, { useState } from 'react';
import { useTms } from '../../lib/store';
import { Card, Field, Kpi, Modal, PageHead, StatusPill, Table, Tabs, Timeline, inr, fmtD } from '../../components/ui';
import { Funnel } from '../../components/charts';
import type { InvStatus, Invoice } from '../../lib/types';

const TABS = ['Carrier Invoices', 'Payment Vouchers', 'Debit / Credit Notes', 'Payment Advice'] as const;
const PIPE: InvStatus[] = ['Pending (Logistics)', 'Pending (Finance)', 'Approved', 'Billed', 'Ready For Payment', 'Paid'];

export default function Accounting() {
  const t = useTms();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Carrier Invoices');
  const [st, setSt] = useState<string>('All'); const [sel, setSel] = useState<string[]>([]); const [view, setView] = useState<string>();
  const [pv, setPv] = useState<{ carrierId: string; amount: string }>(); const [note, setNote] = useState<{ kind: 'Debit' | 'Credit'; carrierId: string; amount: string; reason: string; sin: string }>();
  const inv = t.scoped(t.db.invoices);
  const rows = inv.filter((i) => st === 'All' || i.status === st);
  const cn = (id: string) => t.db.carriers.find((c) => c.id === id)?.name ?? id;
  const sh = (sin: string) => t.db.shipments.find((s) => s.sin === sin);

  // The stage an invoice moves to for each actor, and the permission needed to do it.
  const next = (i: Invoice): { to: InvStatus; perm: string; label: string } | null => ({
    'Pending (Logistics)': { to: 'Pending (Finance)' as InvStatus, perm: 'inv.approve.l', label: 'Approve (Logistics)' }, 'Pending (Finance)': { to: 'Approved' as InvStatus, perm: 'inv.approve.f', label: 'Approve (Finance)' },
    Approved: { to: 'Billed' as InvStatus, perm: 'inv.approve.f', label: 'Post to SAP' }, Billed: { to: 'Ready For Payment' as InvStatus, perm: 'inv.pay', label: 'Mark ready' }, 'Ready For Payment': { to: 'Paid' as InvStatus, perm: 'inv.pay', label: 'Release payment' },
  } as Record<string, { to: InvStatus; perm: string; label: string }>)[i.status] ?? null;
  const act = (i: Invoice) => { const n = next(i); if (!n) return; if (!t.can(n.perm)) return t.toast('Your role does not have permission for this step', 'err'); if (n.to === 'Billed') { void t.postSap(i.id); t.toast(`${i.id} posted to SAP`); return; } t.setInvoice(i.id, n.to); t.toast(`${i.id} → ${n.to}`); };
  const bulk = (to: InvStatus, perm: string) => { if (!t.can(perm)) return t.toast('Your role does not have permission for this action', 'err'); t.bulkInvoice(sel, to); t.toast(`${sel.length} invoice(s) → ${to}`); setSel([]); };
  const vi = t.db.invoices.find((i) => i.id === view);

  return (
    <div>
      <PageHead title="Accounting" sub="Carrier invoice approval pipeline · posting to SAP FI is simulated" />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'Carrier Invoices' && (<div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">{PIPE.map((p) => <Kpi key={p} label={p} value={inv.filter((i) => i.status === p).length} sub={inr(inv.filter((i) => i.status === p).reduce((a, i) => a + i.amount, 0))} tone={p === 'Paid' ? 'green' : p.startsWith('Pending') ? 'amber' : 'violet'} onClick={() => setSt(p)} />)}</div>
        <Card title="Invoice pipeline"><Funnel data={PIPE.map((p) => ({ label: p.replace('Pending ', 'Pend. '), value: inv.filter((i) => i.status === p).length }))} /></Card>
        <Card pad={false} title="Carrier invoices" right={<div className="flex flex-wrap items-center gap-2">
          <button className="btn-ghost !py-1.5 text-xs" onClick={() => { if (!t.can('inv.pay')) return t.toast('Your role does not have permission for this action', 'err'); void t.syncPayments(); t.toast('Payment status pulled from SAP'); }}>Sync payments from SAP</button>
          <select className="input !w-48 !py-1.5 text-xs" value={st} onChange={(e) => setSt(e.target.value)}>{['All', ...PIPE, 'Disapproved'].map((x) => <option key={x}>{x}</option>)}</select>
          <button disabled={!sel.length} className="btn-success !py-1.5 text-xs" onClick={() => bulk('Pending (Finance)', 'inv.approve.l')}>Bulk approve ({sel.length})</button>
          <button disabled={!sel.length} className="btn-danger !py-1.5 text-xs" onClick={() => bulk('Disapproved', 'inv.approve.l')}>Bulk disapprove</button></div>}>
          <Table rows={rows} rowKey={(i) => i.id} onRow={(i) => setView(i.id)} selectable={{ selected: sel, onChange: setSel }} cols={[
            { h: 'Invoice #', r: (i) => <b>{i.id}</b> }, { h: 'Carrier', r: (i) => cn(i.carrierId) }, { h: 'MIRO / Dest. code', r: (i) => i.miro }, { h: 'SAP doc', r: (i) => i.sapDoc ?? '—' },
            { h: 'Route', r: (i) => { const s = sh(i.sin); return s ? `${s.fromLocId} → ${s.toLocId}` : '—'; } }, { h: 'Date', r: (i) => fmtD(i.date) }, { h: 'Vehicle', r: (i) => i.vehicleNo }, { h: 'Status', r: (i) => <StatusPill s={i.status} /> }, { h: 'Freight', r: (i) => inr(i.amount), align: 'right' },
            { h: '', r: (i) => { const n = next(i); return n ? <button className="btn-ghost !px-2.5 !py-1 text-xs" onClick={(e) => { e.stopPropagation(); act(i); }}>{n.label}</button> : null; } }]} />
        </Card></div>)}

      {tab === 'Payment Vouchers' && (<Card pad={false} title="Payment vouchers" right={<button className="btn-primary !py-1.5 text-xs" onClick={() => t.can('voucher.create') ? (t.db.carriers[0] ? setPv({ carrierId: t.db.carriers[0].id, amount: '' }) : t.toast('There are no carriers yet - sync them from SAP first', 'err')) : t.toast('No permission to create payment vouchers', 'err')}>+ New voucher</button>}>
        <Table rows={t.db.vouchers} rowKey={(v) => v.id} cols={[{ h: 'Voucher', r: (v) => <b>{v.id}</b> }, { h: 'Carrier', r: (v) => cn(v.carrierId) }, { h: 'Date', r: (v) => fmtD(v.date) }, { h: 'Amount', r: (v) => inr(v.amount), align: 'right' }, { h: 'Status', r: (v) => <StatusPill s={v.status} /> }]} /></Card>)}

      {tab === 'Debit / Credit Notes' && (<Card pad={false} title="Debit & credit notes" right={<div className="flex gap-2"><button className="btn-ghost !py-1.5 text-xs" onClick={() => t.can('note.create') ? (t.db.carriers[0] ? setNote({ kind: 'Debit', carrierId: t.db.carriers[0].id, amount: '', reason: '', sin: '' }) : t.toast('There are no carriers yet - sync them from SAP first', 'err')) : t.toast('No permission to raise notes', 'err')}>+ Debit note</button><button className="btn-ghost !py-1.5 text-xs" onClick={() => t.can('note.create') ? (t.db.carriers[0] ? setNote({ kind: 'Credit', carrierId: t.db.carriers[0].id, amount: '', reason: '', sin: '' }) : t.toast('There are no carriers yet - sync them from SAP first', 'err')) : t.toast('No permission to raise notes', 'err')}>+ Credit note</button></div>}>
        <Table rows={t.db.notes} rowKey={(n) => n.id} cols={[{ h: 'Note', r: (n) => <b>{n.id}</b> }, { h: 'Type', r: (n) => n.kind }, { h: 'Carrier', r: (n) => cn(n.carrierId) }, { h: 'Shipment', r: (n) => n.sin || '—' }, { h: 'Reason', r: (n) => n.reason }, { h: 'Amount', r: (n) => inr(n.amount), align: 'right' }, { h: 'Date', r: (n) => fmtD(n.date) }]} /></Card>)}

      {tab === 'Payment Advice' && (<Card pad={false} title="Payment advice (paid invoices)"><Table rows={inv.filter((i) => i.status === 'Paid')} rowKey={(i) => i.id} cols={[{ h: 'Advice', r: (i) => `PA-${i.id.slice(-4)}` }, { h: 'Invoice', r: (i) => i.id }, { h: 'Carrier', r: (i) => cn(i.carrierId) }, { h: 'SAP doc', r: (i) => i.sapDoc }, { h: 'Paid', r: (i) => inr(i.amount), align: 'right' }]} empty="No paid invoices in this scope" /></Card>)}

      {vi && <Modal title={`Invoice ${vi.id}`} onClose={() => setView(undefined)}><div className="mb-4 grid grid-cols-2 gap-3 text-sm"><div><b>Carrier</b><br />{cn(vi.carrierId)}</div><div><b>Amount</b><br />{inr(vi.amount)}</div><div><b>Status</b><br /><StatusPill s={vi.status} /></div><div><b>SAP doc</b><br />{vi.sapDoc ?? '—'}</div></div><Timeline items={vi.history} /></Modal>}
      {pv && <Modal title="New payment voucher" onClose={() => setPv(undefined)} footer={<button className="btn-primary" onClick={() => { if (!(+pv.amount > 0)) return t.toast('Enter an amount', 'err'); t.addVoucher(pv.carrierId, +pv.amount); t.toast('Voucher created'); setPv(undefined); }}>Create</button>}><div className="space-y-3"><Field label="Carrier"><select className="input" value={pv.carrierId} onChange={(e) => setPv({ ...pv, carrierId: e.target.value })}>{t.db.carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Amount (₹)"><input type="number" className="input" value={pv.amount} onChange={(e) => setPv({ ...pv, amount: e.target.value })} /></Field></div></Modal>}
      {note && <Modal title={`New ${note.kind.toLowerCase()} note`} onClose={() => setNote(undefined)} footer={<button className="btn-primary" onClick={() => { if (!(+note.amount > 0) || !note.reason) return t.toast('Amount and reason are required', 'err'); t.addNote(note.kind, note.carrierId, +note.amount, note.reason, note.sin); t.toast('Note raised'); setNote(undefined); }}>Raise</button>}><div className="space-y-3"><Field label="Carrier"><select className="input" value={note.carrierId} onChange={(e) => setNote({ ...note, carrierId: e.target.value })}>{t.db.carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Shipment (SIN, optional)"><input className="input" value={note.sin} onChange={(e) => setNote({ ...note, sin: e.target.value })} /></Field><Field label="Amount (₹)"><input type="number" className="input" value={note.amount} onChange={(e) => setNote({ ...note, amount: e.target.value })} /></Field><Field label="Reason"><input className="input" value={note.reason} onChange={(e) => setNote({ ...note, reason: e.target.value })} /></Field></div></Modal>}
    </div>
  );
}
