'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSet } from './api';
import type { CascadeSet, Row, Status } from './types';

/** Rows of one entity set, loaded the first time the tab is shown; reload() fetches again. */
export function useSetData(set: CascadeSet, active: boolean, setStatus: (s: Status) => void) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const loaded = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await getSet(set));
      loaded.current = true;
    } catch (e) {
      setStatus({ busy: false, message: e instanceof Error ? e.message : 'Could not load the data.', tone: 'error' });
    } finally {
      setLoading(false);
    }
  }, [set, setStatus]);

  useEffect(() => {
    if (active && !loaded.current) void reload();
  }, [active, reload]);

  return { rows, loading, reload };
}
