'use client';

import React, { useState } from 'react';
import { useTms } from '../../lib/store';
import { Card, Field, KV, Modal, PageHead, Pill, RowMenu, Table, Tabs, inr } from '../../components/ui';
import { Gauge } from '../../components/charts';

const TABS = ['Carriers', 'Carrier Weightage', 'Allocation By Percentage', 'Support Details'] as const;

export default function Carriers() {
  const t = useTms();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Carriers');
  const [view, setView] = useState<{ id: string; what: 'lane' | 'rate' }>(); const [invite, setInvite] = useState<string>();
  const guard = (perm: string, fn: () => void) => () => (t.can(perm) ? fn() : t.toast('Your role does not have permission for this action', 'err'));
  const total = t.db.carriers.reduce((a, c) => a + c.weightage, 0);
  const c = view && t.db.carriers.find((x) => x.id === view.id);
  const loc = (id: string) => t.db.locs.find((l) => l.id === id)?.city;

  return (
    <div>
      <PageHead title="Carriers" sub={`${t.db.carriers.length} contracted transporters`} right={<button className="btn-primary" onClick={() => setInvite('')}>+ Invite carrier</button>} />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'Carriers' && <Card pad={false}><Table rows={t.db.carriers} rowKey={(x) => x.id} cols={[
        { h: 'Carrier', r: (x) => <div><b>{x.name}</b><div className="hint">{x.code} · {x.shortName}</div></div> }, { h: 'Type', r: (x) => x.type }, { h: 'Payment terms', r: (x) => x.paymentTerms }, { h: 'Fleet', r: (x) => x.fleet },
        { h: 'Fulfilled', r: (x) => `${x.fulfilledPct}%` }, { h: 'Rating', r: (x) => `★ ${x.rating}` }, { h: 'Status', r: (x) => x.blocked ? <Pill tone="red">Blocked</Pill> : <Pill tone="green">Active</Pill> },
        { h: '', r: (x) => <RowMenu items={[
          { label: 'View Lane', onClick: () => setView({ id: x.id, what: 'lane' }) }, { label: 'View Rate Card', onClick: () => setView({ id: x.id, what: 'rate' }) },
          { label: 'Add Carrier Lanes', onClick: guard('carrier.add', () => { const l = prompt('Lane (e.g. GAU-CCU)'); if (l) { t.patchCarrier(x.id, { lanes: [...x.lanes, l.toUpperCase()] }); t.toast('Lane added'); } }) },
          { label: 'Add Short Name', onClick: guard('carrier.add', () => { const n = prompt('Short name', x.shortName); if (n) { t.patchCarrier(x.id, { shortName: n }); t.toast('Updated'); } }) },
          { label: 'Edit Payment Terms', onClick: guard('carrier.add', () => { const n = prompt('Payment terms', x.paymentTerms); if (n) { t.patchCarrier(x.id, { paymentTerms: n }); t.toast('Updated'); } }) },
          { label: x.blocked ? 'Unblock Carrier' : 'Block Carrier', danger: !x.blocked, onClick: guard('carrier.block', () => { t.patchCarrier(x.id, { blocked: !x.blocked }); t.toast(x.blocked ? 'Carrier unblocked' : 'Carrier blocked — excluded from allocation and bids'); }) }]} /> }]} /></Card>}
      {tab === 'Carrier Weightage' && <Card title="Allocation weighting between carriers" right={<Pill tone={total === 100 ? 'green' : 'amber'}>Total {total}%</Pill>}><p className="hint mb-3">Weightage drives the auto-ranking in Allocate Carrier. Keep the total at 100%.</p>
        <div className="grid gap-3 md:grid-cols-2">{t.db.carriers.map((x) => <div key={x.id} className="flex items-center gap-3 rounded-xl border border-border p-3"><span className="min-w-0 flex-1 truncate text-sm font-bold">{x.name}</span><input type="range" min={0} max={40} value={x.weightage} onChange={(e) => { const v = +e.target.value; if (!t.can('carrier.weightage')) return t.toast('Your role does not have permission for this action', 'err'); t.patchCarrier(x.id, { weightage: v }); }} className="w-28" /><span className="w-10 text-right text-sm font-extrabold">{x.weightage}%</span></div>)}</div></Card>}
      {tab === 'Allocation By Percentage' && <Card title="Current allocation split (live shipments)"><div className="space-y-2">{t.db.carriers.map((x) => { const n = t.db.shipments.filter((s) => s.carrierId === x.id).length; const all = t.db.shipments.length || 1; return <div key={x.id} className="flex items-center gap-3 text-sm"><span className="w-56 truncate font-semibold">{x.name}</span><div className="h-4 flex-1 rounded bg-appBg"><div className="h-4 rounded bg-rust" style={{ width: `${(n / all) * 100 * 4}%`, maxWidth: '100%' }} /></div><span className="w-20 text-right text-xs font-bold">{Math.round((n / all) * 100)}% · target {x.weightage}%</span></div>; })}</div></Card>}
      {tab === 'Support Details' && <div className="grid gap-4 md:grid-cols-3">{[['Carrier onboarding', 'carrier.support@emamigroup.com', '1800-000-0101'], ['Tracking & SIM consent', 'tracking.help@emamigroup.com', '1800-000-0102'], ['Billing & payments', 'freight.billing@emamigroup.com', '1800-000-0103']].map(([a, b, p]) => <Card key={a} title={a}><KV k="Email" v={b} /><div className="mt-3" /><KV k="Helpline" v={p} /></Card>)}</div>}

      {c && <Modal wide title={`${c.name} — ${view!.what === 'lane' ? 'Lanes' : 'Rate card'}`} onClose={() => setView(undefined)}>
        {view!.what === 'lane' ? <div className="flex flex-wrap gap-2">{c.lanes.map((l, i) => { const [a, b] = l.split('-'); return <span key={i} className="rounded-xl border border-border bg-cream px-3 py-1.5 text-sm font-bold">{loc(a) ?? a} → {loc(b) ?? b}</span>; })}{c.lanes.length === 0 && <p className="hint">No lanes yet.</p>}</div>
          : <Table rows={c.lanes} rowKey={(l) => l} cols={[{ h: 'Lane', r: (l) => l.replace('-', ' → ') }, { h: '9 MT', r: (l) => inr(14000 + (l.length * 913) % 6000), align: 'right' }, { h: '15 MT', r: (l) => inr(21000 + (l.length * 1311) % 9000), align: 'right' }, { h: '32 MT', r: (l) => inr(34000 + (l.length * 1777) % 12000), align: 'right' }]} />}
        <div className="mt-4 grid grid-cols-4 gap-2"><Gauge value={c.fulfilledPct} label="Fulfilled" color="#1F7A4D" /><Gauge value={c.rejectionPct} label="Rejection" color="#C0392B" /><Gauge value={c.rating * 20} label="Rating" /></div></Modal>}
      {invite !== undefined && <Modal title="Invite carrier" onClose={() => setInvite(undefined)} footer={<button className="btn-primary" onClick={guard('carrier.add', () => { if (!invite.trim()) return t.toast('Enter the carrier name', 'err'); t.addCarrier(invite.trim()); t.toast('Invitation sent by email/SMS'); setInvite(undefined); })}>Send invite</button>}><Field label="Carrier name"><input className="input" autoFocus value={invite} onChange={(e) => setInvite(e.target.value)} /></Field></Modal>}
    </div>
  );
}
