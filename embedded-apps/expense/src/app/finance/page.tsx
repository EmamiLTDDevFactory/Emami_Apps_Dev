'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, CheckCircle2, CheckSquare, ChevronDown, ChevronUp, CreditCard, FileText, IndianRupee, Search, ShieldCheck, Square, X, XCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useClaim } from '../../context/ClaimContext';
import { ExpenseClaim } from '../../types';
import { displayStatusLabel } from '../../utils/claim-status';
import { formatCurrency } from '../../utils/currency';
import { formatSapErrorMessage } from '../../utils/sap-error';
import { Banner, Button, Card, Chip, EmptyState, MessageModal, type MessageModalState, Modal, Spinner } from '../../components/ui';

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

const getEntryYear = (value?: string) => {
  if (!value) return '';
  let d = new Date(value);
  const m = value.match(/(\d+)/);
  if (m && value.includes('/Date(')) d = new Date(parseInt(m[1], 10));
  if (Number.isNaN(d.getTime())) return '';
  return String(d.getFullYear());
};

const TAX_RESULTS_LIMIT = 50;

export default function FinancePage() {
  const router = useRouter();
  const { filterClaims, validateClaimFinance, releasePayment, fetchTaxes, calculateTax, rejectClaimFinance, claims, fetchClaims, fetchHistorySet, historyEntries, claimSummaryCache, fetchClaimSummaries } = useClaim();
  const { currentUser } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [screenMessage, setScreenMessage] = useState<{ title: string; message: string; type: 'success' | 'error' } | null>(null);
  const [selectedClaimIds, setSelectedClaimIds] = useState<string[]>([]);
  const [selectedStat, setSelectedStat] = useState<string | null>(null);
  // Which expense-category groups are expanded in the history list — collapsed by default, a group
  // reveals its claims only once its own card is clicked. Independent per group (not an exclusive
  // accordion), keyed by the group's Setname.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroupExpanded = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  // Groups with more than this many claims show a "Show more" button instead of rendering
  // everything at once on expand.
  const GROUP_PAGE_SIZE = 12;
  const [groupsShowingAll, setGroupsShowingAll] = useState<Set<string>>(new Set());
  const showAllInGroup = (key: string) => setGroupsShowingAll((prev) => new Set(prev).add(key));
  // Always defaults to the current fiscal year — Finance now sends Fiscalyear in the HistorySet
  // filter on every fetch, same as Approvals, instead of only while actively searching.
  const [selectedHistoryYear, setSelectedHistoryYear] = useState<string | null>(() => String(new Date().getFullYear()));
  const [messageModal, setMessageModal] = useState<MessageModalState>(null);

  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectClaimId, setRejectClaimId] = useState('');
  const [rejectRemarks, setRejectRemarks] = useState('');
  const [releaseConfirmVisible, setReleaseConfirmVisible] = useState(false);
  const [releaseConfirmClaimId, setReleaseConfirmClaimId] = useState('');
  const [bulkReleaseConfirmVisible, setBulkReleaseConfirmVisible] = useState(false);
  const [taxModalVisible, setTaxModalVisible] = useState(false);
  const [availableTaxes, setAvailableTaxes] = useState<any[]>([]);
  const [selectedTaxCode, setSelectedTaxCode] = useState('');
  const [selectedTaxDescription, setSelectedTaxDescription] = useState('');
  const [taxCalculation, setTaxCalculation] = useState<{ expenseAmt: number; taxAmt: number } | null>(null);
  const [taxCalculating, setTaxCalculating] = useState(false);
  const [taxDropdownOpen, setTaxDropdownOpen] = useState(false);
  const [taxLoading, setTaxLoading] = useState(false);
  const [taxSearch, setTaxSearch] = useState('');

  const normalizeId = (id?: string) => (id || '').toString().replace(/\D/g, '').padStart(8, '0');
  const financeNumeric = normalizeId(currentUser?.employeeId);
  const financeHistoryEntries = historyEntries || [];

  const financeStatusesForCount = currentUser?.role === 'B' ? ['H', 'P'] : ['H'];
  const financeApprovedCount = financeHistoryEntries.filter((e: any) => (e.Action || '').toUpperCase() === 'APPROVE').length;
  const financePendingCount = claims.filter((c) => financeStatusesForCount.includes(c.rawStatus || '') && normalizeId(c.employeeId) !== financeNumeric).length;
  const financeRejectedCount = financeHistoryEntries.filter((e: any) => (e.Action || '').toUpperCase() === 'REJECT').length;
  const financeTotalCount = financeHistoryEntries.length;

  const financeStats = [
    { label: 'Approved', value: financeApprovedCount, icon: CheckCircle2, accent: 'text-green' },
    { label: 'Pending', value: financePendingCount, icon: ShieldCheck, accent: 'text-amber' },
    { label: 'Rejected', value: financeRejectedCount, icon: XCircle, accent: 'text-red' },
    { label: 'Total', value: financeTotalCount, icon: Briefcase, accent: 'text-brand' },
  ];

  const financeClaims = filterClaims('finance', searchQuery);
  const isBulkReleaseUser = currentUser?.role === 'B';
  const isBPendingRelease = (claim: ExpenseClaim) => isBulkReleaseUser && claim.rawStatus === 'P';
  const bulkReleaseClaims = financeClaims.filter((c) => c.status === 'Pending Release' || isBPendingRelease(c));
  const allBulkSelected = bulkReleaseClaims.length > 0 && bulkReleaseClaims.every((c) => selectedClaimIds.includes(c.id));

  const statFilteredHistoryItems =
    selectedStat === 'Approved' ? financeHistoryEntries.filter((e: any) => (e.Action || '').toUpperCase() === 'APPROVE') :
    selectedStat === 'Rejected' ? financeHistoryEntries.filter((e: any) => (e.Action || '').toUpperCase() === 'REJECT') :
    selectedStat === 'Total' ? [...financeHistoryEntries] : [];

  const statFilteredHistoryClaimIds = statFilteredHistoryItems.map((e: any) => e.ClaimId).filter(Boolean).join('|');
  useEffect(() => {
    const ids = statFilteredHistoryClaimIds ? statFilteredHistoryClaimIds.split('|') : [];
    if (ids.length > 0) fetchClaimSummaries(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statFilteredHistoryClaimIds]);

  // Re-fetches from SAP (server-side Fiscalyear filter) whenever the selected year changes —
  // same debug-visible wiring as Approvals, so the actual SAP request can be inspected per year.
  useEffect(() => {
    const year = selectedHistoryYear && selectedHistoryYear !== 'ALL' ? Number(selectedHistoryYear) : undefined;
    fetchHistorySet(year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHistoryYear]);

  useEffect(() => {
    setSelectedClaimIds((prev) => prev.filter((id) => bulkReleaseClaims.some((c) => c.id === id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkReleaseClaims.map((c) => c.id).join('|')]);

  const isSearching = searchQuery.trim() !== '';
  const searchMatchedHistoryItems = isSearching
    ? statFilteredHistoryItems.filter((entry: any) => {
        const q = searchQuery.trim().toLowerCase();
        const summary = claimSummaryCache[entry.ClaimId];
        return (entry.ClaimId || '').toLowerCase().includes(q) || (summary?.employeeName || '').toLowerCase().includes(q) || (summary?.expenseType || '').toLowerCase().includes(q);
      })
    : statFilteredHistoryItems;

  const availableHistoryYears = useMemo(
    () => Array.from(new Set(searchMatchedHistoryItems.map((e: any) => getEntryYear(e.ActionDate)).filter(Boolean))).sort((a, b) => b.localeCompare(a)),
    [searchMatchedHistoryItems]
  );
  const availableHistoryYearsKey = availableHistoryYears.join('|');

  // Keeps whatever year is already selected (defaults to the current fiscal year, set above) when
  // not searching — no longer resets to null, since the fiscal-year filter should always be sent.
  useEffect(() => {
    if (!isSearching) return;
    setSelectedHistoryYear((prev) => {
      if (prev === 'ALL') return prev;
      if (prev && availableHistoryYears.includes(prev)) return prev;
      return availableHistoryYears[0] || prev || 'ALL';
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSearching, availableHistoryYearsKey]);

  // historyEntries is already scoped to selectedHistoryYear server-side (see fetchHistorySet) — no
  // further client-side year filtering needed here.
  const filteredHistoryItems = searchMatchedHistoryItems;

  // Groups the (already year-scoped) history list by expense category — Setname is SAP's internal
  // category code (e.g. "EMA_CONEXP"), Descript its human-readable label (e.g. "Conveyance
  // Expenses"). Groups are ordered by first appearance in the already-sorted list.
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

  const refreshHistoryStats = async () => {
    const year = selectedHistoryYear && selectedHistoryYear !== 'ALL' ? Number(selectedHistoryYear) : undefined;
    await fetchHistorySet(year);
  };

  const showScreenMessage = (message: string, type: 'success' | 'error' = 'success', title?: string) => {
    setScreenMessage({ title: title || (type === 'error' ? 'Action Failed' : 'Success'), message, type });
  };

  const handleValidate = (id: string) => {
    setMessageModal({
      title: 'Simulate SAP Financial Validation',
      message: `Run simulated SAP compliance checks and verify posting readiness for claim ${id}?`,
      cancelLabel: 'Cancel',
      confirmLabel: 'Validate Claim',
      onConfirm: () => {
        setMessageModal(null);
        validateClaimFinance(id);
        showScreenMessage(`Claim ${id} passed financial checks. Status changed to Parked.`, 'success');
      },
    });
  };

  // 'B' (Top Level) never picks a tax code here — Finance already selected and sent it to SAP on
  // their own earlier release call, so asking again at B's final posting step is redundant and
  // was blocking B from posting. B always goes straight to the simple confirm below.
  const handleRelease = async (id: string) => {
    const claim = claims.find((c) => c.id === id);
    if (claim && claim.stcd3 && currentUser?.role !== 'B') {
      setReleaseConfirmClaimId(id);
      setTaxModalVisible(true);
      setTaxLoading(true);
      setTaxDropdownOpen(true);
      setTaxSearch('');
      const taxes = await fetchTaxes(id);
      setAvailableTaxes(taxes);
      setTaxLoading(false);
    } else {
      setReleaseConfirmClaimId(id);
      setReleaseConfirmVisible(true);
    }
  };

  const closeReleaseConfirm = () => {
    setReleaseConfirmVisible(false);
    setTaxModalVisible(false);
    setReleaseConfirmClaimId('');
    setSelectedTaxCode('');
    setSelectedTaxDescription('');
    setTaxCalculation(null);
    setTaxDropdownOpen(false);
    setTaxSearch('');
    setAvailableTaxes([]);
  };

  // Purely informational — the selected tax code still goes to releasePayment() exactly as
  // before; this just shows Finance the expense/tax split SAP's own tax engine computes for it.
  const handleSelectTaxCode = async (tax: any) => {
    setSelectedTaxCode(tax.Mwskz);
    setSelectedTaxDescription(tax.Text1 || '');
    setTaxCalculation(null);
    const claim = claims.find((c) => c.id === releaseConfirmClaimId);
    if (!claim) return;
    setTaxCalculating(true);
    const result = await calculateTax(claim.amount, 'INR', tax.Mwskz);
    setTaxCalculating(false);
    setTaxCalculation(result);
  };

  const taxQuery = taxSearch.trim().toLowerCase();
  const filteredTaxes = taxQuery ? availableTaxes.filter((t: any) => `${t?.Mwskz ?? ''} ${t?.Text1 ?? ''}`.toLowerCase().includes(taxQuery)) : availableTaxes;
  const visibleTaxes = filteredTaxes.slice(0, TAX_RESULTS_LIMIT);

  const confirmReleasePayment = async () => {
    const id = releaseConfirmClaimId;
    if (!id) return;
    if (taxModalVisible && !selectedTaxCode) {
      showScreenMessage('Please select a Tax Code before releasing payment.', 'error', 'Selection Required');
      return;
    }
    const taxCodeToSend = selectedTaxCode;
    const taxDescriptionToSend = selectedTaxDescription;
    closeReleaseConfirm();
    const result = await releasePayment(id, taxCodeToSend || undefined, taxDescriptionToSend || undefined);
    if (!result.success) {
      showScreenMessage(formatSapErrorMessage(result.error), 'error', 'Payment Release Failed');
      return;
    }
    await refreshHistoryStats();
    await fetchClaims();
    showScreenMessage(`Claim ${id} has been paid successfully and workflow updated.`, 'success', 'Payment Released');
  };

  const handleReject = (id: string) => { setRejectClaimId(id); setRejectRemarks(''); setRejectModalVisible(true); };

  const confirmReject = async () => {
    const result = await rejectClaimFinance(rejectClaimId, rejectRemarks);
    if (!result.success) {
      setRejectModalVisible(false);
      showScreenMessage(formatSapErrorMessage(result.error), 'error', 'Rejection Failed');
      return;
    }
    await refreshHistoryStats();
    await fetchClaims();
    setRejectModalVisible(false);
    showScreenMessage(`Claim ${rejectClaimId} has been rejected successfully and the reason has been saved.`, 'success', 'Claim Rejected');
  };

  const toggleClaimSelection = (id: string) => setSelectedClaimIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  const toggleSelectAllBulkClaims = () => setSelectedClaimIds(allBulkSelected ? [] : bulkReleaseClaims.map((c) => c.id));

  const confirmBulkRelease = async () => {
    if (selectedClaimIds.length === 0) { showScreenMessage('Please select at least one claim to release.', 'error', 'No Claims Selected'); return; }
    setBulkReleaseConfirmVisible(false);
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
    if (failureCount > 0) showScreenMessage(`${successCount} claim(s) released. ${failureCount} claim(s) could not be released.`, 'error', 'Bulk Release Partial');
    else showScreenMessage(`${successCount} claim(s) have been released successfully.`, 'success', 'Bulk Release Complete');
  };

  const handleBulkRelease = () => {
    if (selectedClaimIds.length === 0) { showScreenMessage('Please select at least one claim to release.', 'error', 'No Claims Selected'); return; }
    setBulkReleaseConfirmVisible(true);
  };

  const STATUS_TONE: Record<string, 'green' | 'amber' | 'neutral'> = { Approved: 'green', 'Pending Release': 'amber', Paid: 'green' };
  const getDisplayStatus = (claim: ExpenseClaim) => (isBPendingRelease(claim) ? 'Pending Release' : claim.status);

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-extrabold text-ink">Finance Processing</h1>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {financeStats.map((stat) => {
          const Icon = stat.icon;
          const active = selectedStat === stat.label;
          return (
            <button
              key={stat.label}
              type="button"
              onClick={() => setSelectedStat(active ? null : stat.label)}
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
            placeholder="Search by Claim ID, Employee, Cost Center, or Expense Type..."
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-inkFaint"
          />
          {searchQuery !== '' && <button type="button" onClick={() => setSearchQuery('')}><X size={16} className="text-inkFaint" /></button>}
        </div>
        {isBulkReleaseUser && bulkReleaseClaims.length > 0 && (
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" className="flex-1" icon={allBulkSelected ? CheckSquare : Square} onClick={toggleSelectAllBulkClaims}>
              {allBulkSelected ? 'Clear Selection' : `Select All (${bulkReleaseClaims.length})`}
            </Button>
            <Button variant="success" className="flex-1" icon={IndianRupee} onClick={handleBulkRelease}>Release Selected</Button>
          </div>
        )}
      </Card>

      {screenMessage && (
        <Banner type={screenMessage.type} onClose={() => setScreenMessage(null)}>
          <p className="font-bold">{screenMessage.title}</p>
          <p>{screenMessage.message}</p>
        </Banner>
      )}

      {selectedStat && (
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink">{selectedStat === 'Pending' ? 'Pending Claims' : `${selectedStat} Claims`}</h2>
          <button type="button" onClick={() => setSelectedStat(null)} className="flex items-center gap-1 text-xs font-semibold text-inkSoft">
            <X size={14} /> Clear
          </button>
        </div>
      )}

      {showHistoryList && isSearching && availableHistoryYears.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Chip tone={selectedHistoryYear === 'ALL' ? 'brand' : 'neutral'} onClick={() => setSelectedHistoryYear('ALL')}>All Years</Chip>
          {availableHistoryYears.map((year) => (
            <Chip key={year} tone={selectedHistoryYear === year ? 'brand' : 'neutral'} onClick={() => setSelectedHistoryYear(year)}>{year}</Chip>
          ))}
        </div>
      )}

      {showHistoryList ? (
        filteredHistoryItems.length === 0 ? (
          <EmptyState icon={FileText} title="No Records" hint={`No ${selectedStat?.toLowerCase()} claims found in your history.`} />
        ) : (
          <div className="flex flex-col gap-3">
            {groupedHistoryItems.map((group) => {
              const groupKey = group.key || 'other';
              const isExpanded = expandedGroups.has(groupKey);
              const showingAll = groupsShowingAll.has(groupKey);
              const visibleItems = showingAll ? group.items : group.items.slice(0, GROUP_PAGE_SIZE);
              const remaining = group.items.length - visibleItems.length;
              return (
                <div key={groupKey}>
                  <button
                    type="button"
                    onClick={() => toggleGroupExpanded(groupKey)}
                    className="card flex w-full items-center justify-between !p-3 text-left"
                  >
                    <span className="text-sm font-extrabold text-brand">{group.label} ({group.items.length})</span>
                    {isExpanded ? <ChevronUp size={16} className="text-brand" /> : <ChevronDown size={16} className="text-inkFaint" />}
                  </button>
                  {isExpanded && (
                    <>
                      <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
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
                                <Chip tone={isApprove ? 'green' : 'red'}>{isApprove ? 'Released' : 'Rejected'}</Chip>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {remaining > 0 && (
                        <button
                          type="button"
                          onClick={() => showAllInGroup(groupKey)}
                          className="mt-2.5 w-full rounded-xl2 border border-line bg-white py-2 text-xs font-bold text-brand"
                        >
                          Show {remaining} more
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : financeClaims.length === 0 ? (
        <EmptyState icon={CreditCard} title="All Payments Processed" hint="There are no approved or pending release claims requiring finance action right now." />
      ) : (
        <div className="flex flex-col gap-3">
          {financeClaims.map((claim) => (
            <div key={claim.id} className="card flex items-stretch gap-0 overflow-hidden !p-0">
              {isBulkReleaseUser && (claim.status === 'Pending Release' || isBPendingRelease(claim)) && (
                <button type="button" onClick={() => toggleClaimSelection(claim.id)} className="flex items-center justify-center border-r border-line bg-appBg px-4">
                  {selectedClaimIds.includes(claim.id) ? <CheckSquare size={20} className="text-brand" /> : <Square size={20} className="text-inkFaint" />}
                </button>
              )}
              <div className="flex-1">
                <button type="button" onClick={() => router.push(`/claim/?id=${encodeURIComponent(claim.id)}`)} className="block w-full p-3.5 text-left">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-bold text-ink">{claim.id}</p>
                      <p className="text-xs font-semibold text-brand">{claim.employeeName} ({claim.department})</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <p className="text-base font-extrabold text-ink">₹{formatCurrency(claim.amount)}</p>
                      <Chip tone={STATUS_TONE[getDisplayStatus(claim)] || 'neutral'}>{displayStatusLabel(getDisplayStatus(claim))}</Chip>
                    </div>
                  </div>
                  <div className="mt-2 rounded-lg border border-line bg-appBg p-2">
                    <p className="text-xs font-bold text-inkSoft">{claim.expenseType}</p>
                    <p className="line-clamp-2 text-xs text-ink">{claim.justification}</p>
                  </div>
                  <div className="mt-2 flex justify-between text-2xs font-medium text-inkFaint">
                    <span>Cost Center: {claim.costCenter}</span>
                    <span>Date: {claim.claimDate}</span>
                  </div>
                </button>
                <div className="border-t border-line bg-appBg p-2">
                  {claim.status === 'Approved' ? (
                    <Button variant="secondary" className="w-full" icon={ShieldCheck} onClick={() => handleValidate(claim.id)}>Validate Claim (SAP Check)</Button>
                  ) : claim.status === 'Paid' ? (
                    <div className="flex items-center justify-center gap-1.5 rounded-lg border border-greenBg bg-greenBg py-2 text-sm font-bold text-green">
                      <CheckCircle2 size={18} /> Payment already released
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="success" className="flex-1" icon={IndianRupee} onClick={() => handleRelease(claim.id)}>Release Payment (SAP Pay)</Button>
                      <Button variant="danger" className="flex-1" onClick={() => handleReject(claim.id)}>Reject Claim</Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={bulkReleaseConfirmVisible} title="Release Selected Claims?" onClose={() => setBulkReleaseConfirmVisible(false)}
        footer={<>
          <Button variant="secondary" onClick={() => setBulkReleaseConfirmVisible(false)}>Cancel</Button>
          <Button variant="success" onClick={confirmBulkRelease}>Release Selected</Button>
        </>}>
        <p className="text-sm text-inkSoft">Release payment for {selectedClaimIds.length} selected claim(s) now?</p>
      </Modal>

      <Modal open={releaseConfirmVisible} title="Release Payment?" onClose={closeReleaseConfirm}
        footer={<>
          <Button variant="secondary" onClick={closeReleaseConfirm}>Cancel</Button>
          <Button variant="success" onClick={confirmReleasePayment}>Release Payment</Button>
        </>}>
        <p className="text-sm text-inkSoft">Authorize payment release and post the payment document in SAP FI for claim {releaseConfirmClaimId}?</p>
      </Modal>

      <Modal open={taxModalVisible} title="Select Tax Code" subtitle="This claim has a GSTIN. Please select the applicable tax code to release payment." onClose={closeReleaseConfirm}
        footer={<>
          <Button variant="secondary" onClick={closeReleaseConfirm}>Cancel</Button>
          <Button variant="success" onClick={confirmReleasePayment} disabled={!selectedTaxCode && availableTaxes.length > 0}>Confirm Release</Button>
        </>}>
        {taxLoading ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : availableTaxes.length === 0 ? (
          <p className="py-4 text-center text-sm text-inkSoft">No Tax Codes found for this claim.</p>
        ) : (
          <div>
            <button type="button" onClick={() => setTaxDropdownOpen(!taxDropdownOpen)} className="input flex items-center justify-between">
              <span className={selectedTaxCode ? 'text-ink' : 'text-inkFaint'}>
                {selectedTaxCode ? `${selectedTaxCode}${selectedTaxDescription ? ` (${selectedTaxDescription})` : ''}` : 'Select a Tax Code...'}
              </span>
              {taxDropdownOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {taxCalculating && (
              <div className="mt-2 flex items-center gap-2 text-xs text-inkSoft"><Spinner size={13} /> Calculating tax split…</div>
            )}
            {!taxCalculating && taxCalculation && (
              <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-border bg-appBg p-2.5 text-sm">
                <div><p className="text-2xs font-bold text-inkFaint">Expense Amount</p><p className="font-extrabold text-ink">₹{formatCurrency(taxCalculation.expenseAmt)}</p></div>
                <div><p className="text-2xs font-bold text-inkFaint">Tax Amount</p><p className="font-extrabold text-ink">₹{formatCurrency(taxCalculation.taxAmt)}</p></div>
              </div>
            )}

            {taxDropdownOpen && (
              <div className="mt-1 rounded-lg border border-border bg-white">
                <div className="flex items-center gap-2 border-b border-line bg-appBg px-2.5 py-2">
                  <Search size={14} className="text-inkFaint" />
                  <input value={taxSearch} onChange={(e) => setTaxSearch(e.target.value)} placeholder="Search tax code or description..." className="flex-1 bg-transparent text-sm text-ink outline-none" />
                  {taxSearch && <button type="button" onClick={() => setTaxSearch('')}><X size={14} className="text-inkFaint" /></button>}
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {visibleTaxes.length === 0 ? (
                    <p className="p-3 text-center text-sm text-inkSoft">No tax code matches &quot;{taxSearch.trim()}&quot;.</p>
                  ) : (
                    visibleTaxes.map((tax: any, index: number) => (
                      <button
                        key={`${tax.Mwskz}-${index}`}
                        type="button"
                        onClick={() => handleSelectTaxCode(tax)}
                        className={`block w-full border-b border-line px-3 py-2.5 text-left text-sm last:border-b-0 ${selectedTaxCode === tax.Mwskz ? 'bg-cream font-bold text-ink' : 'text-ink'}`}
                      >
                        {tax.Mwskz}{tax.Text1 ? ` (${tax.Text1})` : ''}
                      </button>
                    ))
                  )}
                </div>
                {filteredTaxes.length > visibleTaxes.length && (
                  <p className="border-t border-line bg-appBg px-3 py-2 text-xs text-inkSoft">Showing {visibleTaxes.length} of {filteredTaxes.length} — keep typing to narrow down.</p>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={rejectModalVisible} title="Reject Claim" onClose={() => setRejectModalVisible(false)}
        footer={<>
          <Button variant="secondary" onClick={() => setRejectModalVisible(false)}>Cancel</Button>
          <Button variant="danger" onClick={confirmReject}>Reject Claim</Button>
        </>}>
        <p className="mb-3 text-sm text-inkSoft">Please provide the reason for rejecting claim {rejectClaimId}.</p>
        <textarea className="input" rows={4} value={rejectRemarks} onChange={(e) => setRejectRemarks(e.target.value)} placeholder="Enter rejection reason" />
      </Modal>

      <MessageModal state={messageModal} onClose={() => setMessageModal(null)} />
    </div>
  );
}
