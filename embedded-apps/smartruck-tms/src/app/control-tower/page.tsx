'use client';

import React, { useState } from 'react';
import { useTms } from '../../lib/store';
import { Card, Kpi, PageHead, Table, Tabs, StatusPill, Pill, fmtDT } from '../../components/ui';
import { Donut, Funnel, Bars } from '../../components/charts';
import IndiaMap from '../../components/IndiaMap';
import ShipmentDetail from '../../components/ShipmentDetail';

const TYPES = ['Primary', 'Secondary', 'LTL'] as const;
const SUB = ['Tracking Stats', 'Shipment Overview', 'Order Overview', 'System Health', 'Sim Consent', 'Anomaly', 'View on Map'] as const;

export default function ControlTower() {
  const t = useTms();
  const [type, setType] = useState<(typeof TYPES)[number]>('Primary');
  const [sub, setSub] = useState<(typeof SUB)[number]>('View on Map');
  const [sel, setSel] = useState<string | undefined>();
  const [open, setOpen] = useState<string | undefined>();
  const [q, setQ] = useState('');
  const ships = t.scoped(t.db.shipments).filter((s) => s.type === type);
  const live = ships.filter((s) => ['Towards Pickup', 'At Pickup', 'In Transit', 'At Delivery'].includes(s.status));
  const transit = ships.filter((s) => s.status === 'In Transit');
  const trk = (m: string) => live.filter((s) => s.tracking === m).length;
  const gpsPct = live.length ? Math.round(((trk('Active') + trk('Passive')) / live.length) * 100) : 0;
  const buckets = [['0-8h', 0, 8], ['8-16h', 8, 16], ['16-24h', 16, 24], ['24-48h', 24, 48], ['>48h', 48, 999]] as const;
  const late = live.filter((s) => s.delayH > 0);
  const ordersHere = t.scoped(t.db.orders);
  const consentRows = ships.filter((s) => s.driver !== '—');
  const anomalies = live.filter((s) => s.anomaly);
  const mapRows = transit.filter((s) => !q || [s.sin, s.vehicleNo, s.driver].join(' ').toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHead title="Control Tower" sub="Near-real-time fleet view — vehicles on the map move live in this demo" />
      <Tabs tabs={TYPES} value={type} onChange={setType} counts={{ Primary: t.scoped(t.db.shipments).filter((s) => s.type === 'Primary').length, Secondary: t.scoped(t.db.shipments).filter((s) => s.type === 'Secondary').length, LTL: t.scoped(t.db.shipments).filter((s) => s.type === 'LTL').length }} />
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-card">{SUB.map((x) => <button key={x} onClick={() => setSub(x)} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold ${sub === x ? 'bg-rust text-white' : 'text-inkSoft hover:bg-appBg'}`}>{x}</button>)}</div>

      {sub === 'Tracking Stats' && (<div className="grid gap-4 lg:grid-cols-3"><div className="grid grid-cols-2 gap-3 lg:col-span-1"><Kpi label="GPS tracking %" value={`${gpsPct}%`} tone={gpsPct > 80 ? 'green' : 'amber'} /><Kpi label="Live vehicles" value={live.length} />
        <Kpi label="Actively tracked" value={trk('Active')} tone="green" /><Kpi label="Passively tracked" value={trk('Passive')} tone="amber" /><Kpi label="Non-tracking" value={trk('Non-Tracking')} tone="red" /><Kpi label="No GPS installed" value={trk('No GPS')} tone="blue" /></div>
        <Card title="Tracking method mix" className="lg:col-span-2"><Donut data={['Active', 'Passive', 'Non-Tracking', 'No GPS'].map((l) => ({ label: l, value: trk(l) }))} /></Card></div>)}

      {sub === 'Shipment Overview' && (<div className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Kpi label="Dispatched today" value={ships.filter((s) => new Date(s.pickupAt).toDateString() === new Date(t.now).toDateString()).length} />
        <Kpi label="ePOD pending" value={ships.filter((s) => s.status === 'Completed' && s.ePod === 'Pending').length} tone="amber" /><Kpi label="Late shipments" value={late.length} tone="red" /><Kpi label="Detention at delivery" value={ships.filter((s) => s.status === 'At Delivery').length} tone="blue" /></div>
        <Card title="Delay buckets (live)"><Bars color="#B45309" data={buckets.map(([l, a, b]) => ({ label: l, value: late.filter((s) => s.delayH > a && s.delayH <= b).length }))} /></Card></div>)}

      {sub === 'Order Overview' && <Card title="Order status funnel"><Funnel data={[{ label: 'Pending', value: ordersHere.filter((o) => o.status === 'Open').length }, ...['Accepted', 'Assigned', 'Towards Pickup', 'At Pickup', 'In Transit'].map((l) => ({ label: l === 'Accepted' ? 'Assigned (carrier)' : l, value: ships.filter((s) => s.status === l).length }))]} /></Card>}

      {sub === 'System Health' && (<div className="grid gap-4 md:grid-cols-3">{[['GPS ingestion', 'Healthy', 'green', 'Last ping 12s ago'], ['Jio SIM consent API', 'Healthy', 'green', '98 ms'], ['Airtel SIM consent API', 'Degraded', 'amber', 'Timeouts 4% — drivers fall back to "Non-Tracking"'], ['Roambee IoT feed', 'Healthy', 'green', '31 devices reporting'], ['E-way bill (GST) API', 'Healthy', 'green', 'Synced 4 min ago'], ['SAP / JDE posting', 'Idle', 'gray', 'Demo mode — not connected']].map(([n, st, tone, d]) => (
        <Card key={n}><div className="flex items-center justify-between"><b className="text-sm">{n}</b><Pill tone={tone}>{st}</Pill></div><p className="hint mt-2">{d}</p></Card>))}</div>)}

      {sub === 'Sim Consent' && (<Card pad={false} title="Driver SIM tracking consent"><Table rows={consentRows} rowKey={(s) => s.sin} cols={[{ h: 'SIN', r: (s) => <b>{s.sin}</b> }, { h: 'Driver', r: (s) => s.driver }, { h: 'Phone', r: (s) => s.phone }, { h: 'Provider', r: (s) => s.provider }, { h: 'Consent', r: (s) => <StatusPill s={s.consent} /> }, { h: 'Subscribed', r: (s) => s.consentSince ? fmtDT(s.consentSince) : '—' },
        { h: '', r: (s) => <button className="btn-ghost !px-2.5 !py-1 !text-xs" onClick={() => { if (!t.can('sim.manage')) return t.toast('No permission to manage SIM consent', 'err'); t.patchShipment(s.sin, { consent: 'Pending' }, 'Resubscribe SMS sent'); t.toast('Resubscribe SMS sent'); }}>Resubscribe</button> }]} /></Card>)}

      {sub === 'Anomaly' && (<div className="space-y-4"><div className="grid grid-cols-3 gap-3">{(['Tracking', 'Speed', 'Distance'] as const).map((a) => <Kpi key={a} label={`${a} anomaly`} value={anomalies.filter((s) => s.anomaly === a).length} tone="red" />)}</div>
        <Card pad={false} title="Flagged shipments"><Table rows={anomalies} rowKey={(s) => s.sin} onRow={(s) => setOpen(s.sin)} cols={[{ h: 'SIN', r: (s) => <b>{s.sin}</b> }, { h: 'Vehicle', r: (s) => s.vehicleNo }, { h: 'Anomaly', r: (s) => <Pill tone="red">{s.anomaly}</Pill> }, { h: 'Route', r: (s) => `${s.fromLocId} → ${s.toLocId}` }]} empty="No anomalies right now" /></Card></div>)}

      {sub === 'View on Map' && (<div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" pad={false}><div className="aspect-square max-h-[640px] w-full p-2"><IndiaMap locs={t.db.locs} shipments={mapRows} selected={sel} onSelect={setSel} /></div>
          <div className="flex flex-wrap gap-4 border-t border-border px-4 py-2 text-[11px] font-bold text-inkSoft"><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-green" />On time</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#E0A100' }} />Delayed</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-amber" />&gt; 8h late</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-red" />Anomaly</span></div></Card>
        <Card title={`In transit (${mapRows.length})`} pad={false} right={<input className="input !w-36 !py-1 text-xs" placeholder="Search vehicle…" value={q} onChange={(e) => setQ(e.target.value)} />}>
          <ul className="max-h-[560px] divide-y divide-border overflow-y-auto">{mapRows.map((s) => (
            <li key={s.sin} onClick={() => setSel(s.sin)} className={`cursor-pointer px-4 py-2.5 text-[13px] hover:bg-cream ${sel === s.sin ? 'bg-rust/5' : ''}`}>
              <div className="flex items-center justify-between"><b>{s.vehicleNo}</b><span className={s.delayH > 8 ? 'font-bold text-amber' : s.delayH > 0 ? 'font-bold text-amber' : 'font-bold text-green'}>{s.delayH ? `+${s.delayH}h` : 'On time'}</span></div>
              <div className="hint">{s.fromLocId} → {s.toLocId} · {Math.round(s.progress * 100)}% · {s.driver}</div>
              {sel === s.sin && <button className="mt-1 text-xs font-bold text-rust" onClick={(e) => { e.stopPropagation(); setOpen(s.sin); }}>Open shipment →</button>}
            </li>))}{mapRows.length === 0 && <li className="px-4 py-8 text-center text-inkSoft">No vehicles in transit for this scope</li>}</ul></Card></div>)}
      {open && <ShipmentDetail sin={open} onClose={() => setOpen(undefined)} />}
    </div>
  );
}
