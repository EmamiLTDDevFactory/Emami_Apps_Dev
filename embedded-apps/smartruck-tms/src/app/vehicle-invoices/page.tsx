'use client';

import React, { useState } from 'react';
import { useTms } from '../../lib/store';
import { Card, Field, Kpi, PageHead, Pill, Table } from '../../components/ui';

interface Row { no: string; plant: string; ttSin: string; ttVehicle: string; ttOn: string; instaSin: string; instaVehicle: string; instaOn: string; status: 'MATCH' | 'DIFF' | 'TT_ONLY' | 'INSTA_ONLY' | string }
const LABEL: Record<string, [string, string]> = { MATCH: ['Same vehicle', 'green'], DIFF: ['Different vehicle', 'red'], TT_ONLY: ['Only in Trip Trail', 'amber'], INSTA_ONLY: ['Only in Instavans', 'blue'] };

/** Parallel run with Instavans: every billing document put on a vehicle in either system, side by side (read from SAP; nothing is changed). */
export default function VehicleInvoicesPage() {
  const t = useTms();
  const [plant, setPlant] = useState('');
  const [days, setDays] = useState('30');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  if (t.mode !== 'live') return <div><PageHead title="Vehicle invoices" /><Card><p className="text-sm">This compares SAP data and runs on the live server. Open this app with <code>?mode=live</code> on the DEV site.</p></Card></div>;
  const load = async () => { setBusy(true); try { const r = await t.cmd<{ rows: Row[] }>({ type: 'parallelCheck', plant, days: Number(days) }); if (r) setRows(r.rows); } finally { setBusy(false); } };
  const n = (k: string) => (rows ?? []).filter((r) => r.status === k).length;
  const shown = (rows ?? []).filter((r) => !filter || r.status === filter);
  const trip = (sapSin: string) => sapSin.startsWith('TT-') ? sapSin.slice(3) : sapSin;
  return (
    <div className="space-y-4">
      <PageHead title="Vehicle invoices" sub="Parallel run with Instavans: billing documents on a vehicle in Trip Trail vs Instavans (ZSMART_VEH)" />
      <Card><div className="flex flex-wrap items-end gap-3">
        <Field label="Plant (blank = all)"><input className="input w-32" value={plant} onChange={(e) => setPlant(e.target.value.toUpperCase())} /></Field>
        <Field label="Last days"><input className="input w-24" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
        <button className="btn-primary" disabled={busy} onClick={() => void load()}>{busy ? 'Loading…' : 'Compare'}</button>
      </div></Card>
      {rows && <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(['MATCH', 'DIFF', 'TT_ONLY', 'INSTA_ONLY'] as const).map((k) => <Kpi key={k} label={LABEL[k][0]} value={n(k)} tone={LABEL[k][1]} onClick={() => setFilter(filter === k ? '' : k)} />)}
        </div>
        <Card pad={false}><Table rows={shown} rowKey={(r) => r.no} empty="No billing documents on a vehicle in this period" cols={[
          { h: 'Billing doc', r: (r) => <b>{r.no.replace(/^0+/, '')}</b> }, { h: 'Plant', r: (r) => r.plant },
          { h: 'Trip Trail', r: (r) => r.ttSin ? <span>{r.ttVehicle} <span className="hint">{trip(r.ttSin)} · {r.ttOn}</span></span> : <span className="hint">—</span> },
          { h: 'Instavans', r: (r) => r.instaSin ? <span>{r.instaVehicle} <span className="hint">{r.instaSin} · {r.instaOn}</span></span> : <span className="hint">—</span> },
          { h: 'Result', r: (r) => <Pill tone={(LABEL[r.status] ?? ['', 'gray'])[1]}>{(LABEL[r.status] ?? [r.status])[0]}</Pill> },
        ]} /></Card>
      </>}
    </div>
  );
}
