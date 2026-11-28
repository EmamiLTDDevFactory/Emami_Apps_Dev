'use client';
import React from 'react';
import { SETTINGS_FIELDS } from '../../lib/dp';
import { Card } from '../ui';
import { SProps, small } from './common';

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => <div className="flex items-center justify-between gap-4 border-b border-border/60 py-1.5 text-sm"><span>{label}</span><span>{children}</span></div>;

/* The engine's DEF options. Changes apply on Re-plan, for this session only (defaults live in dpEngine.js). */
export function Settings({ s, bump }: SProps) {
  const o = s.ST.opt, S = s.S, X = s.ST.P.X;
  const mark = () => { s.ST.dirty = true; bump(); };
  const num = (k: string) => <input type="number" step="any" className={small + ' w-24 text-right'} defaultValue={o[k]} onBlur={(e) => { const v = +e.target.value; if (isFinite(v) && v !== o[k]) { o[k] = v; mark(); } }} />;
  const chk = (k: string) => <input type="checkbox" checked={!!o[k]} onChange={(e) => { o[k] = e.target.checked; mark(); }} />;
  const srcMode = (code: string) => ((o.srcExclude || []).includes(code) ? 'none' : (o.srcAllow || {})[code] ? 'only' : 'any');
  const grpOf = (i: number) => (X.isMwh[i] ? 0 : S[i].type === '3P' ? 2 : 1);
  const srcs: number[] = S.map((_: unknown, i: number) => i).filter((i: number) => X.isMwh[i] || (s.isUnit(i) && (s.D.stk.some((r: number[]) => r[1] === i) || (o.srcAllow || {})[S[i].code] || (o.srcExclude || []).includes(S[i].code))))
    .sort((a: number, b: number) => grpOf(a) - grpOf(b) || S[a].code.localeCompare(S[b].code));
  const dests: number[] = S.map((_: unknown, i: number) => i).filter((i: number) => X.isMwh[i]).concat(S.map((_: unknown, i: number) => i).filter((i: number) => X.isDepot[i] && !(o.viaHub || {})[S[i].code]));
  const setMode = (code: string, v: string) => {
    o.srcAllow = o.srcAllow || {}; o.srcExclude = (o.srcExclude || []).filter((x: string) => x !== code);
    if (v === 'any') delete o.srcAllow[code];
    else if (v === 'none') { delete o.srcAllow[code]; o.srcExclude.push(code); }
    else if (!o.srcAllow[code]) { const si = s.six[code]; o.srcAllow[code] = X.isMwh[si] ? S.map((_: unknown, i: number) => i).filter((i: number) => X.isDepot[i] && X.mwhOf[i] === si).map((i: number) => S[i].code) : [s.ST.P.opt.hub3p]; }
    mark();
  };
  const toggleDest = (code: string, d: string, on: boolean) => { const a = new Set<string>(o.srcAllow[code] || []); if (on) a.add(d); else a.delete(d); o.srcAllow[code] = [...a]; mark(); };
  return (
    <div className="space-y-4">
      <Card title="Planning settings"><div className="hint mb-2">Changes apply when you press Re-plan. They last for this session only; defaults are set in dpEngine.js (Sanjoy Paul's engine, unchanged).</div>
        {SETTINGS_FIELDS.map(([k, l]: [string, string]) => <Row key={k} label={l}>{num(k)}</Row>)}
        <Row label="Vehicle sizes (t)"><input className={small + ' w-28'} defaultValue={o.trucks.join(', ')} onBlur={(e) => { const v = e.target.value.split(/[,\s]+/).map(Number).filter((x) => x > 0); if (v.length) { o.trucks = v; mark(); } }} /></Row>
        <Row label="Plan inter-depot transfers (Pinaka)">{chk('doIdt')}</Row>
        <Row label="Allocate all 3P stock (what is left after the plan goes to the 3P hub)">{chk('flush3p')}</Row>
        <Row label="Plan only on the vehicles ticked as arrived (Arrivals tab)">{chk('arrivalOnly')}</Row>
        <Row label="Open orders go by the quickest source (MWH before unit when it lands sooner)">{chk('ooFastest')}</Row>
        <Row label="Critical (red, loaded first)"><select className={small} value={o.critRule} onChange={(e) => { o.critRule = e.target.value; mark(); }}><option value="stock">Depot stock below % of forecast</option><option value="engine">Open orders not covered / runs dry before the truck lands</option><option value="either">Either rule</option></select></Row>
        <Row label="Critical when depot stock is below this % of month forecast">{num('critStockPct')}</Row>
        <Row label="Stock in transit (SAP GIT, no date) lands within (days)">{num('gitDays')}</Row>
        <Row label="MWH buffer counts its depots' stock above their own target">{chk('mwhNetDepot')}</Row>
        <Row label="Load that does not fill a truck"><select className={small} value={o.holdPartLoads ? 'hold' : 'publish'} onChange={(e) => { o.holdPartLoads = e.target.value === 'hold'; mark(); }}><option value="publish">Dispatch as calculated (part load)</option><option value="hold">Hold for a full truck (critical still goes)</option></select></Row>
        {Object.entries(o.callback || {}).map(([w, d]) => <Row key={w} label={`Callback for ${s.sName(s.six[w])}: ${s.sName(s.six[d as string])} stock serves its depots in leg 2 when the MWH is short`}>
          <input type="checkbox" checked={!!o.doCallback && !(o.cbOff || []).includes(w)} onChange={(e) => { if (!o.doCallback) { o.doCallback = true; o.cbOff = Object.keys(o.callback || {}); } const off = new Set<string>(o.cbOff || []); if (e.target.checked) off.delete(w); else off.add(w); o.cbOff = [...off]; mark(); }} /></Row>)}
      </Card>
      <Card title="Minimum plan quantity"><div className="hint mb-2">Per material and destination, in cases. Lines below the minimum cannot be dispatched. 0 = no minimum.</div>
        <Row label="Raam Baan Leg 1 (unit → depot / MWH) minimum cases">{num('minCases1')}</Row><Row label="Raam Baan Leg 2 (MWH → depot) minimum cases">{num('minCases2')}</Row><Row label="Pinaka (inter-depot) minimum cases">{num('minCases3')}</Row>
        <Row label="Below the minimum"><select className={small} value={o.minMode} onChange={(e) => { o.minMode = e.target.value; mark(); }}><option value="drop">Drop the line</option><option value="up">Raise to the minimum if the source has stock, else drop</option></select></Row>
      </Card>
      <Card title="Plan in pieces"><div className="hint mb-2">These SKUs are planned in whole pieces, not rounded to full cases.</div>
        {['CCD', 'HCD'].map((d) => <Row key={d} label={`All ${d} SKUs`}><input type="checkbox" checked={(o.pcsDivs || []).includes(d)} onChange={(e) => { const a = new Set<string>(o.pcsDivs || []); if (e.target.checked) a.add(d); else a.delete(d); o.pcsDivs = [...a]; mark(); }} /></Row>)}
        <div className="mt-2 text-xs font-bold text-inkSoft">Only these material codes (comma, space or new line)<textarea rows={2} className={small + ' mt-1 block w-full font-normal'} defaultValue={(o.pcsMats || []).join(', ')} onBlur={(e) => { o.pcsMats = [...new Set<string>(e.target.value.split(/[\s,;]+/).map((x) => x.trim().replace(/\.0$/, '')).filter(Boolean))]; mark(); }} /></div>
      </Card>
      <Card title="Pinaka · inter-depot transfers"><div className="hint mb-2">Urgent moves always come first. Donors keep their own need and only lots made within the age limit move.</div>
        <Row label="Donors: own zone first, then the fallback zones">{chk('idtZoneOrder')}</Row><Row label="After the urgent moves, balance depots to coverage %">{chk('idtBalance')}</Row>
        <Row label="Balance target: % of month forecast">{num('idtBalancePct')}</Row><Row label="Donor keeps forecast × target × (1 + this %)">{num('idtBalanceMargin')}</Row>
        <Row label="No console lane: road km = straight km ×">{num('roadFactor')}</Row><Row label="No console lane: km per day">{num('kmPerDay')}</Row>
        <table className="mt-2 w-full text-sm"><thead><tr><th className="text-left text-xs text-inkSoft">Receiving zone</th><th className="text-left text-xs text-inkSoft">Fallback donor zones, in order</th></tr></thead><tbody>
          {['North', 'South', 'East', 'West'].map((z) => <tr key={z}><td className="py-1">{z}</td><td><input className={small + ' w-72'} defaultValue={(o.idtZoneFallback[z] || []).join(', ')} onBlur={(e) => { o.idtZoneFallback = { ...o.idtZoneFallback, [z]: e.target.value.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean).map((x) => x[0].toUpperCase() + x.slice(1).toLowerCase()) }; mark(); }} /></td></tr>)}
        </tbody></table>
      </Card>
      <Card title="Where each source may send"><div className="hint mb-2">Anywhere = any depot or MWH. Only selected = the ticked destinations (a depot it may not reach directly goes via that depot's MWH or Ambala). No plan = the source is not planned at all.</div>
        <table className="w-full text-sm"><thead><tr><th className="text-left text-xs text-inkSoft">Source</th><th className="text-left text-xs text-inkSoft">Sends to</th><th className="text-left text-xs text-inkSoft">Destinations</th></tr></thead><tbody>
          {srcs.map((si) => { const code = S[si].code, m = srcMode(code), list: string[] = (o.srcAllow || {})[code] || [];
            return <tr key={si} className="border-t border-border/60 align-top"><td className="py-1.5 pr-3">{s.sName(si)}</td>
              <td className="pr-3"><select className={small} value={m} onChange={(e) => setMode(code, e.target.value)}><option value="any">Anywhere</option><option value="only">Only selected</option><option value="none">No plan</option></select></td>
              <td>{m === 'only' ? dests.filter((d) => d !== si).map((d) => <label key={d} className="mr-3 inline-flex min-w-[150px] items-center gap-1 text-xs"><input type="checkbox" checked={list.includes(S[d].code)} onChange={(e) => toggleDest(code, S[d].code, e.target.checked)} />{S[d].code} {S[d].name}</label>) : <span className="hint">{m === 'any' ? (X.isMwh[si] ? 'its own depots; backup; Ambala to all India for open orders / trend' : 'all depots and MWHs') : 'nothing planned from this source'}</span>}</td></tr>; })}
        </tbody></table>
      </Card>
      <Card title="Network rules"><div className="space-y-1.5 text-sm">
        <div><b>Sources that share a truck:</b> {o.clubs.map((c: string[]) => c.join(' + ')).join('; ')}</div>
        <div><b>3P hub:</b> {s.sName(s.six[o.hub3p])}</div>
        <div><b>Depots served by a hub:</b> {Object.entries(o.viaHub).map(([a, b]) => `${s.sName(s.six[a])} from ${s.sName(s.six[b as string])}`).join('; ')}</div>
        <div><b>MWH serving all India:</b> {o.anyMwh.map((x: string) => s.sName(s.six[x])).join(', ')}</div>
        <div><b>Codes folded into a depot:</b> {Object.entries(s.D.fold || {}).map(([a, b]) => `${a}→${b}`).join(', ')}</div>
      </div></Card>
      <button className="btn-ghost" onClick={() => { s.restoreDefaults(); bump(); }}>Restore defaults</button>
    </div>
  );
}
