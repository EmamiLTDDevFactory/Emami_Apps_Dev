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

/** Fiscal Year / From Date / To Date filter shown on Pending/Dispatched/Completed/Returned/
 *  Cancelled — shared across all five since they're all slices of the one combined SAP fetch
 *  (see this file's header comment). Changing it on any tab refetches that shared snapshot. */
export interface DateFilterState {
  fiscalYear: string;
  frmDate: string;
  toDate: string;
}

function defaultDateFilter(): DateFilterState {
  const to = todayDate();
  const from = new Date(to);
  from.setDate(from.getDate() - 30);
  return { fiscalYear: String(to.getFullYear()), frmDate: isoDate(from), toDate: isoDate(to) };
}

export type CacheKey = 'inv' | 'pend' | 'disp' | 'comp' | 'ret' | 'canc';

const ALL_KEYS: CacheKey[] = ['inv', 'pend', 'disp', 'comp', 'ret', 'canc'];

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
  dateFilter: DateFilterState;
  setDateFilter: (patch: Partial<DateFilterState>) => void;
  loadDashboard: () => Promise<void>;
  ensurePending: () => Promise<void>;
  ensureDispatched: () => Promise<void>;
  ensureCompleted: () => Promise<void>;
  ensureReturned: () => Promise<void>;
  ensureCancelled: () => Promise<void>;
  reloadInvoices: () => Promise<void>;
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
  const [dateFilter, setDateFilterRaw] = useState<DateFilterState>(defaultDateFilter);

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
        const rows = await api.refreshInvoices(dateFilter);
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
  }, [dateFilter]);

  /** Changing the filter always forces a fresh SAP fetch on next call — it changes what SAP
   *  returns, so the existing cache (however fresh by TTL) no longer answers the new question. */
  const setDateFilter = useCallback((patch: Partial<DateFilterState>) => {
    setDateFilterRaw((prev) => ({ ...prev, ...patch }));
    cacheTs.current = null;
  }, []);

  useEffect(() => {
    if (!session) return;
    reloadInvoices();
    // Only re-run when the filter itself changes — the initial load is handled by each tab's
    // own ensureX() on focus, same as before this filter existed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter]);

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
        dateFilter,
        setDateFilter,
        loadDashboard,
        ensurePending,
        ensureDispatched,
        ensureCompleted,
        ensureReturned,
        ensureCancelled,
        reloadInvoices,
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
