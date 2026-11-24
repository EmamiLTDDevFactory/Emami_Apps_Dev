'use client';
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';

/** Load one document bundle. `load` returns null when SAP does not know it (or hides it from this person). */
export function useDoc<T>(id: string, load: () => Promise<T | null>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!id) { setLoading(false); return; }
    let live = true;
    setLoading(true);
    load().then((d) => { if (live) { setData(d); setError(''); } })
      .catch((e) => { if (live) setError(e instanceof ApiError ? e.message : 'Could not load this document.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload, tick };
}
