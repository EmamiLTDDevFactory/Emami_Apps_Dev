'use client';
import React, { useState } from 'react';
import { dShort } from '../../lib/dp';
import { Bar, Chip, SProps, TableWrap, Td, Th, f0, f1, siteOptions, small } from './common';

/* Vehicles on the road (SAP deliveries PGI'd, not yet received). Tick what has arrived after the data was pulled: it counts as stock there. */
export function Arrivals({ s, bump, toast, replan }: SProps & { replan: () => void }) {
  const [af, setAf] = useState({ to: '', q: '' });
  const v = s.arrivalsView(af), today = s.D.meta.today;
  return (
    <div>
      <Bar>
        <label>Destination <select className={small} value={af.to} onChange={(e) => setAf({ ...af, to: e.target.value })}>{siteOptions(s, v.tos, 'All')}</select></label>
        <input type="search" className={small + ' w-56'} placeholder="Shipment / LR / transporter" value={af.q} onChange={(e) => setAf({ ...af, q: e.target.value })} />
        <button className="btn-ghost !py-1.5 !text-xs" onClick={() => { if (s.ST.arrived.size) { s.ST.arrived.clear(); s.ST.dirty = true; } bump(); }}>Clear ticks</button>
      </Bar>
      <div className="card mb-3 flex flex-wrap items-center gap-3 p-3 text-sm">
        <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={!!s.ST.opt.arrivalOnly} onChange={(e) => { s.ST.opt.arrivalOnly = e.target.checked; s.ST.dirty = true; bump(); }} /> Plan only on the ticked vehicles</label>
        <span className="hint">distributes only what these vehicles brought, from where they landed ({f0(v.ticked)} ticked). Other stock still counts in each depot&apos;s need. No callback or inter-depot moves.</span>
        <button className="btn-primary !py-1.5 !text-xs" onClick={() => { if (s.ST.opt.arrivalOnly && !s.ST.arrived.size) { toast('Tick the vehicles to plan first', 'err'); return; } replan(); }}>Plan now</button>
      </div>
      <TableWrap><thead><tr><Th>Arrived</Th><Th>Shipment</Th><Th>From</Th><Th>To</Th><Th>Posted</Th><Th n>Days on road</Th><Th n>Lane days</Th><Th>Expected</Th><Th n>Lines</Th><Th n>Cases</Th><Th n>Tonnes</Th><Th n>In SAP GIT</Th></tr></thead><tbody>
        {v.rows.map((x: Record<string, any>) => { const on = s.isOn(x), late = x.eta && x.eta < today, pc = Math.round(x.sapPct * 100);
          return <tr key={x.key + '|' + x.to} className={on ? 'bg-appBg' : ''}>
            <Td><input type="checkbox" checked={on} onChange={(e) => { s.tick(x, e.target.checked); bump(); }} /></Td>
            <Td>{x.key}{x.lr && x.lr !== x.key ? <span className="hint"> LR {x.lr}</span> : null}{x.carrier ? <div className="hint">{x.carrier}</div> : null}</Td>
            <Td>{x.from == null ? '' : s.sName(x.from)}</Td><Td>{s.sName(x.to)}</Td><Td>{dShort(x.post)}</Td><Td n>{x.age ?? ''}</Td><Td n>{x.lt ?? ''}</Td>
            <Td>{dShort(x.eta)}{late ? <> <Chip status="PTL">overdue</Chip></> : null}</Td><Td n>{x.idx.length}</Td><Td n>{f0(x.cases)}</Td><Td n>{f1(x.kg / 1000)}</Td>
            <Td n className={pc < 50 ? 'text-inkSoft' : ''}>{pc}%</Td></tr>; })}
      </tbody></TableWrap>
      {v.rows.length === 0 && <div className="hint mt-2">No vehicles on the road in this dataset.</div>}
    </div>
  );
}
