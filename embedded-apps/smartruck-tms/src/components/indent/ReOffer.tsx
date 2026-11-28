'use client';

import React, { useMemo, useState } from 'react';
import { useTms } from '../../lib/store';
import Combobox from '../Combobox';
import { Field, Modal, rateText } from '../ui';
import { carrierLabel } from '../../lib/labels';
import { itemLabel, rankedCarriers } from '../../lib/indentModel';
import type { Indent, IndentItem } from '../../lib/types';

const p2 = (n: number) => String(n).padStart(2, '0');
const toLocal = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };

/** HO gives a rejected / expired line to another transporter: same cases / vehicles / quantity / time prefilled, a new item number on the same indent. */
export default function ReOffer({ indent, item, onClose, onDone }: { indent: Indent; item: IndentItem; onClose: () => void; onDone: (text: string) => void }) {
  const t = useTms();
  const [carrierId, setCarrierId] = useState('');
  const [f, setF] = useState({ cases: String(item.cases), vehicles: String(item.vehicles), qty: String(item.qty), requiredAt: Date.parse(item.requiredAt) > t.now ? toLocal(item.requiredAt) : '' });
  const [busy, setBusy] = useState(false);
  const live = new Set((indent.items ?? []).filter((i) => (i.status === 'Pending' || i.status === 'Submitted') && !('replacedBy' in i && i.replacedBy)).map((i) => i.carrierId));
  const choices = useMemo(() => rankedCarriers(t.db, indent.laneId, indent.vehicleType, indent.shippingType ?? '').filter(({ carrier }) => carrier && !live.has(carrier.id) && carrier.id !== item.carrierId), [t.db, indent, item]); // eslint-disable-line react-hooks/exhaustive-deps
  const picked = t.db.carriers.find((c) => c.id === carrierId);
  const bad = !carrierId ? 'Choose a transporter.' : !(Number(f.cases) >= 0) || !Number.isInteger(Number(f.cases)) || f.cases === '' ? 'No. of cases must be a whole number, 0 or more.' : !(Number(f.vehicles) >= 1) || !Number.isInteger(Number(f.vehicles)) ? 'No. of vehicles must be a whole number, 1 or more.' : !(Number(f.qty) > 0) ? 'Quantity (MT) must be more than 0.' : !(Date.parse(f.requiredAt) > t.now) ? 'Enter a required date and time in the future.' : '';

  const go = async () => {
    if (bad) return;
    setBusy(true);
    const r = await t.cmd<{ itemNo: number; mails?: { sent: boolean; simulated?: boolean; error?: string }[] }>({ type: 'addIndentItem', id: indent.id, replaces: item.itemNo, allocation: { carrierId, cases: Number(f.cases), vehicles: Number(f.vehicles), qty: Number(f.qty), requiredAt: new Date(f.requiredAt).toISOString() } });
    setBusy(false);
    if (r) onDone(`${itemLabel(indent.id, r.itemNo)} offered to ${picked ? carrierLabel(picked) : carrierId} (replaces ${itemLabel(indent.id, item.itemNo)})${r.mails?.[0]?.error ? ' — no e-mail on file' : ''}`);
  };

  return (
    <Modal title={`Re-offer ${itemLabel(indent.id, item.itemNo)} to another transporter`} onClose={onClose} footer={<button className="btn-primary" disabled={busy || !!bad} onClick={() => void go()}>{busy ? 'Offering…' : 'Offer to transporter'}</button>}>
      <div className="space-y-3 text-sm">
        <p className="hint">{item.status === 'Rejected' ? `Rejected${item.rejectReason ? `: ${item.rejectReason}` : ''}.` : 'No reply in time.'} The new line keeps this indent number; the old line stops counting.</p>
        <Field label="Transporter"><Combobox ariaLabel="Transporter" value={carrierId} onChange={setCarrierId} placeholder="Type code or name…"
          options={choices.map(({ carrier, rate }) => ({ value: carrier!.id, label: carrierLabel(carrier), keywords: carrier!.shortName, hint: `${rate ? rateText(rate) : 'no lane rate'}${carrier!.email ? '' : ' · no e-mail'}` }))} /></Field>
        {picked && !picked.email && <div className="rounded-xl bg-amber/10 p-2 text-xs font-bold text-amber">No e-mail on file for {carrierLabel(picked)}: they will not receive the mail. Add it under Carriers.</div>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="No. of cases"><input className="input" inputMode="numeric" value={f.cases} onChange={(e) => setF({ ...f, cases: e.target.value })} /></Field>
          <Field label="No. of vehicles"><input className="input" inputMode="numeric" value={f.vehicles} onChange={(e) => setF({ ...f, vehicles: e.target.value })} /></Field>
          <Field label="Quantity (MT)"><input className="input" inputMode="decimal" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></Field>
        </div>
        <Field label="Required date and time"><input className="input" type="datetime-local" value={f.requiredAt} onChange={(e) => setF({ ...f, requiredAt: e.target.value })} /></Field>
        {bad && <div className="text-xs font-bold text-red">{bad}</div>}
      </div>
    </Modal>
  );
}
