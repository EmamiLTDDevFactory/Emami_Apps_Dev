'use client';
/**
 * Hooks over the cache. NOTHING loads by itself on page open: the main rows start only from run() (the Run button), and the
 * detail hooks start only when `enabled` is true (a row expanded, a tab opened, or "Run live comparison" pressed).
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { ensure, invalidate, peek, subscribe, type WacEntry } from './cache';
import { buildWacFilter, type WacFilterInput } from './filter';
import { WAC_SET, type WacSetKey } from './fields';
import { fetchWac } from './service';
import type { WacRowsBySet } from './types';

const use = <T,>(key: string | null): WacEntry<T> | undefined => useSyncExternalStore(subscribe, () => peek<T>(key), () => undefined);

/** Same inputs -> same key -> same cached result. The set name and the exact $filter make it. */
export const wacKey = (set: WacSetKey, q: WacFilterInput): string => `wac|${WAC_SET[set]}|${buildWacFilter(q, set)}`;
/** The run a call belongs to: the main selection without any per-row material. */
export const wacCtx = (q: WacFilterInput): string => `wac-run|${buildWacFilter({ ...q, materials: undefined, prodha: q.prodha }, 'ROWS')}`;

function safeKey(set: WacSetKey, q: WacFilterInput | null): string | null {
  if (!q) return null;
  try { return wacKey(set, q); } catch { return null; }
}

export const startWac = <K extends WacSetKey>(set: K, q: WacFilterInput, ctx: string, force = false) =>
  ensure<WacRowsBySet[K]>(wacKey(set, q), ctx, set, (signal) => fetchWac(set, q, { signal }), force);

/** Main table: `query` is the SUBMITTED selection (null until the first Run). run() starts it; refresh() refetches. */
export function useWacRows(query: WacFilterInput | null) {
  const key = safeKey('ROWS', query);
  const entry = use<WacRowsBySet['ROWS']>(key);
  const ctx = useMemo(() => (query ? wacCtx(query) : ''), [query]);
  const run = useCallback((q: WacFilterInput) => startWac('ROWS', q, wacCtx(q)), []);
  const refresh = useCallback(() => {
    if (!query) return;
    invalidate(wacCtx(query));
    return startWac('ROWS', query, wacCtx(query), true);
  }, [query]);
  return { entry, ctx, run, refresh };
}

function useDetail<K extends WacSetKey>(set: K, query: WacFilterInput | null, enabled: boolean, run: WacFilterInput | null) {
  const key = safeKey(set, query);
  const entry = use<WacRowsBySet[K]>(key);
  useEffect(() => {
    if (enabled && query && run && key && !peek(key)) void startWac(set, query, wacCtx(run));
  }, [enabled, key, query, run, set]);
  const retry = useCallback(() => { if (query && run) void startWac(set, query, wacCtx(run), true); }, [query, run, set]);
  return { entry, retry };
}

/** Comparison matrix of one finished good and plant (WacCompareSet): runs the live costing, so only when enabled. */
export const useWacCompare = (query: WacFilterInput | null, enabled: boolean, run: WacFilterInput | null) => useDetail('COMPARE', query, enabled, run);
export const useWacComponents = (query: WacFilterInput | null, enabled: boolean, run: WacFilterInput | null) => useDetail('COMP', query, enabled, run);
export const useWacDocuments = (query: WacFilterInput | null, enabled: boolean, run: WacFilterInput | null) => useDetail('DOCS', query, enabled, run);
