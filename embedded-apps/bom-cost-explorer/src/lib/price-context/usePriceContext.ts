'use client';
/**
 * usePriceContext(materials): the MRP / selling price of the finished goods CURRENTLY SHOWN on a screen. Nothing is requested while the
 * switch is off, while no sales organisation is chosen, or while no finished good is visible; never by itself from the URL. Material
 * lists are split into calls of 50 and merged. Results are cached per material set and context (no expiry; Refresh refetches).
 */
import { useEffect, useMemo, useReducer } from 'react';
import { ensure, peek, subscribe, type WacEntry } from '../wac/cache';
import { fetchCk } from '../ck/service';
import type { CkHeaderRow } from '../ck/types';
import { fetchSo } from '../so/service';
import type { SoPriceRow } from '../so/types';
import { usePcApi } from './context';
import { pcBatchKey, pcCtx, pcQuery, planPriceBatches } from './state';

function useTick() {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subscribe(bump), []);
}

export interface PriceContextResult {
  /** Matnr -> rows (one per sales organisation, channel and document type) */
  prices: Map<string, SoPriceRow[]>;
  active: boolean; loading: boolean; error: string | null; messages: { code: string; message: string; severity: string }[];
}

export function usePriceContext(materials: string[]): PriceContextResult {
  const { state, admin } = usePcApi();
  const key = materials.join(',');
  const batches = useMemo(() => (admin ? planPriceBatches(state, materials) : []), [admin, state, key]); // eslint-disable-line react-hooks/exhaustive-deps
  useTick();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const b of batches) {
        if (cancelled) return;
        const q = pcQuery(state, b);
        await ensure<SoPriceRow>(pcBatchKey(state, b), pcCtx(state), 'PRICE', (signal) => fetchSo('PRICE', q, { signal }));
      }
    })();
    return () => { cancelled = true; };
  }, [batches, state]);

  const entries = batches.map((b) => peek<SoPriceRow>(pcBatchKey(state, b))).filter((e): e is WacEntry<SoPriceRow> => !!e);
  const prices = new Map<string, SoPriceRow[]>();
  for (const e of entries) for (const r of e.data ?? []) prices.set(r.Matnr, [...(prices.get(r.Matnr) ?? []), r]);
  const failed = entries.find((e) => e.status === 'error');
  return {
    prices, active: batches.length > 0,
    loading: batches.length > 0 && (entries.length < batches.length || entries.some((e) => e.status === 'loading')),
    error: failed?.error ?? null,
    messages: entries.flatMap((e) => e.messages),
  };
}

/** Standard cost of one finished good (CkHeaderSet, SAP picks the current standard estimate): only when `enabled` (hover / open). */
export function useStdCost(matnr: string, plant: string, enabled: boolean): { header: CkHeaderRow | null; loading: boolean; error: string | null } {
  const { admin } = usePcApi();
  useTick();
  const key = `ck|HEADER|std|${plant}|${matnr}`;
  useEffect(() => {
    if (admin && enabled && matnr && plant) void ensure<CkHeaderRow>(key, 'ck-strip', 'CKHEADER', (signal) => fetchCk('HEADER', { matnr, werks: plant }, { signal }));
  }, [admin, enabled, matnr, plant, key]);
  const e = peek<CkHeaderRow>(key);
  return { header: e?.status === 'done' ? e.data?.[0] ?? null : null, loading: e?.status === 'loading', error: e?.status === 'error' ? e.error : null };
}
