'use client';

import React, { useState } from 'react';
import { useTms } from '../lib/store';
import { KV, Modal, StatusPill, Tabs, Timeline, inr, fmtDT, ProgressSteps, Pill } from './ui';
import type { Shipment } from '../lib/types';
import TripPanel from './TripPanel';

import { carrierLabel } from '../lib/labels';
const STEPS = ['Requested', 'Accepted', 'Assigned', 'Towards Pickup', 'At Pickup', 'In Transit', 'At Delivery', 'Completed'];
const TABS = ['Shipment Details', 'Activity Timeline', 'Pickup & Delivery', 'Carrier Invoice', 'Lorry Receipt', 'Outward Trip'] as const;

export default function ShipmentDetail({ sin, onClose }: { sin: string; onClose: () => void }) {
  const t = useTms();
  const s = t.db.shipments.find((x) => x.sin === sin);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Shipment Details');
  const [assign, setAssign] = useState({ v: '', d: '', p: '' });
  const [eway, setEway] = useState('');
  if (!s) return null;
  const carrier = t.db.carriers.find((c) => c.id === s.carrierId);
  const loc = (id: string) => t.db.locs.find((l) => l.id === id);
  const inv = t.db.invoices.find((i) => i.sin === s.sin);
  const cust = t.db.customers.find((c) => c.id === s.customerId);
  const idx = STEPS.indexOf(s.status);
  const canUpdate = t.can('ship.update') || t.can('order.allocate');
  const guard = (fn: () => void) => () => (canUpdate ? fn() : t.toast('Your role does not have permission for this action', 'err'));
  const set = (patch: Partial<Shipment>, text: string) => guard(() => { t.patchShipment(s.sin, patch, text); t.toast(text); })();

  return (
    <Modal wide title={`Shipment ${s.sin}`} onClose={onClose} footer={<>
      {s.status === 'Accepted' && <button className="btn-primary" onClick={guard(() => { if (!assign.v || !assign.d) return t.toast('Enter vehicle no. and driver', 'err'); t.assign(s.sin, assign.v.toUpperCase(), assign.d, assign.p || '9800000000'); t.toast('Assigned — SIM consent SMS sent'); })}>Assign vehicle</button>}
      {idx >= 2 && idx < 7 && s.status !== 'Cancelled' && <button className="btn-primary" onClick={guard(() => { t.advance(s.sin); t.toast('Status advanced'); })}>Advance to {STEPS[idx + 1]}</button>}
      {s.status === 'Completed' && s.ePod === 'Pending' && <button className="btn-ghost" onClick={() => set({ ePod: 'Uploaded' }, 'ePOD uploaded')}>Upload ePOD</button>}
      {s.status === 'Completed' && s.ePod === 'Uploaded' && <button className="btn-success" onClick={() => set({ ePod: 'Verified' }, 'ePOD verified')}>Verify ePOD</button>}
      {!['Completed', 'Cancelled', 'Rejected'].includes(s.status) && <button className="btn-danger" onClick={guard(() => { t.cancelShipment(s.sin); t.toast('Shipment cancelled'); })}>Cancel</button>}
    </>}>
      {s.status !== 'Cancelled' && s.status !== 'Rejected' ? <div className="mb-4"><ProgressSteps steps={STEPS} current={idx} /></div> : <div className="mb-4"><StatusPill s={s.status} /></div>}
      <Tabs tabs={s.indentId ? TABS : TABS.filter((x) => x !== 'Outward Trip')} value={tab} onChange={setTab} />
      {tab === 'Outward Trip' && <TripPanel s={s} />}
      {tab === 'Shipment Details' && (<div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KV k="Status" v={<StatusPill s={s.status} />} /><KV k="Carrier" v={carrier ? carrierLabel(carrier) : ''} /><KV k="Vehicle" v={`${s.vehicleNo} (${s.vehicleType})`} /><KV k="Freight" v={inr(s.freight)} />
          <KV k="Driver" v={`${s.driver} ${s.phone !== '—' ? '· ' + s.phone : ''}`} /><KV k="SIM consent" v={<span className="flex items-center gap-1.5"><StatusPill s={s.consent} /><span className="hint">{s.provider}</span></span>} />
          <KV k="Tracking" v={<StatusPill s={s.tracking} />} /><KV k="ePOD" v={<StatusPill s={s.ePod} />} />
          <KV k="Material" v={`${s.material} · ${s.qty} MT`} /><KV k="Customer" v={cust?.name} /><KV k="Distance" v={`${s.km} km`} /><KV k="E-way bill expiry" v={fmtDT(s.ewayExpiry)} />
          <KV k="Last GPS ping" v={s.pos ? `${fmtDT(s.pos.at)} · ${s.pos.source} · ${Math.round(s.pos.speed)} km/h` : 'No ping received'} /><KV k="E-way bill no." v={s.ewayNo} />
          <KV k="Delay" v={s.delayH ? `${s.delayH} h${s.delayReason ? ' — ' + s.delayReason : ''}` : 'On time'} /><KV k="GPS issue" v={s.gpsReason} /><KV k="Anomaly" v={s.anomaly ? <Pill tone="red">{s.anomaly}</Pill> : 'None'} /><KV k="Type" v={`${s.type} · ${s.direction}`} />
        </div>
        {s.status === 'Accepted' && (<div className="rounded-xl bg-cream p-3"><div className="mb-2 text-xs font-bold text-inkSoft">Carrier assignment (done by carrier admin in the live system)</div>
          <div className="grid gap-2 md:grid-cols-3"><input className="input" placeholder="Vehicle no. e.g. AS01AB1234" value={assign.v} onChange={(e) => setAssign({ ...assign, v: e.target.value })} /><input className="input" placeholder="Driver name" value={assign.d} onChange={(e) => setAssign({ ...assign, d: e.target.value })} /><input className="input" placeholder="Driver mobile" value={assign.p} onChange={(e) => setAssign({ ...assign, p: e.target.value })} /></div></div>)}
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <button className="btn-ghost" onClick={() => set({ consent: 'Pending' }, 'SIM consent SMS (re)sent to driver')}>Resubscribe SIM</button>
          <button className="btn-ghost" onClick={() => set({ consent: 'Granted', consentSince: new Date(t.now).toISOString(), tracking: 'Active' }, 'SIM consent granted by driver')}>Simulate consent granted</button>
          <button className="btn-ghost" onClick={() => { const r = prompt('Delay reason'); if (r) set({ delayReason: r }, `Delay reason updated: ${r}`); }}>Update delay reason</button>
          <button className="btn-ghost" onClick={async () => { const r = await t.ewayCheck(s.sin); setEway(`${r.status ?? 'Unknown'}${r.validUpto ? ` · valid until ${fmtDT(r.validUpto)}` : ''}${r.simulated ? ' (simulated - e-way bill API not connected)' : ''}`); }}>Check e-way bill</button>
          <button className="btn-ghost" onClick={() => { const r = prompt('GPS disconnection reason'); if (r) set({ gpsReason: r }, `GPS disconnection reason: ${r}`); }}>GPS disconnection reason</button>
        </div>{eway && <div className="rounded-xl bg-cream px-3 py-2 text-xs font-bold text-ink">E-way bill: {eway}</div>}</div>)}
      {tab === 'Activity Timeline' && <Timeline items={s.log} />}
      {tab === 'Pickup & Delivery' && (<div className="grid gap-4 md:grid-cols-2">
        {[{ t: 'Pickup (P1)', l: loc(s.fromLocId), at: s.pickupAt }, { t: 'Delivery (D1)', l: loc(s.toLocId), at: new Date(new Date(s.pickupAt).getTime() + Math.max(8, s.km / 42) * 3600_000).toISOString() }].map((x) => (
          <div key={x.t} className="rounded-xl border border-border p-3"><div className="mb-2 text-sm font-extrabold">{x.t}</div><div className="grid grid-cols-2 gap-3"><KV k="Location" v={`${x.l?.city}, ${x.l?.state}`} /><KV k="Pincode" v={x.l?.pincode} /><KV k="Scheduled" v={fmtDT(x.at)} /><KV k="Actual" v={s.status === 'Completed' || x.t.startsWith('Pickup') && idx >= 4 ? fmtDT(x.at) : '—'} /></div></div>))}</div>)}
      {tab === 'Carrier Invoice' && (inv ? <div className="grid grid-cols-2 gap-4 md:grid-cols-4"><KV k="Invoice" v={inv.id} /><KV k="Status" v={<StatusPill s={inv.status} />} /><KV k="Amount" v={inr(inv.amount)} /><KV k="SAP doc no." v={inv.sapDoc} /></div> : <p className="hint">No carrier invoice submitted yet.</p>)}
      {tab === 'Lorry Receipt' && (s.lr ? (
        <div className="rounded-xl border-2 border-dashed border-border p-5"><div className="mb-3 flex justify-between"><div className="text-lg font-extrabold">LORRY RECEIPT</div><div className="font-mono font-bold">{s.lr}</div></div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3"><KV k="Consignor" v="Emami Ltd." /><KV k="Consignee" v={cust?.name} /><KV k="Carrier" v={carrier ? carrierLabel(carrier) : ''} /><KV k="From" v={loc(s.fromLocId)?.city} /><KV k="To" v={loc(s.toLocId)?.city} /><KV k="Vehicle" v={s.vehicleNo} /><KV k="Goods" v={s.material} /><KV k="Weight" v={`${s.qty} MT`} /><KV k="Freight" v={inr(s.freight)} /></div>
          <button className="btn-ghost mt-4" onClick={() => window.print()}>Print</button></div>) : <p className="hint">LR is generated when a vehicle is assigned.</p>)}
    </Modal>
  );
}
