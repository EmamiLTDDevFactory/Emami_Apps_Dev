'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { ValueHelpItem } from '@/lib/types';
import { cacheKey, createHelpCache, type HelpCache, type HelpParams } from '@/lib/valuehelp';

let cache: HelpCache | undefined;
/** One cache per browser session (module level, mirrored to sessionStorage); concurrent callers of the same list share one request. */
export function helpCache(): HelpCache {
  cache ??= createHelpCache((name, params) => api.valueHelp(name, params), typeof window !== 'undefined' ? safeSession() : undefined);
  return cache;
}
function safeSession(): Storage | undefined { try { return window.sessionStorage; } catch { return undefined; } }

export interface HelpState { items: ValueHelpItem[]; loading: boolean; error: boolean }

/** A value help list with its loading state. name undefined or params null = nothing to load (for example a parent field is still empty). */
export function useValueHelpState(name: string | undefined, params: HelpParams | null = {}): HelpState {
  const k = name && params ? cacheKey(name, params) : '';
  const stable = useMemo(() => params ?? {}, [k]); // eslint-disable-line react-hooks/exhaustive-deps
  const [state, setState] = useState<HelpState>(() => ({ items: (k && name ? helpCache().peek(name, stable) : undefined) ?? [], loading: false, error: false }));
  useEffect(() => {
    if (!name || !k) { setState({ items: [], loading: false, error: false }); return; }
    const hit = helpCache().peek(name, stable);
    if (hit) { setState({ items: hit, loading: false, error: false }); return; }
    let live = true;
    setState({ items: [], loading: true, error: false });
    helpCache().load(name, stable).then((items) => live && setState({ items, loading: false, error: false })).catch(() => live && setState({ items: [], loading: false, error: true }));
    return () => { live = false; };
  }, [k, name, stable]);
  return state;
}

/** Same, only the list (screens that do not show a loading state). */
export function useValueHelp(name: string | undefined, params: HelpParams | null = {}): ValueHelpItem[] {
  return useValueHelpState(name, params).items;
}
