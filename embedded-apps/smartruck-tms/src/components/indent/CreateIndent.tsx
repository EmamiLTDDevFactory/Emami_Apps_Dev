'use client';

import React, { useMemo, useState } from 'react';
import { useTms } from '../../lib/store';
import Combobox from '../Combobox';
import { Field, Modal, rateText } from '../ui';
import { carrierLabel } from '../../lib/labels';
import { MAX_ALLOCATIONS, buildCreateCommand, emptyRow, rankedCarriers, remaining, totals, validateIndentForm } from '../../lib/indentModel';

type Row = { carrierId: string; cases: string; vehicles: string; qty: string; requiredAt: string };

/** New indent: lane + vehicle type, then one line per transporter (cases, vehicles, quantity, required time). Same indent number, one item per line. */
export default function CreateIndent({ onClose, onDone }: { onClose: () => void; onDone: (indentId: string, items: number, mails: { sent: boolean; simulated?: boolean; error?: string }[]) => void }) {
  const t = useTms();
  const lanes = t.db.lanes ?? [], vts = t.db.vehicleTypes ?? [];
  const city = (id: string) => t.db.locs.find((l) => l.id === id)?.city ?? id;
  const [f, setF] = useState({ laneId: '', vehicleType: '', shippingType: '01', material: '', deliveries: '' });
  const [targets, setTargets] = useState({ cases: '', vehicles: '', qty: '' });
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);

  const ranked = useMemo(() => rankedCarriers(t.db, f.laneId, f.vehicleType, f.shippingType), [t.db, f.laneId, f.vehicleType, f.shippingType]);
  const v = validateIndentForm({ laneId: f.laneId, vehicleType: f.vehicleType, rows, targets, now: t.now });
  const tot = totals(rows), rem = remaining(targets, tot);
  const setRow = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const taken = (i: number) => new Set(rows.filter((_, k) => k !== i).map((r) => r.carrierId).filter(Boolean));
  const lanePick = rankedFirst(ranked);
  const noMail = rows.map((r) => t.db.carriers.find((c) => c.id === r.carrierId)).filter((c): c is NonNullable<typeof c> => !!c && !c.email).map((c) => carrierLabel(c));

  const submit = async () => {
    setShown(true);
    if (!v.ok) return;
    setBusy(true);
    const r = await t.cmd<{ indentId: string; items?: { itemNo: number }[]; mails?: { sent: boolean; simulated?: boolean; error?: string }[] }>(buildCreateCommand({ unitId: t.unitId, ...f, rows, targets }));
    setBusy(false);
    if (r) onDone(r.indentId, r.items?.length ?? rows.length, r.mails ?? []);
  };

  const remChip = (k: 'cases' | 'vehicles' | 'qty') => rem[k] === null ? null : <span className={`ml-2 text-xs font-bold ${rem[k] === 0 ? 'text-green' : 'text-amber'}`}>{rem[k] === 0 ? 'fully distributed' : rem[k]! > 0 ? `${rem[k]} remaining` : `${-rem[k]!} over`}</span>;

  return (
    <Modal wide title="New indent" onClose={onClose} footer={<>
      {shown && !v.ok && <span className="mr-auto text-xs font-bold text-red">Fix the highlighted items to raise the indent.</span>}
      <button className="btn-primary" disabled={busy || (shown && !v.ok)} onClick={submit}>{busy ? 'Raising…' : `Raise indent${rows.length > 1 ? ` (${rows.length} transporters)` : ''}`}</button>
    </>}>
      {!lanes.length || !vts.length ? <p className="text-sm">HO must first add lanes and vehicle types (Settings → Outward Rules).</p> : <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Lane"><Combobox ariaLabel="Lane" value={f.laneId} onChange={(v) => setF({ ...f, laneId: v })} options={lanes.map((l) => ({ value: l.id, label: `${city(l.fromLocId)} → ${city(l.toLocId)}`, keywords: `${l.fromLocId} ${l.toLocId}` }))} /></Field>
          <Field label="Vehicle type"><Combobox ariaLabel="Vehicle type" value={f.vehicleType} onChange={(v) => setF({ ...f, vehicleType: v })} options={vts.map((x) => ({ value: x.code, label: `${x.name} (${x.maxWeightKg} kg)`, keywords: x.code }))} /></Field>
          <Field label="Shipping type"><select className="input" value={f.shippingType} onChange={(e) => setF({ ...f, shippingType: e.target.value })}><option value="">Any</option>{Object.entries({ '01': 'Truck', '03': 'Train', ...(t.db.sapTexts?.shipping ?? {}) }).map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></Field>
          <Field label="Material"><input className="input" value={f.material} onChange={(e) => setF({ ...f, material: e.target.value })} /></Field>
          <Field label="Outbound delivery numbers (optional)" className="md:col-span-2"><input className="input" placeholder="comma separated" value={f.deliveries} onChange={(e) => setF({ ...f, deliveries: e.target.value })} /></Field>
        </div>

        <div className="rounded-xl border border-border bg-appBg/60 p-3">
          <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-inkSoft">Total required <span className="font-semibold normal-case">(optional: type a target, then distribute it across the transporters)</span></div>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="No. of cases"><div className="flex items-center"><input className="input" inputMode="numeric" placeholder={String(tot.cases)} value={targets.cases} onChange={(e) => setTargets({ ...targets, cases: e.target.value })} />{remChip('cases')}</div></Field>
            <Field label="No. of vehicles"><div className="flex items-center"><input className="input" inputMode="numeric" placeholder={String(tot.vehicles)} value={targets.vehicles} onChange={(e) => setTargets({ ...targets, vehicles: e.target.value })} />{remChip('vehicles')}</div></Field>
            <Field label="Quantity (MT)"><div className="flex items-center"><input className="input" inputMode="decimal" placeholder={String(tot.qty)} value={targets.qty} onChange={(e) => setTargets({ ...targets, qty: e.target.value })} />{remChip('qty')}</div></Field>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between"><div className="text-sm font-extrabold">Transporters <span className="hint font-semibold">same indent number, one item per line</span></div>
            <button className="btn-ghost" disabled={rows.length >= MAX_ALLOCATIONS} onClick={() => setRows((rs) => [...rs, emptyRow(rs[rs.length - 1]?.requiredAt ?? '')])}>+ Add transporter</button></div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[820px] text-sm">
              <thead><tr className="bg-appBg text-left text-xs text-inkSoft"><th className="px-2 py-2">Item</th><th>Transporter</th><th>No. of cases</th><th>No. of vehicles</th><th>Qty (MT)</th><th>Required date &amp; time</th><th /></tr></thead>
              <tbody>
                {rows.map((r, i) => { const err = shown ? v.rowErrors[i] : ''; const used = taken(i); return (
                  <React.Fragment key={i}>
                    <tr className={`border-t border-border/60 align-top ${err ? 'bg-redBg' : ''}`}>
                      <td className="px-2 py-2 font-bold">{(i + 1) * 10}</td>
                      <td className="py-2 pr-2"><Combobox ariaLabel={`Transporter for item ${(i + 1) * 10}`} minWidth={260} value={r.carrierId} onChange={(v) => setRow(i, { carrierId: v })} placeholder="Type code or name…"
                        options={ranked.map(({ carrier, rate }) => ({ value: carrier!.id, label: carrierLabel(carrier), keywords: carrier!.shortName, disabled: used.has(carrier!.id), hint: `${rate ? rateText(rate) : 'no lane rate'}${carrier!.email ? '' : ' · no e-mail'}` }))} /></td>
                      <td className="py-2 pr-2"><input className="input w-24" inputMode="numeric" value={r.cases} onChange={(e) => setRow(i, { cases: e.target.value })} /></td>
                      <td className="py-2 pr-2"><input className="input w-20" inputMode="numeric" value={r.vehicles} onChange={(e) => setRow(i, { vehicles: e.target.value })} /></td>
                      <td className="py-2 pr-2"><input className="input w-24" inputMode="decimal" value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} /></td>
                      <td className="py-2 pr-2"><input className="input" type="datetime-local" value={r.requiredAt} onChange={(e) => setRow(i, { requiredAt: e.target.value })} /></td>
                      <td className="py-2 pr-2"><button className="rounded-lg border border-border px-2 py-1 text-xs font-bold text-inkSoft hover:text-red disabled:opacity-40" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} aria-label={`Remove item ${(i + 1) * 10}`}>Remove</button></td>
                    </tr>
                    {err && <tr><td /><td colSpan={6} className="pb-2 text-xs font-bold text-red">{err}</td></tr>}
                  </React.Fragment>); })}
                <tr className="border-t-2 border-border bg-appBg/60 font-extrabold"><td className="px-2 py-2" colSpan={2}>Total</td><td>{tot.cases}</td><td>{tot.vehicles}</td><td>{tot.qty}</td><td colSpan={2} /></tr>
              </tbody>
            </table>
          </div>
          {noMail.length > 0 && <div className="mt-2 rounded-xl bg-amber/10 p-2 text-xs font-bold text-amber">No e-mail on file for {noMail.join(', ')}: {noMail.length === 1 ? 'they' : 'they'} will not receive the indent mail. Add the e-mail under Carriers.</div>}
          {lanePick && <div className="mt-2 text-xs text-inkSoft">Lane-ranked transporters are listed first with their rate. Each transporter gets a mail with only its own line.</div>}
          {shown && v.errors.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs font-bold text-red">{v.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        </div>
      </div>}
    </Modal>
  );
}
const rankedFirst = (r: { rate: unknown }[]) => r.some((x) => x.rate);
