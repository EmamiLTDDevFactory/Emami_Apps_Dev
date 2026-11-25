'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { list, ApiError, type ListOptions } from './api';

/** Load a list once (and on reload). `path` null = wait. Keeps previous rows while reloading. */
export function useList<T>(path: string | null, options?: ListOptions) {
  const [rows, setRows] = useState<T[]>([]);
  const [count, setCount] = useState<number | undefined>();
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const key = JSON.stringify([path, options]);
  const alive = useRef(0);
  useEffect(() => {
    if (!path) return;
    const id = ++alive.current;
    setLoading(true);
    list<T>(path, options).then((r) => { if (alive.current === id) { setRows(r.rows); setCount(r.count); setError(''); } })
      .catch((e) => { if (alive.current === id) setError(e instanceof ApiError ? e.message : 'Could not load the data.'); })
      .finally(() => { if (alive.current === id) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { rows, count, loading, error, reload };
}
