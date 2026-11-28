'use client';

import React, { useState } from 'react';
import { useTms } from '../../lib/store';
import { Card, Field, Modal, Pill, fmtDT, rateText } from '../ui';
import { itemLabel, normPhone, normVehicle, validateUnits } from '../../lib/indentModel';
import type { Indent, IndentItem, IndentUnit } from '../../lib/types';

type Entry = { indent: Indent; item: IndentItem };
const TONE: Record<string, string> = { Pending: 'amber', Submitted: 'green', Rejected: 'red', Expired: 'red', Cancelled: 'gray' };

/**
 * The transporter's pending requests (items of an indent addressed to its carrier). The summary is read-only; the ONLY inputs are
 * driver name, driver phone and vehicle number, one row per vehicle. `editable` is false for staff looking at the portal.
 */
export function PendingRequests({ entries, editable }: { entries: Entry[]; editable: boolean }) {
  const t = useTms();
  const city = (id: string) => t.db.locs.find((l) => l.id === id)?.city ?? id;
  const [grid, setGrid] = useState<Record<string, IndentUnit[]>>({});
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState('');
  const [rej, setRej] = useState<Entry | null>(null);
  const [reason, setReason] = useState('');
  const keyOf = (e: Entry) => itemLabel(e.indent.id, e.item.itemNo);
  const rowsOf = (e: Entry): IndentUnit[] => grid[keyOf(e)] ?? Array.from({ length: e.item.vehicles }, () => ({ driver: '', phone: '', vehicleNo: '' }));
  const setCell = (e: Entry, i: number, p: Partial<IndentUnit>) => setGrid((g) => ({ ...g, [keyOf(e)]: rowsOf(e).map((u, k) => (k === i ? { ...u, ...p } : u)) }));

  const send = async (e: Entry) => {
    const k = keyOf(e); setShown((s) => ({ ...s, [k]: true }));
    const units = rowsOf(e).map((u) => ({ driver: u.driver.trim(), phone: normPhone(u.phone), vehicleNo: normVehicle(u.vehicleNo) }));
    if (!validateUnits(units, e.item.vehicles).ok) return;
    setBusy(k);
    const r = await t.cmd({ type: 'vendorSubmitItem', id: e.indent.id, itemNo: e.item.itemNo, units });
    setBusy('');
    if (r) { t.toast(`${k}: details sent to Emami`); setGrid((g) => { const n = { ...g }; delete n[k]; return n; }); }
  };
  const reject = async () => {
    if (!rej || !reason.trim()) return;
    const r = await t.cmd({ type: 'vendorRejectItem', id: rej.indent.id, itemNo: rej.item.itemNo, reason: reason.trim() });
    if (r) { t.toast(`${keyOf(rej)} rejected`); setRej(null); setReason(''); }
  };

  if (!entries.length) return <Card><p className="hint">No pending requests for you.</p></Card>;
  return (
    <div className="grid gap-3 lg:grid-cols-2" data-testid="pending-requests">
      {entries.map((e) => {
        const k = keyOf(e), v = validateUnits(rowsOf(e), e.item.vehicles), show = !!shown[k];
        return (
          <Card key={k} title={<span>{k} <span className="font-semibold text-inkSoft">· {city(e.indent.fromLocId)} → {city(e.indent.toLocId)}</span></span>} right={<Pill tone="amber">Reply by {fmtDT(e.item.expiresAt)}</Pill>}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div><dt className="hint">Vehicle type</dt><dd className="font-bold">{e.indent.vehicleType}</dd></div>
              <div><dt className="hint">Material</dt><dd className="font-bold">{e.indent.material || '—'}</dd></div>
              <div><dt className="hint">No. of cases</dt><dd className="font-bold">{e.item.cases}</dd></div>
              <div><dt className="hint">No. of vehicles</dt><dd className="font-bold">{e.item.vehicles}</dd></div>
              <div><dt className="hint">Quantity</dt><dd className="font-bold">{e.item.qty} MT</dd></div>
              <div><dt className="hint">Required</dt><dd className="font-bold">{fmtDT(e.item.requiredAt)}</dd></div>
              {e.item.rate ? <div className="col-span-2"><dt className="hint">Your rate</dt><dd className="font-bold">{rateText(e.item)}</dd></div> : null}
            </dl>
            {editable ? <div className="mt-3 space-y-2">
              <div className="text-xs font-extrabold uppercase tracking-wide text-inkSoft">Driver and vehicle — fill one row per vehicle</div>
              {rowsOf(e).map((u, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Field label={`Driver name${e.item.vehicles > 1 ? ` (vehicle ${i + 1})` : ''}`}><input className="input" aria-label={`Driver name ${k} ${i + 1}`} value={u.driver} onChange={(ev) => setCell(e, i, { driver: ev.target.value })} /></Field>
                  <Field label="Driver phone number"><input className="input" inputMode="tel" aria-label={`Driver phone ${k} ${i + 1}`} value={u.phone} onChange={(ev) => setCell(e, i, { phone: ev.target.value })} /></Field>
                  <Field label="Vehicle number"><input className="input uppercase" placeholder="AS01AB1234" aria-label={`Vehicle number ${k} ${i + 1}`} value={u.vehicleNo} onChange={(ev) => setCell(e, i, { vehicleNo: ev.target.value })} /></Field>
                  {show && v.rowErrors[i] && <div className="text-xs font-bold text-red sm:col-span-3">{v.rowErrors[i]}</div>}
                </div>))}
              {show && v.errors.map((m) => <div key={m} className="text-xs font-bold text-red">{m}</div>)}
              <div className="flex gap-2 pt-1"><button className="btn-success" disabled={busy === k} onClick={() => void send(e)}>{busy === k ? 'Sending…' : 'Send to Emami'}</button><button className="btn-danger" onClick={() => { setRej(e); setReason(''); }}>Reject</button></div>
            </div> : <p className="hint mt-3">Only the transporter's own login can fill the driver and vehicle details.</p>}
          </Card>);
      })}
      {rej && <Modal title={`Reject ${keyOf(rej)}`} onClose={() => setRej(null)} footer={<button className="btn-danger" disabled={!reason.trim()} onClick={() => void reject()}>Reject request</button>}>
        <Field label="Reason (required)"><textarea className="input" rows={3} value={reason} onChange={(ev) => setReason(ev.target.value)} /></Field>
        <p className="hint mt-2">Emami logistics is told straight away so the quantity can be given to another transporter.</p>
      </Modal>}
    </div>
  );
}

/** The transporter's answered requests, read-only. */
export function RequestHistory({ entries }: { entries: Entry[] }) {
  const t = useTms();
  const city = (id: string) => t.db.locs.find((l) => l.id === id)?.city ?? id;
  if (!entries.length) return null;
  return (
    <Card title="Answered requests" pad={false}>
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm" data-testid="request-history">
        <thead><tr className="bg-appBg text-left text-xs text-inkSoft"><th className="px-3 py-2">Request</th><th>Lane</th><th>Cases · vehicles · qty</th><th>Status</th><th>Vehicles sent</th></tr></thead>
        <tbody>{entries.map(({ indent, item }) => (
          <tr key={itemLabel(indent.id, item.itemNo)} className="border-t border-border/60 align-top">
            <td className="px-3 py-2 font-bold">{itemLabel(indent.id, item.itemNo)}</td><td>{city(indent.fromLocId)} → {city(indent.toLocId)}</td><td>{item.cases} · {item.vehicles} · {item.qty} MT</td>
            <td><Pill tone={TONE[item.status] ?? 'gray'}>{item.status}</Pill>{item.rejectReason ? <div className="hint">{item.rejectReason}</div> : null}</td>
            <td className="text-xs">{item.units.length ? item.units.map((u) => `${u.vehicleNo} · ${u.driver} · ${u.phone}`).join(' | ') : '—'}</td>
          </tr>))}</tbody>
      </table></div>
    </Card>);
}
