'use client';
import { useCallback } from 'react';
import { ApiError } from './api';
import type { ActionResult, Status } from './types';

export interface BusyActionOptions {
  setStatus: (s: Status) => void;
  /** Reload the tab's data after a successful write. */
  reload?: () => Promise<void> | void;
  /** Clear the selection after a successful write. */
  clearSelection?: () => void;
}

/**
 * Wraps one backend call: Working... while it runs, the backend's message afterwards (red when it failed or some rows
 * failed), then reload + clear selection on success (reads like COMPARE pass reloadAfter: false, keepSelection: true). Returns the result, or null when the call threw.
 */
export function useBusyAction({ setStatus, reload, clearSelection }: BusyActionOptions) {
  return useCallback(async (call: () => Promise<ActionResult>, opts: { reloadAfter?: boolean; keepSelection?: boolean } = {}): Promise<ActionResult | null> => {
    setStatus({ busy: true, message: 'Working...', tone: 'info' });
    try {
      const res = await call();
      const tone = res.failed > 0 && res.processed === 0 ? 'error' : res.failed > 0 ? 'info' : 'success';
      if (opts.reloadAfter !== false && reload) await reload();
      if (!opts.keepSelection) clearSelection?.();
      setStatus({ busy: false, message: res.message || `${res.processed} processed, ${res.failed} failed.`, tone });
      return res;
    } catch (e) {
      const msg = e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong.';
      setStatus({ busy: false, message: msg, tone: 'error' });
      return null;
    }
  }, [setStatus, reload, clearSelection]);
}
