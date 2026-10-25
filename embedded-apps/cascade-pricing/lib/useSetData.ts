'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, getCascade } from './api';
import type { CascadeSet, Row, Tone } from './types';

/** Rows of one entity set, loaded the first time the tab is shown; reload() fetches again. A failed load is kept in `error` until a load works; the tab shows it (LoadError), so it is not repeated in the status bar. */
export function useSetData(set: CascadeSet, active: boolean, showMessage: (text: string, tone: Tone) => void) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const loaded = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await getCascade(set));
      setError(null);
      loaded.current = true;
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(e instanceof Error ? e.message : 'Could not load the data.', 0);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [set, showMessage]);

  useEffect(() => {
    if (active && !loaded.current) void reload();
  }, [active, reload]);

  return { rows, setRows, loading, reload, error };
}
