'use client';
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from './api';

/** Load one maintenance list (users / DOA rules); reload() after every save. `enabled` false = wait. */
export function useAdminList<T>(enabled: boolean, load: () => Promise<T[]>) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setLoading(true);
    load().then((r) => { if (live) { setRows(r); setError(''); } })
      .catch((e) => { if (live) setError(e instanceof ApiError ? e.message : 'Could not load the list.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { rows, loading, error, reload };
}
