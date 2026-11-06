'use client';
/** Loads the split (and the Selected / C-Map rates) of many FGs, two at a time, with progress and Stop. Every result lands in the shared caches, so the drawer and the Excel reuse them. */
import { loadRateBasis } from './rateBasis';
import { peekSplit, startSplit } from './useBudget';
import type { FgSplit } from './export';
import type { BudgetQuery } from './filter';
import type { BudgetSummaryRow } from './types';

const POOL = 2;
export interface Progress { done: number; total: number }

async function pool<T>(items: T[], one: (x: T, i: number) => Promise<void>, stopped: () => boolean, onProgress: (p: Progress) => void): Promise<void> {
  let next = 0, done = 0;
  const worker = async () => {
    while (!stopped()) {
      const i = next++;
      if (i >= items.length) return;
      await one(items[i], i);
      onProgress({ done: ++done, total: items.length });
    }
  };
  onProgress({ done: 0, total: items.length });
  await Promise.all(Array.from({ length: Math.min(POOL, items.length) }, worker));
}

export async function loadAllSplits(q: BudgetQuery, fgs: BudgetSummaryRow[], ctx: string, email: string, stopped: () => boolean, onProgress: (p: Progress) => void): Promise<FgSplit[]> {
  const out: FgSplit[] = fgs.map((fg) => ({ fg, split: null }));
  await pool(fgs, async (fg, i) => {
    await startSplit(q, fg.Matnr, fg.Werks, ctx, email);
    const e = peekSplit(q, fg.Matnr, fg.Werks, email);
    out[i].split = e?.status === 'done' ? e.data ?? [] : null;
  }, stopped, onProgress);
  return out;
}
/** Only the splits already in memory (nothing is requested). */
export const cachedSplits = (q: BudgetQuery, fgs: BudgetSummaryRow[], email: string): FgSplit[] => fgs.map((fg) => { const e = peekSplit(q, fg.Matnr, fg.Werks, email); return { fg, split: e?.status === 'done' ? e.data ?? [] : null }; });

/** Returns how many FGs could not be priced. */
export async function loadAllBasis(fgs: BudgetSummaryRow[], signal: AbortSignal, onProgress: (p: Progress) => void): Promise<number> {
  let failed = 0;
  const seen = Array.from(new Map(fgs.map((f) => [`${f.Matnr}|${f.Werks}`, f])).values());
  await pool(seen, async (fg) => { const r = await loadRateBasis(fg.Matnr, fg.Werks, { signal }); if ('error' in r) failed++; }, () => signal.aborted, onProgress);
  return failed;
}
