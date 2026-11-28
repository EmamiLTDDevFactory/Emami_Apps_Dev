'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { useTms } from '../../lib/store';
import { Card, Field, PageHead } from '../../components/ui';
import IndiaMap from '../../components/IndiaMap';
import type { Basis, Stop } from '../../lib/types';

import Combobox from '../../components/Combobox';
import { carrierLabel, carrierOptions, filterOptions } from '../../lib/labels';
const VT = ['CONT15MT', 'CONT20MT', 'TRUCK9MT', 'TRUCK16MT', 'LCV3MT', 'TRAILER32MT'];
const localIso = (t: number, plusH = 0) => new Date(t + plusH * 3600_000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export default function PostOrder() {
  const t = useTms(); const router = useRouter();
  const [mode, setMode] = useState<'FTL' | 'BID'>('FTL');
  const [f, setF] = useState({ basis: 'Vehicle' as Basis, vehicleType: 'CONT15MT', vehicles: 1, material: 'Navratna Cool Talc', qty: 12, uom: 'MT', packages: 400, po: '', so: '', project: '', segment: 'General Trade', odc: false, tolerance: 2, comments: '', customerId: t.db.customers[0]?.id ?? '' });
  const [stops, setStops] = useState<Stop[]>([{ type: 'P', locId: t.db.locs[0]?.id ?? '', at: localIso(t.now, 8) }, { type: 'D', locId: t.db.locs[1]?.id ?? '', at: localIso(t.now, 40) }]);
  const [bid, setBid] = useState({ expiresAt: localIso(t.now, 4), startPrice: 32000, diffType: 'Percentage' as 'Percentage' | 'Amount', diffValue: 1, paymentTerms: 'Net 30', vendors: t.db.carriers.filter((c) => !c.blocked).map((c) => c.id) });
  const [err, setErr] = useState(''); const [vq, setVq] = useState('');
  const [poMsg, setPoMsg] = useState(''); const [poOk, setPoOk] = useState(true);
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const label = (i: number) => `${stops[i].type}${stops.slice(0, i + 1).filter((s) => s.type === stops[i].type).length}`;
  const p0 = t.db.locs.find((l) => l.id === stops[0].locId); const d0 = t.db.locs.find((l) => l.id === stops[stops.length - 1].locId);
  const needSetup = t.db.locs.length < 2 || t.db.customers.length === 0;

  async function submit() {
    if (needSetup) return setErr('Locations and customers are not set up yet. See the notice at the top of this page.');
    if (!t.can('order.create')) return setErr('Your role does not have the "Post Order" permission. Use "Act as" to switch to an Allocation Executive.');
    if (!stops.some((s) => s.type === 'P') || !stops.some((s) => s.type === 'D')) return setErr('Add at least one pickup and one delivery stop');
    if (stops[0].locId === stops[stops.length - 1].locId) return setErr('Pickup and delivery locations must differ');
    if (f.qty <= 0 || f.vehicles <= 0) return setErr('Quantity and number of vehicles must be positive');
    if (mode === 'BID' && (bid.vendors.length === 0 || bid.startPrice <= 0)) return setErr('A bid order needs a start price and at least one vendor');
    const id = await t.createOrder({ ...f, unitId: t.unitId, mode, stops: stops.map((s) => ({ ...s, at: new Date(s.at).toISOString() })), bid: mode === 'BID' ? { ...bid, expiresAt: new Date(bid.expiresAt).toISOString(), bids: [], status: 'Open' } : undefined });
    if (!id) return;
    t.toast(`Order ${id} posted`); router.push(mode === 'BID' ? '/bidding/' : '/orders/');
  }

  return (
    <div>
      <PageHead title="Post Order" sub={`Booking against ${t.db.units.find((u) => u.id === t.unitId)?.name}`} />
      {needSetup && <div className="mb-4 rounded-xl bg-amberBg px-4 py-3 text-sm font-semibold text-amber">Locations and customers are not set up yet, so an order cannot be posted. An administrator can sync customers and carriers from SAP and load the standard locations in Settings &rarr; Integrations.</div>}
      <div className="mb-4 inline-flex overflow-hidden rounded-xl border border-border bg-white text-sm font-bold">{(['FTL', 'BID'] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={`px-6 py-2 ${mode === m ? 'bg-rust text-white' : 'text-inkSoft'}`}>{m === 'FTL' ? 'FTL' : 'Bid Order'}</button>)}</div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card title="Shipment">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Customer"><Combobox ariaLabel="Customer" clearable={false} value={f.customerId} onChange={(v) => set('customerId', v)} placeholder="Type customer name or R-code…" options={t.db.customers.map((c) => ({ value: c.id, label: c.name, keywords: c.rCode }))} /></Field>
              <Field label="Allocation basis"><select className="input" value={f.basis} onChange={(e) => set('basis', e.target.value)}>{['Vehicle', 'Weight', 'Pallet'].map((x) => <option key={x}>{x}</option>)}</select></Field>
              <Field label="Vehicle type"><Combobox ariaLabel="Vehicle type" clearable={false} value={f.vehicleType} onChange={(v) => set('vehicleType', v)} options={VT.map((x) => ({ value: x, label: x }))} /></Field>
              <Field label="No. of vehicles"><input type="number" min={1} className="input" value={f.vehicles} onChange={(e) => set('vehicles', +e.target.value)} /></Field>
              <Field label="Material"><input className="input" value={f.material} onChange={(e) => set('material', e.target.value)} /></Field>
              <Field label="Total quantity (MT)"><input type="number" min={1} className="input" value={f.qty} onChange={(e) => set('qty', +e.target.value)} /></Field>
              <Field label="Packages / CBM"><input type="number" className="input" value={f.packages} onChange={(e) => set('packages', +e.target.value)} /></Field>
              <Field label="Segmentation"><select className="input" value={f.segment} onChange={(e) => set('segment', e.target.value)}>{['General Trade', 'Modern Trade', 'E-Commerce', 'CSD', 'Export'].map((x) => <option key={x}>{x}</option>)}</select></Field>
              <Field label="Tolerance %"><input type="number" className="input" value={f.tolerance} onChange={(e) => set('tolerance', +e.target.value)} /></Field>
              <Field label="PO number"><input className="input" value={f.po} onChange={(e) => { set('po', e.target.value); setPoMsg(''); }} /></Field>
              <Field label="SO number"><input className="input" value={f.so} onChange={(e) => { set('so', e.target.value); setPoMsg(''); }} /></Field>
              <Field label="Project code"><input className="input" value={f.project} onChange={(e) => set('project', e.target.value)} /></Field>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" className="btn-ghost !py-1.5 text-xs" onClick={async () => { const r = await t.checkPoSo(f.po, f.so); setPoMsg(r.valid ? `${r.simulated ? 'Not verified (SAP not connected). ' : 'PO / SO exist in SAP. '}${r.message && r.simulated ? '' : ''}` : r.message); setPoOk(r.valid); }}>Verify PO / SO in SAP</button>{poMsg && <span className={`text-xs font-bold ${poOk ? 'text-green' : 'text-red'}`}>{poMsg}</span>}</div>
            <label className="mt-3 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={f.odc} onChange={(e) => set('odc', e.target.checked)} />ODC (over-dimensional cargo) order</label>
            <Field label="Comments" className="mt-3"><textarea className="input" rows={2} value={f.comments} onChange={(e) => set('comments', e.target.value)} /></Field>
          </Card>
          <Card title="Pickup & delivery stops" right={<div className="flex gap-2"><button className="btn-ghost !py-1 text-xs" onClick={() => setStops((s) => [...s.slice(0, -1), { type: 'P', locId: 'PAT', at: localIso(t.now, 12) }, s[s.length - 1]])}><Plus size={13} />Pickup</button><button className="btn-ghost !py-1 text-xs" onClick={() => setStops((s) => [...s, { type: 'D', locId: 'LKO', at: localIso(t.now, 60) }])}><Plus size={13} />Delivery</button></div>}>
            <div className="space-y-2">{stops.map((s, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-cream p-2">
                <span className={`flex h-8 w-9 items-center justify-center rounded-lg text-xs font-extrabold text-white ${s.type === 'P' ? 'bg-teal' : 'bg-rust'}`}>{label(i)}</span>
                <Combobox className="w-56" ariaLabel={`Stop ${i + 1} location`} clearable={false} value={s.locId} onChange={(v) => setStops((x) => x.map((y, j) => j === i ? { ...y, locId: v } : y))} options={t.db.locs.map((l) => ({ value: l.id, label: `${l.city}, ${l.state}`, keywords: `${l.id} ${l.pincode ?? ''}` }))} />
                <input type="datetime-local" className="input !w-52" value={s.at} onChange={(e) => setStops((x) => x.map((y, j) => j === i ? { ...y, at: e.target.value } : y))} />
                {stops.length > 2 && <button aria-label="Remove stop" onClick={() => setStops((x) => x.filter((_, j) => j !== i))} className="text-red"><Trash2 size={16} /></button>}
              </div>))}</div>
          </Card>
          {mode === 'BID' && (
            <Card title="Reverse auction">
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Bidding expires at"><input type="datetime-local" className="input" value={bid.expiresAt} onChange={(e) => setBid({ ...bid, expiresAt: e.target.value })} /></Field>
                <Field label="Start price (₹ / vehicle)"><input type="number" className="input" value={bid.startPrice} onChange={(e) => setBid({ ...bid, startPrice: +e.target.value })} /></Field>
                <Field label="Payment terms"><select className="input" value={bid.paymentTerms} onChange={(e) => setBid({ ...bid, paymentTerms: e.target.value })}>{['Net 15', 'Net 30', 'Net 45'].map((x) => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Bid difference type"><select className="input" value={bid.diffType} onChange={(e) => setBid({ ...bid, diffType: e.target.value as 'Percentage' | 'Amount' })}><option>Percentage</option><option>Amount</option></select></Field>
                <Field label={bid.diffType === 'Percentage' ? 'Minimum step (%)' : 'Minimum step (₹)'}><input type="number" className="input" value={bid.diffValue} onChange={(e) => setBid({ ...bid, diffValue: +e.target.value })} /></Field>
              </div>
              <div className="mt-3 text-xs font-bold text-inkSoft">Vendors ({bid.vendors.length} of {t.db.carriers.filter((c) => !c.blocked).length} eligible)</div>
              <input className="input mt-1 !w-72" placeholder="Search vendors by code or name…" aria-label="Search vendors" value={vq} onChange={(e) => setVq(e.target.value)} />
              <div className="mt-1 flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">{(() => { const ok = new Set(filterOptions(carrierOptions(t.db.carriers.filter((c) => !c.blocked)), vq).map((o: { value: string }) => o.value)); return t.db.carriers.filter((c) => !c.blocked && ok.has(c.id)); })().map((c) => { const on = bid.vendors.includes(c.id); return <button key={c.id} onClick={() => setBid({ ...bid, vendors: on ? bid.vendors.filter((v) => v !== c.id) : [...bid.vendors, c.id] })} className={`rounded-full border px-3 py-1 text-xs font-bold ${on ? 'border-rust bg-rust/10 text-rust' : 'border-border text-inkSoft'}`}>{carrierLabel(c, { short: true })}</button>; })}</div>
            </Card>)}
          {err && <div className="rounded-xl bg-redBg px-4 py-2.5 text-sm font-bold text-red">{err}</div>}
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => router.push('/orders/')}>Cancel</button><button className="btn-primary" onClick={submit}>{mode === 'BID' ? 'Post bid order' : 'Post order'}</button></div>
        </div>
        <Card title="Route preview" pad={false} className="self-start"><div className="aspect-square p-2"><IndiaMap locs={t.db.locs} shipments={p0 && d0 ? [{ sin: 'preview', fromLocId: p0.id, toLocId: d0.id, progress: 0.5, delayH: 0, status: 'In Transit', vehicleNo: 'Preview', driver: '' } as never] : []} /></div>
          <div className="border-t border-border px-4 py-2 text-xs font-bold text-inkSoft">{p0?.city ?? '—'} → {d0?.city ?? '—'}</div></Card>
      </div>
    </div>
  );
}
