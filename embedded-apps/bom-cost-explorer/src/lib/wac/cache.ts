/**
 * In-memory result cache for the WAC calls. The costing behind them is expensive (about 10 to 15 s per 25 finished goods), so
 * a result stays for the same inputs until the user presses Refresh: there is NO age-based expiry (the equivalent of
 * staleTime Infinity) and NO time limit on a request. A request ends only when SAP answers, on Stop, or when the person
 * leaves the page (abortAll). Sorting or hiding columns never touches this: the rows live here, the table state does not.
 */
import { SapError } from '../sap/client';
import type { SapMessage } from '../sap/messages';

export type WacStatus = 'loading' | 'done' | 'error' | 'cancelled';
export interface WacEntry<T = unknown> {
  key: string;
  /** the run this call belongs to (the main selection): Refresh and the Excel export work per run */
  ctx: string;
  set: string;
  status: WacStatus;
  data: T[] | null;
  error: string | null;
  messages: SapMessage[];
  ms: number;
  startedAt: number;
  finishedAt: number | null;
}

export interface Fetched<T> { rows: T[]; messages: SapMessage[]; ms: number }

const store = new Map<string, WacEntry>();
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const peek = <T = unknown>(key: string | null): WacEntry<T> | undefined => (key ? (store.get(key) as WacEntry<T> | undefined) : undefined);
const put = (e: WacEntry) => { store.set(e.key, e); emit(); };

/** Runs `fetcher` once per key. Done and loading entries are reused as they are (no refetch); an error or a cancelled call is
 * retried on the next ensure; `force` refetches (the Refresh button). The returned promise never rejects. */
export async function ensure<T>(key: string, ctx: string, set: string, fetcher: (signal: AbortSignal) => Promise<Fetched<T>>, force = false): Promise<void> {
  const cur = store.get(key);
  if (!force && cur && (cur.status === 'done' || cur.status === 'loading')) return;
  controllers.get(key)?.abort();
  const ctl = new AbortController();
  controllers.set(key, ctl);
  put({ key, ctx, set, status: 'loading', data: cur?.data ?? null, error: null, messages: [], ms: 0, startedAt: Date.now(), finishedAt: null });
  try {
    const r = await fetcher(ctl.signal);
    if (ctl.signal.aborted) return;
    put({ key, ctx, set, status: 'done', data: r.rows, error: null, messages: r.messages, ms: r.ms, startedAt: store.get(key)?.startedAt ?? Date.now(), finishedAt: Date.now() });
  } catch (e) {
    const started = store.get(key)?.startedAt ?? Date.now();
    if (ctl.signal.aborted || (e as Error).name === 'AbortError' || (e instanceof SapError && e.kind === 'aborted')) {
      put({ key, ctx, set, status: 'cancelled', data: cur?.data ?? null, error: null, messages: [], ms: 0, startedAt: started, finishedAt: Date.now() });
    } else {
      const details = e instanceof SapError ? e.details : [];
      put({ key, ctx, set, status: 'error', data: null, error: (e as Error).message, messages: details, ms: 0, startedAt: started, finishedAt: Date.now() });
    }
  } finally {
    if (controllers.get(key) === ctl) controllers.delete(key);
  }
}

/** Stop button: abort the running calls of one run (or all). The finished results stay. */
export function stop(ctx?: string): void {
  for (const [key, ctl] of controllers) if (!ctx || store.get(key)?.ctx === ctx) ctl.abort();
}
/** Leaving the page. */
export const abortAll = (): void => stop();

/** Refresh: forget the finished results of a run (not the running ones) so the next ensure fetches again. */
export function invalidate(ctx: string): void {
  for (const [key, e] of store) if (e.ctx === ctx && e.status !== 'loading') store.delete(key);
  emit();
}

export const entriesOf = (ctx: string, set: string): WacEntry[] => Array.from(store.values()).filter((e) => e.ctx === ctx && e.set === set && e.status === 'done');
export const isRunning = (ctx?: string): boolean => Array.from(store.values()).some((e) => e.status === 'loading' && (!ctx || e.ctx === ctx));
/** test helper */
export function resetWacCache(): void { for (const c of controllers.values()) c.abort(); controllers.clear(); store.clear(); emit(); }
