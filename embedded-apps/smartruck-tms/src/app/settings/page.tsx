'use client';

import React, { useState } from 'react';
import { useTms } from '../../lib/store';
import { ROLE_PERMS, type AppUser } from '../../lib/types';
import OutwardRules from '../../components/OutwardRules';
import Combobox from '../../components/Combobox';
import { carrierLabel } from '../../lib/labels';
import { Card, Field, Modal, PageHead, Pill, Table, Tabs, fmtDT } from '../../components/ui';
import { buildDemoDb } from '../../lib/demo';

const TABS = ['User Management', 'Roles & Permissions', 'Units & Divisions', 'Locations & Lanes', 'Alerts', 'Outward Rules', 'Integrations'] as const;

export default function Settings() {
  const t = useTms();
  const [tab, setTab] = useState<(typeof TABS)[number]>('User Management');
  const [edit, setEdit] = useState<AppUser>();
  const [alerts, setAlerts] = useState({ delay: true, eway: true, consent: true, bid: true, invoice: false });
  const save = () => { if (!edit) return; if (!t.can('user.manage')) return t.toast('Only an Admin can manage users', 'err'); if (!edit.name.trim() || !/^\S+@\S+\.\S+$/.test(edit.email)) return t.toast('Valid name and email required', 'err'); if (!edit.roles.length || !edit.units.length) return t.toast('Pick at least one role and one unit', 'err'); if (edit.roles.includes('Carrier Vendor') && !edit.carrierId) return t.toast('Pick the transporter this vendor login belongs to', 'err'); t.saveUser(edit); t.toast('User saved'); setEdit(undefined); };
  const [imp, setImp] = useState(''); const [impOut, setImpOut] = useState<string[]>([]);
  const runImport = async (raw: unknown, dry: boolean) => {
    const r = await t.importData(raw, dry);
    setImpOut(r.ok ? [`${dry ? 'Dry run OK' : 'Imported'}: ${Object.entries(r.counts).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ') || 'nothing'}`] : (r.errors ?? ['Import failed']));
    if (r.ok && !dry) t.toast('Import complete');
  };
  const tog = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div>
      <PageHead title="Settings" sub="Master data and access" right={tab === 'User Management' && <button className="btn-primary" onClick={() => setEdit({ id: `U${t.db.users.length + 1}`, name: '', email: '', designation: '', units: [t.unitId], roles: [], lastSignin: new Date(t.now).toISOString() })}>+ Add user</button>} />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'User Management' && <Card pad={false}><Table rows={t.db.users} rowKey={(u) => u.id} onRow={setEdit} cols={[{ h: 'User', r: (u) => <div><b>{u.name}</b><div className="hint">{u.email}</div></div> }, { h: 'Designation', r: (u) => u.designation },
        { h: 'Units', r: (u) => u.units.length > 3 ? `${u.units.slice(0, 2).join(', ')} +${u.units.length - 2}` : u.units.join(', ') }, { h: 'Roles', r: (u) => <div className="flex flex-wrap gap-1">{u.roles.map((r) => <Pill key={r} tone="violet">{r}</Pill>)}</div> },
        { h: 'Permissions', r: (u) => u.roles.flatMap((r) => ROLE_PERMS[r]?.perms ?? []).length }, { h: 'Last sign-in', r: (u) => fmtDT(u.lastSignin) }]} /></Card>}
      {tab === 'Roles & Permissions' && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Object.entries(ROLE_PERMS).map(([r, v]) => <Card key={r} title={r}><ul className="space-y-1.5 text-sm">{v.perms.map((p) => <li key={p.key} className="flex items-center gap-2"><span className="text-green">✓</span>{p.label}<code className="ml-auto text-[10px] text-inkSoft">{p.key}</code></li>)}</ul></Card>)}</div>}
      {tab === 'Units & Divisions' && <Card pad={false}><Table rows={t.db.units} rowKey={(u) => u.id} cols={[{ h: 'Code', r: (u) => <b>{u.code}</b> }, { h: 'Unit', r: (u) => u.name }, { h: 'Division', r: (u) => u.division }, { h: 'City', r: (u) => u.city }]} /></Card>}
      {tab === 'Locations & Lanes' && <Card pad={false}><Table rows={t.db.locs} rowKey={(l) => l.id} cols={[{ h: 'Code', r: (l) => <b>{l.id}</b> }, { h: 'City', r: (l) => l.city }, { h: 'State', r: (l) => l.state }, { h: 'Zone', r: (l) => l.zone }, { h: 'Pincode', r: (l) => l.pincode }]} /></Card>}
      {tab === 'Outward Rules' && <OutwardRules />}
      {tab === 'Alerts' && <Card title="Email / SMS alert rules"><div className="space-y-3">{([['delay', 'Delay > 4h on a live shipment'], ['eway', 'E-way bill expiring within 6h'], ['consent', 'SIM consent expired or declined'], ['bid', 'New bid / auction closing in 30 min'], ['invoice', 'Carrier invoice waiting > 3 days']] as const).map(([k, l]) => <label key={k} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm font-bold">{l}<input type="checkbox" checked={alerts[k]} onChange={() => { setAlerts({ ...alerts, [k]: !alerts[k] }); t.toast('Alert rule updated'); }} /></label>)}</div></Card>}

      {tab === 'Integrations' && (<div className="space-y-4">
        <Card title="Connections" pad={false}><Table rows={[
          { k: 'SAP (ZTMS_SRV on EDS): vendors, customers, PO/SO check, freight invoice posting, payment status', v: t.liveState.integrations?.sap ?? 'demo' },
          { k: 'Telecom SIM consent (Jio / Airtel / Vi)', v: t.liveState.integrations?.consent ?? 'demo' },
          { k: 'E-way bill (GST) API', v: t.liveState.integrations?.eway ?? 'demo' },
          { k: 'GPS / IoT tracking feed (ingest endpoint)', v: t.liveState.integrations?.ingest ?? 'demo' }].map((r) => ({ ...r, id: r.k }))} rowKey={(r) => r.id}
          cols={[{ h: 'Integration', r: (r) => r.k }, { h: 'Status', r: (r) => <Pill tone={r.v === 'live' || r.v === 'enabled' ? 'green' : 'amber'}>{r.v === 'demo' ? 'demo mode' : r.v}</Pill> }]} /></Card>
        {t.mode === 'live' ? (<>
          <Card title="Sync with SAP"><div className="flex flex-wrap gap-2"><button className="btn-primary" onClick={() => { void t.syncMasters(); t.toast('Carriers and customers synced from SAP'); }}>Sync carriers and customers from SAP</button><button className="btn-ghost" onClick={() => { void t.syncPayments(); t.toast('Payment status pulled from SAP'); }}>Sync payments</button></div>
            <p className="hint mt-2">Carriers come from SAP vendors of account group ZTRP, customers from KNA1. Freight invoices are only posted to SAP once finance has set the freight expense account (TVARVC ZTMS_FREIGHT_GL); until then SAP validates the invoice and says so.</p></Card>
          <Card title="Standard locations and units"><p className="hint mb-2">Orders need locations (16 Indian cities) and units. Load them once; existing rows with the same code are updated, nothing else is touched.</p>
            <button className="btn-primary" onClick={() => { const d = buildDemoDb(); void runImport({ units: d.units, locs: d.locs, geofences: d.geofences }, false); }}>Load standard locations and units</button></Card>
          <Card title="Data migration (admin)"><p className="hint mb-2">Paste an export from the old system as JSON ({'{'} units, locs, carriers, customers, orders, shipments, invoices, geofences {'}'}). Run a dry run first: it checks every reference before anything is written.</p>
            <textarea className="input font-mono text-xs" rows={6} value={imp} onChange={(e) => setImp(e.target.value)} placeholder='{"carriers": [...], "orders": [...]}' />
            <div className="mt-2 flex flex-wrap gap-2"><button className="btn-ghost" onClick={() => { try { void runImport(JSON.parse(imp), true); } catch { setImpOut(['That is not valid JSON.']); } }}>Dry run</button><button className="btn-primary" onClick={() => { try { void runImport(JSON.parse(imp), false); } catch { setImpOut(['That is not valid JSON.']); } }}>Import</button>
              <button className="btn-ghost" onClick={() => { if (!confirm('Load the demo orders, shipments and invoices into the LIVE database? Use on DEV only.')) return; const d = buildDemoDb(); void runImport({ units: d.units, locs: d.locs, carriers: d.carriers, customers: d.customers, orders: d.orders, shipments: d.shipments, invoices: d.invoices, geofences: d.geofences }, false); }}>Load demo data into live (DEV only)</button></div>
            {impOut.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-xs font-semibold text-ink">{impOut.map((m, i) => <li key={i}>{m}</li>)}</ul>}</Card></>)
          : <Card><p className="hint">Sync and migration tools are available in live mode. Open this app with <code>?mode=live</code> once the backend is deployed.</p></Card>}
      </div>)}

      {edit && <Modal wide title={t.db.users.some((u) => u.id === edit.id) ? 'Edit user' : 'Add user'} onClose={() => setEdit(undefined)} footer={<><button className="btn-ghost" onClick={() => setEdit(undefined)}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></>}>
        <div className="grid gap-3 md:grid-cols-3"><Field label="Name"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field><Field label="Email"><input className="input" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field><Field label="Designation"><input className="input" value={edit.designation} onChange={(e) => setEdit({ ...edit, designation: e.target.value })} /></Field></div>
        {edit.roles.includes('Carrier Vendor') && <div className="mt-4 max-w-md rounded-xl border border-rust bg-rust/5 p-3"><Field label="Transporter (required for a Carrier Vendor login)"><Combobox ariaLabel="Transporter" value={edit.carrierId ?? ''} onChange={(v) => setEdit({ ...edit, carrierId: v || undefined })} placeholder="Type code or name…" options={t.db.carriers.filter((c) => !c.blocked).map((c) => ({ value: c.id, label: carrierLabel(c), keywords: c.shortName, hint: c.email ?? 'no e-mail' }))} /></Field><div className="mt-1 text-xs text-inkSoft">This login then sees only this transporter&apos;s requests in the Vendor Portal and can fill the driver and vehicle details.</div></div>}
        <div className="mt-4 text-xs font-bold text-inkSoft">Units</div><div className="mt-1 flex flex-wrap gap-1.5">{t.db.units.map((u) => <button key={u.id} onClick={() => setEdit({ ...edit, units: tog(edit.units, u.id) })} className={`rounded-full border px-3 py-1 text-xs font-bold ${edit.units.includes(u.id) ? 'border-rust bg-rust/10 text-rust' : 'border-border text-inkSoft'}`}>{u.code}</button>)}</div>
        <div className="mt-4 text-xs font-bold text-inkSoft">Roles and permissions</div>
        <div className="mt-1 grid gap-3 md:grid-cols-2">{Object.entries(ROLE_PERMS).map(([r, v]) => <div key={r} className={`rounded-xl border p-3 ${edit.roles.includes(r) ? 'border-rust bg-rust/5' : 'border-border'}`}><label className="flex items-center gap-2 text-sm font-extrabold"><input type="checkbox" checked={edit.roles.includes(r)} onChange={() => setEdit({ ...edit, roles: tog(edit.roles, r), ...(r === 'Carrier Vendor' && edit.roles.includes(r) ? { carrierId: undefined } : {}) })} />{r}</label><ul className="mt-2 space-y-1 pl-6 text-xs text-inkSoft">{v.perms.map((p) => <li key={p.key}>{p.label}</li>)}</ul></div>)}</div></Modal>}
    </div>
  );
}
