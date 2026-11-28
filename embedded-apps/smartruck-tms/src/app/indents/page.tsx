'use client';

import React, { useState } from 'react';
import { useTms } from '../../lib/store';
import CreateIndent from '../../components/indent/CreateIndent';
import ReOffer from '../../components/indent/ReOffer';
import Combobox from '../../components/Combobox';
import { carrierLabelOf, carrierOptions } from '../../lib/labels';
import { Card, Field, Kpi, Modal, PageHead, Pill, StatusPill, Tabs, fmtDT, inr, rateText } from '../../components/ui';
import { itemLabel, lostItems, mailLabel, needsHo } from '../../lib/indentModel';
import type { Indent, IndentItem } from '../../lib/types';

const TABS = ['Open', 'Escalated', 'Allocated', 'All'] as const;
const ITEM_TONE: Record<string, string> = { Pending: 'amber', Submitted: 'green', Rejected: 'red', Expired: 'red', Cancelled: 'gray' };

export default function IndentsPage() {
  const t = useTms();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Open');
  const [form, setForm] = useState(false);
  const [sel, setSel] = useState<Indent | null>(null);
  const [cancelFor, setCancelFor] = useState<Indent | null>(null);
  const [reoffer, setReoffer] = useState<{ indent: Indent; item: IndentItem } | null>(null);
  const [reason, setReason] = useState('');
  const [off, setOff] = useState('');
  const lanes = t.db.lanes ?? [], indents = t.db.indents ?? [];
  const mine = t.scoped(indents);
  const city = (id: string) => t.db.locs.find((l) => l.id === id)?.city ?? id;
  const carrier = (id: string) => carrierLabelOf(t.db.carriers, id);
  const isAllocated = (i: Indent) => i.status === 'Allocated' || i.status === 'Partly allocated' || i.status === 'Vehicle Assigned';
  // Open = still waiting on a transporter (a Pending line, or a legacy offer out); Escalated = HO has a rejected / expired line or nobody left to offer; Allocated = something is submitted.
  const isOpen = (i: Indent) => i.status !== 'Cancelled' && (i.items?.length ? i.items.some((x) => x.status === 'Pending') : i.status === 'Open' && !i.escalated);
  const isHo = (i: Indent) => i.status !== 'Cancelled' && needsHo(i);
  const rows = mine.filter((i) => tab === 'All' || (tab === 'Open' ? isOpen(i) : tab === 'Escalated' ? isHo(i) : isAllocated(i)));

  const cancel = async () => {
    if (!cancelFor || !reason.trim()) return;
    const r = await t.cmd({ type: 'cancelIndent', id: cancelFor.id, reason: reason.trim() });
    if (r) { t.toast('Indent cancelled'); setCancelFor(null); setReason(''); setSel(null); }
  };

  const itemRow = (i: Indent, it: IndentItem) => (
    <tr key={`${i.id}-${it.itemNo}`} className={`border-t border-border/50 text-[13px] ${(it.status === 'Rejected' || it.status === 'Expired') && !it.replacedBy ? 'bg-redBg' : 'bg-white'}`}>
      <td className="py-1.5 pl-8 pr-2 font-bold text-inkSoft">{itemLabel(i.id, it.itemNo)}</td>
      <td className="pr-2 font-semibold">{carrier(it.carrierId)}</td>
      <td className="pr-2">{it.cases} cases · {it.vehicles} veh · {it.qty} MT</td>
      <td className="pr-2">{fmtDT(it.requiredAt)}</td>
      <td className="pr-2"><Pill tone={it.replacedBy ? 'gray' : ITEM_TONE[it.status] ?? 'gray'}>{it.status}</Pill></td>
      <td className="pr-2">{(() => { const m = mailLabel(it.mail); return <Pill tone={m.tone}>{m.text}</Pill>; })()}</td>
      <td className="pr-2 text-xs">{it.replacedBy ? <span className="text-inkSoft">replaced by {itemLabel(i.id, it.replacedBy)}</span> : it.status === 'Rejected' || it.status === 'Expired' ? <span className="flex flex-wrap items-center gap-2"><span className="font-bold text-red">{it.status === 'Rejected' ? `HO action — ${it.rejectReason ?? 'rejected'}` : 'HO action — no reply in time'}</span>{t.can('indent.override') && i.status !== 'Cancelled' && <button className="btn-ghost !px-2 !py-0.5 text-xs" onClick={(ev) => { ev.stopPropagation(); setReoffer({ indent: i, item: it }); }}>Re-offer to another transporter</button>}</span> : it.status === 'Submitted' ? `${it.units.length} vehicle${it.units.length === 1 ? '' : 's'} sent` : ''}</td>
    </tr>
  );

  return (
    <div className="space-y-4">
      <PageHead title="Indents" sub="Raise a vehicle requirement and split it across transporters; each transporter gets only its own line" right={t.can('indent.create') && <button className="btn-primary" onClick={() => setForm(true)}>New indent</button>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Open" value={mine.filter(isOpen).length} tone="amber" /><Kpi label="Needs HO" value={mine.filter(isHo).length} tone="red" />
        <Kpi label="Allocated" value={mine.filter((i) => i.status === 'Allocated' || i.status === 'Partly allocated').length} tone="violet" /><Kpi label="Vehicle assigned" value={mine.filter((i) => i.status === 'Vehicle Assigned').length} tone="green" />
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <Card pad={false}>
        {rows.length === 0 ? <p className="p-6 text-sm text-inkSoft">{lanes.length ? 'No indents here' : 'No lanes yet — HO adds lanes under Settings → Outward Rules'}</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm" data-testid="indent-table">
            <thead><tr className="bg-appBg text-left text-xs text-inkSoft"><th className="px-3 py-2">Indent / item</th><th>Lane / transporter</th><th>Cases · vehicles · qty</th><th>Required</th><th>Status</th><th>Mail</th><th /></tr></thead>
            <tbody>{rows.map((i) => (
              <React.Fragment key={i.id}>
                <tr className="cursor-pointer border-t border-border hover:bg-cream" onClick={() => setSel(i)}>
                  <td className="px-3 py-2 font-extrabold">{i.id}</td>
                  <td>{city(i.fromLocId)} → {city(i.toLocId)} <span className="hint">· {i.vehicleType}</span></td>
                  <td>{i.cases !== undefined ? `${i.cases} cases · ` : ''}{i.vehicles} veh · {i.qty} MT</td>
                  <td>{fmtDT(i.requiredAt)}</td>
                  <td><StatusPill s={i.status} /></td>
                  <td className="hint">{i.items?.length ? `${i.items.length} item${i.items.length === 1 ? '' : 's'}` : (() => { const o = i.offers[i.offers.length - 1]; return o ? `${carrier(o.carrierId)} · ${o.response}` : '—'; })()}</td>
                  <td>{needsHo(i) && i.status !== 'Cancelled' && <Pill tone="red">HO action</Pill>}</td>
                </tr>
                {(i.items ?? []).map((it) => itemRow(i, it))}
              </React.Fragment>))}</tbody>
          </table></div>)}
      </Card>

      {form && <CreateIndent onClose={() => setForm(false)} onDone={(id, n, mails) => { const miss = mails.filter((m) => m.error).length, sim = mails.filter((m) => m.simulated && !m.sent).length, sent = mails.filter((m) => m.sent).length; t.toast(`Indent ${id} raised with ${n} transporter item${n === 1 ? '' : 's'} — mail: ${sent} sent${sim ? `, ${sim} not sent (simulated)` : ''}${miss ? `, ${miss} without e-mail` : ''}`); setForm(false); }} />}

      {sel && (() => { const i = indents.find((x) => x.id === sel.id) ?? sel; const lost = lostItems(i); return (
        <Modal wide title={`Indent ${i.id}`} onClose={() => setSel(null)} footer={<>
          {t.can('indent.cancel') && ['Open', 'Allocated', 'Partly allocated'].includes(i.status) && <button className="btn-danger" onClick={() => { setCancelFor(i); setReason(''); }}>Cancel indent</button>}
        </>}>
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2"><StatusPill s={i.status} />{needsHo(i) && i.status !== 'Cancelled' && <Pill tone="red">HO action needed</Pill>}{i.sin && <Pill tone="green">Shipment {i.sin}</Pill>}</div>
            <div>{city(i.fromLocId)} → {city(i.toLocId)} · {i.vehicleType} · {i.material || '—'} · {i.cases !== undefined ? `${i.cases} cases · ` : ''}{i.vehicles} vehicle{i.vehicles === 1 ? '' : 's'} · {i.qty} MT · first needed {fmtDT(i.requiredAt)}{i.deliveries.length ? ` · deliveries ${i.deliveries.join(', ')}` : ''}</div>
            {i.items?.length ? <>
              {lost.length > 0 && <div className="rounded-xl bg-redBg p-3 text-xs font-bold text-red">{lost.map((x: IndentItem) => `${itemLabel(i.id, x.itemNo)} ${carrier(x.carrierId)}: ${x.status === 'Rejected' ? `rejected — ${x.rejectReason ?? ''}` : 'no reply in time'}`).join(' · ')} — HO to re-allocate that quantity.</div>}
              <div className="overflow-x-auto"><table className="w-full min-w-[640px]"><thead><tr className="text-left text-xs text-inkSoft"><th className="py-1">Item</th><th>Transporter</th><th>Cases</th><th>Veh.</th><th>Qty</th><th>Rate</th><th>Required</th><th>Status</th><th>Mail</th></tr></thead><tbody>
                {i.items.map((it) => { const m = mailLabel(it.mail); return (
                  <React.Fragment key={it.itemNo}>
                    <tr className="border-t border-border/60"><td className="py-1 font-bold">{itemLabel(i.id, it.itemNo)}</td><td>{carrier(it.carrierId)}</td><td>{it.cases}</td><td>{it.vehicles}</td><td>{it.qty}</td><td>{it.rate ? rateText(it) : '—'}</td><td>{fmtDT(it.requiredAt)}</td><td><Pill tone={it.replacedBy ? 'gray' : ITEM_TONE[it.status] ?? 'gray'}>{it.status}</Pill>{it.replacedBy ? <div className="hint">replaced by {itemLabel(i.id, it.replacedBy)}</div> : null}{!it.replacedBy && (it.status === 'Rejected' || it.status === 'Expired') && t.can('indent.override') && i.status !== 'Cancelled' ? <button className="btn-ghost !px-2 !py-0.5 mt-1 text-xs" onClick={() => setReoffer({ indent: i, item: it })}>Re-offer to another transporter</button> : null}</td><td><Pill tone={m.tone}>{m.text}</Pill>{it.mail?.to ? <span className="hint"> {it.mail.to}</span> : null}</td></tr>
                    {it.units.length > 0 && <tr><td /><td colSpan={8} className="pb-2 text-xs text-inkSoft">{it.units.map((u) => `${u.vehicleNo} · ${u.driver} · ${u.phone}`).join('   |   ')}{it.sins?.length ? `   →   ${it.sins.join(', ')}` : ''}</td></tr>}
                  </React.Fragment>); })}</tbody></table></div></> : <>
              <table className="w-full"><thead><tr className="text-left text-xs text-inkSoft"><th className="py-1">Vendor</th><th>Offered</th><th>Rate</th><th>Response</th></tr></thead><tbody>
                {i.offers.map((o, k) => <tr key={k} className="border-t border-border/60"><td className="py-1 font-bold">{carrier(o.carrierId)}</td><td>{fmtDT(o.offeredAt)}</td><td>{inr(o.rate)}</td><td>{o.response}{o.reason ? ` — ${o.reason}` : ''}</td></tr>)}</tbody></table>
              {i.status === 'Open' && t.can('indent.override') && <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3"><Combobox className="w-72" ariaLabel="Offer to a vendor" value={off} onChange={setOff} placeholder="Offer to a vendor…" options={carrierOptions(t.db.carriers.filter((c) => !c.blocked))} /><button className="btn-primary" disabled={!off} onClick={() => void t.cmd({ type: 'offerIndent', id: i.id, carrierId: off }).then((r) => { if (r) { t.toast('Offered'); setOff(''); } })}>Offer</button></div>}
            </>}
          </div>
        </Modal>); })()}

      {reoffer && <ReOffer indent={reoffer.indent} item={reoffer.item} onClose={() => setReoffer(null)} onDone={(msg) => { t.toast(msg); setReoffer(null); }} />}

      {cancelFor && <Modal title={`Cancel indent ${cancelFor.id}`} onClose={() => setCancelFor(null)} footer={<button className="btn-danger" disabled={!reason.trim()} onClick={() => void cancel()}>Cancel indent</button>}>
        <Field label="Reason (required)"><textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <p className="hint mt-2">All pending lines are cancelled; vehicles already sent by a transporter have their shipments cancelled.</p>
      </Modal>}
    </div>
  );
}
