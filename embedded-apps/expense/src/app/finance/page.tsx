'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Briefcase, CheckCircle2, CheckSquare, ChevronDown, ChevronUp, CreditCard, Download, FileText, IndianRupee, Search, ShieldCheck, Square, X, XCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useClaim } from '../../context/ClaimContext';
import { ExpenseClaim } from '../../types';
import { getCategoryStyle } from '../../utils/category-style';
import { displayStatusLabel } from '../../utils/claim-status';
import { displayClaimNumber } from '../../utils/claim-number';
import { isGstClaim } from '../../utils/claim-gst';
import { getPersistedTaxSplit } from '../../utils/claim-tax-split';
import { formatCurrency } from '../../utils/currency';
import { buildHistoryExcelHtml } from '../../utils/history-excel';
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

const TAX_RESULTS_LIMIT = 50;

export default function FinancePage() {
  const router = useRouter();
  const { filterClaims, validateClaimFinance, releasePayment, fetchTaxes, calculateTax, rejectClaimFinance, claims, fetchClaims, fetchHistorySet, historyEntries, claimSummaryCache, fetchClaimSummaries } = useClaim();
  const { currentUser } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [screenMessage, setScreenMessage] = useState<{ title: string; message: string; type: 'success' | 'error' } | null>(null);
  const [selectedClaimIds, setSelectedClaimIds] = useState<string[]>([]);
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
  // middle, 2 after) — same widget as Approvals/My Claims, replacing the old search-only year list.
  const [selectedFiscalYear, setSelectedFiscalYear] = useState(() => new Date().getFullYear());
  // Purely cosmetic — which way the year chips slide in, based on whether the newly clicked year
  // was to the right or left of the previously-centered one. Doesn't affect filtering at all.
  const [yearSlideDirection, setYearSlideDirection] = useState<'left' | 'right'>('right');
  const handleSelectFiscalYear = (year: number) => {
    setYearSlideDirection(year >= selectedFiscalYear ? 'right' : 'left');
    setSelectedFiscalYear(year);
  };
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

  // Purely informational Expense/Tax split shown directly on each GST pending card, so Finance
  // doesn't have to open the tax-code picker just to see the breakdown. Reuses the same SAP tax
  // engine the picker calls, auto-applying the first (and in practice only) tax code TaxSet
  // returns for that specific claim/region - never used to actually select the tax code sent to
  // releasePayment(), which still happens via the existing picker flow.
  const [taxPreviewCache, setTaxPreviewCache] = useState<Record<string, { expenseAmt: number; taxAmt: number } | null>>({});
  const taxPreviewCacheRef = useRef(taxPreviewCache);
  useEffect(() => { taxPreviewCacheRef.current = taxPreviewCache; }, [taxPreviewCache]);

  const gstFinanceClaimIds = financeClaims.filter((c) => isGstClaim(c) && !getPersistedTaxSplit(c)).map((c) => c.id).join(',');
  useEffect(() => {
    const ids = gstFinanceClaimIds ? gstFinanceClaimIds.split(',') : [];
    const missing = ids.filter((id) => !(id in taxPreviewCacheRef.current));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(missing.map(async (id) => {
        const claim = financeClaims.find((c) => c.id === id);
        if (!claim) return { id, preview: null };
        const taxes = await fetchTaxes(id);
        const code = taxes[0];
        if (!code) return { id, preview: null };
        const preview = await calculateTax(claim.amount, 'INR', code.Mwskz);
        return { id, preview };
      }));
      if (cancelled) return;
      setTaxPreviewCache((prev) => {
        const next = { ...prev };
        results.forEach((r) => { next[r.id] = r.preview; });
        return next;
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gstFinanceClaimIds]);

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

  // Re-fetches from SAP (server-side Fiscalyear filter) every time the selected year chip
  // changes, instead of fetching once and filtering ActionDate client-side — covers the initial
  // mount too since selectedFiscalYear is already set before this first runs.
  useEffect(() => {
    fetchHistorySet(selectedFiscalYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFiscalYear]);

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

  const visibleFiscalYears = useMemo(
    () => [selectedFiscalYear - 2, selectedFiscalYear - 1, selectedFiscalYear, selectedFiscalYear + 1, selectedFiscalYear + 2],
    [selectedFiscalYear]
  );

  // historyEntries is already scoped to selectedFiscalYear server-side (see fetchHistorySet) — no
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

  // Drives both the drill-down view and the "Type:" filter readout — null means no category
  // selected yet (showing the category grid), so exports/labels fall back to "All".
  const activeGroup = selectedGroupKey ? groupedHistoryItems.find((g) => (g.key || 'other') === selectedGroupKey) : null;

  const handleExportExcel = () => {
    const entriesToExport = activeGroup ? activeGroup.items : filteredHistoryItems;
    if (entriesToExport.length === 0) {
      setMessageModal({ title: 'Export Excel', message: 'There are no claims to export for the current filters.', type: 'error' });
      return;
    }
    const html = buildHistoryExcelHtml(entriesToExport, claimSummaryCache);
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStamp = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `finance-${dateStamp}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const refreshHistoryStats = async () => { await fetchHistorySet(selectedFiscalYear); };

  const showScreenMessage = (message: string, type: 'success' | 'error' = 'success', title?: string) => {
    setScreenMessage({ title: title || (type === 'error' ? 'Action Failed' : 'Success'), message, type });
  };

  const handleValidate = (id: string) => {
    setMessageModal({
      title: 'Simulate SAP Financial Validation',
      message: `Run simulated SAP compliance checks and verify posting readiness for claim ${displayClaimNumber(id)}?`,
      cancelLabel: 'Cancel',
      confirmLabel: 'Validate Claim',
      onConfirm: () => {
        setMessageModal(null);
        validateClaimFinance(id);
        showScreenMessage(`Claim ${displayClaimNumber(id)} passed financial checks. Status changed to Parked.`, 'success');
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
    showScreenMessage(`Claim ${displayClaimNumber(id)} has been paid successfully and workflow updated.`, 'success', 'Payment Released');
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
    showScreenMessage(`Claim ${displayClaimNumber(rejectClaimId)} has been rejected successfully and the reason has been saved.`, 'success', 'Claim Rejected');
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

  const STATUS_TONE: Record<string, 'green' | 'amber' | 'neutral'> = { Approved: 'green', 'Pending Release': 'neutral', 'Pending at finance': 'amber', Paid: 'green' };
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
            placeholder="Search by Claim ID, Employee, Cost Center, or Expense Type..."
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-inkFaint"
          />
          {searchQuery !== '' && <button type="button" onClick={() => setSearchQuery('')}><X size={16} className="text-inkFaint" /></button>}
        </div>
        {showHistoryList && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Chip tone="brand">Type: {activeGroup?.label || 'All'}</Chip>
            <Chip tone="brand">Status: {selectedStat}</Chip>
            <Chip tone="green" icon={Download} onClick={handleExportExcel}>
              Export Excel
            </Chip>
            <div
              key={selectedFiscalYear}
              className={`flex items-center gap-2 ${yearSlideDirection === 'right' ? 'animate-slideFromRight' : 'animate-slideFromLeft'}`}
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
          </div>
        )}
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
              const style = getCategoryStyle(group.label);
              const Icon = style.icon;
              return (
                <button
                  key={groupKey}
                  type="button"
                  onClick={() => setSelectedGroupKey(groupKey)}
                  className={`card flex flex-col items-center gap-1.5 p-3 text-center ${style.bg} border-transparent`}
                >
                  <div className={`flex h-9 w-9 items-center justify-center rounded-full bg-white/60 ${style.text}`}>
                    <Icon size={18} />
                  </div>
                  <span className="text-sm font-extrabold text-ink">{group.label}</span>
                  <span className={`text-xs font-semibold ${style.text}`}>{group.items.length} claim{group.items.length === 1 ? '' : 's'}</span>
                </button>
              );
            })}
          </div>
        ) : (() => {
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
                      className={`relative flex flex-col gap-1 rounded-xl2 border-l-4 p-3 text-left ${isApprove ? 'border-l-green bg-greenBg' : 'border-l-red bg-redBg'}`}
                    >
                      {matchedClaim && isGstClaim(matchedClaim) && (
                        <span className="pointer-events-none absolute right-2 top-2 rounded-full border border-brand bg-white px-2 py-0.5 text-[10px] font-bold text-brand">
                          GST
                        </span>
                      )}
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 text-sm font-bold text-ink">Claim ID:{displayClaimNumber(entry.ClaimId)}</span>
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
                  onClick={() => showAllInGroup(selectedGroupKey)}
                  className="w-full rounded-xl2 border border-line bg-white py-2 text-xs font-bold text-brand"
                >
                  Show {remaining} more
                </button>
              )}
            </div>
          );
        })()
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
                      <p className="text-sm font-bold text-ink">Claim ID:{displayClaimNumber(claim.id)}</p>
                      <p className="text-xs font-semibold text-brand">{claim.employeeName} ({claim.department})</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <p className="text-base font-extrabold text-ink">₹{formatCurrency(claim.amount)}</p>
                      <div className="flex items-center gap-1">
                        {isGstClaim(claim) && (
                          <span className="rounded-full border border-brand bg-white px-2 py-0.5 text-[10px] font-bold text-brand">
                            GST
                          </span>
                        )}
                        <Chip tone={STATUS_TONE[getDisplayStatus(claim)] || 'neutral'}>{displayStatusLabel(getDisplayStatus(claim))}</Chip>
                      </div>
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
                  {isGstClaim(claim) && (getPersistedTaxSplit(claim) || taxPreviewCache[claim.id]) && (() => {
                    const split = getPersistedTaxSplit(claim) || taxPreviewCache[claim.id]!;
                    return (
                      <div className="mt-1 flex justify-between text-2xs font-medium text-inkFaint">
                        <span>Expense Amount: ₹{formatCurrency(split.expenseAmt)}</span>
                        <span>Tax Amount: ₹{formatCurrency(split.taxAmt)}</span>
                      </div>
                    );
                  })()}
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
        <p className="text-sm text-inkSoft">Authorize payment release and post the payment document in SAP FI for claim {displayClaimNumber(releaseConfirmClaimId)}?</p>
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
              <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg border border-border bg-appBg p-2.5 text-sm">
                <div><p className="text-2xs font-bold text-inkFaint">Expense Amount</p><p className="font-extrabold text-ink">₹{formatCurrency(taxCalculation.expenseAmt)}</p></div>
                <div><p className="text-2xs font-bold text-inkFaint">Tax Amount</p><p className="font-extrabold text-ink">₹{formatCurrency(taxCalculation.taxAmt)}</p></div>
                <div><p className="text-2xs font-bold text-inkFaint">Total Amount</p><p className="font-extrabold text-ink">₹{formatCurrency(taxCalculation.expenseAmt + taxCalculation.taxAmt)}</p></div>
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
        <p className="mb-3 text-sm text-inkSoft">Please provide the reason for rejecting claim {displayClaimNumber(rejectClaimId)}.</p>
        <textarea className="input" rows={4} value={rejectRemarks} onChange={(e) => setRejectRemarks(e.target.value)} placeholder="Enter rejection reason" />
      </Modal>

      <MessageModal state={messageModal} onClose={() => setMessageModal(null)} />
    </div>
  );
}
