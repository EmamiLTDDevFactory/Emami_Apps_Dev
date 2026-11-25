'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { errText } from './api';

/** Load data when the screen is first shown (and on reload()); keeps the last good data on error. */
export function useLoad<T>(fn: () => Promise<T>, active: boolean, initial: T, auto = true) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await fnRef.current());
      setLoaded(true);
    } catch (e) {
      setError(errText(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (active && auto && !loaded && !loading && !error) void reload(); }, [active, auto, loaded, loading, error, reload]);
  return { data, setData, loading, error, reload, loaded };
}
