'use client';

import { useRouter } from 'next/navigation';
import { BarChart3, CheckCircle2, Clock, FileStack, IndianRupee, PlusCircle, RefreshCcw, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useClaim } from '../context/ClaimContext';
import { ExpenseClaim } from '../types';
import { formatClaimDisplayDate, getClaimCreatedTimestamp } from '../utils/claim-date';
import { displayStatusLabel } from '../utils/claim-status';
import { displayClaimNumber } from '../utils/claim-number';
import { isGstClaim } from '../utils/claim-gst';
import { formatCurrency } from '../utils/currency';
import { Chip } from '../components/ui';

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

export default function RootPage() {
  const router = useRouter();
  const { kpis, claims, fetchClaims } = useClaim();
  const { activeRole } = useAuth();

  const recentClaims = [...claims]
    .sort((a, b) => getClaimCreatedTimestamp(b) - getClaimCreatedTimestamp(a))
    .slice(0, 5);

  const kpiCards = [
    { label: 'Total Claims', value: kpis.total, icon: FileStack, accent: 'text-brand', href: '/my-claims/?status=All' },
    { label: 'Pending Approval', value: kpis.pending, icon: Clock, accent: 'text-amber', href: '/my-claims/?status=Submitted' },
    { label: 'Pending Pay', value: kpis.approved, icon: CheckCircle2, accent: 'text-green', href: `/my-claims/?status=${encodeURIComponent('Pending Pay')}` },
    { label: 'Paid Claims', value: kpis.paid, icon: IndianRupee, accent: 'text-green', href: '/my-claims/?status=Paid' },
    { label: 'Rejected', value: kpis.rejected, icon: XCircle, accent: 'text-red', href: '/my-claims/?status=Rejected' },
    { label: 'Last 3 Months Total', value: `₹${formatCurrency(kpis.last3MonthsTotal || 0)}`, icon: BarChart3, accent: 'text-green', href: '/my-claims/?status=Paid&period=last3months' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <button
              key={kpi.label}
              type="button"
              onClick={() => router.push(kpi.href)}
              className="card relative flex flex-col items-start gap-1 p-4 text-left transition-shadow hover:shadow-lift"
            >
              <span className={`absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-appBg ${kpi.accent}`}>
                <Icon size={19} />
              </span>
              <span className="text-2xl font-extrabold text-ink">{kpi.value}</span>
              <span className="text-sm font-bold text-inkSoft">{kpi.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col items-start justify-between gap-3 rounded-xl2 bg-brand p-5 text-white sm:flex-row sm:items-center">
        <div>
          <p className="text-base font-bold">Need to submit a reimbursement?</p>
          <p className="mt-0.5 text-sm text-white/80">Attach receipts and route to your manager instantly.</p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/create/')}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brandDeep px-3.5 py-2.5 text-sm font-bold text-white hover:opacity-90"
        >
          <PlusCircle size={18} /> Create Claim
        </button>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-ink">Recent Claims Activity</h2>
        <div className="flex items-center gap-3">
          {activeRole === 'employee' && (
            <button type="button" onClick={() => router.push('/my-claims/')} className="text-sm font-bold text-brand">
              View All
            </button>
          )}
          <button
            type="button"
            onClick={() => fetchClaims()}
            className="flex items-center gap-1 rounded-lg border border-blueBg bg-cream px-2.5 py-1 text-xs font-bold text-brand"
          >
            <RefreshCcw size={12} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {recentClaims.map((claim: ExpenseClaim) => (
          <button
            key={claim.id}
            type="button"
            onClick={() => router.push(`/claim/?id=${encodeURIComponent(claim.id)}`)}
            className={`card-accent ${ACCENT_BORDER[claim.status] || 'border-l-blue'} relative flex flex-col gap-2 p-3.5 text-left transition-shadow hover:shadow-lift`}
          >
            {isGstClaim(claim) && (
              <span className="pointer-events-none absolute right-2 top-2 rounded-full border border-brand bg-white px-2 py-0.5 text-[10px] font-bold text-brand">
                GST
              </span>
            )}
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-sm font-extrabold text-ink">Claim ID:{displayClaimNumber(claim.id)}</span>
              {claim.expenseType && <Chip tone="blue" className="min-w-0 shrink truncate">{claim.expenseType}</Chip>}
            </div>
            <p className="truncate text-sm text-ink">{claim.justification}</p>
            <p className="text-xs font-semibold text-inkSoft">{claim.employeeName} | Date: {formatClaimDisplayDate(claim)}</p>
            <div className="flex items-center justify-between pt-1">
              <span className="text-base font-black text-ink">₹{formatCurrency(claim.amount)}</span>
              <Chip tone={STATUS_BADGE_TONE[claim.status] || 'neutral'}>{displayStatusLabel(claim.status)}</Chip>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
