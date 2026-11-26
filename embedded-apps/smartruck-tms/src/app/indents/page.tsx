'use client';

import React, { useState } from 'react';
import { useTms } from '../../lib/store';
import { Card, Field, Kpi, Modal, PageHead, Pill, StatusPill, Table, Tabs, fmtDT, inr, rateText } from '../../components/ui';
import type { Indent } from '../../lib/types';

const TABS = ['Open', 'Escalated', 'Allocated', 'All'] as const;

export default function IndentsPage() {
  const t = useTms();
  const live = t.mode === 'live';
  const [tab, setTab] = useState<(typeof TABS)[number]>('Open');
  const [form, setForm] = useState(false);
  const [sel, setSel] = useState<Indent | null>(null);
  const lanes = t.db.lanes ?? [], vts = t.db.vehicleTypes ?? [], indents = t.db.indents ?? [];
  const rows = t.scoped(indents).filter((i) => tab === 'All' || (tab === 'Open' ? i.status === 'Open' && !i.escalated : tab === 'Escalated' ? i.status === 'Open' && i.escalated : i.status === 'Allocated' || i.status === 'Vehicle Assigned'));
  const city = (id: string) => t.db.locs.find((l) => l.id === id)?.city ?? id;
  const carrier = (id: string) => t.db.carriers.find((c) => c.id === id)?.name ?? id;
  const mine = t.scoped(indents);
  const [f, setF] = useState({ laneId: '', vehicleType: '', shippingType: '01', requiredAt: '', customerId: '', material: '', qty: '10', deliveries: '' });
  const [off, setOff] = useState('');

  if (!live) return <div><PageHead title="Indents" sub="Depot indents and vendor allocation" /><Card><p className="text-sm">Outward tracking runs on the live server. Open this app with <code>?mode=live</code> on the DEV site.</p></Card></div>;

  const submit = async () => {
    const r = await t.cmd<{ indentId: string; offeredTo: string | null }>({ type: 'createIndent', unitId: t.unitId, laneId: f.laneId, vehicleType: f.vehicleType, shippingType: f.shippingType, requiredAt: f.requiredAt ? new Date(f.requiredAt).toISOString() : '', customerId: f.customerId, material: f.material, qty: Number(f.qty), deliveries: f.deliveries.split(/[\s,]+/).filter(Boolean) });
    if (r) { t.toast(r.offeredTo ? `Indent ${r.indentId} offered to ${carrier(r.offeredTo)}` : `Indent ${r.indentId} raised — no vendor on the lane, HO must allocate`); setForm(false); }
  };

  return (
    <div className="space-y-4">
      <PageHead title="Indents" sub="Raise a vehicle requirement; the lane's first vendor is offered it, then the next, then HO" right={t.can('indent.create') && <button className="btn-primary" onClick={() => setForm(true)}>New indent</button>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Open" value={mine.filter((i) => i.status === 'Open' && !i.escalated).length} tone="amber" /><Kpi label="Escalated to HO" value={mine.filter((i) => i.status === 'Open' && i.escalated).length} tone="red" />
        <Kpi label="Allocated" value={mine.filter((i) => i.status === 'Allocated').length} tone="violet" /><Kpi label="Vehicle assigned" value={mine.filter((i) => i.status === 'Vehicle Assigned').length} tone="green" />
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <Card pad={false}><Table rows={rows} rowKey={(i) => i.id} onRow={setSel} empty={lanes.length ? 'No indents here' : 'No lanes yet — HO adds lanes under Settings → Outward Rules'} cols={[
        { h: 'Indent', r: (i) => <b>{i.id}</b> }, { h: 'Lane', r: (i) => `${city(i.fromLocId)} → ${city(i.toLocId)}` }, { h: 'Vehicle', r: (i) => i.vehicleType }, { h: 'Required', r: (i) => fmtDT(i.requiredAt) },
        { h: 'Status', r: (i) => <StatusPill s={i.status} /> }, { h: 'Offered to', r: (i) => { const o = i.offers[i.offers.length - 1]; return o ? <span>{carrier(o.carrierId)} <span className="hint">{o.response}</span></span> : '—'; } },
        { h: '', r: (i) => i.escalated ? <Pill tone="red">HO action</Pill> : null },
      ]} /></Card>

      {form && <Modal title="New indent" onClose={() => setForm(false)} footer={<button className="btn-primary" onClick={submit}>Raise indent</button>}>
        {!lanes.length || !vts.length ? <p className="text-sm">HO must first add lanes and vehicle types (Settings → Outward Rules).</p> : <div className="grid gap-3 md:grid-cols-2">
          <Field label="Lane"><select className="input" value={f.laneId} onChange={(e) => setF({ ...f, laneId: e.target.value })}><option value="">Select…</option>{lanes.map((l) => <option key={l.id} value={l.id}>{city(l.fromLocId)} → {city(l.toLocId)}</option>)}</select></Field>
          <Field label="Vehicle type"><select className="input" value={f.vehicleType} onChange={(e) => setF({ ...f, vehicleType: e.target.value })}><option value="">Select…</option>{vts.map((v) => <option key={v.code} value={v.code}>{v.name} ({v.maxWeightKg} kg)</option>)}</select></Field>
          <Field label="Shipping type"><select className="input" value={f.shippingType} onChange={(e) => setF({ ...f, shippingType: e.target.value })}><option value="">Any</option>{Object.entries({ '01': 'Truck', '03': 'Train', ...(t.db.sapTexts?.shipping ?? {}) }).map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></Field>
          {(() => { const l = lanes.find((x) => x.id === f.laneId); if (!l || !f.vehicleType) return null;
            const fit = l.vendors.filter((v) => (!v.vehicleType || v.vehicleType === f.vehicleType) && (!f.shippingType || !v.shippingType || v.shippingType === f.shippingType))
              .sort((a, b) => (a.vehicleType === f.vehicleType ? 0 : 1) - (b.vehicleType === f.vehicleType ? 0 : 1) || a.priority - b.priority || a.rate - b.rate);
            return <div className="md:col-span-2 text-sm">{fit.length ? <>Offer order: {fit.slice(0, 4).map((v) => `${carrier(v.carrierId)} ${rateText(v)}`).join(' → ')}{fit.length > 4 ? ` → +${fit.length - 4} more` : ''}</> : <span className="text-red">No transporter rate on this lane for this vehicle / shipping type - HO will allocate.</span>}</div>; })()}
          <Field label="Required date and time"><input className="input" type="datetime-local" value={f.requiredAt} onChange={(e) => setF({ ...f, requiredAt: e.target.value })} /></Field>
          <Field label="Customer"><select className="input" value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })}><option value="">Select…</option>{t.db.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Material"><input className="input" value={f.material} onChange={(e) => setF({ ...f, material: e.target.value })} /></Field>
          <Field label="Quantity (MT)"><input className="input" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></Field>
          <Field label="Outbound delivery numbers (optional, comma separated)" className="md:col-span-2"><input className="input" value={f.deliveries} onChange={(e) => setF({ ...f, deliveries: e.target.value })} /></Field>
        </div>}
      </Modal>}

      {sel && (() => { const i = indents.find((x) => x.id === sel.id) ?? sel; return (
        <Modal title={`Indent ${i.id}`} onClose={() => setSel(null)} footer={<>
          {t.can('indent.cancel') && ['Open', 'Allocated'].includes(i.status) && <button className="btn-danger" onClick={() => { const reason = prompt('Reason for cancelling'); if (reason) void t.cmd({ type: 'cancelIndent', id: i.id, reason }).then((r) => { if (r) { t.toast('Indent cancelled'); setSel(null); } }); }}>Cancel indent</button>}
        </>}>
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2"><StatusPill s={i.status} />{i.escalated && <Pill tone="red">No vendor left — HO must allocate</Pill>}{i.sin && <Pill tone="green">Shipment {i.sin}</Pill>}</div>
            <div>{city(i.fromLocId)} → {city(i.toLocId)} · {i.vehicleType} · {i.material} {i.qty} MT · needed {fmtDT(i.requiredAt)}{i.deliveries.length ? ` · deliveries ${i.deliveries.join(', ')}` : ''}</div>
            <table className="w-full"><thead><tr className="text-left text-xs text-inkSoft"><th className="py-1">Vendor</th><th>Offered</th><th>Rate</th><th>Response</th></tr></thead><tbody>
              {i.offers.map((o, k) => <tr key={k} className="border-t border-border/60"><td className="py-1 font-bold">{carrier(o.carrierId)}</td><td>{fmtDT(o.offeredAt)}</td><td>{inr(o.rate)}</td><td>{o.response}{o.reason ? ` — ${o.reason}` : ''}</td></tr>)}</tbody></table>
            {i.status === 'Open' && t.can('indent.override') && <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3"><select className="input !w-auto" value={off} onChange={(e) => setOff(e.target.value)}><option value="">Offer to a vendor…</option>{t.db.carriers.filter((c) => !c.blocked).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="btn-ghost" disabled={!off} onClick={() => void t.cmd({ type: 'offerIndent', id: i.id, carrierId: off }).then((r) => { if (r) t.toast('Offered'); })}>Offer</button></div>}
          </div>
        </Modal>); })()}
    </div>
  );
}
