'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useTms } from '../../lib/store';
import { Card, PageHead, Table } from '../../components/ui';
import { downloadCsv } from '../../lib/csv';
import { Download, Play } from 'lucide-react';

import { addCarrierCodes } from '../../lib/labels';
type Row = Record<string, string | number>;
const CATALOG: Record<string, string[]> = {
  ORDERS: ['To Be Allocated', 'Non Placement Report'], 'LTL ORDERS': ['Orders', 'Logs', 'ActivityTimeline'],
  'SHIPMENTS / MIS': ['EnRoute Vehicles Status', 'Shipment Summary', 'Trip Sheet Report', 'Delay Report', 'On Time Delivery Report', 'Halt Report', 'Pending EPODs Report', 'Epod Status', 'Consent Report', 'ETA Performance Report', 'Penalty Amount Report', 'Billing Report'],
  'DRIVER & VEHICLE': ['Driver Activity', 'Vehicle Trip', 'Vehicle Maintenance Report'], FREIGHT: ['Freight Provision', 'Pending Freight Report', 'Freight Reconciliation', 'Carrier Invoice'],
  OTHERS: ['User Last Login Details', 'Location Master', 'Indent And Placement'], 'BIDDING REPORTS': ['Bidding Reports'], 'INVOICE REPORTS': ['Invoice Approved Details'],
};

export default function Reports() {
  const t = useTms();
  const [cat, setCat] = useState('SHIPMENTS / MIS'); const [rep, setRep] = useState('Shipment Summary');
  const [out, setOut] = useState<{ name: string; rows: Row[] }>();
  const [serverCat, setServerCat] = useState<Record<string, string[]> | null>(null);
  useEffect(() => { if (t.mode === 'live') t.catalog().then(setServerCat); }, [t.mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const CAT = serverCat ?? CATALOG;
  const rowsFor = async (name: string): Promise<Row[]> => addCarrierCodes((await t.report(name)) ?? build(name), t.db.carriers) as Row[];
  const city = (id: string) => t.db.locs.find((l) => l.id === id)?.city ?? id;
  const cn = (id: string) => t.db.carriers.find((c) => c.id === id)?.name ?? id;   // rows carry the name; addCarrierCodes puts the vendor code in its own column
  const ships = t.scoped(t.db.shipments); const orders = t.scoped(t.db.orders); const invs = t.scoped(t.db.invoices);

  const build = useMemo(() => (name: string): Row[] => {
    const sRow = (s: typeof ships[number]): Row => ({ SIN: s.sin, Order: s.orderId, Status: s.status, Carrier: cn(s.carrierId), Vehicle: s.vehicleNo, From: city(s.fromLocId), To: city(s.toLocId), 'Freight (₹)': s.freight });
    if (['To Be Allocated', 'Non Placement Report', 'Indent And Placement'].includes(name)) return orders.filter((o) => o.status === 'Open').map((o) => ({ Order: o.id, Mode: o.mode, From: city(o.stops[0].locId), To: city(o.stops[o.stops.length - 1].locId), Vehicles: o.vehicles, Type: o.vehicleType, 'Pickup': o.stops[0].at.slice(0, 16).replace('T', ' ') }));
    if (['Orders', 'Logs', 'ActivityTimeline'].includes(name)) return ships.filter((s) => s.type === 'LTL').map(sRow);
    if (name === 'Delay Report' || name === 'ETA Performance Report') return ships.filter((s) => s.delayH > 0).map((s) => ({ ...sRow(s), 'Delay (h)': s.delayH, Reason: s.delayReason ?? '—' }));
    if (name === 'On Time Delivery Report') return ships.filter((s) => s.status === 'Completed').map((s) => ({ ...sRow(s), 'On time': s.delayH < 4 ? 'Yes' : 'No' }));
    if (name === 'Pending EPODs Report' || name === 'Epod Status') return ships.filter((s) => s.status === 'Completed').map((s) => ({ ...sRow(s), ePOD: s.ePod }));
    if (name === 'Consent Report') return ships.filter((s) => s.driver !== '—').map((s) => ({ SIN: s.sin, Driver: s.driver, Phone: s.phone, Provider: s.provider, Consent: s.consent }));
    if (name === 'Halt Report') return ships.filter((s) => s.status === 'At Delivery' || s.status === 'At Pickup').map(sRow);
    if (['Freight Provision', 'Pending Freight Report', 'Freight Reconciliation', 'Billing Report', 'Penalty Amount Report'].includes(name)) return ships.filter((s) => s.status === 'Completed').map((s) => ({ ...sRow(s), Invoiced: invs.some((i) => i.sin === s.sin) ? 'Yes' : 'No' }));
    if (['Carrier Invoice', 'Invoice Approved Details'].includes(name)) return invs.filter((i) => name === 'Carrier Invoice' || ['Approved', 'Billed', 'Ready For Payment', 'Paid'].includes(i.status)).map((i) => ({ Invoice: i.id, Carrier: cn(i.carrierId), Status: i.status, 'SAP doc': i.sapDoc ?? '—', 'Amount (₹)': i.amount }));
    if (name === 'Bidding Reports') return orders.filter((o) => o.bid).map((o) => ({ Order: o.id, Status: o.bid!.status, 'Start (₹)': o.bid!.startPrice, Bids: o.bid!.bids.length, 'Awarded (₹)': o.bid!.awardedPrice ?? '—', Winner: o.bid!.winner ? cn(o.bid!.winner) : '—' }));
    if (name === 'User Last Login Details') return t.db.users.map((u) => ({ User: u.name, Email: u.email, Roles: u.roles.join('; '), 'Last sign-in': u.lastSignin.slice(0, 16).replace('T', ' ') }));
    if (name === 'Location Master') return t.db.locs.map((l) => ({ Code: l.id, City: l.city, State: l.state, Zone: l.zone, Pincode: l.pincode }));
    if (name === 'Driver Activity' || name === 'Vehicle Trip') return ships.filter((s) => s.driver !== '—').map((s) => ({ Driver: s.driver, Vehicle: s.vehicleNo, SIN: s.sin, 'Distance (km)': s.km, Status: s.status }));
    return ships.map(sRow);
  }, [ships, orders, invs, t.db]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <PageHead title="Reports" sub={`${Object.values(CAT).flat().length} canned reports in ${Object.keys(CAT).length} categories${t.mode === 'live' ? ' - run on the server against your unit scope' : ' (demo subset)'}`} />
      <div className="grid gap-4 lg:grid-cols-4">
        <Card title="Report type" pad={false} className="self-start"><div className="max-h-[560px] overflow-y-auto">{Object.entries(CAT).map(([c, items]) => (
          <div key={c}><button onClick={() => setCat(c)} className={`w-full px-4 py-2 text-left text-[11px] font-extrabold uppercase tracking-wide ${cat === c ? 'text-rust' : 'text-inkSoft'}`}>{c}</button>
            {cat === c && items.map((i) => <button key={i} onClick={() => { setRep(i); setOut(undefined); }} className={`block w-full px-6 py-1.5 text-left text-[13px] font-semibold ${rep === i ? 'bg-rust/10 text-rust' : 'hover:bg-appBg'}`}>{i}</button>)}</div>))}</div></Card>
        <div className="space-y-4 lg:col-span-3">
          <Card title={rep} right={<div className="flex gap-2"><button className="btn-primary !py-1.5 text-xs" onClick={async () => setOut({ name: rep, rows: await rowsFor(rep) })}><Play size={13} />View Report</button><button className="btn-ghost !py-1.5 text-xs" onClick={async () => { const r = await rowsFor(rep); if (!r.length) return t.toast('No data for this report in the current scope', 'err'); downloadCsv(`${rep.replace(/\W+/g, '_')}.csv`, r); }}><Download size={13} />Generate</button><button className="btn-ghost !py-1.5 text-xs" onClick={() => setOut(undefined)}>Clear</button></div>}>
            <p className="hint">Runs against the {t.allUnits ? 'all-units' : 'selected unit'} scope. In production, reports run on a read replica / warehouse, not the live transactional database.</p></Card>
          {out && <Card pad={false} title={`${out.name} — ${out.rows.length} rows`}>{out.rows.length ? <Table rows={out.rows} rowKey={(r) => JSON.stringify(r)} cols={Object.keys(out.rows[0]).map((k) => ({ h: k, r: (r: Row) => String(r[k]) }))} /> : <p className="p-6 text-center text-inkSoft">No rows</p>}</Card>}
        </div>
      </div>
    </div>
  );
}
