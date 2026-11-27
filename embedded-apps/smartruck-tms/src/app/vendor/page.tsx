'use client';

import React, { useState } from 'react';
import { useTms } from '../../lib/store';
import TripPanel from '../../components/TripPanel';
import { Card, Kpi, Modal, PageHead, Pill, StatusPill, Table, Tabs, fmtDT, inr, rateText } from '../../components/ui';

const TABS = ['Indent inbox', 'My trips', 'Invoices'] as const;

/** The carrier's own workspace: offers addressed to them, and the trips they run. Staff see the same lists for a chosen carrier (read only here). */
export default function VendorPortal() {
  const t = useTms();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Indent inbox');
  const [open, setOpen] = useState('');
  const vendor = t.me.roles.includes('Carrier Vendor');
  const city = (id: string) => t.db.locs.find((l) => l.id === id)?.city ?? id;
  const indents = (t.db.indents ?? []).filter((i) => i.status === 'Open' && i.offers.some((o) => o.response === 'Pending'));
  const trips = t.db.shipments.filter((s) => s.indentId);
  const invs = t.db.invoices.filter((i) => i.invoiceNo);
  if (t.mode !== 'live') return <div><PageHead title="Vendor Portal" /><Card><p className="text-sm">The vendor portal runs on the live server. Open this app with <code>?mode=live</code> on the DEV site.</p></Card></div>;

  const respond = async (id: string, response: 'accept' | 'reject') => {
    let reason: string | undefined;
    if (response === 'reject') { reason = prompt('Reason for rejecting (required)') ?? ''; if (!reason.trim()) return; }
    const r = await t.cmd({ type: 'vendorRespond', id, response, reason });
    if (r) t.toast(response === 'accept' ? 'Indent accepted — assign a vehicle under My trips' : 'Indent rejected');
  };
  return (
    <div className="space-y-4">
      <PageHead title="Vendor Portal" sub={vendor ? `${t.db.carriers[0]?.name ?? ''}` : 'Carrier view'} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Indents waiting" value={indents.length} tone="amber" /><Kpi label="Need a vehicle" value={trips.filter((s) => s.status === 'Accepted').length} tone="red" />
        <Kpi label="In transit" value={trips.filter((s) => s.status === 'In Transit').length} tone="blue" /><Kpi label="POD / invoice due" value={trips.filter((s) => s.status === 'Completed' && !invs.some((i) => i.sin === s.sin)).length + trips.filter((s) => s.receipt && !s.pod).length} tone="violet" />
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} counts={{ 'Indent inbox': indents.length }} />
      {tab === 'Indent inbox' && <div className="grid gap-3 md:grid-cols-2">{indents.length === 0 ? <Card><p className="hint">No indents waiting for you.</p></Card> : indents.map((i) => { const o = i.offers.find((x) => x.response === 'Pending')!; return (
        <Card key={i.id} title={`${city(i.fromLocId)} → ${city(i.toLocId)}`} right={<Pill tone="amber">Reply by {fmtDT(o.expiresAt)}</Pill>}>
          <div className="space-y-1 text-sm"><div><b>{i.vehicleType}</b> · {i.material} {i.qty} MT</div><div>Needed {fmtDT(i.requiredAt)}</div><div>Rate <b>{rateText(o)}</b>{o.per === 'KG' ? <span className="hint"> (≈ {inr(o.rate * i.qty * 1000)} on {i.qty} MT)</span> : null}</div></div>
          {vendor && <div className="mt-3 flex gap-2"><button className="btn-success" onClick={() => void respond(i.id, 'accept')}>Accept</button><button className="btn-danger" onClick={() => void respond(i.id, 'reject')}>Reject</button></div>}
        </Card>); })}</div>}
      {tab === 'My trips' && <Card pad={false}><Table rows={trips} rowKey={(s) => s.sin} onRow={(s) => setOpen(s.sin)} empty="No trips yet" cols={[
        { h: 'Trip', r: (s) => <b>{s.sin}</b> }, { h: 'Lane', r: (s) => `${city(s.fromLocId)} → ${city(s.toLocId)}` }, { h: 'Vehicle', r: (s) => s.vehicleNo }, { h: 'Status', r: (s) => <StatusPill s={s.status} /> },
        { h: 'Next step', r: (s) => s.status === 'Accepted' ? 'Assign vehicle' : s.status === 'Assigned' ? (s.loading ? (['NotNeeded', 'Approved'].includes(s.loading.approval) ? 'Depart' : 'Waiting for approval') : 'Waiting for loading check') : s.status === 'In Transit' ? 'Tracking' : s.receipt && !s.pod ? 'Upload POD' : s.pod && !invs.some((i) => i.sin === s.sin) ? 'Submit invoice' : '' },
        { h: 'ETA', r: (s) => (s.etaAt ? fmtDT(s.etaAt) : '—') },
      ]} /></Card>}
      {tab === 'Invoices' && <Card pad={false}><Table rows={invs} rowKey={(i) => i.id} empty="No invoices yet" cols={[
        { h: 'Invoice', r: (i) => <b>{i.invoiceNo}</b> }, { h: 'Trip', r: (i) => i.sin }, { h: 'Amount', r: (i) => inr(i.amount), align: 'right' }, { h: 'Variance', r: (i) => `${i.variancePct}%` },
        { h: 'Review', r: (i) => <Pill tone={i.review === 'Under Review' ? 'amber' : i.review === 'Rejected' ? 'red' : 'green'}>{i.review}</Pill> }, { h: 'Status', r: (i) => <StatusPill s={i.status} /> },
      ]} /></Card>}
      {open && (() => { const s = trips.find((x) => x.sin === open); return s ? <Modal wide title={`Trip ${s.sin}`} onClose={() => setOpen('')}><TripPanel s={s} /></Modal> : null; })()}
    </div>
  );
}
