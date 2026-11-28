'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTms } from '../lib/store';
import { Card, Kpi, PageHead, Tabs, inr, StatusPill, Table, fmtDT } from '../components/ui';
import { Bars, Donut, Funnel, Gauge } from '../components/charts';

import { carrierLabel, carrierLabelOf } from '../lib/labels';
const TABS = ['Home', 'LTL Overview', 'Pre-shipment', 'Ongoing', 'Post-shipment', 'Enterprise', 'Carrier Overview', 'Geofencing'] as const;

export default function Dashboard() {
  const t = useTms();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Home');
  const ships = t.scoped(t.db.shipments);
  const orders = t.scoped(t.db.orders);
  const inv = t.scoped(t.db.invoices);
  const by = (st: string) => ships.filter((s) => s.status === st).length;
  const live = ships.filter((s) => ['Towards Pickup', 'At Pickup', 'In Transit', 'At Delivery'].includes(s.status));
  const done = ships.filter((s) => s.status === 'Completed');
  const revenue = done.reduce((a, s) => a + s.freight, 0);
  const onTime = done.length ? Math.round((done.filter((s) => s.delayH < 4).length / done.length) * 100) : 0;
  const funnel = ['Requested', 'Accepted', 'Assigned', 'Towards Pickup', 'At Pickup', 'In Transit', 'At Delivery', 'Completed', 'Rejected'].map((l) => ({ label: l, value: by(l) }));
  const lateLive = live.filter((s) => s.delayH > 0);
  const epodPending = done.filter((s) => s.ePod === 'Pending');
  const byCarrier = useMemo(() => t.db.carriers.map((c) => {
    const cs = ships.filter((s) => s.carrierId === c.id); const rej = cs.filter((s) => s.status === 'Rejected').length;
    return { c, n: cs.length, rej, rejPct: cs.length ? Math.round((rej / cs.length) * 100) : 0, ful: cs.filter((s) => s.status === 'Completed').length };
  }).filter((x) => x.n > 0).sort((a, b) => b.n - a.n), [ships, t.db.carriers]);
  const zone = (id: string) => t.db.locs.find((l) => l.id === id)?.zone ?? '—';
  const zones = ['NE', 'East', 'North', 'West', 'South', 'Central'].map((z) => ({ label: z, value: ships.filter((s) => zone(s.toLocId) === z).length }));
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(t.now - (6 - i) * 86400_000); return { label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), value: ships.filter((s) => new Date(s.pickupAt).toDateString() === d.toDateString()).length }; });
  const mix = ['Active', 'Passive', 'Non-Tracking', 'No GPS'].map((l) => ({ label: l, value: live.filter((s) => s.tracking === l).length }));
  const invPipe = ['Pending (Logistics)', 'Pending (Finance)', 'Approved', 'Billed', 'Ready For Payment', 'Paid'].map((l) => ({ label: l, value: inv.filter((i) => i.status === l).length }));
  const gf = t.db.geofences.slice(0, 8).map((g) => ({ label: g.name.split(' ')[0], value: g.completions }));

  return (
    <div>
      <PageHead title="Dashboard" sub={`${t.allUnits ? 'All my units' : t.db.units.find((u) => u.id === t.unitId)?.name} · ${ships.length} shipments · ${orders.length} orders`} />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'Home' && (<div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi label="Shipments" value={ships.length} sub={`${live.length} live now`} />
          <Kpi label="Freight revenue" value={inr(revenue)} sub="Completed shipments" tone="green" />
          <Kpi label="Tonnage (MT)" value={ships.reduce((a, s) => a + s.qty, 0)} tone="blue" />
          <Kpi label="Cases" value={(ships.length * 412).toLocaleString('en-IN')} tone="teal" />
          <Kpi label="TAT %" value={`${onTime}%`} sub="On-time delivery" tone={onTime > 80 ? 'green' : 'amber'} />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Shipments by pickup day (7 days)" className="lg:col-span-2"><Bars data={days} /></Card>
          <Card title="Delivery zone mix"><Donut data={zones} /></Card>
        </div>
        <Card title="Shipment funnel (vehicle-loads)"><Funnel data={funnel} /></Card>
      </div>)}

      {tab === 'LTL Overview' && (() => { const l = ships.filter((s) => s.type === 'LTL'); return (
        <div className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi label="LTL shipments" value={l.length} /><Kpi label="Revenue" value={inr(l.reduce((a, s) => a + s.freight, 0))} tone="green" /><Kpi label="MT" value={l.reduce((a, s) => a + s.qty, 0)} tone="blue" />
          <Kpi label="Cases" value={(l.length * 380).toLocaleString('en-IN')} tone="teal" /><Kpi label="TAT %" value={`${l.length ? Math.round((l.filter((s) => s.delayH < 4).length / l.length) * 100) : 0}%`} tone="amber" /></div>
          <Card title="LTL shipments"><Table rows={l} rowKey={(s) => s.sin} cols={[{ h: 'SIN', r: (s) => s.sin }, { h: 'Carrier', r: (s) => carrierLabelOf(t.db.carriers, s.carrierId, { short: true }) }, { h: 'Status', r: (s) => <StatusPill s={s.status} /> }, { h: 'Freight', r: (s) => inr(s.freight), align: 'right' }]} /></Card></div>); })()}

      {tab === 'Pre-shipment' && (<div className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Pending allocation" value={orders.filter((o) => o.status === 'Open' && o.mode === 'FTL').length} tone="amber" />
        <Kpi label="Pending assignment" value={by('Accepted')} tone="amber" /><Kpi label="Pending acceptance" value={by('Requested')} tone="blue" />
        <Kpi label="SIM consent pending" value={ships.filter((s) => s.status === 'Assigned' && s.consent !== 'Granted').length} tone="red" /></div>
        <Card title="Orders waiting for a carrier" right={<Link href="/orders/" className="text-xs font-bold text-rust">Open Orders →</Link>}>
          <Table rows={orders.filter((o) => o.status === 'Open')} rowKey={(o) => o.id} cols={[{ h: 'Order', r: (o) => <b>{o.id}</b> }, { h: 'Mode', r: (o) => o.mode }, { h: 'Route', r: (o) => `${o.stops[0].locId} → ${o.stops[o.stops.length - 1].locId}` }, { h: 'Pickup', r: (o) => fmtDT(o.stops[0].at) }, { h: 'Vehicles', r: (o) => `${o.vehicles} × ${o.vehicleType}` }]} /></Card></div>)}

      {tab === 'Ongoing' && (<div className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Live shipments" value={live.length} /><Kpi label="Live late" value={lateLive.length} tone="red" /><Kpi label="E-way bill expiring <24h" value={live.filter((s) => new Date(s.ewayExpiry).getTime() - t.now < 86400_000).length} tone="amber" />
        <Kpi label="Anomalies" value={live.filter((s) => s.anomaly).length} tone="red" /></div>
        <Card title="Live late shipments"><Table rows={lateLive.sort((a, b) => b.delayH - a.delayH)} rowKey={(s) => s.sin} cols={[{ h: 'SIN', r: (s) => <b>{s.sin}</b> }, { h: 'Vehicle', r: (s) => s.vehicleNo }, { h: 'Route', r: (s) => `${s.fromLocId} → ${s.toLocId}` }, { h: 'Status', r: (s) => <StatusPill s={s.status} /> }, { h: 'Delay', r: (s) => `${s.delayH}h` }, { h: 'E-way expiry', r: (s) => fmtDT(s.ewayExpiry) }]} /></Card></div>)}

      {tab === 'Post-shipment' && (<div className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Delivered" value={done.length} tone="green" /><Kpi label="ePOD pending" value={epodPending.length} tone="amber" /><Kpi label="ePOD uploaded" value={done.filter((s) => s.ePod === 'Uploaded').length} tone="blue" /><Kpi label="ePOD verified" value={done.filter((s) => s.ePod === 'Verified').length} tone="green" /></div>
        <Card title="Shipments pending ePOD upload"><Table rows={epodPending} rowKey={(s) => s.sin} cols={[{ h: 'SIN', r: (s) => <b>{s.sin}</b> }, { h: 'Carrier', r: (s) => carrierLabelOf(t.db.carriers, s.carrierId, { short: true }) }, { h: 'Delivery', r: (s) => s.toLocId }, { h: 'Freight', r: (s) => inr(s.freight), align: 'right' }]} /></Card></div>)}

      {tab === 'Enterprise' && (<div className="grid gap-4 lg:grid-cols-2">
        <Card title="Month over month (shipments)"><Bars data={['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'].map((m, i) => ({ label: m, value: 820 + i * 63 + (i % 2) * 40 }))} /></Card>
        <Card title="Year over year (freight ₹ lakh)"><Bars color="#1D6FA5" data={[{ label: 'FY24', value: 612 }, { label: 'FY25', value: 748 }, { label: 'FY26', value: 903 }, { label: 'FY27 YTD', value: 615 }]} /></Card>
        <Card title="All units — funnel" className="lg:col-span-2"><Funnel data={['Requested', 'Accepted', 'Assigned', 'In Transit', 'Completed'].map((l) => ({ label: l, value: t.db.shipments.filter((s) => s.status === l).length }))} /></Card>
        <Card title="Invoice pipeline" className="lg:col-span-2"><Bars data={invPipe} color="#0F766E" /></Card></div>)}

      {tab === 'Carrier Overview' && (<div className="space-y-4">
        <Card title="Service quality score"><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Gauge value={100 - (ships.length ? (by('Rejected') / ships.length) * 100 : 0)} label="Acceptance %" color="#1F7A4D" />
          <Gauge value={ships.length ? ((ships.length - by('Requested') - by('Accepted')) / ships.length) * 100 : 0} label="Assignment %" />
          <Gauge value={ships.length ? (by('Rejected') / ships.length) * 100 : 0} label="Rejection %" color="#C0392B" />
          <Gauge value={ships.length ? (done.length / ships.length) * 100 : 0} label="Fulfilled %" color="#1D6FA5" /></div></Card>
        <Card title="By carrier" pad={false}><Table rows={byCarrier} rowKey={(x) => x.c.id} cols={[{ h: 'Carrier', r: (x) => <b>{carrierLabel(x.c)}</b> }, { h: 'Shipments', r: (x) => x.n }, { h: 'Completed', r: (x) => x.ful }, { h: 'Rejected', r: (x) => x.rej }, { h: 'Rejection %', r: (x) => `${x.rejPct}%` }, { h: 'Rating', r: (x) => `★ ${x.c.rating}` }]} /></Card></div>)}

      {tab === 'Geofencing' && (<div className="grid gap-4 lg:grid-cols-2">
        <Card title="Geofence completions"><Bars data={gf} color="#0F766E" /></Card>
        <Card title="Tracking method mix (live)"><Donut data={mix} /></Card>
        <Card title="Geofences" className="lg:col-span-2" pad={false}><Table rows={t.db.geofences} rowKey={(g) => g.id} cols={[{ h: 'Name', r: (g) => <b>{g.name}</b> }, { h: 'Type', r: (g) => g.type }, { h: 'Radius', r: (g) => `${g.radiusM} m` }, { h: 'Completions', r: (g) => g.completions }]} /></Card></div>)}
    </div>
  );
}
