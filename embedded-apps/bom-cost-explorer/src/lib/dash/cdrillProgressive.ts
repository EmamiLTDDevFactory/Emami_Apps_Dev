/**
 * Breakup of a material, read gradually. One SAP read of a whole financial year (hundreds of batches, thousands of process orders) can run past the gateway
 * limit (about 230 s). The period is therefore cut into windows (31 days, newest first), each window is its own DashCdrillSet read, and the answers are
 * MERGED here after every window so the screen fills up while SAP keeps working. A window that still times out is split in half and retried (down to one day).
 *
 * Merging is exact because SAP's component rows carry totals: Qty and Val are sums over the sold quantity of the window, SoldQty of the summary is the weight.
 * Merged per piece = sum of Qty (or Val) of all windows / sum of the weights. Batch rows join by batch; the budget rows (they depend on the financial year of the
 * "to" date only) are taken once.
 */
import Decimal from 'decimal.js';
import type { CdrillRow } from './types';
import { SapError } from '../sap/client';

const D = (v: string | number | null | undefined) => { try { return new Decimal(String(v ?? '0') || '0'); } catch { return new Decimal(0); } };
const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
const at = (s: string) => new Date(`${s}T00:00:00Z`);
const addDays = (s: string, n: number) => iso(new Date(at(s).getTime() + n * 86400000));
const daysBetween = (a: string, b: string) => Math.round((at(b).getTime() - at(a).getTime()) / 86400000);

export interface Win { from: string; to: string }
/** Windows of at most `days` days covering from..to, newest first. */
export function windows(from: string, to: string, days = 31): Win[] {
  const out: Win[] = [];
  let end = to;
  while (end >= from) {
    const start = addDays(end, -(days - 1));
    out.push({ from: start < from ? from : start, to: end });
    end = addDays(start, -1);
  }
  return out;
}
export const splitWindow = (w: Win): [Win, Win] | null => {
  const n = daysBetween(w.from, w.to);
  if (n < 1) return null;
  const mid = addDays(w.from, Math.floor(n / 2));
  return [{ from: addDays(mid, 1), to: w.to }, { from: w.from, to: mid }];   // newest half first
};

/** Rows of several windows -> the rows one read of the whole period would give. */
export function mergeCdrill(parts: CdrillRow[][]): CdrillRow[] {
  const matnr = parts.flat()[0]?.Matnr ?? '';
  const batches = new Map<string, CdrillRow>();
  const comps = new Map<string, CdrillRow & { _qty: Decimal; _val: Decimal }>();
  const orderItems = new Map<string, CdrillRow>();
  let weight = new Decimal(0);
  let budget: CdrillRow[] = [];
  for (const rows of parts) {
    const s = rows.find((r) => r.Grain === 'S');
    if (s) weight = weight.plus(D(s.SoldQty));
    if (!budget.length) budget = rows.filter((r) => r.Grain === 'T');
    for (const r of rows) {
      if (r.Grain === 'B') {
        const x = batches.get(r.Charg);
        if (!x) batches.set(r.Charg, { ...r });
        else { x.SoldQty = D(x.SoldQty).plus(D(r.SoldQty)).toString(); if (x.Flag !== 'OK' && r.Flag === 'OK') { x.Flag = 'OK'; x.Msg = r.Msg; x.RmPc = r.RmPc; x.PmPc = r.PmPc; x.PfPc = r.PfPc; x.OthPc = r.OthPc; x.ProdQty = r.ProdQty; x.Orders = r.Orders; } }
      } else if (r.Grain === 'O') {
        if (!orderItems.has(`${r.Msg}|${r.Idnrk}`)) orderItems.set(`${r.Msg}|${r.Idnrk}`, r);
      } else if (r.Grain === 'C') {
        const x = comps.get(r.Idnrk);
        if (!x) comps.set(r.Idnrk, { ...r, _qty: D(r.Qty), _val: D(r.Val) });
        else { x._qty = x._qty.plus(D(r.Qty)); x._val = x._val.plus(D(r.Val)); }
      }
    }
  }
  const cRows: CdrillRow[] = Array.from(comps.values()).map(({ _qty, _val, ...r }) => ({
    ...r, Qty: _qty.toString(), Val: _val.toString(), SoldQty: weight.toString(),
    AvgQtyPc: weight.gt(0) ? _qty.div(weight).toString() : '0', AvgCostPc: weight.gt(0) ? _val.div(weight).toString() : '0',
  }));
  const bRows = Array.from(batches.values());
  const sum = (cat: string[]) => cRows.filter((r) => cat.includes(r.Cat) || (!['R', 'P', 'F'].includes(r.Cat) && cat.includes('O'))).reduce((a, r) => a.plus(D(r.AvgCostPc)), new Decimal(0)).toString();
  const ok = bRows.filter((b) => b.Flag === 'OK').length;
  const orders = bRows.reduce((a, b) => a + (Number(b.Orders) || 0), 0);
  const first = parts.flat().find((r) => r.Grain === 'S');
  const s: CdrillRow | null = first ? {
    ...first, Grain: 'S', SoldQty: weight.toString(), RmPc: sum(['R']), PmPc: sum(['P']), PfPc: sum(['F']), OthPc: sum(['O']), Orders: orders,
    ProdQty: bRows.reduce((a, b) => a.plus(D(b.ProdQty)), new Decimal(0)).toString(), Flag: ok ? 'OK' : 'NBC', Msg: `${ok} of ${bRows.length} sold batches costed from ${orders} process orders`,
  } : null;
  void matnr;
  return [...(s ? [s] : []), ...bRows, ...cRows, ...Array.from(orderItems.values()), ...budget];
}

export interface Progress { rows: CdrillRow[]; /** days of the period read so far / in total */ coveredDays: number; totalDays: number; current: Win | null; splits: number; failed: Win | null; error: string }
export type ReadWindow = (w: Win) => Promise<CdrillRow[]>;

const isTimeout = (e: unknown) => e instanceof SapError && (e.kind === 'timeout' || e.status === 504 || e.sapStatus === 504);
const spanDays = (w: Win) => daysBetween(w.from, w.to) + 1;

/** Reads every window in turn (newest first), merging after each one; a timing-out window is split and retried. Never throws for a SAP error: the rows read so far come back with `error`. */
export async function readGradually(from: string, to: string, read: ReadWindow, onProgress: (p: Progress) => void, opts: { days?: number; signal?: AbortSignal } = {}): Promise<Progress> {
  const queue = windows(from, to, opts.days ?? 31);
  const totalDays = spanDays({ from, to });
  const parts: CdrillRow[][] = [];
  let covered = 0, splits = 0;
  let failed: Win | null = null, error = '';
  const state = (current: Win | null): Progress => ({ rows: mergeCdrill(parts), coveredDays: covered, totalDays, current, splits, failed, error });
  while (queue.length) {
    if (opts.signal?.aborted) break;
    const w = queue.shift()!;
    onProgress(state(w));
    try {
      parts.push(await read(w));
      covered += spanDays(w);
    } catch (e) {
      if (opts.signal?.aborted) break;
      const halves = isTimeout(e) ? splitWindow(w) : null;
      if (halves) { splits++; queue.unshift(...halves); continue; }
      failed = w;
      error = isTimeout(e) ? `SAP still timed out for ${w.from}${w.to !== w.from ? ` to ${w.to}` : ''} (a single day). The figures below cover the rest of the period.` : (e instanceof Error ? e.message : String(e));
      break;
    }
  }
  const last = state(null);
  onProgress(last);
  return last;
}
