// @ts-nocheck - these views render the engine's own loosely typed plan records (see lib/dp.ts: DpSession is any)
'use client';
import React, { useState } from 'react';
import { LEG, LEGS, TIER } from '../../lib/dp';
import { Kpi, Card } from '../ui';
import { Bar, Chip, SProps, Seg, TableWrap, Td, Th, f0, f1, siteOptions, small } from './common';

/* ------------------------------------------------------------ Summary */
export function Summary({ s }: SProps) {
  const sm = s.summary(), P = s.ST.P;
  const nShip = s.ticked();
  return (
    <div className="space-y-4">
      {P.opt.arrivalOnly && <div className="card border-rust p-3 text-sm"><b>Plan on arrival:</b> only what the {f0(nShip)} vehicles ticked on the Arrivals tab brought is planned, from where they landed. Untick it there (or in Settings) for the full plan.</div>}
      {s.ST.div && <div className="hint">Showing <b>{s.ST.div}</b> only. Truck counts are for whole trucks, which may carry both divisions.</div>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="To dispatch" value={f1(sm.all.t) + ' t'} sub={`${f0(sm.all.cases)} cases · ${f0(sm.all.lines)} lines`} />
        <Kpi label="Value" value={'₹' + f0(sm.all.v) + ' L'} sub="at rate per piece" tone="blue" />
        <Kpi label="Critical (load first)" value={f0(sm.all.crit) + ' lines'} sub={f1(sm.all.critT) + ' t'} tone="red" />
        <Kpi label="Full trucks" value={f0(sm.trucks.full)} sub={f1(sm.trucks.fullT) + ' t'} tone="green" />
        <Kpi label="Part loads" value={`${f0(sm.trucks.part)} + ${f0(sm.trucks.ptl)} PTL`} sub={f1(sm.trucks.partT) + ' t' + (P.opt.holdPartLoads ? '' : ' · dispatched as calculated')} tone="amber" />
        <Kpi label="Held (wait for a full truck)" value={f1(sm.held.t) + ' t'} sub={`${f0(sm.held.lines)} lines`} tone="teal" />
        <Kpi label="Trucks built" value={f0(sm.trucks.total)} sub={`planned in ${P.ms} ms`} />
        {sm.belowMin.lines > 0 && <Kpi label="Below minimum (dropped)" value={f0(sm.belowMin.lines) + ' lines'} sub={`${f0(sm.belowMin.cases)} cases · see Plan lines › Removed`} tone="amber" />}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="By leg" pad={false}><div className="overflow-auto"><table className="w-full border-collapse"><thead><tr><Th>Leg</Th><Th n>Lines</Th><Th n>Cases</Th><Th n>Tonnes</Th><Th n>₹ L</Th><Th n>Critical</Th><Th n>Held t</Th></tr></thead><tbody>
          {sm.byLeg.map((l) => <tr key={l.leg}><Td>{l.leg}. {LEG[l.leg as 1 | 2 | 3]}</Td><Td n>{f0(l.lines)}</Td><Td n>{f0(l.cases)}</Td><Td n>{f1(l.t)}</Td><Td n>{f0(l.v)}</Td><Td n>{f0(l.crit)}</Td><Td n>{f1(l.heldT)}</Td></tr>)}
          <tr className="font-extrabold"><Td>Total</Td><Td n>{f0(sm.byLeg.reduce((a, l) => a + l.lines, 0))}</Td><Td n>{f0(sm.byLeg.reduce((a, l) => a + l.cases, 0))}</Td><Td n>{f1(sm.byLeg.reduce((a, l) => a + l.t, 0))}</Td><Td n>{f0(sm.byLeg.reduce((a, l) => a + l.v, 0))}</Td><Td n>{f0(sm.byLeg.reduce((a, l) => a + l.crit, 0))}</Td><Td n>{f1(sm.byLeg.reduce((a, l) => a + l.heldT, 0))}</Td></tr>
        </tbody></table></div></Card>
        <Card title="By source" pad={false}><div className="max-h-72 overflow-auto"><table className="w-full border-collapse"><thead><tr><Th>Source</Th><Th n>Full</Th><Th n>Part</Th><Th n>PTL</Th><Th n>Dispatch t</Th><Th n>Held t</Th></tr></thead><tbody>
          {sm.bySrc.map((r) => <tr key={r.src}><Td>{r.src} <span className="hint">{r.name === r.src ? '' : r.name}</span></Td><Td n>{f0(r.full)}</Td><Td n>{f0(r.pc)}</Td><Td n>{f0(r.ptl)}</Td><Td n>{f1(r.t)}</Td><Td n>{f1(r.ht)}</Td></tr>)}
        </tbody></table></div></Card>
      </div>
      {sm.validation.length > 0 && <Card title={<>Pinaka checks {sm.validation.some((v: { result: string }) => v.result !== 'PASS') ? <Chip status="PTL">{sm.validation.filter((v: { result: string }) => v.result !== 'PASS').length} FAIL</Chip> : <Chip status="full">all PASS</Chip>}</>} pad={false}>
        <table className="w-full border-collapse"><thead><tr><Th>Check</Th><Th>Result</Th><Th>Detail</Th></tr></thead><tbody>
          {sm.validation.map((v: { check: string; result: string; detail: string }, i: number) => <tr key={i} className={v.result !== 'PASS' ? 'bg-redBg' : ''}><Td>{v.check}</Td><Td><b>{v.result}</b></Td><Td className="text-inkSoft">{v.detail}</Td></tr>)}
        </tbody></table></Card>}
      <Card title={`Critical needs units could not cover (${f0(sm.shortfalls.length)})`} pad={false}>
        <div className="hint px-4 pt-3">Open orders or a stock-out before the truck lands, with no unit stock left to send. Pinaka (inter-depot) moves may cover some; the rest needs production or MWH stock.</div>
        <div className="max-h-[44vh] overflow-auto"><table className="w-full border-collapse"><thead><tr><Th>Div</Th><Th>Key</Th><Th>Description</Th><Th>Depot</Th><Th n>Open orders</Th><Th n>Stock</Th><Th n>Days cover</Th><Th n>Need (cs)</Th><Th n>Sent</Th><Th n>Short</Th><Th n>₹ L</Th></tr></thead><tbody>
          {sm.shortfalls.slice(0, 300).map(({ n, K, short, cp, v, idt, depot }: { n: { n: { oo: number; stk: number; doc: number }; total: number; done: number; k: number; si: number }; K: { div: string; key: string; name: string }; short: number; cp: number; v: number; idt: number; depot: string }) =>
            <tr key={n.k + '|' + n.si}><Td>{K.div}</Td><Td>{K.key}</Td><Td>{K.name}</Td><Td>{depot}</Td><Td n>{f0(n.n.oo / cp)}</Td><Td n>{f0(n.n.stk / cp)}</Td><Td n>{n.n.doc}</Td><Td n>{f0(n.total / cp)}</Td><Td n>{f0(n.done / cp)}{idt ? <span className="hint"> +{f0(idt / cp)} IDT</span> : null}</Td><Td n>{f0(short / cp)}</Td><Td n>{f1(v)}</Td></tr>)}
        </tbody></table></div>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------- Plan lines */
interface Filters { leg: number; from: string; to: string; crit: boolean; q: string; show: string }
export function Lines({ s, bump, toast, createIndent }: SProps & { createIndent?: never }) {
  const [f, setF] = useState<Filters>({ leg: 0, from: '', to: '', crit: false, q: '', show: 'planned' });
  const [add, setAdd] = useState<null | { code: string; from: string; to: string; cases: string; crit: boolean }>(null);
  void createIndent;
  const v = s.linesView(f), P = s.ST.P, M = s.M, S = s.S;
  const cap = 2500;
  const srcs = S.map((_: unknown, i: number) => i).filter((i: number) => s.isUnit(i) || s.isMwh(i) || S[i].type === 'Depot'), dst = S.map((_: unknown, i: number) => i).filter((i: number) => s.isMwh(i) || S[i].type === 'Depot');
  const desc = add && s.mByCode[add.code.trim()] != null ? `${M[s.mByCode[add.code.trim()]].desc} · ${M[s.mByCode[add.code.trim()]].cp}/case` : '';
  return (
    <div>
      <Bar>
        <Seg options={[[0, 'All'], [1, LEGS[1]], [2, LEGS[2]], [3, LEGS[3]]]} value={f.leg} onChange={(leg) => setF({ ...f, leg })} />
        <Seg options={[['planned', 'To dispatch'], ['held', 'Held'], ['off', 'Removed'], ['all', 'All']]} value={f.show} onChange={(show) => setF({ ...f, show })} />
        <label>From <select className={small} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })}>{siteOptions(s, v.froms, 'All')}</select></label>
        <label>To <select className={small} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })}>{siteOptions(s, v.tos, 'All')}</select></label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={f.crit} onChange={(e) => setF({ ...f, crit: e.target.checked })} /> Critical only</label>
        <input type="search" className={small + ' w-56'} placeholder="Material / description / reason" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <span className="flex-1" /><button className="btn-ghost !py-1.5 !text-xs" onClick={() => setAdd(add ? null : { code: '', from: String(srcs[0]), to: String(dst[0]), cases: '', crit: false })}>+ Add line</button>
      </Bar>
      {add && <div className="card mb-3 flex flex-wrap items-end gap-3 p-3 text-xs font-bold text-inkSoft">
        <label>Material code<input className={small + ' mt-1 block w-32'} value={add.code} onChange={(e) => setAdd({ ...add, code: e.target.value })} /></label><span className="pb-2 font-normal">{desc}</span>
        <label>From<select className={small + ' mt-1 block'} value={add.from} onChange={(e) => setAdd({ ...add, from: e.target.value })}>{siteOptions(s, srcs)}</select></label>
        <label>To<select className={small + ' mt-1 block'} value={add.to} onChange={(e) => setAdd({ ...add, to: e.target.value })}>{siteOptions(s, dst)}</select></label>
        <label>Cases<input type="number" min={1} className={small + ' mt-1 block w-24'} value={add.cases} onChange={(e) => setAdd({ ...add, cases: e.target.value })} /></label>
        <label className="flex items-center gap-1 pb-2"><input type="checkbox" checked={add.crit} onChange={(e) => setAdd({ ...add, crit: e.target.checked })} /> Critical</label>
        <button className="btn-primary !py-1.5 !text-xs" onClick={() => { const err = s.addLine({ code: add.code, from: +add.from, to: +add.to, cases: +add.cases, crit: add.crit }); if (err) toast(err, 'err'); else { toast('Line added'); setAdd(null); bump(); } }}>Add</button>
        <button className="btn-ghost !py-1.5 !text-xs" onClick={() => setAdd(null)}>Cancel</button>
      </div>}
      <div className="hint mb-2">{f0(v.lines.length)} lines · {s.fq(v.tot.c)} cases · {f1(v.tot.kg / 1000)} t · ₹{f1(v.tot.v / 1e5)} L. Change {s.uLbl().toLowerCase()} to override the plan; set 0 or tick Remove to drop a line. Trucks rebuild at once.</div>
      <TableWrap><thead><tr><Th>Leg</Th><Th>Truck</Th><Th>Material</Th><Th>Description</Th><Th>From</Th><Th>To</Th><Th n>{s.uLbl()}</Th><Th n>Planned</Th><Th n>Kg</Th><Th>Priority</Th><Th>Critical</Th><Th>Reason</Th><Th n>Lands (d)</Th><Th>Remove</Th></tr></thead><tbody>
        {v.lines.slice(0, cap).map((l: Record<string, any>) => {
          const t = l.truck != null ? s.truckOf(l.truck) : null;
          return <tr key={l.id} className={l.off ? 'opacity-40' : l.held ? 'bg-appBg' : l.crit ? 'bg-redBg/50' : l.tier === 1 ? 'bg-blueBg/60' : ''}>
            <Td>{l.leg}</Td><Td>{s.truckLabel(l)} {t && <Chip status={t.status}>{t.veh === 'PTL' ? 'PTL' : t.veh + ' t'}</Chip>}</Td><Td>{M[l.mi].code}</Td><Td>{M[l.mi].desc}</Td><Td>{S[l.from].code}</Td>
            <Td>{S[l.to].code}{l.via && <span className="hint"> → {l.via}</span>}</Td>
            <Td n><input key={l.id + ':' + s.qty(l) + s.ST.unit} type="number" min={0} step="any" defaultValue={s.qty(l)} className="w-20 rounded-md border border-border px-1.5 py-0.5 text-right text-xs" onBlur={(e) => { if (+e.target.value !== s.qty(l)) { s.editLine(l, e.target.value); bump(); } }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /></Td>
            <Td n className="text-inkSoft">{l.manual ? 'manual' : s.fq(l.cases0 * s.qf(l.mi))}{l.inPcs ? <Chip>pcs</Chip> : null}</Td><Td n>{f0(l.kg)}</Td>
            <Td>{TIER[l.tier as 0 | 1 | 2 | 3] || ''}{l.topup ? <span className="hint"> top-up</span> : null}{l.pass ? <span className="hint"> pass-through</span> : null}{l.cb ? <span className="hint"> callback from {S[l.cbFrom].code}</span> : null}{l.belowMin ? <span className="hint"> below minimum</span> : null}{l.fast ? <span className="hint"> quickest route</span> : null}{l.flush ? <span className="hint"> 3P flush</span> : null}{l.idtBalance ? <span className="hint"> balance</span> : null}{l.minUp ? <span className="hint"> raised to minimum</span> : null}</Td>
            <Td className="font-bold text-red">{l.crit ? 'CRITICAL' : ''}</Td><Td>{l.reason}</Td><Td n>{l.a}</Td>
            <Td><input type="checkbox" checked={!!l.off} onChange={(e) => { s.removeLine(l, e.target.checked); bump(); }} /></Td></tr>;
        })}
      </tbody></TableWrap>
      {v.lines.length > cap && <div className="hint mt-1">Showing first {cap} of {f0(v.lines.length)} - narrow the filter.</div>}
      {P.lines.length === 0 && <div className="hint">No plan lines.</div>}
    </div>
  );
}

/* ------------------------------------------------------------- Trucks */
export function Trucks({ s, createIndent }: SProps & { createIndent?: (t: Record<string, any>, lines: Record<string, any>[]) => React.ReactNode }) {
  const [tf, setTf] = useState({ src: '', status: '' });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const v = s.trucksView(tf), P = s.ST.P, M = s.M, S = s.S;
  const toggle = (k: string) => setOpen((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <div>
      <Bar>
        <Seg options={[['', 'All'], ['full', 'Full'], ['part-load', 'Part load'], ['part-critical', 'Part critical'], ['PTL', 'PTL'], ['held', 'Held']]} value={tf.status} onChange={(status) => setTf({ ...tf, status })} />
        <label>Source <select className={small} value={tf.src} onChange={(e) => setTf({ ...tf, src: e.target.value })}><option value="">All</option>{v.srcs.map((x: string) => <option key={x}>{x}</option>)}</select></label>
        <span className="font-normal">Full = filled to at least {Math.round(P.opt.minFill * 100)}%. Part critical / PTL = carries critical stock and should go now. Held = waits until the lane fills a truck. Click a row for its lines.</span>
      </Bar>
      <TableWrap max="72vh"><thead><tr><Th>Truck</Th><Th>Status</Th><Th>Leg</Th><Th>From</Th><Th>To</Th><Th n>Vehicle</Th><Th n>Tonnes</Th><Th n>Fill</Th><Th n>Lines</Th><Th n>{s.uLbl()}</Th><Th>Critical</Th><Th /></tr></thead><tbody>
        {v.rows.map(({ t, key, lines }: { t: Record<string, any>; key: string; lines: Record<string, any>[] }) => {
          const o = open.has(key);
          return <React.Fragment key={key}>
            <tr className={`cursor-pointer ${t.crit ? 'bg-redBg/50' : t.status === 'held' ? 'bg-appBg' : ''}`} onClick={() => toggle(key)}>
              <Td>{o ? '▾' : '▸'} {t.no != null ? 'T' + String(t.no + 1).padStart(3, '0') : '-'}</Td>
              <Td><Chip status={t.status}>{t.status}</Chip>{t.later != null && <span className="hint"> after leg-1 lands (day {t.later})</span>}</Td><Td>{t.leg}</Td><Td>{t.src}</Td><Td>{s.sName(t.to)}</Td>
              <Td n>{t.veh == null ? '' : t.veh === 'PTL' ? 'PTL' : t.veh + ' t'}</Td><Td n>{f1(t.tonnes)}</Td><Td n>{t.fill == null ? '' : Math.round(t.fill * 100) + '%'}</Td><Td n>{lines.length}</Td>
              <Td n>{s.fq(lines.reduce((a, l) => a + s.qty(l), 0))}</Td><Td className="font-bold text-red">{t.crit ? f0(lines.filter((l) => l.crit).length) + ' lines' : ''}</Td>
              <Td>{createIndent && t.no != null ? createIndent(t, lines) : null}</Td></tr>
            {o && lines.map((l, i) => <tr key={i} className={l.crit ? 'bg-redBg/30' : 'bg-cream/60'}><Td /><Td>{M[l.mi].code}</Td><Td />
              <Td>{M[l.mi].desc}</Td><Td n>{S[l.from].code}</Td><Td n>{f0(l.kg)} kg</Td><Td /><Td>{TIER[l.tier as 0 | 1 | 2 | 3] || ''}</Td><Td n>{s.fq(s.qty(l))}</Td><Td colSpan={3} className="text-inkSoft"><b className="text-red">{l.crit ? 'CRITICAL ' : ''}</b>{l.via ? 'for ' + l.via + ' · ' : ''}{l.reason}</Td></tr>)}
          </React.Fragment>;
        })}
      </tbody></TableWrap>
    </div>
  );
}
