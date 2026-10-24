'use client';
import { useCallback } from 'react';
import { runAction } from './api';
import type { ActionName, ActionPayload, ActionResult, Tone } from './types';

export interface ShellApi {
  busy: boolean;
  setBusy: (b: boolean) => void;
  /** Adds a message to the status bar (newest first, last 20 kept). */
  showMessage: (text: string, tone: Tone) => void;
}

/**
 * Wraps runAction: busy while it runs, the result message in the status bar (red when anything failed, a generic text
 * when SAP sent none), and the result back - or null when the call failed (the error is shown in red).
 */
export function useBusyAction({ setBusy, showMessage }: Pick<ShellApi, 'setBusy' | 'showMessage'>) {
  return useCallback(async (action: ActionName, payload?: ActionPayload, vfrom?: string, vto?: string): Promise<ActionResult | null> => {
    setBusy(true);
    try {
      const r = await runAction(action, payload, vfrom, vto);
      const text = r.message.trim() || `Done: ${r.processed} processed${r.failed ? `, ${r.failed} failed` : ''}.`;
      showMessage(text, r.failed > 0 ? 'error' : 'success');
      return r;
    } catch (e) {
      showMessage(e instanceof Error && e.message ? e.message : 'Something went wrong.', 'error');
      return null;
    } finally {
      setBusy(false);
    }
  }, [setBusy, showMessage]);
}
