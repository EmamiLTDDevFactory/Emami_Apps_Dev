// @ts-nocheck - these views render the engine's own loosely typed plan records (see lib/dp.ts: DpSession is any)
'use client';
import React, { useMemo, useState } from 'react';
import { downloadExport } from '../../lib/dp';
import { Bar, SProps, Seg, f1, siteOptions, small } from './common';

/* Raam Baan Leg 1 / Leg 2 in the DP.xlsx layout. Depot cells are editable: the change goes back to the plan lines and the trucks rebuild. */
export function Sheet({ s, bump, toast }: SProps) {
  const [sv, setSv] = useState<{ leg: number; src: number | null; onlyPlan: boolean; q: string; hide: boolean }>({ leg: 1, src: null, onlyPlan: true, q: '', hide: false });
  const list: number[] = s.sheetSources(sv.leg);
  const def = sv.leg === 1 ? 'UN13' : 'DP44';
  const src = sv.src != null && list.includes(sv.src) ? sv.src : (list.find((i) => s.S[i].code === def) ?? list[0]);
  const sh = useMemo(() => (src == null ? null : s.sheetFor(sv.leg, src)), [s, sv.leg, src, s.ST.P, s.ST.unit, s.ST.div, bumpKey(s)]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!sh || src == null) return <div className="card p-4 text-sm">No source to show.</div>;
  const { hdr, cD0, dcols } = sh.meta!;
  const extras = s.sheetExtras(sv.leg, src, dcols);
  const val = (c: unknown) => (c != null && typeof c === 'object' ? (c as { v: unknown }).v : c);
  const stl = (c: unknown) => (c != null && typeof c === 'object' ? ((c as { s?: number }).s ?? 0) : 0);
  const head = sh.rows.slice(0, hdr), body = sh.rows.slice(hdr), listMi = sh.meta!.list;
  const q = sv.q.trim().toLowerCase();
  let idx = body.map((_, i) => i);
  if (sv.onlyPlan) idx = idx.filter((i) => { const r = body[i]; for (let c = cD0; c < r.length; c++) if (+(val(r[c]) as number) > 0) return true; return false; });
  if (q) idx = idx.filter((i) => String(val(body[i][1])).toLowerCase().includes(q) || String(val(body[i][2])).toLowerCase().includes(q) || String(val(body[i][0])).toLowerCase().includes(q));
  const hidFrom = sv.leg === 1 ? 2 : 3, hidTo = sv.leg === 1 ? cD0 - 2 : 7;
  const vis = (c: number) => !(sv.hide && c >= hidFrom && c < hidTo);
  const cEnd = cD0 + dcols.length, codeCols = sv.leg === 1 ? 1 : 2;
  const fmt = (v: unknown, st: number, ci: number, th: boolean) => (v == null || v === '' ? '' : ci < codeCols && !th && typeof v === 'number' ? String(v) : typeof v === 'number' ? (st === 7 ? f1(v) : v === 0 && st !== 8 ? '' : s.fq(v)) : String(v));
  const cls = (v: unknown, st: number) => `whitespace-nowrap border-b border-border/60 px-2 py-1 text-[12px] ${typeof v === 'number' ? 'text-right tabular-nums' : ''} ${st === 9 ? 'bg-redBg text-red font-bold' : st === 12 ? 'bg-blueBg' : ''} ${st === 8 || st === 7 || st === 4 ? 'font-bold' : ''} ${st === 10 ? 'font-bold text-plum' : ''}`;
  return (
    <div>
      <Bar>
        <Seg options={[[1, 'Raam Baan Leg 1 (unit)'], [2, 'Raam Baan Leg 2 (MWH)']]} value={sv.leg} onChange={(leg) => setSv({ ...sv, leg, src: null })} />
        <select className={small} value={src} onChange={(e) => setSv({ ...sv, src: +e.target.value })}>{siteOptions(s, list)}</select>
        <label className="flex items-center gap-1"><input type="checkbox" checked={sv.onlyPlan} onChange={(e) => setSv({ ...sv, onlyPlan: e.target.checked })} /> Only rows with a plan</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={sv.hide} onChange={(e) => setSv({ ...sv, hide: e.target.checked })} /> Hide {sv.leg === 1 ? 'case pack / weight / stock' : 'stock / callback / arrival'} columns</label>
        <input type="search" className={small + ' w-52'} placeholder="Material / description" value={sv.q} onChange={(e) => setSv({ ...sv, q: e.target.value })} />
        <span className="flex-1" />
        <button className="btn-ghost !py-1.5 !text-xs" onClick={() => downloadExport(s.sheetExport(sv.leg, src))}>Export this sheet</button>
      </Bar>
      <div className="hint mb-2">{sv.leg === 1 ? 'Stock from SAP (UR + QC)' : 'Stock from SAP; Arrival = ticked trucks; depot columns = today from MWH stock + callback'} · {s.uLbl().toLowerCase()} · red = critical · blue = against open orders · hover a cell for why · edit a depot cell to change the plan</div>
      <div className="card overflow-auto" style={{ maxHeight: '70vh' }}>
        <table className="border-collapse text-[12px]" data-testid="sheet-table"><thead>
          {head.map((r, ri) => <tr key={ri} className="bg-cream">{r.map((c: unknown, ci: number) => vis(ci) ? (ri === hdr - 1
            ? <th key={ci} className="sticky top-0 z-10 whitespace-nowrap border-b border-border bg-cream px-2 py-1.5 text-left text-[11px] font-bold text-inkSoft">{String(val(c) ?? '')}</th>
            : <td key={ci} className={cls(val(c), stl(c))}>{fmt(val(c), stl(c), 99, true)}</td>) : null)}</tr>)}
          <tr className="bg-cream">{new Array(cD0).fill(0).map((_, c) => vis(c) ? <td key={c} className="px-2 py-1 text-right text-[11px] font-bold text-plum">{c === cD0 - 1 ? 'Trucks' : ''}</td> : null)}
            {extras.trk.map((t: { txt: string; crit: boolean; full: boolean; held: boolean }, j: number) => <td key={j} className={`whitespace-nowrap px-2 py-1 text-[11px] font-bold ${t.crit ? 'bg-redBg text-red' : t.full ? 'bg-greenBg text-green' : t.held ? 'bg-appBg text-inkSoft' : ''}`}>{t.txt}</td>)}<td colSpan={4} /></tr>
        </thead><tbody>
          {idx.slice(0, 1500).map((i) => { const r = body[i], mi = listMi[i];
            return <tr key={mi}>{r.map((c: unknown, ci: number) => {
              if (ci >= cD0 && ci < cEnd) {
                const v = +(val(c) as number) || 0, st = stl(c), tip = extras.why.get(mi + '|' + dcols[ci - cD0]);
                return <td key={ci} title={tip ? tip.join('\n') : undefined} className={`border-b border-border/60 px-1 py-0.5 text-right ${st === 9 ? 'bg-redBg' : st === 12 ? 'bg-blueBg' : ''}`}>
                  <input key={mi + ':' + ci + ':' + v} type="number" min={0} defaultValue={v || ''} className="w-16 rounded border border-transparent bg-transparent px-1 py-0.5 text-right text-[12px] hover:border-border focus:border-rust"
                    onBlur={(e) => { const want = Math.max(0, +e.target.value || 0); if (want === v) return; const got = s.editSheetCell(sv.leg, src, mi, dcols[ci - cD0], want); bump();
                      toast(Math.abs(got - want) > 1e-6 && !s.isPcsMat(mi) ? `Planned in whole cases: ${s.fq(got)} ${s.uLbl().toLowerCase()} (case pack ${s.M[mi].cp || 1})` : 'Plan updated'); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /></td>;
              }
              return vis(ci) ? <td key={ci} className={cls(val(c), stl(c))}>{fmt(val(c), stl(c), ci, false)}</td> : null;
            })}</tr>; })}
        </tbody></table>
      </div>
      {idx.length > 1500 && <div className="hint mt-1">Showing 1,500 of {idx.length} rows - use the search.</div>}
    </div>
  );
}
/* the memo key: plan edits mutate lines in place, so Sheet is told to recompute by the parent's render counter */
function bumpKey(s: { ST: { P: { lines: unknown[]; trucks: unknown[] } } }) { return s.ST.P.lines.length * 7919 + s.ST.P.trucks.length + ((globalThis as { __dpBump?: number }).__dpBump || 0); }
