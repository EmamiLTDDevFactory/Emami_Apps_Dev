'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useTms } from '../../lib/store';
import { Card, Field, KV, Modal, PageHead, RowMenu, StatusPill, Table, Pill, fmtDT, inr } from '../../components/ui';
import ShipmentDetail from '../../components/ShipmentDetail';
import { Search } from 'lucide-react';
import type { Order } from '../../lib/types';

export default function Orders() {
  const t = useTms();
  const [q, setQ] = useState(''); const [basis, setBasis] = useState('All'); const [status, setStatus] = useState('All'); const [mine, setMine] = useState(false); const [adv, setAdv] = useState(false);
  const [f, setF] = useState({ pz: '', dz: '', seg: '', carrier: '', so: '' });
  const [view, setView] = useState<string>(); const [alloc, setAlloc] = useState<string>(); const [carrierSel, setCarrierSel] = useState(''); const [ship, setShip] = useState<string>();
  const [rem, setRem] = useState<{ id: string; text: string }>();
  const loc = (id: string) => t.db.locs.find((l) => l.id === id);
  const all = t.scoped(t.db.orders);
  const shipsOf = (o: Order) => t.db.shipments.filter((s) => s.orderId === o.id);
  const rows = all.filter((o) => (basis === 'All' || o.basis === basis) && (status === 'All' || o.status === status) && (!mine || o.createdBy === t.me.name)
    && (!q || [o.id, o.oin, o.po, o.so, o.material].join(' ').toLowerCase().includes(q.toLowerCase()))
    && (!f.pz || loc(o.stops[0].locId)?.zone === f.pz) && (!f.dz || loc(o.stops[o.stops.length - 1].locId)?.zone === f.dz) && (!f.seg || o.segment === f.seg)
    && (!f.so || o.so.includes(f.so)) && (!f.carrier || shipsOf(o).some((s) => s.carrierId === f.carrier)));
  const guard = (perm: string, fn: () => void) => () => (t.can(perm) ? fn() : t.toast('Your role does not have permission for this action', 'err'));
  const vo = t.db.orders.find((o) => o.id === view);
  const ao = t.db.orders.find((o) => o.id === alloc);

  return (
    <div>
      <PageHead title="Orders" sub={`${all.length.toLocaleString('en-IN')} orders in scope`} right={<Link href="/post-order/" className="btn-primary">+ Post Order</Link>} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative"><Search size={14} className="absolute left-3 top-3 text-inkSoft" /><input className="input !w-64 !pl-8" placeholder="Search order, OIN, PO, SO, material…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="input !w-36" value={basis} onChange={(e) => setBasis(e.target.value)}>{['All', 'Vehicle', 'Weight', 'Pallet'].map((x) => <option key={x} value={x}>{x === 'All' ? 'All basis' : x}</option>)}</select>
        <select className="input !w-36" value={status} onChange={(e) => setStatus(e.target.value)}>{['All', 'Open', 'Active', 'Fulfilled', 'Cancelled'].map((x) => <option key={x}>{x}</option>)}</select>
        <label className="flex items-center gap-1.5 text-xs font-bold text-inkSoft"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />My Orders</label>
        <button className="btn-ghost" onClick={() => setAdv((a) => !a)}>Advanced Search</button>
      </div>
      {adv && <Card className="mb-3"><div className="grid gap-3 md:grid-cols-5">
        <Field label="Pickup zone"><select className="input" value={f.pz} onChange={(e) => setF({ ...f, pz: e.target.value })}><option value="">Any</option>{['NE', 'East', 'North', 'West', 'South', 'Central'].map((z) => <option key={z}>{z}</option>)}</select></Field>
        <Field label="Delivery zone"><select className="input" value={f.dz} onChange={(e) => setF({ ...f, dz: e.target.value })}><option value="">Any</option>{['NE', 'East', 'North', 'West', 'South', 'Central'].map((z) => <option key={z}>{z}</option>)}</select></Field>
        <Field label="Segmentation"><select className="input" value={f.seg} onChange={(e) => setF({ ...f, seg: e.target.value })}><option value="">Any</option>{['General Trade', 'Modern Trade', 'E-Commerce', 'CSD', 'Export'].map((z) => <option key={z}>{z}</option>)}</select></Field>
        <Field label="Carrier"><select className="input" value={f.carrier} onChange={(e) => setF({ ...f, carrier: e.target.value })}><option value="">Any</option>{t.db.carriers.map((c) => <option key={c.id} value={c.id}>{c.shortName}</option>)}</select></Field>
        <Field label="SO number"><input className="input" value={f.so} onChange={(e) => setF({ ...f, so: e.target.value })} /></Field></div></Card>}
      <Card pad={false}><Table rows={rows} rowKey={(o) => o.id} onRow={(o) => setView(o.id)} cols={[
        { h: 'Order', r: (o) => <div><b>{o.id}</b><div className="hint">{fmtDT(o.createdAt)}</div></div> },
        { h: 'Pickup → Delivery', r: (o) => <div>{o.stops.map((s, i) => <div key={i}><span className={`mr-1 rounded px-1 text-[10px] font-extrabold text-white ${s.type === 'P' ? 'bg-teal' : 'bg-rust'}`}>{s.type}{o.stops.slice(0, i + 1).filter((x) => x.type === s.type).length}</span>{loc(s.locId)?.city}</div>)}</div> },
        { h: 'Vehicle', r: (o) => `${o.vehicles} × ${o.vehicleType}` },
        { h: 'Fulfilment', r: (o) => { const s = shipsOf(o); return <div className="text-[11px] font-semibold"><span className="text-inkSoft">Req {o.vehicles}</span> · <span className="text-amber">Alloc {s.length}</span> · <span className="text-violet-700">Acc {s.filter((x) => x.status !== 'Requested').length}</span> · <span className="text-green">Done {s.filter((x) => x.status === 'Completed').length}</span></div>; } },
        { h: 'Material', r: (o) => `${o.material} · ${o.qty} MT` },
        { h: 'Carrier', r: (o) => { const c = shipsOf(o)[0]?.carrierId ?? o.bid?.winner; return c ? t.db.carriers.find((x) => x.id === c)?.shortName : <span className="text-inkSoft">—</span>; } },
        { h: 'Status', r: (o) => <div className="flex flex-col items-start gap-1"><StatusPill s={o.status} />{o.mode === 'BID' && <Pill tone="violet">Bid</Pill>}</div> },
        { h: '', r: (o) => <RowMenu items={[
          { label: 'View Order', onClick: () => setView(o.id) },
          { label: 'Allocate Carrier', disabled: o.status !== 'Open' || o.mode === 'BID', onClick: guard('order.allocate', () => { setAlloc(o.id); setCarrierSel(''); }) },
          { label: 'Add Remarks', onClick: () => setRem({ id: o.id, text: '' }) },
          { label: 'Duplicate Order', onClick: guard('order.create', () => { t.orderAction(o.id, 'duplicate'); t.toast('Order duplicated'); }) },
          { label: 'Re Book', onClick: guard('order.create', () => { t.orderAction(o.id, 'rebook'); t.toast('Order re-booked'); }) },
          { label: 'Convert To Bid', disabled: o.status !== 'Open' || o.mode === 'BID', onClick: guard('order.allocate', () => { t.orderAction(o.id, 'toBid'); t.toast('Converted to bid order'); }) },
          { label: 'Cancel', danger: true, disabled: ['Cancelled', 'Fulfilled'].includes(o.status), onClick: guard('order.cancel', () => { t.orderAction(o.id, 'cancel'); t.toast('Order cancelled'); }) },
          { label: 'Delete Order', danger: true, disabled: o.status === 'Active', onClick: guard('order.cancel', () => { if (confirm(`Delete ${o.id}?`)) { t.orderAction(o.id, 'delete'); t.toast('Order deleted'); } }) },
        ]} /> },
      ]} /></Card>

      {vo && (<Modal wide title={`Order ${vo.id}`} onClose={() => setView(undefined)}><div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4"><KV k="OIN" v={vo.oin} /><KV k="Status" v={<StatusPill s={vo.status} />} /><KV k="Customer" v={t.db.customers.find((c) => c.id === vo.customerId)?.name} /><KV k="Division / Unit" v={t.db.units.find((u) => u.id === vo.unitId)?.name} />
          <KV k="Allocation basis" v={vo.basis} /><KV k="Vehicle" v={`${vo.vehicles} × ${vo.vehicleType}`} /><KV k="Material" v={vo.material} /><KV k="Quantity" v={`${vo.qty} ${vo.uom} · ${vo.packages} pkgs`} />
          <KV k="PO / SO" v={`${vo.po} / ${vo.so}`} /><KV k="Project" v={vo.project} /><KV k="Segmentation" v={vo.segment} /><KV k="Bidding order" v={vo.mode === 'BID' ? 'Yes' : 'No'} /><KV k="Tolerance" v={`${vo.tolerance}%`} /><KV k="ODC" v={vo.odc ? 'Yes' : 'No'} /><KV k="Created by" v={vo.createdBy} /></div>
        <div><div className="mb-2 text-sm font-extrabold">Stops</div><div className="grid gap-2 md:grid-cols-2">{vo.stops.map((s, i) => <div key={i} className="rounded-xl bg-cream p-3 text-sm"><b>{s.type === 'P' ? 'Pickup' : 'Delivery'} {vo.stops.slice(0, i + 1).filter((x) => x.type === s.type).length}</b> — {loc(s.locId)?.city}, {loc(s.locId)?.state}<div className="hint">Scheduled {fmtDT(s.at)}</div></div>)}</div></div>
        <div><div className="mb-2 text-sm font-extrabold">Shipments ({shipsOf(vo).length})</div>{shipsOf(vo).length === 0 ? <p className="hint">No shipments yet — allocate a carrier{vo.mode === 'BID' ? ' or award the bid' : ''}.</p> :
          <Table rows={shipsOf(vo)} rowKey={(s) => s.sin} onRow={(s) => setShip(s.sin)} cols={[{ h: 'SIN', r: (s) => <b>{s.sin}</b> }, { h: 'Status', r: (s) => <StatusPill s={s.status} /> }, { h: 'Carrier', r: (s) => t.db.carriers.find((c) => c.id === s.carrierId)?.shortName }, { h: 'Vehicle', r: (s) => s.vehicleNo }, { h: 'Freight', r: (s) => inr(s.freight), align: 'right' }]} />}</div>
        {vo.remarks.length > 0 && <div><div className="mb-1 text-sm font-extrabold">Remarks</div><ul className="list-disc space-y-1 pl-5 text-sm">{vo.remarks.map((r, i) => <li key={i}>{r}</li>)}</ul></div>}
      </div></Modal>)}

      {ao && (<Modal title={`Allocate ${ao.id}`} onClose={() => setAlloc(undefined)} footer={<><button className="btn-ghost" onClick={() => setAlloc(undefined)}>Cancel</button><button className="btn-primary" onClick={() => { if (!carrierSel) return t.toast('Pick a carrier', 'err'); t.allocate(ao.id, carrierSel); t.toast(`Allocated — ${ao.vehicles} shipment(s) created`); setAlloc(undefined); }}>Allocate</button></>}>
        <p className="hint mb-3">Ranked by carrier weightage and service quality. Blocked carriers are excluded.</p>
        <ul className="space-y-2">{t.db.carriers.filter((c) => !c.blocked).sort((a, b) => b.fulfilledPct - a.fulfilledPct).map((c) => (
          <li key={c.id}><label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${carrierSel === c.id ? 'border-rust bg-rust/5' : 'border-border'}`}><input type="radio" name="car" checked={carrierSel === c.id} onChange={() => setCarrierSel(c.id)} /><div className="flex-1"><b className="text-sm">{c.name}</b><div className="hint">Fulfilled {c.fulfilledPct}% · Rejection {c.rejectionPct}% · ★ {c.rating}</div></div><Pill tone="violet">{c.weightage}% weight</Pill></label></li>))}</ul>
      </Modal>)}

      {rem && (<Modal title={`Remarks — ${rem.id}`} onClose={() => setRem(undefined)} footer={<button className="btn-primary" onClick={() => { if (rem.text.trim()) { t.addRemark(rem.id, rem.text.trim()); t.toast('Remark added'); setRem(undefined); } }}>Save</button>}><textarea className="input" rows={3} autoFocus value={rem.text} onChange={(e) => setRem({ ...rem, text: e.target.value })} /></Modal>)}
      {ship && <ShipmentDetail sin={ship} onClose={() => setShip(undefined)} />}
    </div>
  );
}
