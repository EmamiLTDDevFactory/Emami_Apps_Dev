/**
 * ONE snapshot of every invoice, sliced five ways.
 *
 * Previously this held six independent caches (inv + pend/disp/comp/ret/canc), and every
 * getter in lib/api.ts calls refreshInvoices(), which fetches ALL FIVE entity sets and then
 * discards four of them. Six consumers each doing that meant ~30 HTTP calls to paint the
 * dashboard and ~15 per dispatch, while the five caches could each be from a different moment
 * (so KPI totals summed across five different points in time).
 *
 * Now: refreshInvoices() runs ONCE and its result is the single source of truth. The five
 * per-status lists are derived from it with filters, so they are always mutually consistent
 * and cost nothing. The context's public shape is deliberately unchanged — same names, same
 * types, same "null until first load" semantics — so no screen needed rewriting for this.
 *
 * Staleness, not eviction: invalidate() marks the snapshot stale instead of nulling it, and
 * the tab screens re-check on focus (useFocusEffect). A write also applies its result locally
 * via applyLocalStatus() so the row moves tabs immediately. That combination is what fixes
 * rows appearing one action late: SAP's POST returns before the update task commits, so an
 * instant re-read could miss the write — previously that stale read was cached forever
 * because ensureX() only ever ran when its cache was null.
 */
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { isoDate, todayDate } from '@/lib/format';
import {
  CancelledInvoice,
  CompletedInvoice,
  DispatchDetail,
  Invoice,
  PendingInvoice,
  ReturnedInvoice,
} from '@/types/models';

const INV_CACHE_TTL_MS = 90 * 1000;

/** From Date / To Date used for the combined bulk fetch (LoginSet + all five entity sets) that
 *  fires on Dashboard entry/focus — always "today-30 to today", recomputed fresh each call since
 *  there's no user-facing control for it anymore (Pending/Dispatched/Completed/Returned/
 *  Cancelled each refetch just their own entity set independently instead — see
 *  refreshEntitySet below). */
function defaultDateFilter(): { frmDate: string; toDate: string } {
  const to = todayDate();
  const from = new Date(to);
  from.setDate(from.getDate() - 30);
  return { frmDate: isoDate(from), toDate: isoDate(to) };
}

export type CacheKey = 'inv' | 'pend' | 'disp' | 'comp' | 'ret' | 'canc';
export type StatusCacheKey = Exclude<CacheKey, 'inv'>;

const ALL_KEYS: CacheKey[] = ['inv', 'pend', 'disp', 'comp', 'ret', 'canc'];

/** Which entity set and status label each tab's independent refresh maps to. */
const ENTITY_SET_FOR: Record<StatusCacheKey, { entitySet: string; status: string }> = {
  pend: { entitySet: 'InvoicePendSet', status: 'Pending' },
  disp: { entitySet: 'InvoiceDispSet', status: 'Dispatched' },
  comp: { entitySet: 'InvoiceCompSet', status: 'Completed' },
  ret: { entitySet: 'InvoiceRetSet', status: 'Returned' },
  canc: { entitySet: 'InvoiceCanSet', status: 'Cancelled' },
};

/** One fetch feeds every key, so loading/error flags are set for all of them together. */
const everyKey = <T,>(value: T): Partial<Record<CacheKey, T>> =>
  ALL_KEYS.reduce((acc, k) => ({ ...acc, [k]: value }), {} as Partial<Record<CacheKey, T>>);

interface DataState {
  invCache: Invoice[] | null;
  pendCache: PendingInvoice[] | null;
  dispCache: DispatchDetail[] | null;
  compCache: CompletedInvoice[] | null;
  retCache: ReturnedInvoice[] | null;
  cancCache: CancelledInvoice[] | null;
  loading: Partial<Record<CacheKey, boolean>>;
  errors: Partial<Record<CacheKey, string>>;
  loadDashboard: () => Promise<void>;
  ensurePending: () => Promise<void>;
  ensureDispatched: () => Promise<void>;
  ensureCompleted: () => Promise<void>;
  ensureReturned: () => Promise<void>;
  ensureCancelled: () => Promise<void>;
  reloadInvoices: () => Promise<void>;
  /** Refetches just one tab's own entity set (Email + FrmDate + ToDate, no LoginSet) and merges
   *  the result into the shared cache in place of that status's old rows — used when a tab's own
   *  From/To Date filter changes, instead of refetching all five. */
  refreshEntitySet: (key: StatusCacheKey, frmDate: string, toDate: string) => Promise<void>;
  invalidate: (...keys: CacheKey[]) => void;
  /** Move one invoice to a new status locally, so the UI updates without waiting on SAP. */
  applyLocalStatus: (invoiceNo: string, status: string, patch?: Partial<Invoice>) => void;
}

const DataContext = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { session, consumeInitialInvoices } = useAuth();

  const [invCache, setInvCache] = useState<Invoice[] | null>(null);
  const cacheTs = useRef<number | null>(null);
  /** De-dupes concurrent callers — Reports asks all five at once, that must stay one request. */
  const inFlight = useRef<Promise<void> | null>(null);

  const [loading, setLoading] = useState<Partial<Record<CacheKey, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<CacheKey, string>>>({});

  useEffect(() => {
    if (!session) {
      setInvCache(null);
      cacheTs.current = null;
      inFlight.current = null;
      setLoading({});
      setErrors({});
    }
  }, [session]);

  const reloadInvoices = useCallback(async (): Promise<void> => {
    if (inFlight.current) return inFlight.current;

    const run = (async () => {
      setLoading(everyKey(true));
      setErrors({});
      try {
        const rows = await api.refreshInvoices(defaultDateFilter());
        setInvCache(rows);
        cacheTs.current = Date.now();
      } catch (e) {
        setErrors(everyKey(e instanceof Error ? e.message : 'Could not reach SAP.'));
      } finally {
        setLoading({});
        inFlight.current = null;
      }
    })();

    inFlight.current = run;
    return run;
  }, []);

  /** One tab's own entity set, refetched independently on that tab's own From/To Date change —
   *  no LoginSet call, just Email + FrmDate + ToDate against that one entity set. The result
   *  replaces that status's rows in the shared invCache, leaving every other status untouched. */
  const refreshEntitySet = useCallback(async (key: StatusCacheKey, frmDate: string, toDate: string): Promise<void> => {
    const { entitySet, status } = ENTITY_SET_FOR[key];
    setLoading((prev) => ({ ...prev, [key]: true }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    try {
      const rows = await api.refreshEntitySet(entitySet, status, { frmDate, toDate });
      setInvCache((prev) => {
        const others = (prev ?? []).filter((r) => r.status !== status);
        return [...others, ...rows];
      });
    } catch (e) {
      setErrors((prev) => ({ ...prev, [key]: e instanceof Error ? e.message : 'Could not reach SAP.' }));
    } finally {
      setLoading((prev) => ({ ...prev, [key]: false }));
    }
  }, []);

  /** load_df(): reuse the one-shot LoginSet rows first, else refetch when missing/stale. */
  const ensureInvoices = useCallback(async () => {
    const handoff = consumeInitialInvoices();
    if (handoff && invCache === null) {
      setInvCache(handoff);
      cacheTs.current = Date.now();
      return;
    }
    const age = cacheTs.current ? Date.now() - cacheTs.current : Infinity;
    if (invCache === null || age > INV_CACHE_TTL_MS) {
      await reloadInvoices();
    }
  }, [consumeInitialInvoices, invCache, reloadInvoices]);

  // Derived slices. null while nothing has loaded yet, exactly as the old caches behaved.
  const pendCache = useMemo(
    () => (invCache === null ? null : (invCache.filter((r) => r.status === 'Pending') as unknown as PendingInvoice[])),
    [invCache]
  );
  const dispCache = useMemo(
    () => (invCache === null ? null : (invCache.filter((r) => r.status === 'Dispatched') as unknown as DispatchDetail[])),
    [invCache]
  );
  const compCache = useMemo(
    () => (invCache === null ? null : (invCache.filter((r) => r.status === 'Completed') as unknown as CompletedInvoice[])),
    [invCache]
  );
  const retCache = useMemo(
    () => (invCache === null ? null : (invCache.filter((r) => r.status === 'Returned') as unknown as ReturnedInvoice[])),
    [invCache]
  );
  const cancCache = useMemo(
    () => (invCache === null ? null : (invCache.filter((r) => r.status === 'Cancelled') as unknown as CancelledInvoice[])),
    [invCache]
  );

  /**
   * Every ensure* now resolves to the same snapshot fetch. Kept as separate names so the
   * screens that call them did not have to change.
   */
  const loadDashboard = ensureInvoices;
  const ensurePending = ensureInvoices;
  const ensureDispatched = ensureInvoices;
  const ensureCompleted = ensureInvoices;
  const ensureReturned = ensureInvoices;
  const ensureCancelled = ensureInvoices;

  /**
   * Marks the snapshot stale rather than throwing it away: the rows stay on screen (no blank
   * flash) and the next focused tab re-reads, by which time SAP has committed.
   * Keys are accepted for call-site compatibility; there is only one cache to invalidate now.
   */
  const invalidate = useCallback((..._keys: CacheKey[]) => {
    cacheTs.current = null;
  }, []);

  const applyLocalStatus = useCallback(
    (invoiceNo: string, status: string, patch?: Partial<Invoice>) => {
      setInvCache((prev) =>
        prev === null
          ? prev
          : prev.map((r) => (r.invoice_no === invoiceNo ? ({ ...r, ...patch, status } as Invoice) : r))
      );
      // Deliberately marks the snapshot FRESH, not stale. We just wrote this row, so locally we
      // now know more than a re-read would tell us: SAP's POST returns before the update task
      // commits, so refetching immediately can come back without the change and would wipe out
      // the move we just made. Holding for the TTL lets SAP settle; the next focus after that
      // reconciles against the server.
      cacheTs.current = Date.now();
    },
    []
  );

  return (
    <DataContext.Provider
      value={{
        invCache,
        pendCache,
        dispCache,
        compCache,
        retCache,
        cancCache,
        loading,
        errors,
        loadDashboard,
        ensurePending,
        ensureDispatched,
        ensureCompleted,
        ensureReturned,
        ensureCancelled,
        reloadInvoices,
        refreshEntitySet,
        invalidate,
        applyLocalStatus,
      }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
