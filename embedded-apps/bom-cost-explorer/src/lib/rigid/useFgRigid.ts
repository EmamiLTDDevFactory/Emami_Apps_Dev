'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadFgRigid, type FgRigid } from './fgRigid';
import { strip0 } from './model';

/** Rigid packing split per finished good for a list on screen. `rows` carry matnr and the production plant. Returns an empty map until (and unless) SAP answers. */
export function useFgRigid(rows: { matnr: string; werks?: string }[], enabled = true): { get: (matnr: string, werks?: string) => FgRigid | undefined; any: boolean; loading: boolean } {
  const [map, setMap] = useState<Map<string, FgRigid>>(new Map());
  const [loading, setLoading] = useState(false);
  const key = useMemo(() => rows.map((r) => `${r.werks ?? ''}|${strip0(r.matnr)}`).sort().join(','), [rows]);
  const seen = useRef('');
  useEffect(() => {
    if (!enabled || !key || seen.current === key) return;
    seen.current = key;
    const c = new AbortController(); setLoading(true);
    const t = setTimeout(() => {
      void loadFgRigid(rows.map((r) => ({ matnr: r.matnr, werks: r.werks ?? '' })), (m) => { if (!c.signal.aborted) setMap(m); }, c.signal).finally(() => { if (!c.signal.aborted) setLoading(false); });
    }, 400);
    return () => { clearTimeout(t); c.abort(); seen.current = ''; };
  }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return { get: (matnr, werks) => (werks ? map.get(`${werks.toUpperCase()}|${strip0(matnr)}`) : [...map.values()].find((v) => v.matnr === strip0(matnr))), any: map.size > 0, loading };
}
