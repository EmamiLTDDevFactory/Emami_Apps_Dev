'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ChevronRight, FileText, IndianRupee, RefreshCw, Search, Settings2, ShieldAlert, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useClaim } from '../../context/ClaimContext';
import { ExpenseClaim } from '../../types';
import { formatCurrency } from '../../utils/currency';
import { displayClaimNumber } from '../../utils/claim-number';
import { formatClaimDisplayDate } from '../../utils/claim-date';
import { Banner, Button, Card, CardTitle, EmptyState, Field, Input, LoadingBlock, PageHeader, Select } from '../../components/ui';
import type { LucideIcon } from 'lucide-react';

// Same leading-icon input look every search field here already used - a plain Input with an icon
// positioned over its left padding, not a new component.
function IconInput({ icon: LeadIcon, ...rest }: { icon: LucideIcon } & React.ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <LeadIcon size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-inkFaint" />
      <Input {...rest} className={`pl-8 ${rest.className || ''}`} />
    </div>
  );
}

// S (Posted) and P (Parked/legacy) are deliberately excluded — the backend's admin search never
// returns claims in those statuses regardless of filter, so offering them here would only ever
// produce an empty result.
const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'N', label: 'N — Submitted' },
  { value: 'A', label: 'A — Approved' },
  { value: 'H', label: 'H — Pending at Finance' },
  { value: 'R', label: 'R — Rejected' },
];

export default function AdminPage() {
  const router = useRouter();
  const { currentUser } = useAuth();
  const { adminSearchClaims } = useClaim();

  const [claimId, setClaimId] = useState('');
  const [empId, setEmpId] = useState('');
  const [empName, setEmpName] = useState('');
  const [status, setStatus] = useState('');
  const [costCenter, setCostCenter] = useState('');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ExpenseClaim[]>([]);

  if (!currentUser?.isAdmin) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Access restricted"
        hint="This page is only available to admins listed in SAP's ZEXP_ADMIN variable."
      />
    );
  }

  const handleSearch = async () => {
    const criteria = {
      claimId: claimId.trim() || undefined,
      empId: empId.trim() || undefined,
      empName: empName.trim() || undefined,
      status: status || undefined,
      costCenter: costCenter.trim() || undefined,
    };
    if (!criteria.claimId && !criteria.empId && !criteria.empName && !criteria.status && !criteria.costCenter) {
      setError('Enter at least one of Claim ID, Employee ID, Employee Name, Status or Cost Centre to search');
      return;
    }
    setError(null);
    setSearching(true);
    setSearched(true);
    try {
      const claims = await adminSearchClaims(currentUser.employeeId, criteria);
      setResults(claims);
    } catch (err: any) {
      // Shown verbatim - the backend's own business-error table should reach the admin unmodified
      // (e.g. "Not authorised for admin claim search").
      setError(err?.message || 'Admin claim search failed');
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleClear = () => {
    setClaimId('');
    setEmpId('');
    setEmpName('');
    setStatus('');
    setCostCenter('');
    setError(null);
    setSearched(false);
    setResults([]);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Admin Console"
        subtitle="Manage claim search, rejection and DOA chain maintenance."
        icon={ShieldAlert}
      />

      <Card className="mb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
              <Settings2 size={18} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">DOA Chain Maintenance</p>
              <p className="text-xs text-inkSoft">Maintain approval-chain slabs, approvers and HoD routing per cost centre.</p>
            </div>
          </div>
          <Button variant="primary" onClick={() => router.push('/doa-chain/')} className="shrink-0">
            Open DOA Chain Maintenance
            <ChevronRight size={14} />
          </Button>
        </div>
      </Card>

      <Card className="mb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
              <IndianRupee size={18} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">Mobile Expense Cap Maintenance</p>
              <p className="text-xs text-inkSoft">Maintain monthly mobile-expense caps by category, grade and level.</p>
            </div>
          </div>
          <Button variant="primary" onClick={() => router.push('/mob-cap/')} className="shrink-0">
            Open Mobile Cap Maintenance
            <ChevronRight size={14} />
          </Button>
        </div>
      </Card>

      <Card className="mb-3">
        <CardTitle icon={Search} title="Claim Search & Reject" hint="Search any claim in the system and reject it while it's still open." />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Claim ID">
            <IconInput
              icon={FileText}
              value={claimId}
              onChange={(e) => setClaimId(e.target.value)}
              placeholder="e.g. 1800000123"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            />
          </Field>
          <Field label="Employee ID">
            <IconInput
              icon={User}
              value={empId}
              onChange={(e) => setEmpId(e.target.value)}
              placeholder="e.g. 90000367"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            />
          </Field>
          <Field label="Employee Name" hint="Part of name, case-insensitive">
            <IconInput
              icon={User}
              value={empName}
              onChange={(e) => setEmpName(e.target.value)}
              placeholder="e.g. bhatta"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={setStatus} options={STATUS_OPTIONS} />
          </Field>
          <Field label="Cost Centre">
            <IconInput
              icon={Building2}
              value={costCenter}
              onChange={(e) => setCostCenter(e.target.value.toUpperCase())}
              placeholder="e.g. CORP16"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            />
          </Field>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button variant="primary" icon={Search} loading={searching} onClick={handleSearch}>
            Search
          </Button>
          <Button variant="secondary" icon={RefreshCw} onClick={handleClear}>
            Clear
          </Button>
        </div>
      </Card>

      {error && (
        <Banner type="error" onClose={() => setError(null)}>{error}</Banner>
      )}

      {searching && <LoadingBlock label="Searching claims…" />}

      {!searching && searched && results.length === 0 && !error && (
        <EmptyState icon={Search} title="No claims found" hint="Try different search criteria. Posted claims are not shown." />
      )}

      {!searching && results.length > 0 && (
        <div className="flex flex-col gap-2">
          {results.map((claim) => (
            <button
              key={claim.id}
              type="button"
              onClick={() => router.push(`/claim/?id=${encodeURIComponent(claim.id)}`)}
              className="card block w-full p-3.5 text-left"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-ink">Claim ID: {displayClaimNumber(claim.id)}</p>
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
                <span>Date: {formatClaimDisplayDate(claim)}</span>
              </div>
              {claim.attachments.length > 0 && (
                <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-cream px-2.5 py-1.5 text-xs font-semibold text-brand">
                  <FileText size={14} /> {claim.attachments[0].name}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
