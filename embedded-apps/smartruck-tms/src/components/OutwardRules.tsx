'use client';

import React, { useState } from 'react';
import { useTms } from '../lib/store';
import { Card, Field, Table, inr } from './ui';
import type { TmsSettings } from '../lib/types';

/** HO's rule book for the outward module: vehicle capacities, lanes with ordered vendors and rates, thresholds, mailbox, consent wording. */
export default function OutwardRules() {
  const t = useTms();
  const live = t.mode === 'live';
  const vts = t.db.vehicleTypes ?? [], lanes = t.db.lanes ?? [];
  const st: TmsSettings = { offerTimeoutH: 4, capacityMinPct: 80, invoiceTolerancePct: 2, delayMarginH: 2, unlinkedAlertH: 12, invoiceMailbox: '', consentVersion: 'v1', consentText: '', ...(t.db.settings ?? {}) };
  const [vt, setVt] = useState({ code: '', name: '', maxWeightKg: '', maxVolumeM3: '' });
  const [ln, setLn] = useState({ fromLocId: '', toLocId: '', distanceKm: '', transitH: '', vendors: [{ carrierId: '', rate: '' }] });
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
        <Table rows={vts} rowKey={(v) => v.code} empty="No vehicle types yet" onRow={(v) => setVt({ code: v.code, name: v.name, maxWeightKg: String(v.maxWeightKg), maxVolumeM3: String(v.maxVolumeM3) })} cols={[{ h: 'Code', r: (v) => <b>{v.code}</b> }, { h: 'Name', r: (v) => v.name }, { h: 'Max weight (kg)', r: (v) => v.maxWeightKg.toLocaleString('en-IN'), align: 'right' }, { h: 'Max volume (m³)', r: (v) => v.maxVolumeM3, align: 'right' }]} />
        {manage && <div className="grid gap-2 border-t border-border p-3 md:grid-cols-5">
          <input className="input" placeholder="Code" value={vt.code} onChange={(e) => setVt({ ...vt, code: e.target.value })} /><input className="input" placeholder="Name" value={vt.name} onChange={(e) => setVt({ ...vt, name: e.target.value })} />
          <input className="input" placeholder="Max weight kg" value={vt.maxWeightKg} onChange={(e) => setVt({ ...vt, maxWeightKg: e.target.value })} /><input className="input" placeholder="Max volume m³" value={vt.maxVolumeM3} onChange={(e) => setVt({ ...vt, maxVolumeM3: e.target.value })} />
          <button className="btn-primary" onClick={async () => { const r = await t.cmd({ type: 'upsertVehicleType', code: vt.code, name: vt.name, maxWeightKg: Number(vt.maxWeightKg), maxVolumeM3: Number(vt.maxVolumeM3) }); if (r) { t.toast('Vehicle type saved'); setVt({ code: '', name: '', maxWeightKg: '', maxVolumeM3: '' }); } }}>Save</button>
        </div>}
      </Card>

      <Card title="Lanes and vendors" right={manage && <button className="btn-ghost" onClick={async () => { const r = await t.cmd<{ lanes: number; skipped: string[] }>({ type: 'syncLanes' }); if (r) t.toast(`${r.lanes} lanes synced from SAP${r.skipped.length ? `, ${r.skipped.length} skipped (location or vendor not in the app)` : ''}`); }}>Sync lanes from SAP</button>} pad={false}>
        <Table rows={lanes} rowKey={(l) => l.id} empty="No lanes yet" cols={[
          { h: 'Lane', r: (l) => <b>{city(l.fromLocId)} → {city(l.toLocId)}</b> }, { h: 'Distance / transit', r: (l) => `${l.distanceKm} km · ${l.transitH} h` },
          { h: 'Vendors in order', r: (l) => [...l.vendors].sort((a, b) => a.priority - b.priority).map((v) => `${v.priority}. ${car(v.carrierId)} ${inr(v.rate)}`).join('  ·  ') },
        ]} />
        {manage && <div className="space-y-2 border-t border-border p-3">
          <div className="grid gap-2 md:grid-cols-4">
            <select className="input" value={ln.fromLocId} onChange={(e) => setLn({ ...ln, fromLocId: e.target.value })}><option value="">From…</option>{t.db.locs.map((l) => <option key={l.id} value={l.id}>{l.city}</option>)}</select>
            <select className="input" value={ln.toLocId} onChange={(e) => setLn({ ...ln, toLocId: e.target.value })}><option value="">To…</option>{t.db.locs.map((l) => <option key={l.id} value={l.id}>{l.city}</option>)}</select>
            <input className="input" placeholder="Distance km" value={ln.distanceKm} onChange={(e) => setLn({ ...ln, distanceKm: e.target.value })} /><input className="input" placeholder="Planned transit hours" value={ln.transitH} onChange={(e) => setLn({ ...ln, transitH: e.target.value })} />
          </div>
          {ln.vendors.map((v, i) => <div key={i} className="grid gap-2 md:grid-cols-4"><div className="self-center text-sm font-bold text-inkSoft">Vendor {i + 1}{i === 0 ? ' (offered first)' : ''}</div>
            <select className="input" value={v.carrierId} onChange={(e) => setLn({ ...ln, vendors: ln.vendors.map((x, k) => (k === i ? { ...x, carrierId: e.target.value } : x)) })}><option value="">Carrier…</option>{t.db.carriers.filter((c) => !c.blocked).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <input className="input" placeholder="Freight rate ₹" value={v.rate} onChange={(e) => setLn({ ...ln, vendors: ln.vendors.map((x, k) => (k === i ? { ...x, rate: e.target.value } : x)) })} /></div>)}
          <div className="flex gap-2"><button className="btn-ghost" onClick={() => setLn({ ...ln, vendors: [...ln.vendors, { carrierId: '', rate: '' }] })}>Add fallback vendor</button>
            <button className="btn-primary" onClick={async () => { const r = await t.cmd({ type: 'upsertLane', fromLocId: ln.fromLocId, toLocId: ln.toLocId, distanceKm: Number(ln.distanceKm), transitH: Number(ln.transitH), vendors: ln.vendors.map((v, i) => ({ carrierId: v.carrierId, priority: i + 1, rate: Number(v.rate) })) }); if (r) { t.toast('Lane saved'); setLn({ fromLocId: '', toLocId: '', distanceKm: '', transitH: '', vendors: [{ carrierId: '', rate: '' }] }); } }}>Save lane</button></div>
        </div>}
      </Card>
    </div>
  );
}
