'use client';

import React, { useState } from 'react';
import { useTms } from '../../lib/store';
import { Card, PageHead, Table, Tabs, StatusPill, RowMenu, inr, fmtDT } from '../../components/ui';
import ShipmentDetail from '../../components/ShipmentDetail';
import IndiaMap from '../../components/IndiaMap';
import { Download } from 'lucide-react';
import { downloadCsv } from '../../lib/csv';

import { carrierCols, carrierLabelOf } from '../../lib/labels';
const TABS = ['Outbound', 'Inbound', 'Others', 'All'] as const;

export default function Shipments() {
  const t = useTms();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Outbound');
  const [open, setOpen] = useState<string>();
  const [q, setQ] = useState(''); const [status, setStatus] = useState('All'); const [odc, setOdc] = useState(false); const [map, setMap] = useState(false);
  const all = t.scoped(t.db.shipments);
  const rows = all.filter((s) => (tab === 'All' || s.direction === tab) && (status === 'All' || s.status === status) && (!odc || t.db.orders.find((o) => o.id === s.orderId)?.odc)
    && (!q || [s.sin, s.vehicleNo, s.driver, s.orderId].join(' ').toLowerCase().includes(q.toLowerCase())));
  const carrier = (id: string) => carrierLabelOf(t.db.carriers, id);
  const city = (id: string) => t.db.locs.find((l) => l.id === id)?.city;

  return (
    <div>
      <PageHead title="Shipments" sub="Execution and tracking — one row per vehicle-load" right={<>
        <button className="btn-ghost" onClick={() => setMap((m) => !m)}>{map ? 'List view' : 'Map view'}</button>
        <button className="btn-ghost" onClick={() => downloadCsv('shipments.csv', rows.map((s) => ({ SIN: s.sin, Order: s.orderId, Status: s.status, ...carrierCols(t.db.carriers, s.carrierId), Vehicle: s.vehicleNo, Driver: s.driver, From: city(s.fromLocId), To: city(s.toLocId), Freight: s.freight, ePOD: s.ePod })))}><Download size={15} />Export</button></>} />
      <Tabs tabs={TABS} value={tab} onChange={setTab} counts={{ Outbound: all.filter((s) => s.direction === 'Outbound').length, Inbound: all.filter((s) => s.direction === 'Inbound').length, Others: 0, All: all.length }} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="input !w-64" placeholder="Search SIN, vehicle, driver, order…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input !w-44" value={status} onChange={(e) => setStatus(e.target.value)}>{['All', 'Requested', 'Accepted', 'Assigned', 'Towards Pickup', 'At Pickup', 'In Transit', 'At Delivery', 'Completed', 'Cancelled', 'Rejected'].map((x) => <option key={x}>{x}</option>)}</select>
        <label className="flex items-center gap-1.5 text-xs font-bold text-inkSoft"><input type="checkbox" checked={odc} onChange={(e) => setOdc(e.target.checked)} />ODC shipments only</label>
      </div>
      {map ? <Card pad={false}><div className="aspect-square max-h-[640px] p-2"><IndiaMap locs={t.db.locs} shipments={rows.filter((s) => s.status === 'In Transit')} onSelect={setOpen} /></div></Card> : (
        <Card pad={false}><Table rows={rows} rowKey={(s) => s.sin} onRow={(s) => setOpen(s.sin)} cols={[
          { h: 'Status', r: (s) => <StatusPill s={s.status} /> }, { h: 'SIN', r: (s) => <b>{s.sin}</b> }, { h: 'ePOD', r: (s) => <StatusPill s={s.ePod} /> },
          { h: 'Route', r: (s) => `${city(s.fromLocId)} → ${city(s.toLocId)}` }, { h: 'Pickup', r: (s) => fmtDT(s.pickupAt) }, { h: 'Carrier', r: (s) => carrier(s.carrierId) }, { h: 'Vehicle', r: (s) => <div>{s.vehicleNo}<div className="hint">{s.vehicleType}</div></div> },
          { h: 'Driver', r: (s) => <div>{s.driver}<div className="hint">{s.phone}</div></div> }, { h: 'GPS', r: (s) => <StatusPill s={s.consent} /> }, { h: 'Freight', r: (s) => inr(s.freight), align: 'right' },
          { h: '', r: (s) => <RowMenu items={[
            { label: 'View', onClick: () => setOpen(s.sin) }, { label: 'SIM Tracking', onClick: () => { t.patchShipment(s.sin, { consent: 'Pending' }, 'SIM tracking consent requested'); t.toast('Consent SMS sent'); } },
            { label: 'Share tracking link', onClick: () => { navigator.clipboard?.writeText(`https://tms.example/track/${s.sin}`); t.toast('Tracking link copied'); } },
            { label: 'Create Advance Payment', onClick: () => t.toast(`Advance request raised for ${s.sin} (demo)`) },
            { label: 'Update Delay Reason', onClick: () => { const r = prompt('Delay reason'); if (r) { t.patchShipment(s.sin, { delayReason: r }, `Delay reason: ${r}`); t.toast('Updated'); } } },
            { label: 'Cancel', danger: true, disabled: ['Completed', 'Cancelled'].includes(s.status), onClick: () => { t.cancelShipment(s.sin); t.toast('Cancelled'); } }]} /> },
        ]} /></Card>)}
      {open && <ShipmentDetail sin={open} onClose={() => setOpen(undefined)} />}
    </div>
  );
}
