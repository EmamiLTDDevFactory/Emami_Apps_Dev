'use client';
/**
 * Lazy freight break-up of one cost line. Nothing is requested until `enabled` turns true (the first click / the
 * drawer section opened); results are cached in memory per ["freight-breakup", matnr, werks, freightDays, stdFrt]
 * for 10 minutes (the app has no TanStack Query; this is the same contract: key, staleTime, enabled, abort).
 * Closing the panel aborts a request still running.
 */
import { useEffect, useState } from 'react';
import type { FreightRow } from '../sap/fields';
import { cacheKey, fetchFreightBreakup, type FreightKey } from './breakup';

export const FREIGHT_STALE_MS = 10 * 60_000;
const cache = new Map<string, { at: number; rows: FreightRow[] }>();
export const clearFreightBreakupCache = () => cache.clear();

/** Cached read: a hit younger than 10 minutes is returned without calling SAP. */
export async function loadFreightBreakup(key: FreightKey, opts: { signal?: AbortSignal } = {}): Promise<FreightRow[]> {
  const k = cacheKey(key);
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < FREIGHT_STALE_MS) return hit.rows;
  const rows = await fetchFreightBreakup(key, opts);
  cache.set(k, { at: Date.now(), rows });
  return rows;
}

export type FreightBreakupState =
  | { status: 'idle' | 'loading'; rows: null; error: '' }
  | { status: 'ready'; rows: FreightRow[]; error: '' }
  | { status: 'error'; rows: null; error: string };

export function useFreightBreakup(key: FreightKey | null, enabled: boolean): FreightBreakupState & { retry: () => void } {
  const k = key ? cacheKey(key) : '';
  const [state, setState] = useState<FreightBreakupState>({ status: 'idle', rows: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!key || !enabled) return;
    const hit = cache.get(k);
    if (hit && Date.now() - hit.at < FREIGHT_STALE_MS) { setState({ status: 'ready', rows: hit.rows, error: '' }); return; }
    const c = new AbortController();
    setState({ status: 'loading', rows: null, error: '' });
    loadFreightBreakup(key, { signal: c.signal })
      .then((rows) => { if (!c.signal.aborted) setState({ status: 'ready', rows, error: '' }); })
      .catch((e) => { if (!c.signal.aborted) setState({ status: 'error', rows: null, error: (e as Error).message || 'SAP did not answer.' }); });
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, enabled, attempt]);
  return { ...state, retry: () => { cache.delete(k); setAttempt((a) => a + 1); } };
}
