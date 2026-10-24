'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getCascade } from './api';
import type { CascadeSet, Row, Tone } from './types';

/** Rows of one entity set, loaded the first time the tab is shown; reload() fetches again. Errors go to the status bar. */
export function useSetData(set: CascadeSet, active: boolean, showMessage: (text: string, tone: Tone) => void) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const loaded = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await getCascade(set));
      loaded.current = true;
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Could not load the data.', 'error');
    } finally {
      setLoading(false);
    }
  }, [set, showMessage]);

  useEffect(() => {
    if (active && !loaded.current) void reload();
  }, [active, reload]);

  return { rows, setRows, loading, reload };
}
