'use client';
/** Hooks over the shared in-memory cache (lib/wac/cache.ts): same inputs -> same key -> one result, no expiry, Refresh refetches. Nothing loads by itself: start only from user actions. */
import { useSyncExternalStore } from 'react';
import { ensure, peek, subscribe, type WacEntry } from '../wac/cache';
import { CK_SET, type CkSetKey } from './fields';
import { buildCkFilter, type CkQuery } from './filter';
import { fetchCk } from './service';
import type { CkRowsBySet } from './types';

export const ckKey = (set: CkSetKey, q: CkQuery): string => `ck|${CK_SET[set]}|${buildCkFilter(q, set)}`;
function safeKey(set: CkSetKey, q: CkQuery | null): string | null {
  if (!q) return null;
  try { return ckKey(set, q); } catch { return null; }
}
export function useCkEntry<K extends CkSetKey>(set: K, q: CkQuery | null): WacEntry<CkRowsBySet[K]> | undefined {
  const key = safeKey(set, q);
  return useSyncExternalStore(subscribe, () => peek<CkRowsBySet[K]>(key), () => undefined);
}
export const startCk = <K extends CkSetKey>(set: K, q: CkQuery, ctx: string, label: string = set, force = false) =>
  ensure<CkRowsBySet[K]>(ckKey(set, q), ctx, label, (signal) => fetchCk(set, q, { signal }), force);
