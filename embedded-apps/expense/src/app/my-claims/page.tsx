'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download, FileText, Search, X } from 'lucide-react';
import { useClaim } from '../../context/ClaimContext';
import { ExpenseClaim } from '../../types';
import { formatClaimDisplayDate, getClaimCreatedTimestamp } from '../../utils/claim-date';
import { displayStatusLabel } from '../../utils/claim-status';
import { displayClaimNumber } from '../../utils/claim-number';
import { isGstClaim } from '../../utils/claim-gst';
import { formatCurrency } from '../../utils/currency';
import { buildSpreadsheetMLWorkbook } from '../../utils/history-excel';
import { Card, Chip, EmptyState, MessageModal, type MessageModalState, Modal } from '../../components/ui';

const STATUSES = ['All', 'Draft', 'Submitted', 'Approved', 'Pending Release', 'Pending at finance', 'Paid', 'Rejected'];

// 'Pending Pay' is a synthetic combined status the Dashboard KPI card links to (Pending at finance
// + Parked) - not one of the real SAP statuses in STATUSES, so it's accepted separately here
// without being offered as its own selectable filter chip.
const getStatusParamValue = (statusParam: string | null) =>
  statusParam && (STATUSES.includes(statusParam) || statusParam === 'Pending Pay') ? statusParam : 'All';

// Fiscal-year filter reads the same "Submitted" timestamp shown on each card (createdOn/
// createdTime, falling back to claimDate) — not claim.claimDate — per the stakeholder requirement.
const getSubmittedYear = (claim: ExpenseClaim) => {
  const ts = getClaimCreatedTimestamp(claim);
  // UTC getter: this timestamp is SAP's midnight-UTC date-only value, so a local-timezone getter
  // could misfile a claim made right at a year boundary into the wrong fiscal year.
  return ts ? new Date(ts).getUTCFullYear() : null;
};

const formatAttachmentNames = (claim: ExpenseClaim) => claim.attachments?.map((a) => a.name).filter(Boolean).join(', ') || '';

const getLastWorkflowAction = (claim: ExpenseClaim) => {
  const lastEvent = claim.workflowHistory?.[claim.workflowHistory.length - 1];
  if (!lastEvent) return '';
  return [lastEvent.step, lastEvent.outcome, lastEvent.timestamp].filter(Boolean).join(' - ');
};

const buildClaimsExcelHtml = (claims: ExpenseClaim[]) => {
  const headers = [
    'Claim ID', 'Employee ID', 'Employee Name', 'Department', 'Designation', 'Claim Date', 'Expense Date',
    'Expense Type', 'Amount', 'Currency', 'Cost Center', 'Business Justification', 'Status', 'SAP Raw Status',
    'Current Approver', 'Attachment Count', 'Attachment Names', 'Last Workflow Action',
  ];

  const rows = claims.map((claim) => [
    claim.id, claim.employeeId, claim.employeeName, claim.department, claim.designation, claim.claimDate,
    claim.expenseDate || '', claim.expenseType, claim.amount.toFixed(2), 'INR', claim.costCenter, claim.justification,
    claim.status, claim.rawStatus || '', claim.currentApprover || '', claim.attachments?.length || 0,
    formatAttachmentNames(claim), getLastWorkflowAction(claim),
  ]);

  return buildSpreadsheetMLWorkbook(headers, rows);
};

const STATUS_BADGE_TONE: Record<string, 'green' | 'amber' | 'blue' | 'red' | 'neutral'> = {
  Approved: 'green',
  Paid: 'green',
  'Pending Release': 'neutral',
  'Pending at finance': 'amber',
  Submitted: 'blue',
  Rejected: 'red',
};

const ACCENT_BORDER: Record<string, string> = {
  Approved: 'border-l-green',
  Paid: 'border-l-green',
  'Pending Release': 'border-l-border',
  'Pending at finance': 'border-l-amber',
  Submitted: 'border-l-blue',
  Rejected: 'border-l-red',
};

function MyClaimsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { filterClaims, expenseTypes, fetchExpenseTypes } = useClaim();

  const expenseTypeOptions = useMemo(() => {
    const sapExpenseTypes = expenseTypes
      .map((t) => t.name)
      .filter((name, index, names): name is string => !!name && names.indexOf(name) === index);
    return ['All', ...sapExpenseTypes];
  }, [expenseTypes]);

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilterSearch, setTypeFilterSearch] = useState('');
  const [selectedExpenseType, setSelectedExpenseType] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState(() => getStatusParamValue(searchParams.get('status')));
  const [typeFilterModal, setTypeFilterModal] = useState(false);
  const [statusFilterModal, setStatusFilterModal] = useState(false);
  const [messageModal, setMessageModal] = useState<MessageModalState>(null);
  // Fiscal-year slider: always-on, 5 years visible (2 before, selected in the middle, 2 after).
  // Clicking any visible year re-centers the window on it — defaults to the current year.
  const [selectedFiscalYear, setSelectedFiscalYear] = useState(() => new Date().getFullYear());
  // Purely cosmetic — which way the year chips slide in, based on whether the newly clicked year
  // was to the right or left of the previously-centered one. Doesn't affect filtering at all.
  const [yearSlideDirection, setYearSlideDirection] = useState<'left' | 'right'>('right');
  const handleSelectFiscalYear = (year: number) => {
    setYearSlideDirection(year >= selectedFiscalYear ? 'right' : 'left');
    setSelectedFiscalYear(year);
  };

  useEffect(() => {
    fetchExpenseTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!expenseTypeOptions.includes(selectedExpenseType)) setSelectedExpenseType('All');
  }, [expenseTypeOptions, selectedExpenseType]);

  useEffect(() => {
    setSelectedStatus(getStatusParamValue(searchParams.get('status')));
  }, [searchParams]);

  const period = searchParams.get('period') || '';

  const filteredExpenseTypeOptions = useMemo(
    () => expenseTypeOptions.filter((t) => t.toLowerCase().includes(typeFilterSearch.trim().toLowerCase())),
    [expenseTypeOptions, typeFilterSearch]
  );

  const filteredClaims = filterClaims('employee', searchQuery, selectedExpenseType, selectedStatus);

  // The 5 years currently visible in the slider — 2 before, the selected year in the middle, 2
  // after. Pure integer arithmetic, not clamped to years that actually have claims, so the window
  // keeps sliding freely in either direction even into years with no data (shows an empty state).
  const visibleFiscalYears = useMemo(
    () => [selectedFiscalYear - 2, selectedFiscalYear - 1, selectedFiscalYear, selectedFiscalYear + 1, selectedFiscalYear + 2],
    [selectedFiscalYear]
  );

  const displayedClaims = useMemo(() => {
    let next = filteredClaims;
    if (period === 'last3months') {
      try {
        const now = new Date();
        const cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        next = next.filter((c) => {
          if (!c || c.status !== 'Paid') return false;
          const createdTimestamp = getClaimCreatedTimestamp(c);
          if (!createdTimestamp) return false;
          return createdTimestamp >= cutoff.getTime();
        });
      } catch (e) {
        console.warn('Failed to apply last3months filter', e);
      }
    }
    next = next.filter((c) => getSubmittedYear(c) === selectedFiscalYear);
    return [...next].sort((a, b) => getClaimCreatedTimestamp(b) - getClaimCreatedTimestamp(a));
  }, [filteredClaims, period, selectedFiscalYear]);

  const handleExportExcel = () => {
    if (displayedClaims.length === 0) {
      setMessageModal({ title: 'Export Excel', message: 'There are no claims to export for the current filters.', type: 'error' });
      return;
    }
    const html = buildClaimsExcelHtml(displayedClaims);
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStamp = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `my-claims-${dateStamp}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-xl font-extrabold text-ink">My Submitted Claims</h1>
      </div>

      <Card>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-appBg px-3 py-2">
          <Search size={16} className="text-inkFaint" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Claim ID, Cost Center, or Type..."
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-inkFaint"
          />
          {searchQuery !== '' && (
            <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search">
              <X size={16} className="text-inkFaint" />
            </button>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Chip tone="brand" onClick={() => { setTypeFilterSearch(''); setTypeFilterModal(true); }}>
            Type: {selectedExpenseType}
          </Chip>
          <Chip tone="brand" onClick={() => setStatusFilterModal(true)}>
            Status: {displayStatusLabel(selectedStatus)}
          </Chip>
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
      </Card>

      {displayedClaims.length === 0 ? (
        <EmptyState icon={FileText} title="No Claims Found" hint="No expense claims match your active search or filter criteria." />
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {displayedClaims.map((claim) => (
            <button
              key={claim.id}
              type="button"
              onClick={() => router.push(`/claim/?id=${encodeURIComponent(claim.id)}`)}
              className={`card-accent ${ACCENT_BORDER[claim.status] || 'border-l-blue'} flex flex-col gap-2.5 p-3 text-left transition-shadow hover:shadow-lift`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">Claim ID:{displayClaimNumber(claim.id)}</p>
                  <p className="truncate text-xs font-medium text-inkSoft">{claim.expenseType}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className="text-base font-extrabold text-ink">₹{formatCurrency(claim.amount)}</p>
                  <Chip tone={STATUS_BADGE_TONE[claim.status] || 'neutral'}>{displayStatusLabel(claim.status)}</Chip>
                </div>
              </div>

              <p className="line-clamp-2 text-xs text-inkSoft">{claim.justification}</p>

              <div className="flex items-start justify-between border-t border-line pt-2 text-2xs font-medium text-inkFaint">
                <div className="flex flex-col items-start gap-1">
                  <span>Cost Center: {claim.costCenter}</span>
                  {isGstClaim(claim) && (
                    <span className="w-fit rounded-full border border-brand bg-white px-2 py-0.5 text-[10px] font-bold text-brand">
                      GST
                    </span>
                  )}
                </div>
                <span>Submitted: {formatClaimDisplayDate(claim)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal open={typeFilterModal} title="Filter by Expense Type" onClose={() => setTypeFilterModal(false)}>
        <input
          value={typeFilterSearch}
          onChange={(e) => setTypeFilterSearch(e.target.value)}
          placeholder="Search expense types"
          className="input mb-3"
        />
        <div className="flex max-h-80 flex-col overflow-y-auto">
          {filteredExpenseTypeOptions.length === 0 ? (
            <p className="py-3 text-sm text-inkSoft">No matching expense types</p>
          ) : (
            filteredExpenseTypeOptions.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => { setSelectedExpenseType(item); setTypeFilterModal(false); }}
                className="flex items-center justify-between border-b border-line py-3 text-left text-sm text-ink last:border-b-0"
              >
                <span>{item}</span>
                {selectedExpenseType === item && <span className="text-brand">✓</span>}
              </button>
            ))
          )}
        </div>
      </Modal>

      <Modal open={statusFilterModal} title="Filter by Status" onClose={() => setStatusFilterModal(false)}>
        <div className="flex flex-col">
          {STATUSES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => { setSelectedStatus(item); setStatusFilterModal(false); }}
              className="flex items-center justify-between border-b border-line py-3 text-left text-sm text-ink last:border-b-0"
            >
              <span>{displayStatusLabel(item)}</span>
              {selectedStatus === item && <span className="text-brand">✓</span>}
            </button>
          ))}
        </div>
      </Modal>

      <MessageModal state={messageModal} onClose={() => setMessageModal(null)} />
    </div>
  );
}

export default function MyClaimsPage() {
  return (
    <Suspense fallback={<div className="py-14 text-center text-sm text-inkSoft">Loading…</div>}>
      <MyClaimsInner />
    </Suspense>
  );
}
