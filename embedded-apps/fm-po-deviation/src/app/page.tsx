'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ClipboardCheck, CheckCircle2, XCircle, Inbox, X, RefreshCw, Download, ArrowDownUp } from 'lucide-react';
import {
  fetchMyApprovals, fetchApprovedHistory, fetchRejectedHistory, fetchHistoryLog,
  fetchPrintformPdf, submitPoAction,
} from '../lib/sapClient';
import { getHubEmail } from '../lib/hubEmailLogin';
import { exportPoRowsToExcel } from '../lib/exportExcel';
import { usePendingCount } from '../context/PendingCountContext';
import type { PoRow } from '../types/po';
import PoCard from '../components/PoCard';
import { RejectDialog, HistoryLogModal, PdfPreviewModal } from '../components/Modals';

type MainTab = 'pending' | 'history';
type HistoryTab = 'approved' | 'rejected';
type ActingAction = 'A' | 'R' | 'U' | 'print' | null;
type SortOption = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc';

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: 'date-desc', label: 'Date: Newest first' },
  { key: 'date-asc', label: 'Date: Oldest first' },
  { key: 'amount-desc', label: 'Amount: High to Low' },
  { key: 'amount-asc', label: 'Amount: Low to High' },
];

// Remembered per browser so switching tabs (or coming back tomorrow) keeps the sort an approver
// actually wanted, instead of resetting to the default every time.
const SORT_STORAGE_KEY = 'fm-po-deviation-sort-prefs';

function filterRows(rows: PoRow[], query: string): PoRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) =>
    [r.ebeln, r.lifnr, r.name1, r.stxt].join(' ').toLowerCase().includes(q)
  );
}

function sortRows(rows: PoRow[], sort: SortOption): PoRow[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (sort === 'amount-desc' || sort === 'amount-asc') {
      const diff = (parseFloat(a.netwr) || 0) - (parseFloat(b.netwr) || 0);
      return sort === 'amount-asc' ? diff : -diff;
    }
    const aTime = new Date(`${a.erdat || '1970-01-01'}T${a.uzeit || '00:00:00'}`).getTime();
    const bTime = new Date(`${b.erdat || '1970-01-01'}T${b.uzeit || '00:00:00'}`).getTime();
    const diff = aTime - bTime;
    return sort === 'date-asc' ? diff : -diff;
  });
  return sorted;
}

function SortSelect({ value, onChange }: { value: SortOption; onChange: (v: SortOption) => void }) {
  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-border bg-white px-2.5 py-2">
      <ArrowDownUp size={14} className="text-inkSoft shrink-0" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SortOption)}
        className="bg-transparent text-sm font-semibold text-ink outline-none"
        aria-label="Sort by"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.key} value={opt.key}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

/** A history card's real approve/reject outcome, not just which tab it's being viewed under -
 * row.status is the ground truth (see sapClient.ts), historyTab is only a fallback for the rare
 * row that hasn't got a Status value back from SAP yet. Keeps a card from ever silently relabeling
 * to match whichever tab happens to be open if a query ever returns a row that doesn't actually
 * belong there. */
function historyVariant(row: PoRow, historyTab: HistoryTab): 'approved' | 'rejected' {
  if (row.status === 'A') return 'approved';
  if (row.status === 'R') return 'rejected';
  return historyTab;
}

function formatLastUpdated(d: Date | null): string {
  if (!d) return '';
  return `Updated ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export default function HomePage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  const [mainTab, setMainTab] = useState<MainTab>('pending');
  const [historyTab, setHistoryTab] = useState<HistoryTab>('approved');

  const [pending, setPending] = useState<PoRow[]>([]);
  const [approved, setApproved] = useState<PoRow[]>([]);
  const [rejected, setRejected] = useState<PoRow[]>([]);
  const [loading, setLoading] = useState({ pending: true, approved: true, rejected: true });
  const [loadError, setLoadError] = useState<string | null>(null);

  const [pendingSearch, setPendingSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [pendingSort, setPendingSort] = useState<SortOption>('date-desc');
  const [historySort, setHistorySort] = useState<SortOption>('date-desc');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { setCount: setPendingCount } = usePendingCount();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowActing, setRowActing] = useState<Record<string, ActingAction>>({});
  const [massActing, setMassActing] = useState<'A' | 'R' | null>(null);

  const [rejectTarget, setRejectTarget] = useState<PoRow | { mass: string[] } | null>(null);
  const [historyLog, setHistoryLog] = useState<{ po: string; entries: PoRow[] } | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ blobUrl: string; filename: string } | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    setEmail(getHubEmail());
    try {
      const saved = localStorage.getItem(SORT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { pending?: SortOption; history?: SortOption };
        if (parsed.pending) setPendingSort(parsed.pending);
        if (parsed.history) setHistorySort(parsed.history);
      }
    } catch {
      // ignore malformed/unavailable storage — defaults already set
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ pending: pendingSort, history: historySort }));
    } catch {
      // best-effort only — a private-browsing tab or a full storage quota shouldn't break sorting
    }
  }, [pendingSort, historySort]);

  useEffect(() => {
    setPendingCount(pending.length);
  }, [pending, setPendingCount]);

  const loadPending = (userEmail: string) => {
    setLoading((s) => ({ ...s, pending: true }));
    fetchMyApprovals(userEmail)
      .then((rows) => { setPending(rows); setLoadError(null); setLastUpdated(new Date()); })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not load pending approvals.'))
      .finally(() => setLoading((s) => ({ ...s, pending: false })));
  };
  const loadApproved = (userEmail: string) => {
    setLoading((s) => ({ ...s, approved: true }));
    fetchApprovedHistory(userEmail)
      .then((rows) => setApproved(rows))
      .catch(() => {})
      .finally(() => setLoading((s) => ({ ...s, approved: false })));
  };
  const loadRejected = (userEmail: string) => {
    setLoading((s) => ({ ...s, rejected: true }));
    fetchRejectedHistory(userEmail)
      .then((rows) => setRejected(rows))
      .catch(() => {})
      .finally(() => setLoading((s) => ({ ...s, rejected: false })));
  };

  useEffect(() => {
    if (!email) return;
    loadPending(email);
    // Delay the rest slightly so the gateway doesn't get hit with four requests at once — same
    // pacing the source app's own _onObjectMatched used.
    const t = setTimeout(() => {
      loadApproved(email);
      loadRejected(email);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  const filteredPending = useMemo(
    () => sortRows(filterRows(pending, pendingSearch), pendingSort),
    [pending, pendingSearch, pendingSort]
  );
  const filteredHistory = useMemo(
    () => sortRows(filterRows(historyTab === 'approved' ? approved : rejected, historySearch), historySort),
    [historyTab, approved, rejected, historySearch, historySort]
  );

  const handleRefresh = () => {
    if (!email) return;
    loadPending(email);
    loadApproved(email);
    loadRejected(email);
  };

  const patchActing = (ebeln: string, action: ActingAction) => {
    setRowActing((prev) => ({ ...prev, [ebeln]: action }));
  };

  const runAction = async (row: PoRow, action: 'A' | 'R' | 'U', reason?: string) => {
    patchActing(row.ebeln, action);
    try {
      await submitPoAction(row, action, reason);
      const msg = action === 'A' ? 'Approved successfully' : action === 'R' ? 'Rejected successfully' : 'Unreleased successfully';
      setBanner({ type: 'success', message: `PO ${row.ebeln}: ${msg}` });
      if (email) {
        loadPending(email);
        // Approve/Reject move a PO into that specific history tab - refresh it too so it shows up
        // there right away instead of only after a manual refresh or full reload. Unrelease just
        // returns a PO to pending, so it has no history tab of its own to refresh.
        if (action === 'A') loadApproved(email);
        if (action === 'R') loadRejected(email);
      }
    } catch (e) {
      setBanner({ type: 'error', message: e instanceof Error ? e.message : 'Action failed.' });
    } finally {
      patchActing(row.ebeln, null);
    }
  };

  const handleMassAction = async (action: 'A' | 'R', reason?: string) => {
    const targets = pending.filter((r) => selected.has(r.ebeln) && r.zpoInd !== 'R');
    if (targets.length === 0) return;
    setMassActing(action);
    targets.forEach((r) => patchActing(r.ebeln, action));
    let failures = 0;
    for (const row of targets) {
      try {
        await submitPoAction(row, action, reason);
      } catch {
        failures += 1;
      }
      patchActing(row.ebeln, null);
    }
    setSelected(new Set());
    setMassActing(null);
    setRejectTarget(null);
    if (failures === 0) {
      setBanner({ type: 'success', message: `${targets.length} item(s) ${action === 'A' ? 'approved' : 'rejected'}.` });
    } else {
      setBanner({ type: 'error', message: `${failures} of ${targets.length} item(s) failed.` });
    }
    if (email) {
      loadPending(email);
      if (action === 'A') loadApproved(email);
      if (action === 'R') loadRejected(email);
    }
  };

  const handleHistory = async (row: PoRow) => {
    try {
      const entries = await fetchHistoryLog(row.ebeln);
      setHistoryLog({ po: row.ebeln, entries });
    } catch {
      setBanner({ type: 'error', message: 'Could not load history.' });
    }
  };

  const handlePrint = async (row: PoRow) => {
    patchActing(row.ebeln, 'print');
    try {
      const blob = await fetchPrintformPdf(row.ebeln);
      if (!blob) {
        setBanner({ type: 'error', message: 'Could not download PDF. Please try again or contact support.' });
        return;
      }
      const blobUrl = URL.createObjectURL(blob);
      setPdfPreview({ blobUrl, filename: `PO_${row.ebeln}.pdf` });
    } catch {
      setBanner({ type: 'error', message: 'Could not download PDF. Please try again or contact support.' });
    } finally {
      patchActing(row.ebeln, null);
    }
  };

  const toggleSelected = (ebeln: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ebeln)) next.delete(ebeln); else next.add(ebeln);
      return next;
    });
  };

  const openDetails = (row: PoRow, mode: 'P' | 'A' | 'R') => {
    // next/navigation's router auto-prepends next.config.js's basePath — write it without.
    router.push(`/details/?po=${encodeURIComponent(row.ebeln)}&mode=${mode}`);
  };

  const selectableCount = filteredPending.filter((r) => r.zpoInd !== 'R').length;
  const allSelected = selectableCount > 0 && filteredPending.filter((r) => r.zpoInd !== 'R').every((r) => selected.has(r.ebeln));

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      {banner && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${
            banner.type === 'error' ? 'border-red/30 bg-redBg text-red' : 'border-green/30 bg-greenBg text-green'
          }`}
        >
          {banner.type === 'error' ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
          <span className="flex-1">{banner.message}</span>
          <button onClick={() => setBanner(null)}><X size={16} /></button>
        </div>
      )}

      {/* Main tabs */}
      <div className="mb-4 flex gap-1 rounded-2xl bg-white p-1 shadow-card w-fit">
        {(['pending', 'history'] as MainTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setMainTab(tab)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
              mainTab === tab ? 'bg-rust text-white shadow-sm' : 'text-inkSoft hover:text-ink'
            }`}
          >
            {tab === 'pending' ? <ClipboardCheck size={15} /> : <Inbox size={15} />}
            {tab === 'pending' ? 'Pending Approvals' : 'Approval History'}
          </button>
        ))}
      </div>

      {mainTab === 'pending' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-1 min-w-[200px] items-center gap-2 rounded-xl border border-border bg-white px-3 py-2">
              <Search size={15} className="text-inkSoft" />
              <input
                value={pendingSearch}
                onChange={(e) => setPendingSearch(e.target.value)}
                placeholder="Find PO or Vendor..."
                className="flex-1 text-sm text-ink outline-none placeholder:text-inkSoft"
              />
            </div>
            <SortSelect value={pendingSort} onChange={setPendingSort} />
            <button
              onClick={handleRefresh}
              disabled={loading.pending}
              className="btn-ghost !px-3"
              aria-label="Refresh"
              title="Refresh"
            >
              <RefreshCw size={15} className={loading.pending ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => exportPoRowsToExcel(filteredPending, 'Pending Approvals', 'PO_Pending_Approvals')}
              disabled={filteredPending.length === 0}
              className="btn-ghost !px-3"
              aria-label="Export to Excel"
              title="Export to Excel"
            >
              <Download size={15} />
            </button>
          </div>
          {lastUpdated && <p className="-mt-1 px-1 text-[11px] font-semibold text-inkSoft">{formatLastUpdated(lastUpdated)}</p>}

          {selectableCount > 0 && (
            <label className="flex items-center gap-2 px-1 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => {
                  setSelected(allSelected ? new Set() : new Set(filteredPending.filter((r) => r.zpoInd !== 'R').map((r) => r.ebeln)));
                }}
                className="h-4 w-4 accent-rust"
              />
              Select all
            </label>
          )}

          {selected.size > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-2.5">
              <span className="text-sm font-bold text-ink">{selected.size} selected</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setRejectTarget({ mass: Array.from(selected) })}
                  disabled={massActing !== null}
                  className="btn-danger !py-1.5 !px-3 text-xs"
                >
                  Reject Selected
                </button>
                <button
                  onClick={() => handleMassAction('A')}
                  disabled={massActing !== null}
                  className="btn-success !py-1.5 !px-3 text-xs"
                >
                  {massActing === 'A' ? 'Approving…' : 'Approve Selected'}
                </button>
              </div>
            </div>
          )}

          {loading.pending ? (
            <LoadingRows />
          ) : loadError ? (
            <ErrorState message={loadError} />
          ) : filteredPending.length === 0 ? (
            <EmptyState message="No pending approvals" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredPending.map((row) => (
                <PoCard
                  key={row.ebeln}
                  row={row}
                  variant="pending"
                  onOpen={() => openDetails(row, 'P')}
                  onApprove={() => runAction(row, 'A')}
                  onReject={() => setRejectTarget(row)}
                  onUnrelease={() => runAction(row, 'U')}
                  onHistory={() => handleHistory(row)}
                  onPrint={() => handlePrint(row)}
                  acting={rowActing[row.ebeln] ?? null}
                  selected={selected.has(row.ebeln)}
                  onToggleSelect={() => toggleSelected(row.ebeln)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-1 rounded-xl bg-white p-1 shadow-card w-fit">
            {(['approved', 'rejected'] as HistoryTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setHistoryTab(tab)}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-bold transition-colors ${
                  historyTab === tab
                    ? tab === 'approved' ? 'bg-greenBg text-green' : 'bg-redBg text-red'
                    : 'text-inkSoft hover:text-ink'
                }`}
              >
                {tab === 'approved' ? 'Approved' : 'Rejected'}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-1 min-w-[200px] items-center gap-2 rounded-xl border border-border bg-white px-3 py-2">
              <Search size={15} className="text-inkSoft" />
              <input
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search history..."
                className="flex-1 text-sm text-ink outline-none placeholder:text-inkSoft"
              />
            </div>
            <SortSelect value={historySort} onChange={setHistorySort} />
            <button
              onClick={() => exportPoRowsToExcel(filteredHistory, historyTab === 'approved' ? 'Approved' : 'Rejected', `PO_${historyTab === 'approved' ? 'Approved' : 'Rejected'}`)}
              disabled={filteredHistory.length === 0}
              className="btn-ghost !px-3"
              aria-label="Export to Excel"
              title="Export to Excel"
            >
              <Download size={15} />
            </button>
          </div>

          {loading[historyTab] ? (
            <LoadingRows />
          ) : filteredHistory.length === 0 ? (
            <EmptyState message={`No ${historyTab} items yet.`} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredHistory.map((row) => (
                <PoCard
                  key={row.ebeln}
                  row={row}
                  variant={historyVariant(row, historyTab)}
                  onOpen={() => openDetails(row, historyVariant(row, historyTab) === 'approved' ? 'A' : 'R')}
                  onHistory={() => handleHistory(row)}
                  onPrint={() => handlePrint(row)}
                  acting={rowActing[row.ebeln] ?? null}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {rejectTarget && (
        <RejectDialog
          busy={massActing === 'R'}
          onClose={() => setRejectTarget(null)}
          onConfirm={(reason) => {
            if ('mass' in rejectTarget) {
              setMassActing('R');
              handleMassAction('R', reason);
            } else {
              runAction(rejectTarget, 'R', reason);
              setRejectTarget(null);
            }
          }}
        />
      )}
      {historyLog && (
        <HistoryLogModal poNumber={historyLog.po} entries={historyLog.entries} onClose={() => setHistoryLog(null)} />
      )}
      {pdfPreview && (
        <PdfPreviewModal
          blobUrl={pdfPreview.blobUrl}
          filename={pdfPreview.filename}
          onClose={() => {
            URL.revokeObjectURL(pdfPreview.blobUrl);
            setPdfPreview(null);
          }}
        />
      )}
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-32 animate-pulse rounded-2xl bg-white/60" />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-white/50 py-14 text-center">
      <Inbox size={28} className="text-inkSoft" />
      <p className="text-sm font-semibold text-inkSoft">{message}</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red/30 bg-redBg p-6 text-center text-sm font-semibold text-red">
      {message}
    </div>
  );
}
