// Value help lists: cache key, search, the description cascade, and a session cache that shares one request between callers.
import type { ValueHelpItem } from './types';

export type HelpParams = Record<string, string>;
export type HelpFetcher = (name: string, params: HelpParams) => Promise<ValueHelpItem[]>;

/** Same list = same key: name in upper case, parameters sorted, empty ones dropped. */
export function cacheKey(name: string, params: HelpParams = {}): string {
  const p = Object.entries(params).filter(([, v]) => v !== '' && v !== undefined).map(([k, v]) => `${k.toLowerCase()}=${v}`).sort().join('&');
  return `${name.toUpperCase()}?${p}`;
}

/**
 * The description cascade: main group > sub group > sub sub group, each filtered by the material type and the choices above it.
 * null = a parent is not chosen yet: the list is not loaded (and the field shows why). Other lists have no parent here.
 */
export function cascadeParams(name: string, sel: { mtart?: string; mgrp?: string; sgrp?: string }): HelpParams | null {
  const need = { MGRP: ['mtart'], SGRP: ['mtart', 'mgrp'], SSGR: ['mtart', 'mgrp', 'sgrp'] }[name.toUpperCase()] as Array<keyof typeof sel> | undefined;
  if (!need) return {};
  const out: HelpParams = {};
  for (const k of need) { const v = sel[k]; if (!v) return null; out[k] = v; }
  return out;
}

/** Text keys (i18n) of the hint shown while the parent of a cascading list is still empty. */
export const CASCADE_PARENT_HINT: Record<string, 'new.hintMtart' | 'new.hintMg' | 'new.hintSg'> = { MGRP: 'new.hintMtart', SGRP: 'new.hintMg', SSGR: 'new.hintSg' };

export const HELP_LIMIT = 100;

/** Entries whose key or text matches the typed text: starting with it first, then containing it. An empty query shows everything (up to the limit). */
export function filterItems(items: ValueHelpItem[], query: string, limit = HELP_LIMIT): { shown: ValueHelpItem[]; total: number } {
  const q = query.trim().toLowerCase();
  if (!q) return { shown: items.slice(0, limit), total: items.length };
  const starts: ValueHelpItem[] = [];
  const has: ValueHelpItem[] = [];
  for (const it of items) {
    const k = it.key.toLowerCase();
    const t = it.text.toLowerCase();
    if (k.startsWith(q) || t.startsWith(q)) starts.push(it);
    else if (k.includes(q) || t.includes(q)) has.push(it);
  }
  const all = [...starts, ...has];
  return { shown: all.slice(0, limit), total: all.length };
}

/** "KEY text", or just the key when the text is the same. */
export const itemLabel = (it: ValueHelpItem): string => (it.text && it.text !== it.key ? `${it.key} ${it.text}` : it.key);

export interface HelpCache {
  /** the list, from the cache or from one shared request */
  load(name: string, params?: HelpParams): Promise<ValueHelpItem[]>;
  /** the list when it is already there */
  peek(name: string, params?: HelpParams): ValueHelpItem[] | undefined;
  clear(): void;
}

/** Cache for one browser session. A failed request is not remembered (the next call asks again). `store` mirrors small lists to sessionStorage. */
export function createHelpCache(fetcher: HelpFetcher, store?: Pick<Storage, 'getItem' | 'setItem'>): HelpCache {
  const done = new Map<string, ValueHelpItem[]>();
  const inflight = new Map<string, Promise<ValueHelpItem[]>>();
  const PREFIX = 'mm_vh:';
  const fromStore = (k: string): ValueHelpItem[] | undefined => {
    try { const raw = store?.getItem(PREFIX + k); return raw ? (JSON.parse(raw) as ValueHelpItem[]) : undefined; } catch { return undefined; }
  };
  return {
    peek(name, params = {}) {
      const k = cacheKey(name, params);
      const hit = done.get(k) ?? fromStore(k);
      if (hit) done.set(k, hit);
      return hit;
    },
    load(name, params = {}) {
      const k = cacheKey(name, params);
      const hit = done.get(k) ?? fromStore(k);
      if (hit) { done.set(k, hit); return Promise.resolve(hit); }
      const run = inflight.get(k);
      if (run) return run;
      const p = fetcher(name, params).then((items) => {
        done.set(k, items);
        try { const s = JSON.stringify(items); if (s.length < 200_000) store?.setItem(PREFIX + k, s); } catch { /* storage full or blocked */ }
        return items;
      }).finally(() => { inflight.delete(k); });
      inflight.set(k, p);
      return p;
    },
    clear() { done.clear(); inflight.clear(); }
  };
}
