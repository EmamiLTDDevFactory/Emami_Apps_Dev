'use client';
import { useCallback, useEffect, useRef } from 'react';

const CAP = 50;

/** Leave the app the way the browser would: previous page if there is one, else the hub. */
export function leaveApp() {
  if (window.history.length > 1) window.history.back();
  else window.location.href = '/';
}

/**
 * useScreenHistory(snapshot, restore): remembers earlier screens of this app, in memory only.
 * `snapshot` is a small serialisable object describing the current screen (compared via
 * JSON.stringify). Whenever it changes, the previous snapshot is pushed on a stack (capped at 50),
 * unless the change was made by back() itself. back() pops the most recent earlier snapshot and
 * hands it to `restore` (which uses the app's own setters); with nothing left it leaves the app.
 * A null snapshot means "not on a screen yet" (still booting) and is never pushed.
 * It never touches browser history (no pushState/replaceState).
 */
export function useScreenHistory<T>(snapshot: T | null, restore: (prev: T) => void): { back: () => void } {
  const key = JSON.stringify(snapshot);
  const stack = useRef<string[]>([]);
  const last = useRef(key);
  const restoring = useRef<string | null>(null); // the snapshot back() just asked for
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  useEffect(() => {
    if (key === last.current) return;
    const expected = restoring.current;
    restoring.current = null;
    if (key !== expected && last.current !== 'null') {
      stack.current.push(last.current);
      if (stack.current.length > CAP) stack.current.shift();
    }
    last.current = key;
  }, [key]);

  const back = useCallback(() => {
    let prev = stack.current.pop();
    while (prev !== undefined && prev === last.current) prev = stack.current.pop();
    if (prev === undefined) return leaveApp();
    restoring.current = prev;
    restoreRef.current(JSON.parse(prev) as T);
  }, []);

  return { back };
}
