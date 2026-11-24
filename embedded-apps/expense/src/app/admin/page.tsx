'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ChevronRight, FileText, IndianRupee, Lock, RefreshCw, Search, Settings2, ShieldAlert, Tag, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useClaim } from '../../context/ClaimContext';
import { ExpenseClaim } from '../../types';
import { formatCurrency } from '../../utils/currency';
import { displayClaimNumber } from '../../utils/claim-number';
import { formatClaimDisplayDate } from '../../utils/claim-date';
import { Banner, Button, Card, CardTitle, EmptyState, Field, Input, LoadingBlock, PageHeader } from '../../components/ui';
import type { LucideIcon } from 'lucide-react';

// A locked field shows its own icon + a trailing lock, same brand/inkFaint colors as the rest of
// the app's inputs - not a new visual language, just marking "not enabled yet" at a glance.
function LockedField({ icon: LeadIcon, placeholder }: { icon: LucideIcon; placeholder: string }) {
  return (
    <div className="relative">
      <LeadIcon size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-inkFaint" />
      <Input disabled placeholder={placeholder} className="pl-8 pr-8" />
      <Lock size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-inkFaint" />
    </div>
  );
}

// Non-CTC Expense: per the DOA handover, only ClaimId/LoginId/Zview are filterable server-side
// today - EmpId/EmpName/Status/CostCenter need a backend metadata change first. The other fields
// are rendered disabled below rather than omitted, so the gap is visible instead of silent.
export default function AdminPage() {
  const router = useRouter();
  const { currentUser } = useAuth();
  const { adminSearchClaims } = useClaim();

  const [claimId, setClaimId] = useState('');
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
    const trimmed = claimId.trim();
    if (!trimmed) {
      setError('Enter Claim Id, Employee, Status or Cost Centre to search');
      return;
    }
    setError(null);
    setSearching(true);
    setSearched(true);
    try {
      const claims = await adminSearchClaims(currentUser.employeeId, { claimId: trimmed });
      setResults(claims);
    } catch (err: any) {
      // Shown verbatim - the DOA handover's admin business-error table should reach the admin
      // unmodified (e.g. "Not authorised for admin claim search").
      setError(err?.message || 'Admin claim search failed');
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleClear = () => {
    setClaimId('');
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
          <Field label="Claim ID" required>
            <div className="relative">
              <FileText size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-inkFaint" />
              <Input
                value={claimId}
                onChange={(e) => setClaimId(e.target.value)}
                placeholder="e.g. 1800000123"
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                className="pl-8"
              />
            </div>
          </Field>
          <Field label="Employee ID / Name">
            <LockedField icon={User} placeholder="Not enabled yet" />
          </Field>
          <Field label="Status">
            <LockedField icon={Tag} placeholder="Not enabled yet" />
          </Field>
          <Field label="Cost Centre">
            <LockedField icon={Building2} placeholder="Not enabled yet" />
          </Field>
        </div>

        <div className="mt-3">
          <Banner type="info">
            Employee, Status and Cost Centre search aren't enabled yet — SAP hasn't opened those fields
            for filtering on the admin view yet. Search by Claim ID for now.
          </Banner>
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
        <EmptyState icon={Search} title="No claims found" hint="Try a different Claim ID." />
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
