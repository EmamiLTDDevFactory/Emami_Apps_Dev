/**
 * Run snapshots: the compact history the cost-change explainer compares against. One snapshot per FG header of a
 * costing run, leaf rows only (Haschild blank), one object per header + component + unit:
 *   { hwerks, headmat, idnrk, mtart, meins, q, sel_source, src_count, donor, r_loc, f_loc, fx_inr, p_inr, loc_curr, cov_h1, bud_landed }
 *   q      quantity per finished piece = ProdQty / ExplQty (the BOM tree's basis; falls back to Menge / Hbmeng, guard 0)
 *   r_loc  SelRatePcLoc    f_loc FrtPcLoc    fx_inr SelFxInr    p_inr TotCostPcInr
 * A component that appears several times under one header is added up: q summed, r_loc / f_loc / p_inr / fx_inr
 * quantity-weighted. total_per_unit = sum of q * p_inr.
 * Storage: this browser only (IndexedDB payloads + a small localStorage index), newest 400 snapshots, 400 days.
 * saveSnapshotIfEnabled never blocks or fails a costing run.
 */
import { D, ZERO, type Decimal } from '../cost/decimal';
import { isLeafRow } from '../cost/tree';
import type { CostLine } from '../sap/fields';
import type { CostQuery } from '../query/schema';
import { idb, ls } from '../client/storage';
import { SNAPSHOTS_ENABLED } from '../ai/config';

export interface SnapLine {
  hwerks: string; headmat: string; idnrk: string; mtart: string; meins: string;
  q: string; sel_source: string; src_count: number; donor: string;
  r_loc: string; f_loc: string; fx_inr: string; p_inr: string; loc_curr: string; cov_h1: string; bud_landed: string;
}
export interface SnapParams { system: string; prio: string[]; lookback: number; donorPlant: string; explQty: string; inclFrt: boolean; stdFrt: boolean; useAsof: boolean; asofDate: string }
export interface Snapshot {
  run_id: string; ts: string; user_id: string; system: string; sku: string; plant: string; headtxt: string;
  params_hash: string; params: SnapParams; total_per_unit: string; line_count: number; lines: SnapLine[]; suspect: boolean; label?: string;
}
export type SnapIndex = Omit<Snapshot, 'lines'>;

export const SNAPSHOT_RETENTION_DAYS = 400;
const MAX_SNAPSHOTS = 400;
const INDEX = 'bce:snapshots:index';

export function snapParams(q: CostQuery, system: string): SnapParams {
  return { system, prio: [...q.prio], lookback: q.lookback, donorPlant: q.donorPlant || '', explQty: String(q.explQty), inclFrt: q.inclFrt, stdFrt: q.stdFrt, useAsof: !!q.useAsof, asofDate: q.asofDate || '' };
}
/** Stable hash of the settings that make two runs like-for-like. */
export function paramsHash(p: SnapParams): string {
  const s = JSON.stringify([p.system, p.prio.join(','), p.lookback, p.donorPlant, p.explQty, p.inclFrt, p.stdFrt, p.useAsof, p.asofDate]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const wavg = (a: Decimal, aq: Decimal, b: Decimal, bq: Decimal) => (aq.plus(bq).isZero() ? b : a.times(aq).plus(b.times(bq)).div(aq.plus(bq)));

/** Leaf lines of a run grouped into one snapshot per FG header. */
export function buildSnapshots(rows: CostLine[], q: CostQuery, system: string, user: string, label?: string): Snapshot[] {
  const params = snapParams(q, system);
  const hash = paramsHash(params);
  const explQty = D(q.explQty).gt(0) ? D(q.explQty) : D(1);
  const heads = new Map<string, { headtxt: string; lines: Map<string, { l: SnapLine; q: Decimal; r: Decimal; f: Decimal; x: Decimal; p: Decimal }> }>();
  for (const r of rows) {
    if (!isLeafRow(r)) continue;
    const hk = `${r.Hwerks}|${r.Headmat}`;
    let h = heads.get(hk);
    if (!h) heads.set(hk, (h = { headtxt: r.Headtxt, lines: new Map() }));
    const qty = D(r.ProdQty).gt(0) ? D(r.ProdQty).div(explQty) : D(r.Hbmeng).gt(0) ? D(r.Menge).div(D(r.Hbmeng)) : ZERO;
    const ck = `${r.Idnrk}|${r.Meins}`;
    const cur = { r: D(r.SelRatePcLoc), f: D(r.FrtPcLoc), x: D(r.SelFxInr).gt(0) ? D(r.SelFxInr) : D(1), p: D(r.TotCostPcInr) };
    const e = h.lines.get(ck);
    if (!e) {
      h.lines.set(ck, { q: qty, ...cur, l: { hwerks: r.Hwerks, headmat: r.Headmat, idnrk: r.Idnrk, mtart: r.Mtart, meins: r.Meins, q: '', sel_source: r.SelSource || '', src_count: Number(r.SrcCount) || 0, donor: r.Donor || '', r_loc: '', f_loc: '', fx_inr: '', p_inr: '', loc_curr: r.LocCurr || '', cov_h1: String((r as unknown as { CovH1?: string }).CovH1 ?? ''), bud_landed: String(r.BudLanded ?? '0') } });
    } else {
      e.r = wavg(e.r, e.q, cur.r, qty); e.f = wavg(e.f, e.q, cur.f, qty); e.x = wavg(e.x, e.q, cur.x, qty); e.p = wavg(e.p, e.q, cur.p, qty);
      e.q = e.q.plus(qty);
    }
  }
  const ts = new Date().toISOString();
  return [...heads.entries()].map(([hk, h]) => {
    const lines = [...h.lines.values()].map((e) => ({ ...e.l, q: e.q.toString(), r_loc: e.r.toString(), f_loc: e.f.toString(), fx_inr: e.x.toString(), p_inr: e.p.toString() }));
    const total = lines.reduce((a, l) => a.plus(D(l.q).times(D(l.p_inr))), ZERO);
    const [plant, sku] = hk.split('|');
    return { run_id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, ts, user_id: user, system, sku, plant, headtxt: h.headtxt, params_hash: hash, params, total_per_unit: total.toString(), line_count: lines.length, lines, suspect: false, label };
  });
}

/* ---------- store (this browser) ---------- */

export function listSnapshots(sku?: string, plant?: string): SnapIndex[] {
  const all = ls.get<SnapIndex[]>(INDEX, []);
  const cutoff = Date.now() - SNAPSHOT_RETENTION_DAYS * 86400000;
  return all.filter((s) => new Date(s.ts).getTime() >= cutoff && (!sku || s.sku === sku) && (!plant || s.plant === plant)).sort((a, b) => b.ts.localeCompare(a.ts));
}
export async function loadSnapshot(runId: string): Promise<Snapshot | null> {
  try { return (await idb.get<Snapshot>(`snap:${runId}`)) ?? null; } catch { return null; }
}

/** Saves the run's snapshots (only when enabled). Marks a run suspect when it has under half the lines of the previous like-for-like one. */
export async function saveSnapshotIfEnabled(rows: CostLine[], q: CostQuery, system: string, user: string): Promise<void> {
  if (!SNAPSHOTS_ENABLED || q.mode !== 'B' || !rows.length) return;
  try {
    const snaps = buildSnapshots(rows, q, system, user);
    const index = ls.get<SnapIndex[]>(INDEX, []);
    for (const s of snaps) {
      const prev = index.filter((x) => x.sku === s.sku && x.plant === s.plant && x.params_hash === s.params_hash).sort((a, b) => b.ts.localeCompare(a.ts))[0];
      if (prev && s.line_count < prev.line_count * 0.5) s.suspect = true;
      await idb.set(`snap:${s.run_id}`, s);
      const { lines: _lines, ...meta } = s; // eslint-disable-line @typescript-eslint/no-unused-vars
      index.push(meta);
    }
    const cutoff = Date.now() - SNAPSHOT_RETENTION_DAYS * 86400000;
    const sorted = index.sort((a, b) => b.ts.localeCompare(a.ts));
    const keep = sorted.filter((s, i) => i < MAX_SNAPSHOTS && new Date(s.ts).getTime() >= cutoff);
    for (const s of sorted) if (!keep.includes(s)) await idb.del(`snap:${s.run_id}`).catch(() => {});
    ls.set(INDEX, keep);
  } catch { /* never block or fail the costing run */ }
}
