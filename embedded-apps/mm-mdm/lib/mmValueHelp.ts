/**
 * Live value helps (F4 lists) of the material screens: GET /me/mm-mdm/valuehelp/<NAME>?<params>, cached per name + parameters,
 * loaded lazily, with an error kept per list. Nothing is invented: a list that cannot be read stays empty and carries SAP's / the
 * network's error text.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { getValueHelp } from './mmApi';
import { fetchCrsVerticals } from './phApi';

export interface Opt { value: string; label: string }

interface Entry { options?: Opt[]; error?: string; promise?: Promise<void> }
const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
let tick = 0;
const emit = () => { tick++; listeners.forEach((l) => l()); };

const cacheKey = (name: string, params: Record<string, string>) =>
  `${name}?${Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&')}`;

export const vhSubscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const vhTick = () => tick;

/** Loads a list once; later calls reuse it (force = after an error, "try again") */
export function vhLoad(name: string, params: Record<string, string> = {}, source?: 'verticals', force = false): Promise<void> {
  const key = cacheKey(name, params);
  const hit = cache.get(key);
  if (hit && !force && (hit.options || hit.promise)) return hit.promise ?? Promise.resolve();
  const entry: Entry = {};
  entry.promise = (source === 'verticals'
    ? fetchCrsVerticals().then((rows) => rows.map((r) => ({ value: r.code, label: r.text })))
    : getValueHelp(name, params).then((rows) => rows.map((r) => ({ value: r.key, label: r.text })))
  )
    .then((opts) => { entry.options = opts; entry.error = undefined; })
    .catch((e: Error) => { entry.error = e.message; entry.options = undefined; })
    .finally(() => { entry.promise = undefined; emit(); });
  cache.set(key, entry);
  emit();
  return entry.promise;
}

export function vhRead(name: string, params: Record<string, string> = {}): { options: Opt[]; loading: boolean; error: string } {
  const e = cache.get(cacheKey(name, params));
  return { options: e?.options ?? [], loading: !e || !!e.promise, error: e?.error ?? '' };
}

/** Description of one code from an already loaded list ('' when the list is not loaded or has no such code) */
export function vhText(name: string, params: Record<string, string>, value: string): string {
  return vhRead(name, params).options.find((o) => o.value === value)?.label ?? '';
}

export function vhReset() { cache.clear(); emit(); }

/** Re-renders when any list finishes loading */
export function useVhTick() { return useSyncExternalStore(vhSubscribe, vhTick, vhTick); }

/** One list, loaded on first use. `enabled=false` loads nothing (a dependent list whose parent is empty). */
export function useValueHelp(name: string, params: Record<string, string> = {}, enabled = true, source?: 'verticals') {
  useVhTick();
  const key = cacheKey(name, params);
  useEffect(() => { if (enabled) void vhLoad(name, params, source); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [key, enabled]);
  const r = vhRead(name, params);
  return { ...r, loading: enabled && r.loading, retry: () => vhLoad(name, params, source, true) };
}
