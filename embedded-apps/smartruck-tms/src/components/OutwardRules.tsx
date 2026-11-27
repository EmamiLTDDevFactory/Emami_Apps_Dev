'use client';

import React, { useState } from 'react';
import { useTms } from '../lib/store';
import { Card, Field, Table, inr, rateText } from './ui';
import type { Lane, LaneVendor, TmsSettings } from '../lib/types';

/** HO's rule book for the outward module: vehicle capacities, lanes with ordered vendors and rates, thresholds, mailbox, consent wording. */
export default function OutwardRules() {
  const t = useTms();
  const live = t.mode === 'live';
  const vts = t.db.vehicleTypes ?? [], lanes = t.db.lanes ?? [];
  const st: TmsSettings = { offerTimeoutH: 4, capacityMinPct: 80, invoiceTolerancePct: 2, delayMarginH: 2, unlinkedAlertH: 12, invoiceMailbox: '', consentVersion: 'v1', consentText: '', ...(t.db.settings ?? {}) };
  const [vt, setVt] = useState({ code: '', name: '', maxWeightKg: '', maxVolumeM3: '', lengthCm: '', widthCm: '', heightCm: '' });
  const [ln, setLn] = useState({ fromLocId: '', toLocId: '', distanceKm: '', transitH: '', vendors: [{ carrierId: '', rate: '', vehicleType: '', shippingType: '' }] });
  const [q, setQ] = useState('');
  const [open, setOpen] = useState('');
  const texts = t.db.sapTexts ?? { vehicles: {}, shipping: {} };
  const ship = (c?: string) => (c ? texts.shipping[c] ?? c : 'Any mode');
  const veh = (v: LaneVendor) => (v.sapVehicle ? texts.vehicles[v.sapVehicle] ?? v.sapVehicle : v.vehicleType || 'Any vehicle');
  /** Rates of one lane grouped by mode (shipping type + vehicle / rate method + basis), cheapest first. */
  const byMode = (l: Lane) => {
    const g = new Map<string, LaneVendor[]>();
    for (const v of l.vendors) { const k = `${ship(v.shippingType)} · ${veh(v)}${v.rateBasis ? ` · ${v.rateBasis.toLowerCase()}` : ''}${v.sdabw === 'COUR' ? ' · courier' : ''}`; g.set(k, [...(g.get(k) ?? []), v]); }
    return [...g.entries()].map(([k, vs]) => [k, vs.sort((a, b) => a.priority - b.priority || a.rate - b.rate)] as const).sort((a, b) => a[0].localeCompare(b[0]));
  };
  const shown = lanes.filter((l) => !q || `${city(l.fromLocId)} ${city(l.toLocId)} ${(l.sapRoutes ?? []).join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const manage = t.can('lane.manage'), settings = t.can('settings.manage');
  const city = (id: string) => t.db.locs.find((l) => l.id === id)?.city ?? id;
  const car = (id: string) => t.db.carriers.find((c) => c.id === id)?.name ?? id;
  const val = (k: keyof TmsSettings) => cfg[k] ?? String(st[k] ?? '');
  if (!live) return <Card><p className="text-sm">These rules are stored on the live server. Open this app with <code>?mode=live</code> on the DEV site.</p></Card>;

  const saveCfg = async () => {
    const num = (k: string) => (cfg[k] !== undefined ? { [k]: Number(cfg[k]) } : {});
    const r = await t.cmd({ type: 'saveSettings', settings: { ...num('offerTimeoutH'), ...num('capacityMinPct'), ...num('invoiceTolerancePct'), ...num('delayMarginH'), ...num('unlinkedAlertH'), ...(cfg.invoiceMailbox !== undefined ? { invoiceMailbox: cfg.invoiceMailbox } : {}), ...(cfg.consentText !== undefined ? { consentText: cfg.consentText } : {}) } });
    if (r) { t.toast('Settings saved'); setCfg({}); }
  };
  const num = (k: keyof TmsSettings, label: string, unit: string) => <Field label={`${label} (${unit})`}><input className="input" disabled={!settings} value={val(k)} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} /></Field>;

  return (
    <div className="space-y-4">
      <Card title="Thresholds and mailbox" right={settings && <button className="btn-primary" disabled={!Object.keys(cfg).length} onClick={saveCfg}>Save</button>}>
        <div className="grid gap-3 md:grid-cols-3">
          {num('offerTimeoutH', 'Vendor reply time', 'hours')}{num('capacityMinPct', 'Minimum vehicle utilisation', '%')}{num('invoiceTolerancePct', 'Invoice tolerance', '%')}
          {num('delayMarginH', 'Delay margin before a trip is flagged', 'hours')}{num('unlinkedAlertH', 'Alert if no ECC shipment after', 'hours')}
          <Field label="Mailbox for freight invoices"><input className="input" disabled={!settings} value={val('invoiceMailbox')} onChange={(e) => setCfg({ ...cfg, invoiceMailbox: e.target.value })} placeholder="freight@…" /></Field>
          <Field label={`Driver consent wording (${st.consentVersion})`} className="md:col-span-3"><textarea className="input" rows={2} disabled={!settings} value={val('consentText')} onChange={(e) => setCfg({ ...cfg, consentText: e.target.value })} /></Field>
        </div>
        <p className="hint mt-2">Changing the consent wording starts a new version; each trip records the version its driver agreed to.</p>
      </Card>

      <Card title="Vehicle types" pad={false}>
        <Table rows={vts} rowKey={(v) => v.code} empty="No vehicle types yet" onRow={(v) => setVt({ code: v.code, name: v.name, maxWeightKg: String(v.maxWeightKg), maxVolumeM3: String(v.maxVolumeM3), lengthCm: String(v.lengthCm ?? ''), widthCm: String(v.widthCm ?? ''), heightCm: String(v.heightCm ?? '') })} cols={[{ h: 'Code', r: (v) => <b>{v.code}</b> }, { h: 'Name', r: (v) => v.name }, { h: 'Cargo L × W × H (cm)', r: (v) => (v.lengthCm ? `${v.lengthCm} × ${v.widthCm} × ${v.heightCm}` : <span className="hint">not set</span>) }, { h: 'Max weight (kg)', r: (v) => v.maxWeightKg.toLocaleString('en-IN'), align: 'right' }, { h: 'Max volume (m³)', r: (v) => v.maxVolumeM3, align: 'right' }]} />
        {manage && <div className="grid gap-2 border-t border-border p-3 md:grid-cols-4 lg:grid-cols-8">
          <input className="input" placeholder="Code" value={vt.code} onChange={(e) => setVt({ ...vt, code: e.target.value })} /><input className="input" placeholder="Name" value={vt.name} onChange={(e) => setVt({ ...vt, name: e.target.value })} />
          <input className="input" placeholder="Max weight kg" value={vt.maxWeightKg} onChange={(e) => setVt({ ...vt, maxWeightKg: e.target.value })} /><input className="input" placeholder="Max volume m³ (blank = from size)" value={vt.maxVolumeM3} onChange={(e) => setVt({ ...vt, maxVolumeM3: e.target.value })} />
          <input className="input" placeholder="Cargo length cm" value={vt.lengthCm} onChange={(e) => setVt({ ...vt, lengthCm: e.target.value })} /><input className="input" placeholder="Cargo width cm" value={vt.widthCm} onChange={(e) => setVt({ ...vt, widthCm: e.target.value })} /><input className="input" placeholder="Cargo height cm" value={vt.heightCm} onChange={(e) => setVt({ ...vt, heightCm: e.target.value })} />
          <button className="btn-primary" onClick={async () => { const r = await t.cmd({ type: 'upsertVehicleType', code: vt.code, name: vt.name, maxWeightKg: Number(vt.maxWeightKg), maxVolumeM3: Number(vt.maxVolumeM3), lengthCm: vt.lengthCm, widthCm: vt.widthCm, heightCm: vt.heightCm }); if (r) { t.toast('Vehicle type saved'); setVt({ code: '', name: '', maxWeightKg: '', maxVolumeM3: '', lengthCm: '', widthCm: '', heightCm: '' }); } }}>Save</button>
        </div>}
      </Card>

      <Card title="Lanes and vendors" right={<div className="flex items-center gap-2"><input className="input w-48" placeholder="Search lane / SAP route" value={q} onChange={(e) => setQ(e.target.value)} />{manage && <button className="btn-ghost" onClick={async () => { const r = await t.cmd<{ lanes: number; rates: number; locationsAdded: number; vehicleTypesAdded: number; carriersAdded: number; skippedCount: number; skipped: string[] }>({ type: 'syncLanes' }); if (r) t.toast(`${r.lanes} lanes, ${r.rates} rates synced from SAP (ZB00)${r.locationsAdded ? ` · ${r.locationsAdded} new locations (add coordinates)` : ''}${r.vehicleTypesAdded ? ` · ${r.vehicleTypesAdded} vehicle types` : ''}${r.carriersAdded ? ` · ${r.carriersAdded} transporters added` : ''}${r.skippedCount ? ` · ${r.skippedCount} rates skipped` : ''}`); }}>Sync lanes from SAP</button>}</div>} pad={false}>
        <Table rows={shown} rowKey={(l) => l.id} onRow={(l) => setOpen(open === l.id ? '' : l.id)} empty="No lanes yet" cols={[
          { h: 'Lane', r: (l) => <div><b>{city(l.fromLocId)} → {city(l.toLocId)}</b>{l.sapRoutes?.length ? <div className="hint">SAP route {l.sapRoutes.join(', ')}</div> : null}</div> },
          { h: 'Distance / transit', r: (l) => `${l.distanceKm} km · ${l.transitH} h` },
          { h: 'Rates by mode (cheapest first)', r: (l) => open === l.id
            ? <div className="space-y-1">{byMode(l).map(([k, vs]) => <div key={k}><div className="text-[11px] font-bold uppercase text-inkSoft">{k}</div><div>{vs.map((v) => `${v.priority}. ${car(v.carrierId)} ${rateText(v)}`).join('  ·  ')}</div></div>)}</div>
            : <span>{byMode(l).slice(0, 3).map(([k, vs]) => `${k}: ${car(vs[0].carrierId)} ${rateText(vs[0])}`).join('  |  ')}{byMode(l).length > 3 ? `  |  +${byMode(l).length - 3} more modes` : ''} <span className="hint">({l.vendors.length} rates, click for all)</span></span> },
        ]} />
        {manage && <div className="space-y-2 border-t border-border p-3">
          <div className="grid gap-2 md:grid-cols-4">
            <select className="input" value={ln.fromLocId} onChange={(e) => setLn({ ...ln, fromLocId: e.target.value })}><option value="">From…</option>{t.db.locs.map((l) => <option key={l.id} value={l.id}>{l.city}</option>)}</select>
            <select className="input" value={ln.toLocId} onChange={(e) => setLn({ ...ln, toLocId: e.target.value })}><option value="">To…</option>{t.db.locs.map((l) => <option key={l.id} value={l.id}>{l.city}</option>)}</select>
            <input className="input" placeholder="Distance km" value={ln.distanceKm} onChange={(e) => setLn({ ...ln, distanceKm: e.target.value })} /><input className="input" placeholder="Planned transit hours" value={ln.transitH} onChange={(e) => setLn({ ...ln, transitH: e.target.value })} />
          </div>
          {ln.vendors.map((v, i) => <div key={i} className="grid gap-2 md:grid-cols-4"><div className="self-center text-sm font-bold text-inkSoft">Vendor {i + 1}{i === 0 ? ' (offered first)' : ''}</div>
            <select className="input" value={v.carrierId} onChange={(e) => setLn({ ...ln, vendors: ln.vendors.map((x, k) => (k === i ? { ...x, carrierId: e.target.value } : x)) })}><option value="">Carrier…</option>{t.db.carriers.filter((c) => !c.blocked).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <input className="input" placeholder="Freight rate ₹ per trip" value={v.rate} onChange={(e) => setLn({ ...ln, vendors: ln.vendors.map((x, k) => (k === i ? { ...x, rate: e.target.value } : x)) })} />
            <div className="grid grid-cols-2 gap-2"><select className="input" value={v.vehicleType} onChange={(e) => setLn({ ...ln, vendors: ln.vendors.map((x, k) => (k === i ? { ...x, vehicleType: e.target.value } : x)) })}><option value="">Any vehicle</option>{vts.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</select>
              <select className="input" value={v.shippingType} onChange={(e) => setLn({ ...ln, vendors: ln.vendors.map((x, k) => (k === i ? { ...x, shippingType: e.target.value } : x)) })}><option value="">Any mode</option>{Object.entries({ '01': 'Truck', '03': 'Train', ...texts.shipping }).map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></div></div>)}
          <div className="flex gap-2"><button className="btn-ghost" onClick={() => setLn({ ...ln, vendors: [...ln.vendors, { carrierId: '', rate: '', vehicleType: '', shippingType: '' }] })}>Add fallback vendor</button>
            <button className="btn-primary" onClick={async () => { const r = await t.cmd({ type: 'upsertLane', fromLocId: ln.fromLocId, toLocId: ln.toLocId, distanceKm: Number(ln.distanceKm), transitH: Number(ln.transitH), vendors: ln.vendors.map((v, i) => ({ carrierId: v.carrierId, priority: i + 1, rate: Number(v.rate), vehicleType: v.vehicleType, shippingType: v.shippingType })) }); if (r) { t.toast('Lane saved (SAP rates on the lane are kept)'); setLn({ fromLocId: '', toLocId: '', distanceKm: '', transitH: '', vendors: [{ carrierId: '', rate: '', vehicleType: '', shippingType: '' }] }); } }}>Save lane</button></div>
        </div>}
      </Card>
    </div>
  );
}
