'use client';
/**
 * One detail read of a Board row (drivers, alerts, history): starts only when `enabled` (its tab is opened), through the shared cache (the same
 * inputs stay cached, Refresh = retry), with NO time limit; leaving the page aborts it.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { ensure, peek, subscribe, type WacEntry } from '@/lib/wac/cache';
import { buildMarginFilter, type MarginQuery } from '@/lib/margin/filter';
import { MARGIN_SET, type MarginReadKey } from '@/lib/margin/fields';
import { fetchMargin, rowMessages } from '@/lib/margin/service';
import type { MarginRowsBySet } from '@/lib/margin/types';

export const DETAIL_CTX = 'margin-board-detail';
export function detailKey(set: MarginReadKey, q: MarginQuery): string | null {
  try { return `margin|${MARGIN_SET[set]}|${buildMarginFilter(q, set)}`; } catch { return null; }
}

export function useDetail<K extends MarginReadKey>(set: K, q: MarginQuery | null, enabled: boolean): { entry: WacEntry<MarginRowsBySet[K]> | undefined; retry: () => void } {
  const key = q ? detailKey(set, q) : null;
  const entry = useSyncExternalStore(subscribe, () => peek<MarginRowsBySet[K]>(key), () => undefined);
  const start = useCallback((force: boolean) => {
    if (!q || !key) return;
    void ensure<MarginRowsBySet[K]>(key, DETAIL_CTX, set, async (signal) => { const r = await fetchMargin(set, q, { signal }); return { rows: r.rows, messages: rowMessages(r.rows as { Msg?: string }[], r.messages), ms: r.ms }; }, force);
  }, [q, key, set]);
  useEffect(() => { if (enabled && key && !peek(key)) start(false); }, [enabled, key, start]);
  return { entry, retry: () => start(true) };
}
