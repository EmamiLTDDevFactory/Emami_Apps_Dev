'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, CheckSquare, ChevronDown, ChevronUp, Clock, FileText, IndianRupee, Search, Square, Users, X, XCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useClaim } from '../../context/ClaimContext';
import { ExpenseClaim } from '../../types';
import { formatCurrency } from '../../utils/currency';
import { Button, Card, Chip, EmptyState, MessageModal, type MessageModalState, Modal } from '../../components/ui';

const formatHistoryDate = (value?: string) => {
  if (!value) return '';
  let d = new Date(value);
  const m = value.match(/(\d+)/);
  if (m && value.includes('/Date(')) d = new Date(parseInt(m[1], 10));
  if (Number.isNaN(d.getTime())) return value;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
};

// HistorySet rows come back in SAP's own order (effectively oldest-first) with no sort applied —
// this derives a real millisecond timestamp from ActionDate + ActionTime so the most recently
// created/actioned entries can be shown first, same expectation as My Claims.
const getActionTimestamp = (entry: any): number => {
  const value = entry?.ActionDate;
  if (!value) return 0;
  let dateMs = NaN;
  const m = typeof value === 'string' ? value.match(/(\d+)/) : null;
  if (m && value.includes('/Date(')) dateMs = parseInt(m[1], 10);
  else dateMs = new Date(value).getTime();
  if (Number.isNaN(dateMs)) return 0;
  const timeStr = entry?.ActionTime || '';
  const hours = parseInt(timeStr.match(/(\d+)H/)?.[1] || '0', 10);
  const minutes = parseInt(timeStr.match(/(\d+)M/)?.[1] || '0', 10);
  const seconds = parseInt(timeStr.match(/(\d+)S/)?.[1] || '0', 10);
  return dateMs + ((hours * 60 + minutes) * 60 + seconds) * 1000;
};

export default function ApprovalsPage() {
  const router = useRouter();
  const { filterClaims, approveClaim, rejectClaim, requestClarification, releasePayment, rejectClaimFinance, fetchClaims, fetchHistorySet, historyEntries, claimSummaryCache, fetchClaimSummaries } = useClaim();
  const { currentUser } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClaimIds, setSelectedClaimIds] = useState<string[]>([]);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [selectedClaimId, setSelectedClaimId] = useState('');
  const [rejectionRemarks, setRejectionRemarks] = useState('');
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [clarifyModalVisible, setClarifyModalVisible] = useState(false);
  const [clarificationRemarks, setClarificationRemarks] = useState('');
  const [selectedStat, setSelectedStat] = useState<string | null>(null);
  // Expense-category drill-down: null shows the grid of compact category cards; selecting one
  // replaces the view with that category's claims (same claim-card style as before), with a Back
  // control to return to the category grid. Not an in-place accordion/expand.
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  // Groups with more than this many claims show a "Show more" button instead of rendering
  // everything at once.
  const GROUP_PAGE_SIZE = 12;
  const [groupsShowingAll, setGroupsShowingAll] = useState<Set<string>>(new Set());
  const showAllInGroup = (key: string) => setGroupsShowingAll((prev) => new Set(prev).add(key));
  // Fiscal-year slider (history view only): always-on, 5 years visible (2 before, selected in the
  // middle, 2 after) — same widget as My Claims, replacing the old search-only "All Years" pills.
  const [selectedFiscalYear, setSelectedFiscalYear] = useState(() => new Date().getFullYear());
  // Purely cosmetic — which way the year chips slide in, based on whether the newly clicked year
  // was to the right or left of the previously-centered one. Doesn't affect filtering at all.
  const [yearSlideDirection, setYearSlideDirection] = useState<'left' | 'right'>('right');
  const handleSelectFiscalYear = (year: number) => {
    setYearSlideDirection(year >= selectedFiscalYear ? 'right' : 'left');
    setSelectedFiscalYear(year);
    setSelectedGroupKey(null);
  };
  const [messageModal, setMessageModal] = useState<MessageModalState>(null);

  const isBulkReleaseUser = currentUser?.role === 'B';
  const managerHistoryEntries = historyEntries || [];

  const pendingClaims = isBulkReleaseUser ? filterClaims('finance', searchQuery) : filterClaims('manager', searchQuery);
  const isBPendingRelease = (claim: ExpenseClaim) => isBulkReleaseUser && claim.rawStatus === 'P';
  const bulkReleaseClaims = isBulkReleaseUser ? pendingClaims.filter((c) => c.status === 'Pending Release' || isBPendingRelease(c)) : [];
  const allBulkSelected = bulkReleaseClaims.length > 0 && bulkReleaseClaims.every((c) => selectedClaimIds.includes(c.id));

  useEffect(() => {
    setSelectedClaimIds((prev) => prev.filter((id) => bulkReleaseClaims.some((c) => c.id === id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkReleaseClaims.map((c) => c.id).join('|')]);

  // Re-fetches from SAP (server-side Fiscalyear filter) every time the selected year chip
  // changes, instead of fetching once and filtering ActionDate client-side — covers the initial
  // mount too since selectedFiscalYear is already set before this first runs.
  useEffect(() => {
    fetchHistorySet(selectedFiscalYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFiscalYear]);

  const toggleClaimSelection = (id: string) => setSelectedClaimIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  const toggleSelectAllBulkClaims = () => setSelectedClaimIds(allBulkSelected ? [] : bulkReleaseClaims.map((c) => c.id));

  const refreshHistoryStats = async () => { await fetchHistorySet(selectedFiscalYear); };

  const confirmBulkRelease = async () => {
    if (selectedClaimIds.length === 0) { setMessageModal({ title: 'No Claims Selected', message: 'Please select at least one claim to release.', type: 'error' }); return; }
    let successCount = 0, failureCount = 0;
    const failedIds: string[] = [];
    for (const claimId of selectedClaimIds) {
      const result = await releasePayment(claimId);
      if (result.success) successCount++;
      else { failureCount++; failedIds.push(claimId); }
    }
    setSelectedClaimIds(failedIds);
    await refreshHistoryStats();
    await fetchClaims();
    if (failureCount > 0) setMessageModal({ title: 'Bulk Release Partial', message: `${successCount} claim(s) released. ${failureCount} claim(s) could not be released.`, type: 'error' });
    else setMessageModal({ title: 'Bulk Release Complete', message: `${successCount} claim(s) were released successfully.`, type: 'success' });
  };

  const handleBulkRelease = () => {
    if (selectedClaimIds.length === 0) { setMessageModal({ title: 'No Claims Selected', message: 'Please select at least one claim to release.', type: 'error' }); return; }
    setMessageModal({
      title: 'Confirm Bulk Release',
      message: `Release ${selectedClaimIds.length} selected claim(s)?`,
      cancelLabel: 'Cancel',
      confirmLabel: 'Release',
      onConfirm: () => { setMessageModal(null); confirmBulkRelease(); },
    });
  };

  const managerApprovedCount = managerHistoryEntries.filter((e: any) => (e.Action || '').toUpperCase() === 'APPROVE').length;
  const managerRejectedCount = managerHistoryEntries.filter((e: any) => (e.Action || '').toUpperCase() === 'REJECT').length;
  const managerTotalCount = managerHistoryEntries.length;
  const managerPendingCount = pendingClaims.length;

  const managerStats = [
    { label: 'Approved', value: managerApprovedCount, icon: CheckCircle2, accent: 'text-green' },
    { label: 'Pending', value: managerPendingCount, icon: Clock, accent: 'text-amber' },
    { label: 'Rejected', value: managerRejectedCount, icon: XCircle, accent: 'text-red' },
    { label: 'Total', value: managerTotalCount, icon: Users, accent: 'text-brand' },
  ];

  const statFilteredHistoryItems =
    selectedStat === 'Approved' ? managerHistoryEntries.filter((e: any) => (e.Action || '').toUpperCase() === 'APPROVE') :
    selectedStat === 'Rejected' ? managerHistoryEntries.filter((e: any) => (e.Action || '').toUpperCase() === 'REJECT') :
    selectedStat === 'Total' ? [...managerHistoryEntries] : [];

  const statFilteredHistoryClaimIds = statFilteredHistoryItems.map((e: any) => e.ClaimId).filter(Boolean).join('|');
  useEffect(() => {
    const ids = statFilteredHistoryClaimIds ? statFilteredHistoryClaimIds.split('|') : [];
    if (ids.length > 0) fetchClaimSummaries(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statFilteredHistoryClaimIds]);

  const isSearching = searchQuery.trim() !== '';
  const searchMatchedHistoryItems = isSearching
    ? statFilteredHistoryItems.filter((entry: any) => {
        const q = searchQuery.trim().toLowerCase();
        const summary = claimSummaryCache[entry.ClaimId];
        return (entry.ClaimId || '').toLowerCase().includes(q) || (summary?.employeeName || '').toLowerCase().includes(q) || (summary?.expenseType || '').toLowerCase().includes(q);
      })
    : statFilteredHistoryItems;

  const visibleFiscalYears = useMemo(
    () => [selectedFiscalYear - 2, selectedFiscalYear - 1, selectedFiscalYear, selectedFiscalYear + 1, selectedFiscalYear + 2],
    [selectedFiscalYear]
  );

  // historyEntries is already scoped to selectedFiscalYear server-side (see fetchHistorySet) — no
  // further client-side year filtering needed here.
  const filteredHistoryItems = searchMatchedHistoryItems;

  // Groups the (already fiscal-year-scoped) history list by expense category — Setname is SAP's
  // internal category code (e.g. "EMA_CONEXP"), Descript its human-readable label (e.g.
  // "Conveyance Expenses"). Groups are ordered by first appearance in the already-sorted list.
  const groupedHistoryItems = useMemo(() => {
    const sorted = [...filteredHistoryItems].sort((a, b) => getActionTimestamp(b) - getActionTimestamp(a));
    const groups: { key: string; label: string; items: any[] }[] = [];
    const indexByKey: Record<string, number> = {};
    sorted.forEach((entry: any) => {
      const key = entry.Setname || '';
      if (!(key in indexByKey)) {
        indexByKey[key] = groups.length;
        groups.push({ key, label: entry.Descript || key || 'Other', items: [] });
      }
      groups[indexByKey[key]].items.push(entry);
    });
    return groups;
  }, [filteredHistoryItems]);

  const showHistoryList = selectedStat !== null && selectedStat !== 'Pending';

  const handleApprove = async (id: string) => {
    if (isBulkReleaseUser) {
      const result = await releasePayment(id);
      if (!result.success) { setMessageModal({ title: 'Release Failed', message: result.error || 'Failed to release payment.', type: 'error' }); return; }
      await refreshHistoryStats();
      await fetchClaims();
      setSuccessMessage(`Claim ${id} has been released successfully.`);
      setSuccessModalVisible(true);
      return;
    }
    await approveClaim(id);
    await refreshHistoryStats();
    await fetchClaims();
    setSuccessMessage(`Claim ${id} has been approved successfully.`);
    setSuccessModalVisible(true);
  };

  const handleOpenRejectModal = (id: string) => { setSelectedClaimId(id); setRejectionRemarks(''); setRejectModalVisible(true); };

  const handleConfirmReject = async () => {
    const result = isBulkReleaseUser ? await rejectClaimFinance(selectedClaimId, rejectionRemarks) : await rejectClaim(selectedClaimId, rejectionRemarks);
    if (!result.success) { setMessageModal({ title: 'Rejection Failed', message: result.error || 'Rejection remarks are mandatory.', type: 'error' }); return; }
    await refreshHistoryStats();
    await fetchClaims();
    setRejectModalVisible(false);
    setSuccessMessage(`Claim ${selectedClaimId} has been rejected. Remarks saved to audit log.`);
    setSuccessModalVisible(true);
  };

  const handleConfirmClarify = () => {
    requestClarification(selectedClaimId, clarificationRemarks);
    setClarifyModalVisible(false);
    setMessageModal({ title: 'Clarification Requested', message: `A clarification request has been sent to the employee for claim ${selectedClaimId}.`, type: 'success' });
  };

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-extrabold text-ink">{isBulkReleaseUser ? 'Finance Approvals' : 'Manager Approvals'}</h1>

      {isBulkReleaseUser && bulkReleaseClaims.length > 0 && (
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" icon={allBulkSelected ? CheckSquare : Square} onClick={toggleSelectAllBulkClaims}>
            {allBulkSelected ? 'Clear Selection' : `Select All (${bulkReleaseClaims.length})`}
          </Button>
          <Button variant="success" className="flex-1" icon={IndianRupee} onClick={handleBulkRelease}>Release Selected</Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {managerStats.map((stat) => {
          const Icon = stat.icon;
          const active = selectedStat === stat.label;
          return (
            <button
              key={stat.label}
              type="button"
              onClick={() => { setSelectedStat(active ? null : stat.label); setSelectedGroupKey(null); }}
              className={`card flex flex-col items-center gap-1 p-3 text-center ${active ? 'ring-2 ring-brand' : ''}`}
            >
              <Icon size={18} className={stat.accent} />
              <span className="text-sm font-bold text-inkSoft">{stat.label}</span>
              <span className="text-lg font-extrabold text-ink">{stat.value}</span>
              {active ? <ChevronUp size={13} className="text-brand" /> : <ChevronDown size={13} className="text-inkFaint" />}
            </button>
          );
        })}
      </div>

      <Card>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-appBg px-3 py-2">
          <Search size={16} className="text-inkFaint" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Employee Name or Expense Type..."
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-inkFaint"
          />
          {searchQuery !== '' && <button type="button" onClick={() => setSearchQuery('')}><X size={16} className="text-inkFaint" /></button>}
        </div>
        {showHistoryList && (
          <div
            key={selectedFiscalYear}
            className={`mt-2 flex flex-wrap items-center gap-2 ${yearSlideDirection === 'right' ? 'animate-slideFromRight' : 'animate-slideFromLeft'}`}
          >
            {visibleFiscalYears.map((year) => (
              <Chip
                key={year}
                tone={year === selectedFiscalYear ? 'red' : 'neutral'}
                onClick={() => handleSelectFiscalYear(year)}
              >
                {year}
              </Chip>
            ))}
          </div>
        )}
      </Card>

      {selectedStat && (
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink">{selectedStat === 'Pending' ? 'Pending Claims' : `${selectedStat} Claims`}</h2>
          <button type="button" onClick={() => { setSelectedStat(null); setSelectedGroupKey(null); }} className="flex items-center gap-1 text-xs font-semibold text-inkSoft">
            <X size={14} /> Clear
          </button>
        </div>
      )}

      {showHistoryList ? (
        filteredHistoryItems.length === 0 ? (
          <EmptyState icon={FileText} title="No Records" hint={`No ${selectedStat?.toLowerCase()} claims found in your history.`} />
        ) : selectedGroupKey === null ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {groupedHistoryItems.map((group) => {
              const groupKey = group.key || 'other';
              return (
                <button
                  key={groupKey}
                  type="button"
                  onClick={() => setSelectedGroupKey(groupKey)}
                  className="card flex flex-col items-center gap-1 p-3 text-center"
                >
                  <span className="text-sm font-extrabold text-brand">{group.label}</span>
                  <span className="text-xs font-semibold text-inkSoft">{group.items.length} claim{group.items.length === 1 ? '' : 's'}</span>
                </button>
              );
            })}
          </div>
        ) : (() => {
          const activeGroup = groupedHistoryItems.find((g) => (g.key || 'other') === selectedGroupKey);
          if (!activeGroup) return null;
          const showingAll = groupsShowingAll.has(selectedGroupKey);
          const visibleItems = showingAll ? activeGroup.items : activeGroup.items.slice(0, GROUP_PAGE_SIZE);
          const remaining = activeGroup.items.length - visibleItems.length;
          return (
            <div className="flex flex-col gap-3">
              <button type="button" onClick={() => setSelectedGroupKey(null)} className="flex w-fit items-center gap-1 text-xs font-semibold text-brand">
                <ArrowLeft size={14} /> Back
              </button>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {visibleItems.map((entry: any, idx: number) => {
                  const isApprove = (entry.Action || '').toUpperCase() === 'APPROVE';
                  const matchedClaim = claimSummaryCache[entry.ClaimId];
                  return (
                    <button
                      key={`${entry.ClaimId}-${idx}`}
                      type="button"
                      onClick={() => router.push(`/claim/?id=${encodeURIComponent(entry.ClaimId)}`)}
                      className={`flex flex-col gap-1 rounded-xl2 border-l-4 p-3 text-left ${isApprove ? 'border-l-green bg-greenBg' : 'border-l-red bg-redBg'}`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 text-sm font-bold text-ink">{entry.ClaimId}</span>
                      </div>
                      {matchedClaim?.employeeName && <p className="truncate text-xs font-bold text-ink">By: {matchedClaim.employeeName}</p>}
                      <p className="text-xs font-semibold text-inkSoft">{formatHistoryDate(entry.ActionDate)}</p>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-sm font-extrabold text-ink">{matchedClaim ? `₹${formatCurrency(matchedClaim.amount)}` : ''}</span>
                        <Chip tone={isApprove ? 'green' : 'red'}>{isApprove ? 'Approved' : 'Rejected'}</Chip>
                      </div>
                    </button>
                  );
                })}
              </div>
              {remaining > 0 && (
                <button
                  type="button"
                  onClick={() => showAllInGroup(selectedGroupKey)}
                  className="w-full rounded-xl2 border border-line bg-white py-2 text-xs font-bold text-brand"
                >
                  Show {remaining} more
                </button>
              )}
            </div>
          );
        })()
      ) : pendingClaims.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="All Caught Up!" hint="There are no pending expense claims requiring your approval at this time." />
      ) : (
        <div className="flex flex-col gap-3">
          {pendingClaims.map((claim) => (
            <div key={claim.id} className="card flex items-stretch gap-0 overflow-hidden !p-0">
              {isBulkReleaseUser && (
                <button type="button" onClick={() => toggleClaimSelection(claim.id)} className="flex items-center justify-center border-r border-line bg-appBg px-4">
                  {selectedClaimIds.includes(claim.id) ? <CheckSquare size={20} className="text-brand" /> : <Square size={20} className="text-inkFaint" />}
                </button>
              )}
              <div className="flex-1">
                <button type="button" onClick={() => router.push(`/claim/?id=${encodeURIComponent(claim.id)}`)} className="block w-full p-3.5 text-left">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-bold text-ink">{claim.id}</p>
                      <p className="text-xs font-semibold text-brand">{claim.employeeName} ({claim.designation})</p>
                    </div>
                    <p className="text-base font-extrabold text-ink">₹{formatCurrency(claim.amount)}</p>
                  </div>
                  <div className="mt-2 rounded-lg border border-line bg-appBg p-2">
                    <p className="text-xs font-bold text-inkSoft">{claim.expenseType}</p>
                    <p className="line-clamp-2 text-xs text-ink">{claim.justification}</p>
                  </div>
                  <div className="mt-2 flex justify-between text-2xs font-medium text-inkFaint">
                    <span>Cost Center: {claim.costCenter}</span>
                    <span>Date: {claim.claimDate}</span>
                  </div>
                  {claim.attachments.length > 0 && (
                    <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-cream px-2.5 py-1.5 text-xs font-semibold text-brand">
                      <FileText size={14} /> View Attached Receipt: {claim.attachments[0].name}
                    </div>
                  )}
                </button>
                <div className="flex gap-2 border-t border-line bg-appBg p-2">
                  <Button variant="danger" className="flex-1" onClick={() => handleOpenRejectModal(claim.id)}>Reject</Button>
                  <Button variant="success" className="flex-1" onClick={() => handleApprove(claim.id)}>{isBulkReleaseUser ? 'Release' : 'Approve'}</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={rejectModalVisible} title={`Reject Claim ${selectedClaimId}`} onClose={() => setRejectModalVisible(false)}
        footer={<>
          <Button variant="secondary" onClick={() => setRejectModalVisible(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleConfirmReject}>Confirm Rejection</Button>
        </>}>
        <p className="mb-3 text-sm text-inkSoft">Please provide a mandatory reason for rejecting this expense claim. This will be permanently recorded in the workflow audit log.</p>
        <textarea className="input" rows={4} value={rejectionRemarks} onChange={(e) => setRejectionRemarks(e.target.value)} placeholder="Enter mandatory rejection remarks..." />
      </Modal>

      <Modal open={successModalVisible} title={successMessage.includes('rejected') ? 'Action Completed' : 'Success'} onClose={() => setSuccessModalVisible(false)}
        footer={<Button variant="success" onClick={() => setSuccessModalVisible(false)}>OK</Button>}>
        <p className="text-sm text-inkSoft">{successMessage}</p>
      </Modal>

      <Modal open={clarifyModalVisible} title="Request Clarification" onClose={() => setClarifyModalVisible(false)}
        footer={<>
          <Button variant="secondary" onClick={() => setClarifyModalVisible(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleConfirmClarify}>Send Request</Button>
        </>}>
        <p className="mb-3 text-sm text-inkSoft">Send a message to the employee requesting additional documentation or explanation for claim {selectedClaimId}.</p>
        <textarea className="input" rows={4} value={clarificationRemarks} onChange={(e) => setClarificationRemarks(e.target.value)} placeholder="What details or documents do you need?" />
      </Modal>

      <MessageModal state={messageModal} onClose={() => setMessageModal(null)} />
    </div>
  );
}
