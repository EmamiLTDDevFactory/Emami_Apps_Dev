'use client';

import React, { useState } from 'react';
import { useTms } from '../lib/store';
import { openFile } from '../lib/liveApi';
import { readUpload, type Upload } from '../lib/files';
import { Card, KV, Pill, StatusPill, fmtDT, inr } from './ui';
import type { Shipment, TripInvoice } from '../lib/types';

import Combobox from './Combobox';
/** One trip's outward-tracking work, shown to the roles that may do each part (the server enforces it again on every command). */
export default function TripPanel({ s }: { s: Shipment }) {
  const t = useTms();
  const vendor = t.me.roles.includes('Carrier Vendor');
  const staff = !vendor && t.can('trip.manage');
  const st = { ...({ capacityMinPct: 80, consentText: 'I agree that my vehicle position may be tracked for this trip.' } as const), ...(t.db.settings ?? {}) };
  const sapSim = t.liveState.integrations?.sap === 'simulated';
  const [busy, setBusy] = useState(false);
  const go = async (c: Record<string, unknown>, ok: string) => { setBusy(true); try { const r = await t.cmd(c); if (r !== undefined) t.toast(ok); return r; } finally { setBusy(false); } };
  const pick = async (e: React.ChangeEvent<HTMLInputElement>, imageOnly = false): Promise<Upload | undefined> => {
    const f = e.target.files?.[0]; if (!f) return undefined;
    try { return await readUpload(f, imageOnly); } catch (er) { t.toast((er as Error).message, 'err'); e.target.value = ''; return undefined; }
  };
  const view = (id: string, name: string) => openFile(id, name).catch((er) => t.toast((er as Error).message, 'err'));

  const [a, setA] = useState({ vehicleNo: '', driver: '', phone: '', consent: false });
  const [dl, setDl] = useState(''); const [man, setMan] = useState({ cartons: '', weightKg: '', volumeM3: '' });
  const [ecc, setEcc] = useState({ no: '', net: '', tax: '' });
  const [reason, setReason] = useState('');
  const [bill, setBill] = useState('');
  const [found, setFound] = useState<(TripInvoice & { delivery?: string; message?: string; ttSin?: string; ttVehicle?: string; instaVehicle?: string })[] | null>(null);
  const invNos = (s.invoices ?? []).map((i) => i.no);
  const saveInv = (nos: string[], ok: string) => go({ type: 'setTripInvoices', sin: s.sin, invoices: nos }, ok);
  const same = (a?: string, b?: string) => (a ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === (b ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const [dep, setDep] = useState<{ lr: string; seal: string; photo?: Upload }>({ lr: '', seal: '' });
  const [cp, setCp] = useState({ locId: '' });
  const [rc, setRc] = useState({ rec: '', dmg: '0', unl: '0', det: '0', remarks: '' });
  const [pod, setPod] = useState<Upload | undefined>();
  const [iv, setIv] = useState<{ no: string; date: string; amount: string; lr: string; file?: Upload }>({ no: '', date: new Date().toISOString().slice(0, 10), amount: '', lr: '' });

  const inv = t.db.invoices.find((i) => i.sin === s.sin && i.invoiceNo);
  const closed = s.status === 'Completed' || s.status === 'Cancelled';
  const preDepart = ['Accepted', 'Assigned'].includes(s.status) && !s.departedAt;
  const canDepart = s.status === 'Assigned' && s.loading && ['NotNeeded', 'Approved'].includes(s.loading.approval);
  const link = typeof window !== 'undefined' && s.trackToken ? `${window.location.origin}/apps/smartruck-tms/track/?t=${s.trackToken}` : '';
  const bar = (p: number) => <div className="h-2 w-full overflow-hidden rounded-full bg-appBg"><div className={`h-full ${p > 100 ? 'bg-red' : p < st.capacityMinPct ? 'bg-amber' : 'bg-green'}`} style={{ width: `${Math.min(100, p)}%` }} /></div>;
  const Btn = ({ children, onClick, kind = 'btn-primary', disabled }: { children: React.ReactNode; onClick: () => void; kind?: string; disabled?: boolean }) => <button className={kind} disabled={busy || disabled} onClick={onClick}>{children}</button>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KV k="Planned arrival" v={s.plannedArrival ? fmtDT(s.plannedArrival) : '—'} />
        <KV k="ETA" v={s.etaAt ? <span className="flex items-center gap-1.5">{fmtDT(s.etaAt)}{s.delayFlag && <Pill tone="red">Delayed {s.delayH} h</Pill>}</span> : '—'} />
        <KV k="LR / seal" v={s.lr ? `${s.lr}${s.sealNo ? ` / ${s.sealNo}` : ''}` : '—'} />
        <KV k="ECC shipment" v={s.eccShipmentNo ? <span>{s.eccShipmentNo} <span className="hint">{s.eccCost ? `${inr(s.eccCost.net + s.eccCost.tax)} (${s.eccCost.source})` : ''}</span></span> : <Pill tone="amber">Not linked</Pill>} />
        <KV k="Vehicle documents" v={s.ulipCheck ? <Pill tone={s.ulipCheck.simulated ? 'amber' : 'green'}>{s.ulipCheck.simulated ? 'ULIP simulated' : 'ULIP verified'}</Pill> : '—'} />
        <KV k="Driver consent" v={s.driverConsent ? `${s.driverConsent.version} · ${fmtDT(s.driverConsent.at)}` : '—'} />
      </div>

      {preDepart && (vendor || staff) && (
        <Card title={s.status === 'Assigned' ? 'Replace vehicle / driver' : 'Assign vehicle and driver'}>
          <div className="grid gap-2 md:grid-cols-3">
            <input className="input" placeholder="Vehicle no. e.g. AS01AB1234" value={a.vehicleNo} onChange={(e) => setA({ ...a, vehicleNo: e.target.value })} />
            <input className="input" placeholder="Driver name" value={a.driver} onChange={(e) => setA({ ...a, driver: e.target.value })} />
            <input className="input" placeholder="Driver mobile (10 digits)" inputMode="numeric" value={a.phone} onChange={(e) => setA({ ...a, phone: e.target.value })} />
          </div>
          <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={a.consent} onChange={(e) => setA({ ...a, consent: e.target.checked })} /><span>{st.consentText} <span className="hint">(driver has agreed — mandatory)</span></span></label>
          <div className="mt-3"><Btn onClick={() => void go({ type: 'vendorAssign', sin: s.sin, vehicleNo: a.vehicleNo, driver: a.driver, phone: a.phone, driverConsent: a.consent }, 'Vehicle assigned')}>Assign</Btn></div>
        </Card>
      )}

      {staff && !closed && s.indentId && (
        <Card title="Deliveries and ECC shipment">
          {s.deliveries?.length ? <div className="mb-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-inkSoft"><th className="py-1">Delivery</th><th>Ship-to</th><th>Cartons</th><th>Weight kg</th><th>Volume m³</th><th>Source</th><th>E-invoice / E-way</th></tr></thead><tbody>
            {s.deliveries.map((d) => <tr key={d.no} className="border-t border-border/60"><td className="py-1 font-bold">{d.no}</td><td>{d.shipTo}</td><td>{d.cartons}</td><td>{d.weightKg}</td><td>{d.volumeM3}</td><td><Pill tone={d.source === 'sap' ? 'green' : 'amber'}>{d.source}</Pill></td><td className="hint">{d.irn ? 'IRN ✓' : '—'} {d.ewbNo ? `· EWB ${d.ewbNo}${d.ewbValid ? ` till ${d.ewbValid}` : ''}` : ''}</td></tr>)}</tbody></table></div> : <p className="hint mb-3">No deliveries linked yet.</p>}
          <div className="grid gap-2 md:grid-cols-4">
            <input className="input md:col-span-2" placeholder="Delivery numbers, comma separated" value={dl} onChange={(e) => setDl(e.target.value)} />
            {sapSim && <><input className="input" placeholder="Cartons (each)" value={man.cartons} onChange={(e) => setMan({ ...man, cartons: e.target.value })} /><input className="input" placeholder="Weight kg (each)" value={man.weightKg} onChange={(e) => setMan({ ...man, weightKg: e.target.value })} /><input className="input" placeholder="Volume m³ (each)" value={man.volumeM3} onChange={(e) => setMan({ ...man, volumeM3: e.target.value })} /></>}
            <Btn kind="btn-ghost" onClick={() => { const nos = dl.split(/[\s,]+/).filter(Boolean); void go({ type: 'linkDeliveries', sin: s.sin, deliveries: nos, manual: sapSim ? nos.map((no) => ({ no, shipTo: '', cartons: Number(man.cartons), weightKg: Number(man.weightKg), volumeM3: Number(man.volumeM3) })) : undefined }, 'Deliveries linked'); }}>Link deliveries</Btn>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <input className="input" placeholder="ECC shipment no." value={ecc.no} onChange={(e) => setEcc({ ...ecc, no: e.target.value })} />
            {sapSim && t.can('indent.override') && <><input className="input" placeholder="Shipment cost (manual)" value={ecc.net} onChange={(e) => setEcc({ ...ecc, net: e.target.value })} /><input className="input" placeholder="Tax (manual)" value={ecc.tax} onChange={(e) => setEcc({ ...ecc, tax: e.target.value })} /></>}
            <Btn kind="btn-ghost" onClick={() => void go({ type: 'linkShipment', sin: s.sin, eccShipmentNo: ecc.no, manualNet: Number(ecc.net), manualTax: Number(ecc.tax || 0) }, 'ECC shipment linked')}>{s.eccShipmentNo ? 'Refresh cost' : 'Link shipment'}</Btn>
          </div>
        </Card>
      )}

      {staff && s.status !== 'Cancelled' && s.vehicleNo && s.vehicleNo !== '—' && (
        <Card title="Invoices on this vehicle" right={s.sapVehicle ? <Pill tone={s.sapVehicle.ok ? (s.sapVehicle.simulated ? 'amber' : 'green') : 'red'}>{s.sapVehicle.ok ? (s.sapVehicle.simulated ? 'SAP simulated' : `In SAP · ${fmtDT(s.sapVehicle.at)}`) : 'Not in SAP yet'}</Pill> : null}>
          <p className="hint mb-2">Replaces the Instavans step (ZSMART_VEH). During the parallel run Trip Trail keeps its own SAP record; the Instavans vehicle is shown only to compare.</p>
          {s.sapVehicle && !s.sapVehicle.ok && <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-red">{s.sapVehicle.message}<Btn kind="btn-ghost" onClick={() => void go({ type: 'syncTripVehicle', sin: s.sin }, 'Sent to SAP')}>Retry</Btn></div>}
          {s.invoices?.length ? <div className="mb-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-inkSoft"><th className="py-1">Billing doc</th><th>Date</th><th>Customer</th><th>Cases</th><th>Value</th><th>Gross / net kg</th><th>Instavans vehicle</th><th /></tr></thead><tbody>
            {s.invoices.map((i) => <tr key={i.no} className="border-t border-border/60"><td className="py-1 font-bold">{i.no}</td><td>{i.date}</td><td>{i.customer}</td><td>{i.cases}</td><td>{inr(i.value)}</td><td>{i.grossKg} / {i.netKg}</td>
              <td>{i.instavans ? <span>{i.instavans.vehicle} <Pill tone={same(i.instavans.vehicle, s.vehicleNo) ? 'green' : 'amber'}>{same(i.instavans.vehicle, s.vehicleNo) ? 'same' : 'different'}</Pill></span> : <span className="hint">—</span>}</td>
              <td>{!closed && <button className="btn-ghost !py-0.5 text-xs" disabled={busy} onClick={() => { if (confirm(`Remove ${i.no} from this vehicle?`)) void saveInv(invNos.filter((n) => n !== i.no), `${i.no} removed`); }}>Remove</button>}</td></tr>)}
            <tr className="border-t border-border font-bold"><td className="py-1">Total</td><td /><td /><td>{Math.round(s.invoices.reduce((a, i) => a + i.cases, 0) * 100) / 100}</td><td>{inr(s.invoices.reduce((a, i) => a + i.value, 0))}</td><td>{Math.round(s.invoices.reduce((a, i) => a + i.grossKg, 0) * 10) / 10} / {Math.round(s.invoices.reduce((a, i) => a + i.netKg, 0) * 10) / 10}</td><td /><td /></tr>
          </tbody></table></div> : <p className="mb-3 text-sm text-inkSoft">No invoices on this vehicle yet.</p>}
          {!closed && <div className="grid gap-2 md:grid-cols-4">
            <input className="input md:col-span-2" placeholder="Billing document numbers, comma separated" value={bill} onChange={(e) => setBill(e.target.value)} />
            <Btn onClick={() => { const add = bill.split(/[\s,]+/).filter(Boolean); void saveInv([...invNos, ...add], 'Invoices saved').then((r) => { if (r) setBill(''); }); }} disabled={!bill.trim()}>Add invoices</Btn>
            <Btn kind="btn-ghost" disabled={!s.deliveries?.length} onClick={async () => { setBusy(true); try { const r = await t.cmd<{ rows: NonNullable<typeof found> }>({ type: 'findTripInvoices', sin: s.sin }); if (r) setFound(r.rows); } finally { setBusy(false); } }}>Find from deliveries</Btn>
          </div>}
          {found && <div className="mt-3 rounded-lg border border-border p-2 text-sm">
            {found.length === 0 ? <p className="hint">The linked deliveries are not billed yet.</p> : <>
              {found.map((f) => <div key={f.no} className="flex flex-wrap items-center gap-2 py-0.5"><b>{f.no.replace(/^0+/, '')}</b><span className="hint">delivery {f.delivery?.replace(/^0+/, '')} · {f.cases} cases · {inr(f.value)}</span>
                {f.message ? <Pill tone="red">{f.message}</Pill> : f.ttSin ? <Pill tone="amber">on {f.ttVehicle}</Pill> : invNos.includes(f.no.replace(/^0+/, '')) ? <Pill tone="green">on this vehicle</Pill> : null}</div>)}
              <div className="mt-2 flex gap-2"><Btn onClick={() => { const add = found.filter((f) => !f.message && !f.ttSin).map((f) => f.no.replace(/^0+/, '')); void saveInv([...new Set([...invNos, ...add])], 'Invoices saved').then((r) => { if (r) setFound(null); }); }} disabled={!found.some((f) => !f.message && !f.ttSin && !invNos.includes(f.no.replace(/^0+/, '')))}>Add these to the vehicle</Btn><Btn kind="btn-ghost" onClick={() => setFound(null)}>Close</Btn></div></>}
          </div>}
        </Card>
      )}

      {(s.loading || (s.status === 'Assigned' && (vendor || (staff && s.deliveries?.length)))) && (
        <Card title="Loading check">
          {s.loading && <div className="mb-3 grid gap-3 md:grid-cols-3">
            <div><div className="mb-1 text-xs font-bold text-inkSoft">Weight {s.loading.weightPct}% · {s.loading.weightKg} kg</div>{bar(s.loading.weightPct)}</div>
            <div><div className="mb-1 text-xs font-bold text-inkSoft">Volume {s.loading.volumePct}% · {s.loading.volumeM3} m³</div>{bar(s.loading.volumePct)}</div>
            <div className="flex items-center gap-2"><b className="text-lg">{s.loading.effectivePct}%</b><Pill tone={s.loading.approval === 'Pending' || s.loading.approval === 'Rejected' ? 'amber' : 'green'}>{s.loading.approval === 'NotNeeded' ? 'OK' : s.loading.approval}</Pill>{s.loading.reason && <span className="hint">{s.loading.reason}</span>}</div>
          </div>}
          {staff && s.status === 'Assigned' && <div className="flex flex-wrap items-center gap-2"><input className="input max-w-md" placeholder={`Reason (needed if under ${st.capacityMinPct}% or over 100%)`} value={reason} onChange={(e) => setReason(e.target.value)} /><Btn kind="btn-ghost" onClick={() => void go({ type: 'loadingCheck', sin: s.sin, reason }, 'Loading checked')}>{s.loading ? 'Re-check' : 'Run check'}</Btn>
            {s.loading?.approval === 'Pending' && t.can('loading.approve') && <><Btn kind="btn-success" onClick={() => void go({ type: 'approveLoading', sin: s.sin, approve: true }, 'Approved')}>Approve</Btn><Btn kind="btn-danger" onClick={() => { const remark = prompt('Reason for rejecting'); if (remark) void go({ type: 'approveLoading', sin: s.sin, approve: false, remark }, 'Rejected'); }}>Reject</Btn></>}</div>}
          {vendor && s.loading?.approval === 'Pending' && <p className="hint">Waiting for the depot head to approve the load.</p>}
          {vendor && !s.loading && s.status === 'Assigned' && <p className="hint">Waiting for the depot to run the loading check.</p>}
        </Card>
      )}

      {s.status === 'Assigned' && (vendor || staff) && (
        <Card title="Departure">
          {!canDepart && <p className="hint mb-2">Departure opens after the loading check passes{s.loading?.approval === 'Pending' ? ' and is approved' : ''}.</p>}
          <div className="grid gap-2 md:grid-cols-4">
            <input className="input" placeholder="LR number" value={dep.lr} onChange={(e) => setDep({ ...dep, lr: e.target.value })} />
            <input className="input" placeholder="Seal no. (optional)" value={dep.seal} onChange={(e) => setDep({ ...dep, seal: e.target.value })} />
            <input className="input md:col-span-2" type="file" accept="image/png,image/jpeg" onChange={async (e) => setDep({ ...dep, photo: await pick(e, true) })} />
          </div>
          <div className="mt-3"><Btn disabled={!canDepart} onClick={() => void go({ type: 'vendorDepart', sin: s.sin, lrNo: dep.lr, sealNo: dep.seal, photo: dep.photo }, 'Trip departed')}>Confirm departure</Btn></div>
        </Card>
      )}

      {s.departedAt && (
        <Card title="Tracking" right={staff && link ? <button className="btn-ghost !py-1 text-xs" onClick={() => { void navigator.clipboard?.writeText(link); t.toast('Recipient link copied'); }}>Copy recipient link</button> : undefined}>
          {s.status === 'In Transit' && (vendor || staff) && <div className="mb-3 flex flex-wrap items-center gap-2">
            <Combobox className="w-64" ariaLabel="Checkpoint place" value={cp.locId} onChange={(v) => setCp({ ...cp, locId: v })} placeholder="Checkpoint at a known place…" options={t.db.locs.map((l) => ({ value: l.id, label: l.city, keywords: `${l.id} ${l.state ?? ''}` }))} />
            <Btn kind="btn-ghost" disabled={!cp.locId} onClick={() => void go({ type: 'vendorCheckpoint', sin: s.sin, locId: cp.locId }, 'Checkpoint added')}>Add manual checkpoint</Btn>
          </div>}
          {s.events?.length ? <ul className="space-y-1.5 text-sm">{[...s.events].reverse().slice(0, 12).map((e, i) => <li key={i} className="flex flex-wrap items-center gap-2"><Pill tone={e.source === 'ULIP' ? 'green' : e.source === 'Manual' ? 'amber' : 'gray'}>{e.source}</Pill><b>{e.place || `${e.lat.toFixed(2)}, ${e.lon.toFixed(2)}`}</b><span className="hint">{fmtDT(e.at)}{e.note ? ` · ${e.note}` : ''}</span></li>)}</ul> : <p className="hint">No tracking events yet.</p>}
        </Card>
      )}

      {staff && ['In Transit', 'At Delivery'].includes(s.status) && !s.receipt && (
        <Card title="Arrival and receipt">
          <div className="grid gap-2 md:grid-cols-5">
            <input className="input" placeholder="Cartons received" value={rc.rec} onChange={(e) => setRc({ ...rc, rec: e.target.value })} />
            <input className="input" placeholder="Damaged" value={rc.dmg} onChange={(e) => setRc({ ...rc, dmg: e.target.value })} />
            <input className="input" placeholder="Unloading ₹" value={rc.unl} onChange={(e) => setRc({ ...rc, unl: e.target.value })} />
            <input className="input" placeholder="Detention ₹" value={rc.det} onChange={(e) => setRc({ ...rc, det: e.target.value })} />
            <input className="input" placeholder="Remarks" value={rc.remarks} onChange={(e) => setRc({ ...rc, remarks: e.target.value })} />
          </div>
          <div className="mt-3"><Btn onClick={() => void go({ type: 'recordReceipt', sin: s.sin, cartonsReceived: Number(rc.rec), damagedQty: Number(rc.dmg), unloadingCharge: Number(rc.unl), detentionCharge: Number(rc.det), remarks: rc.remarks }, 'Receipt recorded')}>Record receipt</Btn></div>
        </Card>
      )}
      {s.receipt && (
        <Card title="Receipt">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KV k="Arrived" v={fmtDT(s.receipt.arrivedAt)} /><KV k="Dispatched / received / damaged" v={`${s.receipt.dispatched} / ${s.receipt.cartonsReceived} / ${s.receipt.damagedQty}`} /><KV k="Short" v={s.receipt.shortage ? <Pill tone="red">{s.receipt.shortage}</Pill> : '0'} />
            <KV k="Unloading / detention" v={`${inr(s.receipt.unloadingCharge)} / ${inr(s.receipt.detentionCharge)}`} /><KV k="Charges" v={<StatusPill s={s.receipt.chargesApproval === 'NotNeeded' ? 'Approved' : s.receipt.chargesApproval} />} /><KV k="Remarks" v={s.receipt.remarks} />
          </div>
          {s.receipt.chargesApproval === 'Pending' && t.can('charges.approve') && !vendor && <div className="mt-3 flex gap-2"><Btn kind="btn-success" onClick={() => void go({ type: 'approveCharges', sin: s.sin, approve: true }, 'Charges approved')}>Approve charges</Btn><Btn kind="btn-danger" onClick={() => void go({ type: 'approveCharges', sin: s.sin, approve: false }, 'Charges rejected')}>Reject</Btn></div>}
        </Card>
      )}

      {s.receipt && (vendor || staff) && (
        <Card title="Proof of delivery">
          {s.pod ? <div className="flex items-center gap-3 text-sm"><Pill tone="green">Uploaded</Pill><button className="underline" onClick={() => view(s.pod!.fileId, s.pod!.name)}>{s.pod.name}</button><span className="hint">{fmtDT(s.pod.at)} · {s.pod.by}</span></div>
            : <div className="flex flex-wrap items-center gap-2"><input className="input max-w-md" type="file" accept="application/pdf,image/png,image/jpeg" onChange={async (e) => setPod(await pick(e))} /><Btn disabled={!pod} onClick={() => void go({ type: 'vendorUploadPod', sin: s.sin, file: pod }, 'POD uploaded — trip closed')}>Upload POD and close trip</Btn></div>}
        </Card>
      )}

      {s.pod && (
        <Card title="Freight invoice">
          {inv ? <div className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2"><b>{inv.invoiceNo}</b><StatusPill s={inv.status} /><Pill tone={inv.review === 'Under Review' ? 'amber' : inv.review === 'Rejected' ? 'red' : 'green'}>{inv.review}</Pill><span>{inr(inv.amount)}</span><span className="hint">expected {inr(inv.expected ?? 0)} ({inv.basis}{inv.extras ? ` + ${inr(inv.extras)} charges` : ''}) · variance {inv.variancePct}%</span>{inv.fileId && <button className="underline" onClick={() => view(inv.fileId!, `invoice-${inv.invoiceNo}.pdf`)}>Open file</button>}{inv.mailedAt && <Pill tone="green">Mailed</Pill>}</div>
            {inv.review === 'Under Review' && t.can('invoice.review') && !vendor && <div className="flex gap-2"><Btn kind="btn-success" onClick={() => void go({ type: 'reviewFreightInvoice', id: inv.id, decision: 'approve' }, 'Variance accepted')}>Accept variance</Btn><Btn kind="btn-danger" onClick={() => { const remark = prompt('Reason for rejecting'); if (remark) void go({ type: 'reviewFreightInvoice', id: inv.id, decision: 'reject', remark }, 'Rejected'); }}>Reject</Btn></div>}
          </div> : (vendor || t.can('invoice.review')) ? <div className="space-y-2">
            <div className="grid gap-2 md:grid-cols-4"><input className="input" placeholder="Invoice no." value={iv.no} onChange={(e) => setIv({ ...iv, no: e.target.value })} /><input className="input" type="date" value={iv.date} onChange={(e) => setIv({ ...iv, date: e.target.value })} /><input className="input" placeholder="Amount ₹" value={iv.amount} onChange={(e) => setIv({ ...iv, amount: e.target.value })} /><input className="input" placeholder={`LR no. (${s.lr})`} value={iv.lr} onChange={(e) => setIv({ ...iv, lr: e.target.value })} /></div>
            <div className="flex flex-wrap items-center gap-2"><input className="input max-w-md" type="file" accept="application/pdf,image/png,image/jpeg" onChange={async (e) => setIv({ ...iv, file: await pick(e) })} /><Btn disabled={!iv.file} onClick={async () => { const r = await go({ type: 'vendorInvoice', sin: s.sin, invoiceNo: iv.no, invoiceDate: iv.date, amount: Number(iv.amount), lrNo: iv.lr, file: iv.file }, 'Invoice submitted'); if (r && (r as { within?: boolean }).within === false) t.toast('Outside tolerance — sent for HO review', 'err'); }}>Submit invoice</Btn></div>
          </div> : <p className="hint">No invoice yet.</p>}
        </Card>
      )}
      {!staff && !vendor && <p className="hint">Your role can view this trip but not change it.</p>}
    </div>
  );
}
