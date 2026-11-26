'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useTms } from '../lib/store';
import { pack, cartonVolumeM3, type CartonType, type PackResult } from '../lib/packer';
import { Card, Field, Kpi, Pill } from './ui';
import TruckViewer, { TYPE_COLORS } from './TruckViewer';

interface Row { id: string; name: string; l: string; w: string; h: string; kg: string; qty: string; fragile: boolean; tip: boolean; layers: string; source?: string }
const KEY = 'trip_trail_loading_optimizer_v1';
// ISO container internal sizes (standard values); trucks come from the vehicle types or are typed in.
const PRESETS: { name: string; l: number; w: number; h: number; kg: number }[] = [
  { name: "20 ft container (ISO)", l: 590, w: 235, h: 239, kg: 28000 },
  { name: "40 ft container (ISO)", l: 1203, w: 235, h: 239, kg: 26500 },
  { name: "40 ft high-cube container (ISO)", l: 1203, w: 235, h: 270, kg: 26500 },
];
const blankRow = (n: number): Row => ({ id: `T${n}`, name: `Carton ${n}`, l: '', w: '', h: '', kg: '', qty: '', fragile: false, tip: false, layers: '' });
const num = (s: string) => { const v = Number(String(s).replace(/,/g, '')); return Number.isFinite(v) ? v : 0; };

/** 3D Truck Loading Optimizer: compares carton volume with the truck and shows how to arrange the cartons (see docs/LOADING_OPTIMIZER.md). */
export default function LoadingOptimizer({ initialRows, initialTruck }: { initialRows?: Row[]; initialTruck?: { l: number; w: number; h: number; kg: number; name?: string } }) {
  const t = useTms();
  const minPct = Number(t.db.settings?.capacityMinPct ?? 80);
  const vts = (t.db.vehicleTypes ?? []).filter((v) => v.lengthCm && v.widthCm && v.heightCm);
  const [truckSel, setTruckSel] = useState('custom');
  const [truck, setTruck] = useState({ l: '', w: '', h: '', kg: '' });
  const [rows, setRows] = useState<Row[]>([{ ...blankRow(1) }]);
  const [ref, setRef] = useState('');
  const [res, setRes] = useState<PackResult | null>(null);
  const [err, setErr] = useState('');
  const [run, setRun] = useState(0);

  useEffect(() => {      // restore the last inputs of this browser (a convenience only)
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) { const s = JSON.parse(raw); if (s.truck) setTruck(s.truck); if (Array.isArray(s.rows) && s.rows.length) setRows(s.rows); }
    } catch { /* ignore */ }
    if (initialRows?.length) setRows(initialRows);
    if (initialTruck) setTruck({ l: String(initialTruck.l), w: String(initialTruck.w), h: String(initialTruck.h), kg: String(initialTruck.kg) });
  }, [initialRows, initialTruck]);
  useEffect(() => { try { window.localStorage.setItem(KEY, JSON.stringify({ truck, rows })); } catch { /* ignore */ } }, [truck, rows]);

  const pickTruck = (v: string) => {
    setTruckSel(v);
    const p = PRESETS.find((x) => x.name === v), vt = vts.find((x) => x.code === v);
    if (p) setTruck({ l: String(p.l), w: String(p.w), h: String(p.h), kg: String(p.kg) });
    if (vt) setTruck({ l: String(vt.lengthCm), w: String(vt.widthCm), h: String(vt.heightCm), kg: String(vt.maxWeightKg) });
  };
  const upd = (i: number, patch: Partial<Row>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const colorOf = (id: string) => TYPE_COLORS[Math.max(0, rows.findIndex((r) => r.id === id)) % TYPE_COLORS.length];
  const types: CartonType[] = useMemo(() => rows.filter((r) => num(r.qty) > 0).map((r) => ({ id: r.id, name: r.name || r.id, lengthCm: num(r.l), widthCm: num(r.w), heightCm: num(r.h), weightKg: num(r.kg), qty: Math.floor(num(r.qty)), fragile: r.fragile, canTip: r.tip, maxLayers: num(r.layers) > 0 ? Math.floor(num(r.layers)) : undefined })), [rows]);
  const plainCbm = cartonVolumeM3(types);
  const truckCbm = Math.round((num(truck.l) * num(truck.w) * num(truck.h)) / 1e4) / 100;

  const optimize = () => {
    setErr('');
    try {
      const reference = types.find((x) => x.id === ref) || [...types].sort((a, b) => b.qty - a.qty)[0];
      const r = pack({ lengthCm: num(truck.l), widthCm: num(truck.w), heightCm: num(truck.h), maxWeightKg: num(truck.kg) }, types, { extra: reference ? { ...reference, qty: 1 } : undefined });
      setRes(r); setRun((n) => n + 1);
    } catch (e) { setRes(null); setErr((e as Error).message); }
  };

  const status = !res ? null : res.status === 'empty' ? { tone: 'gray', text: 'Enter cartons to optimise' }
    : res.status === 'overweight' ? { tone: 'red', text: 'Over the weight limit' }
    : res.status === 'nofit' ? { tone: 'red', text: `Does not fit - ${res.cartonsUnplaced} carton(s) left out` }
    : res.utilizationPct < minPct ? { tone: 'amber', text: 'Optimization needed' } : { tone: 'green', text: 'Good loading' };
  const volOnlyFits = res && plainCbm <= res.truckVolumeM3 && res.cartonsUnplaced > 0;
  const extraFit = res?.extraFit ?? 0;
  const refName = (types.find((x) => x.id === ref) || [...types].sort((a, b) => b.qty - a.qty)[0])?.name ?? '';
  const ring = res ? Math.min(100, res.utilizationPct) : 0;

  return (
    <div className="space-y-4">
      <Card title="1. Truck (internal cargo space)">
        <div className="grid gap-3 md:grid-cols-5">
          <Field label="Truck"><select className="input" value={truckSel} onChange={(e) => pickTruck(e.target.value)}>
            <option value="custom">Enter size</option>
            {vts.length > 0 && <optgroup label="Trip Trail vehicle types">{vts.map((v) => <option key={v.code} value={v.code}>{v.name}</option>)}</optgroup>}
            <optgroup label="Containers">{PRESETS.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}</optgroup>
          </select></Field>
          <Field label="Length (cm)"><input className="input" inputMode="decimal" value={truck.l} onChange={(e) => { setTruckSel('custom'); setTruck({ ...truck, l: e.target.value }); }} /></Field>
          <Field label="Width (cm)"><input className="input" inputMode="decimal" value={truck.w} onChange={(e) => { setTruckSel('custom'); setTruck({ ...truck, w: e.target.value }); }} /></Field>
          <Field label="Height (cm)"><input className="input" inputMode="decimal" value={truck.h} onChange={(e) => { setTruckSel('custom'); setTruck({ ...truck, h: e.target.value }); }} /></Field>
          <Field label="Payload limit (kg)"><input className="input" inputMode="decimal" value={truck.kg} onChange={(e) => { setTruckSel('custom'); setTruck({ ...truck, kg: e.target.value }); }} /></Field>
        </div>
        <p className="hint mt-2">{truckCbm > 0 ? `Cargo volume ${truckCbm} CBM. ` : ''}Use the inside measurements of the cargo body. Vehicle types appear here once their length, width and height are filled in (Settings → Outward Rules).</p>
      </Card>

      <Card title="2. Cartons" right={<button className="btn-ghost" onClick={() => setRows([...rows, blankRow(rows.length + 1)])}>Add carton type</button>}>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-inkSoft"><th />
          <th className="py-1">Name</th><th>L (cm)</th><th>W (cm)</th><th>H (cm)</th><th>Weight (kg)</th><th>Quantity</th><th title="Nothing may be stacked on top">Fragile</th><th title="May lie on its side">Can tip</th><th title="Maximum cartons stacked in one column">Max layers</th><th /></tr></thead><tbody>
          {rows.map((r, i) => <tr key={r.id} className="border-t border-border/60">
            <td className="pr-1"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: TYPE_COLORS[i % TYPE_COLORS.length] }} /></td>
            <td className="py-1 pr-1"><input className="input min-w-[120px]" value={r.name} onChange={(e) => upd(i, { name: e.target.value })} />{r.source && <div className="hint">{r.source}</div>}</td>
            {(['l', 'w', 'h', 'kg', 'qty'] as const).map((k) => <td key={k} className="pr-1"><input className="input w-20" inputMode="decimal" value={r[k]} onChange={(e) => upd(i, { [k]: e.target.value })} /></td>)}
            <td><input type="checkbox" checked={r.fragile} onChange={(e) => upd(i, { fragile: e.target.checked })} /></td>
            <td><input type="checkbox" checked={r.tip} onChange={(e) => upd(i, { tip: e.target.checked })} /></td>
            <td className="pr-1"><input className="input w-16" inputMode="numeric" placeholder="any" value={r.layers} onChange={(e) => upd(i, { layers: e.target.value })} /></td>
            <td>{rows.length > 1 && <button className="btn-ghost !py-0.5 text-xs" onClick={() => setRows(rows.filter((_, k) => k !== i))}>Remove</button>}</td></tr>)}
        </tbody></table></div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <button className="btn-primary" onClick={optimize}>Optimize loading</button>
          <Field label="Count 'more cartons possible' for"><select className="input" value={ref} onChange={(e) => setRef(e.target.value)}><option value="">Largest quantity</option>{rows.filter((r) => num(r.qty) > 0).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
          <span className="hint">Plain volume of the cartons: <b>{plainCbm} CBM</b>{truckCbm > 0 && plainCbm > 0 ? ` (${Math.round((plainCbm / truckCbm) * 100)}% of the truck by volume alone)` : ''}</span>
        </div>
        {err && <p className="mt-2 text-sm font-bold text-red">{err}</p>}
        <p className="hint mt-2">Cartons are kept this-side-up unless "Can tip" is ticked. Fragile cartons never get anything on top. The plan puts heavy, large cartons at the bottom near the cab and fragile ones last.</p>
      </Card>

      {res && status && <>
        <Card title="3. Loading dashboard" right={<Pill tone={status.tone}>{status.text}</Pill>}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Truck capacity" value={`${res.truckVolumeM3} CBM`} tone="blue" />
            <Kpi label="Total carton volume" value={`${cartonVolumeM3(types)} CBM`} sub={`${res.loadedVolumeM3} CBM loaded`} tone="violet" />
            <Kpi label="Volume utilization" value={`${res.utilizationPct}%`} sub={`minimum ${minPct}%`} tone={res.utilizationPct >= minPct ? 'green' : 'amber'} />
            <Kpi label="Unused volume" value={`${res.unusedVolumeM3} CBM`} tone="amber" />
            <Kpi label="Cartons that fit" value={`${res.cartonsPlaced} / ${res.cartonsRequested}`} tone={res.cartonsUnplaced ? 'red' : 'green'} />
            <Kpi label="More cartons possible" value={extraFit} sub={refName ? `of ${refName}` : ''} tone="teal" />
          </div>
          {volOnlyFits && <p className="mt-3 rounded-lg bg-amberBg p-3 text-sm text-amber"><b>Volume alone is misleading here.</b> The cartons add up to {plainCbm} CBM, below the truck's {res.truckVolumeM3} CBM, but only {res.cartonsPlaced} of {res.cartonsRequested} fit because of their shapes and sizes.</p>}
          {res.warnings.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-red">{res.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
        </Card>

        <Card title="4. Loading animation and arrangement"><TruckViewer result={res} colorOf={colorOf} autoPlay={run} /></Card>

        <Card title="5. Loading report" right={<button className="btn-ghost" onClick={() => window.print()}>Print / save as PDF</button>}>
          <div className="grid gap-4 md:grid-cols-[180px_1fr]">
            <div className="flex flex-col items-center justify-center">
              <div className="grid h-36 w-36 place-items-center rounded-full" style={{ background: `conic-gradient(${res.utilizationPct >= minPct ? '#27ae60' : '#f2994a'} ${ring * 3.6}deg, #e6e9ee 0deg)` }}>
                <div className="grid h-28 w-28 place-items-center rounded-full bg-white"><div className="text-center"><div className="text-3xl font-extrabold">{res.utilizationPct}%</div><div className="text-[11px] font-bold uppercase text-inkSoft">Truck volume used</div></div></div>
              </div>
              <div className="mt-2"><Pill tone={status.tone}>{status.text}</Pill></div>
            </div>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-inkSoft"><th className="py-1" /><th>Carton</th><th>Requested</th><th>Loaded</th><th>Volume (CBM)</th><th>Weight (kg)</th><th>Result</th></tr></thead><tbody>
              {res.byType.map((b) => <tr key={b.id} className="border-t border-border/60"><td className="py-1 pr-2"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: colorOf(b.id) }} /></td><td className="font-bold">{b.name}</td><td>{b.requested}</td><td>{b.placed}</td><td>{b.volumeM3}</td><td>{b.weightKg}</td>
                <td>{b.reason === '' ? <Pill tone="green">All loaded</Pill> : b.reason === 'weight' ? <Pill tone="red">Weight limit</Pill> : b.reason === 'size' ? <Pill tone="red">Too large</Pill> : <Pill tone="red">{b.requested - b.placed} left out</Pill>}</td></tr>)}
              <tr className="border-t border-border font-bold"><td /><td>Total</td><td>{res.cartonsRequested}</td><td>{res.cartonsPlaced}</td><td>{res.loadedVolumeM3}</td><td>{res.totalWeightKg}</td><td>{res.weightPct ? `${res.weightPct}% of payload` : ''}</td></tr>
            </tbody></table>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div><div className="hint">Truck volume</div><b>{res.truckVolumeM3} CBM</b></div><div><div className="hint">Loaded volume</div><b>{res.loadedVolumeM3} CBM</b></div>
                <div><div className="hint">Unused volume</div><b>{res.unusedVolumeM3} CBM</b></div><div><div className="hint">Weight balance (front / rear half)</div><b>{res.frontSharePct}% / {res.rearSharePct}%</b></div>
              </div>
              <p className="hint mt-2">Balance is a guide only (35-65% in each half). Exact axle loads need the vehicle's axle data, which Trip Trail does not hold yet.</p>
            </div>
          </div>
        </Card>
      </>}
    </div>
  );
}
