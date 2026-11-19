'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useTms } from '../../lib/store';
import { Card, Kpi, PageHead, Pill, Table, StatusPill, inr, fmtDT, Field, Modal } from '../../components/ui';
import { Bars } from '../../components/charts';

function countdown(ms: number) { if (ms <= 0) return 'Expired'; const m = Math.floor(ms / 60000); return `${Math.floor(m / 60)}h ${m % 60}m left`; }

export default function Bidding() {
  const t = useTms();
  const orders = t.scoped(t.db.orders).filter((o) => o.mode === 'BID');
  const [sel, setSel] = useState<string>();
  const [manual, setManual] = useState<{ carrierId: string; price: string }>({ carrierId: '', price: '' });
  const cur = orders.find((o) => o.id === sel) ?? orders.find((o) => o.bid?.status === 'Open') ?? orders[0];
  const loc = (id: string) => t.db.locs.find((l) => l.id === id)?.city;
  const cn = (id: string) => t.db.carriers.find((c) => c.id === id)?.name ?? id;
  const open = orders.filter((o) => o.bid?.status === 'Open');
  const [confirmAward, setConfirmAward] = useState<string>();
  const vendor = t.mode === 'live' && t.me.roles.includes('Carrier Vendor');

  const lowest = (o: typeof cur) => o?.bid?.lowest ?? (o?.bid?.bids.length ? Math.min(...o.bid.bids.map((b) => b.price)) : undefined);
  const b = cur?.bid;
  const ranked = b ? Object.values(b.bids.reduce<Record<string, { carrierId: string; price: number; n: number }>>((m, x) => { const e = m[x.carrierId]; m[x.carrierId] = { carrierId: x.carrierId, price: e ? Math.min(e.price, x.price) : x.price, n: (e?.n ?? 0) + 1 }; return m; }, {})).sort((a, c) => a.price - c.price) : [];

  function place() {
    if (!cur || !b) return;
    const price = +manual.price; const low = lowest(cur) ?? b.startPrice;
    const step = b.diffType === 'Percentage' ? low * (b.diffValue / 100) : b.diffValue;
    if (!vendor && !manual.carrierId) return t.toast('Pick a vendor', 'err');
    if (!(price > 0) || price > low - step) return t.toast(`Bid must be at least ${inr(step)} below the current lowest (${inr(low)})`, 'err');
    t.placeBid(cur.id, vendor ? (t.me.carrierId ?? '') : manual.carrierId, price); setManual({ carrierId: manual.carrierId, price: '' }); t.toast('Bid placed');
  }

  return (
    <div>
      <PageHead title="Bidding Room" sub="Reverse auction — carriers undercut each other; Logistics awards the best bid and it converts to a normal order" right={<Link href="/post-order/" className="btn-primary">+ New bid order</Link>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Open auctions" value={open.length} tone="amber" /><Kpi label="Awarded" value={orders.filter((o) => o.bid?.status === 'Awarded').length} tone="green" />
        <Kpi label="Total bids" value={orders.reduce((a, o) => a + (o.bid?.bids.length ?? 0), 0)} tone="blue" />
        <Kpi label="Avg saving vs start" value={`${(() => { const a = orders.filter((o) => o.bid?.awardedPrice); return a.length ? Math.round(a.reduce((s, o) => s + (1 - o.bid!.awardedPrice! / o.bid!.startPrice) * 100, 0) / a.length) : 0; })()}%`} tone="green" /></div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Bid orders" pad={false} className="self-start"><ul className="max-h-[560px] divide-y divide-border overflow-y-auto">{orders.map((o) => (
          <li key={o.id} onClick={() => setSel(o.id)} className={`cursor-pointer px-4 py-3 hover:bg-cream ${cur?.id === o.id ? 'bg-rust/5' : ''}`}>
            <div className="flex items-center justify-between"><b className="text-sm">{o.id}</b><StatusPill s={o.bid?.status ?? ''} /></div>
            <div className="hint">{loc(o.stops[0].locId)} → {loc(o.stops[o.stops.length - 1].locId)} · {o.vehicles} × {o.vehicleType}</div>
            <div className="mt-1 text-xs font-semibold">{o.bid?.status === 'Open' ? <span className="text-amber">{countdown(new Date(o.bid.expiresAt).getTime() - t.now)}</span> : `Awarded ${inr(o.bid?.awardedPrice ?? 0)}`} · {o.bid?.bids.length} bids</div></li>))}
          {orders.length === 0 && <li className="px-4 py-10 text-center text-inkSoft">No bid orders in this scope</li>}</ul></Card>
        {cur && b ? (<div className="space-y-4 lg:col-span-2">
          <Card title={`${cur.id} — ${loc(cur.stops[0].locId)} → ${loc(cur.stops[cur.stops.length - 1].locId)}`} right={b.status === 'Open' ? <Pill tone="amber">{countdown(new Date(b.expiresAt).getTime() - t.now)}</Pill> : <StatusPill s={b.status} />}>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div><div className="text-[11px] font-bold uppercase text-inkSoft">Start price</div><div className="text-lg font-extrabold">{inr(b.startPrice)}</div></div>
              <div><div className="text-[11px] font-bold uppercase text-inkSoft">Current lowest</div><div className="text-lg font-extrabold text-green">{inr(lowest(cur) ?? b.startPrice)}</div></div>
              <div><div className="text-[11px] font-bold uppercase text-inkSoft">Min step</div><div className="text-lg font-extrabold">{b.diffValue}{b.diffType === 'Percentage' ? '%' : ' ₹'}</div></div>
              <div><div className="text-[11px] font-bold uppercase text-inkSoft">Vendors invited</div><div className="text-lg font-extrabold">{b.vendors.length}</div></div></div>
            <div className="mt-4"><Bars color="#1F7A4D" data={[{ label: 'Start', value: b.startPrice }, ...b.bids.map((x, i) => ({ label: `#${i + 1}`, value: x.price }))]} fmt={inr} height={140} /></div>
          </Card>
          {!vendor && <Card title="Leaderboard" pad={false}><Table rows={ranked} rowKey={(r) => r.carrierId} page={6} cols={[{ h: 'Rank', r: (r) => `#${ranked.indexOf(r) + 1}` }, { h: 'Vendor', r: (r) => <b>{cn(r.carrierId)}</b> }, { h: 'Best bid', r: (r) => inr(r.price), align: 'right' }, { h: 'Bids', r: (r) => r.n }, { h: 'Saving', r: (r) => `${Math.round((1 - r.price / b.startPrice) * 100)}%` },
            { h: '', r: (r) => b.status === 'Open' ? <button className="btn-success !px-3 !py-1 text-xs" onClick={() => { if (!t.can('bid.award')) return t.toast('You do not have the "Award Bid" permission', 'err'); setConfirmAward(r.carrierId); }}>Award</button> : b.winner === r.carrierId ? <Pill tone="green">Winner</Pill> : null }]} empty="No bids yet — vendors have been notified" /></Card>}
          {b.status === 'Open' && <Card title="Place bid on behalf of a vendor (demo)"><div className="flex flex-wrap items-end gap-3">{!vendor && <Field label="Vendor" className="min-w-[200px] flex-1"><select className="input" value={manual.carrierId} onChange={(e) => setManual({ ...manual, carrierId: e.target.value })}><option value="">Select…</option>{b.vendors.map((v) => <option key={v} value={v}>{cn(v)}</option>)}</select></Field>}
            <Field label="Price (₹ / vehicle)" className="w-40"><input type="number" className="input" value={manual.price} onChange={(e) => setManual({ ...manual, price: e.target.value })} /></Field><button className="btn-primary" onClick={place}>Place bid</button></div><p className="hint mt-2">New bids from other vendors also arrive automatically every few seconds while an auction is open.</p></Card>}
          <Card title="Bid history" pad={false}><Table rows={[...b.bids].reverse()} rowKey={(x) => x.carrierId + x.at + x.price} page={6} cols={[{ h: 'Time', r: (x) => fmtDT(x.at) }, { h: 'Vendor', r: (x) => cn(x.carrierId) }, { h: 'Price', r: (x) => inr(x.price), align: 'right' }]} /></Card>
        </div>) : <div className="lg:col-span-2"><Card><p className="hint">Select a bid order.</p></Card></div>}
      </div>
      {confirmAward && cur && <Modal title="Award bid" onClose={() => setConfirmAward(undefined)} footer={<><button className="btn-ghost" onClick={() => setConfirmAward(undefined)}>Cancel</button><button className="btn-success" onClick={() => { t.awardBid(cur.id, confirmAward); t.toast('Bid awarded — order converted and shipments created'); setConfirmAward(undefined); }}>Confirm award</button></>}>
        <p className="text-sm">Award <b>{cur.id}</b> to <b>{cn(confirmAward)}</b> at <b>{inr(ranked.find((r) => r.carrierId === confirmAward)?.price ?? 0)}</b> per vehicle? This creates {cur.vehicles} shipment(s), closes the auction and notifies all vendors.</p></Modal>}
    </div>
  );
}
