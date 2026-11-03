'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { ValueHelpItem } from '@/lib/types';

const cache = new Map<string, ValueHelpItem[]>();

/** Loads a value help list once and shares it; params make a separate list (for example the description cascade). */
export function useValueHelp(name: string | undefined, params: Record<string, string> = {}): ValueHelpItem[] {
  const k = name ? `${name}?${new URLSearchParams(params).toString()}` : '';
  const [items, setItems] = useState<ValueHelpItem[]>(() => (k ? cache.get(k) ?? [] : []));
  useEffect(() => {
    if (!name) return;
    const hit = cache.get(k);
    if (hit) { setItems(hit); return; }
    let live = true;
    api.valueHelp(name, params).then((r) => { cache.set(k, r); if (live) setItems(r); }).catch(() => undefined);
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);
  return items;
}
