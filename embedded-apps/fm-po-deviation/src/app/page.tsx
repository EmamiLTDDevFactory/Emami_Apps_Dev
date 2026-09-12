'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ClipboardCheck, CheckCircle2, XCircle, Inbox, X } from 'lucide-react';
import {
  fetchMyApprovals, fetchApprovedHistory, fetchRejectedHistory, fetchHistoryLog,
  fetchPrintformPdf, submitPoAction,
} from '../lib/sapClient';
import { getHubEmail } from '../lib/hubEmailLogin';
import type { PoRow } from '../types/po';
import PoCard from '../components/PoCard';
import { RejectDialog, HistoryLogModal, PdfPreviewModal } from '../components/Modals';

type MainTab = 'pending' | 'history';
type HistoryTab = 'approved' | 'rejected';
type ActingAction = 'A' | 'R' | 'U' | 'print' | null;

function filterRows(rows: PoRow[], query: string): PoRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) =>
    [r.ebeln, r.lifnr, r.name1, r.stxt].join(' ').toLowerCase().includes(q)
  );
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

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowActing, setRowActing] = useState<Record<string, ActingAction>>({});
  const [massActing, setMassActing] = useState<'A' | 'R' | null>(null);

  const [rejectTarget, setRejectTarget] = useState<PoRow | { mass: string[] } | null>(null);
  const [historyLog, setHistoryLog] = useState<{ po: string; entries: PoRow[] } | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ blobUrl: string; filename: string } | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    setEmail(getHubEmail());
  }, []);

  const loadPending = (userEmail: string) => {
    setLoading((s) => ({ ...s, pending: true }));
    fetchMyApprovals(userEmail)
      .then((rows) => { setPending(rows); setLoadError(null); })
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

  const filteredPending = useMemo(() => filterRows(pending, pendingSearch), [pending, pendingSearch]);
  const filteredHistory = useMemo(
    () => filterRows(historyTab === 'approved' ? approved : rejected, historySearch),
    [historyTab, approved, rejected, historySearch]
  );

  const patchActing = (ebeln: string, action: ActingAction) => {
    setRowActing((prev) => ({ ...prev, [ebeln]: action }));
  };

  const runAction = async (row: PoRow, action: 'A' | 'R' | 'U', reason?: string) => {
    patchActing(row.ebeln, action);
    try {
      await submitPoAction(row, action, reason);
      const msg = action === 'A' ? 'Approved successfully' : action === 'R' ? 'Rejected successfully' : 'Unreleased successfully';
      setBanner({ type: 'success', message: `PO ${row.ebeln}: ${msg}` });
      if (email) loadPending(email);
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
    if (email) loadPending(email);
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
          <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2">
            <Search size={15} className="text-inkSoft" />
            <input
              value={pendingSearch}
              onChange={(e) => setPendingSearch(e.target.value)}
              placeholder="Find PO or Vendor..."
              className="flex-1 text-sm text-ink outline-none placeholder:text-inkSoft"
            />
          </div>

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

          <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2">
            <Search size={15} className="text-inkSoft" />
            <input
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Search history..."
              className="flex-1 text-sm text-ink outline-none placeholder:text-inkSoft"
            />
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
                  variant={historyTab}
                  onOpen={() => openDetails(row, historyTab === 'approved' ? 'A' : 'R')}
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
