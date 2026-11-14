/**
 * Plan costing in steps. One CostLineSet Mode P request for a whole plan (all plants, every FG) can run for minutes and the gateway gives up
 * after ~230 s, so the run is cut into units: ONE plant and a few FGs (from PlanEntrySet) per request. Units run PLAN_CONCURRENCY at a time,
 * the rows of every finished unit are published at once (the tabs show them while the rest still runs), a unit that fails with an HTTP error,
 * a dropped connection or a timeout is split in two and retried down to one FG, and a FG that still fails is reported (with a Retry), not fatal.
 */
import { SapError } from '../sap/client';
import type { SapMessage } from '../sap/messages';
import { fetchPlanCostLines, fetchPlanEntries } from './client';
import type { PlanCostLine } from './fields';
import type { PlanCostQuery } from './requests';

export const PLAN_BATCH = 5;
export const PLAN_CONCURRENCY = 2;

export interface PlanUnit { werks: string; materials: string[] }
/** One successful CostLineSet request: the rate options are read with the SAME plant + FG list, so their Seqnr lines up with the cost lines. */
export interface PlanCall { werks: string; materials: string[] }
export interface PlanFailure { werks: string; materials: string[]; message: string }
export interface PlanProgress {
  done: number;
  total: number;
  /** what is being costed right now, e.g. "UN13 · 3 FGs" */
  current: string[];
  lines: number;
  failed: PlanFailure[];
  etaMs: number | null;
}

const chunk = <T,>(xs: T[], n: number): T[][] => { const o: T[][] = []; for (let i = 0; i < xs.length; i += n) o.push(xs.slice(i, i + n)); return o; };
const abortErr = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
const isAbort = (e: unknown, s?: AbortSignal) => !!s?.aborted || (e as Error)?.name === 'AbortError' || (e instanceof SapError && e.kind === 'aborted');
const splittable = (e: unknown) => e instanceof SapError && (e.kind === 'http' || e.kind === 'network' || e.kind === 'timeout');

/** Plants x FG batches of a plan. FGs come from PlanEntrySet (one cheap read per plant) unless the query names materials. */
export async function planUnits(q: PlanCostQuery, plants: string[], signal?: AbortSignal): Promise<PlanUnit[]> {
  if (!plants.length) return [{ werks: '', materials: q.materials }]; // plan with no plant list: one plain run, as before
  const units: PlanUnit[] = [];
  for (const w of plants) {
    let mats = q.materials;
    if (!mats.length) {
      const r = await fetchPlanEntries(q.plan, { plants: [w] }, { signal });
      mats = [...new Set(r.rows.map((e) => e.Matnr).filter(Boolean))].sort();
    }
    for (const list of chunk(mats, PLAN_BATCH)) units.push({ werks: w, materials: list });
  }
  return units;
}

export interface PlanRun {
  rows: PlanCostLine[];
  messages: SapMessage[];
  failed: PlanFailure[];
  calls: PlanCall[];
  /** rows per unit, in unit order (kept so a retry can slot its rows in) */
  parts: PlanCostLine[][];
}

export async function runPlanUnits(
  q: PlanCostQuery, units: PlanUnit[], opts: { signal?: AbortSignal; onStep?: (run: PlanRun, p: PlanProgress) => void; parts?: PlanCostLine[][]; indexes?: number[]; calls?: PlanCall[] } = {},
): Promise<PlanRun> {
  const { signal, onStep } = opts;
  const parts: PlanCostLine[][] = opts.parts ? opts.parts.map((p) => p.slice()) : units.map(() => []);
  const todo = opts.indexes ?? units.map((_, i) => i);
  const msgs = new Map<string, SapMessage>();
  const failed: PlanFailure[] = [];
  const calls: PlanCall[] = opts.calls ? opts.calls.slice() : [];
  const running = new Map<number, string>();
  let done = 0;
  const started = Date.now();
  const snapshot = (): PlanRun => ({ rows: parts.flat(), messages: [...msgs.values()], failed: failed.slice(), calls: calls.slice(), parts });
  const step = () => {
    const left = todo.length - done;
    onStep?.(snapshot(), { done, total: todo.length, current: [...running.values()], lines: parts.reduce((a, p) => a + p.length, 0), failed: failed.slice(), etaMs: done > 0 && left > 0 ? Math.round(((Date.now() - started) / done) * left / PLAN_CONCURRENCY) : null });
  };

  const costList = async (idx: number, werks: string, list: string[]): Promise<void> => {
    if (signal?.aborted) throw abortErr();
    try {
      const r = await fetchPlanCostLines({ ...q, plants: werks ? [werks] : q.plants, materials: list }, { signal });
      parts[idx].push(...r.rows);
      calls.push({ werks, materials: list });
      r.messages.forEach((m) => msgs.set(`${m.severity}|${m.code}|${m.message}`, m));
    } catch (e) {
      if (isAbort(e, signal)) throw abortErr();
      if (splittable(e) && list.length > 1) {
        const half = Math.ceil(list.length / 2);
        await costList(idx, werks, list.slice(0, half));
        await costList(idx, werks, list.slice(half));
        return;
      }
      failed.push({ werks, materials: list, message: (e as Error).message || 'SAP request failed.' });
    }
    step();
  };

  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const idx = todo[next++];
      const u = units[idx];
      parts[idx] = [];
      running.set(idx, `${u.werks || 'plan'} · ${u.materials.length || 'all'} FG${u.materials.length === 1 ? '' : 's'}`);
      step();
      try { await costList(idx, u.werks, u.materials); } finally { running.delete(idx); }
      done++;
      step();
    }
  };
  step();
  await Promise.all(Array.from({ length: Math.min(PLAN_CONCURRENCY, todo.length || 1) }, worker));
  return snapshot();
}
