'use client';

import { CheckCircle2, XCircle, RotateCcw, History, Printer, Loader2, Clock, Gem } from 'lucide-react';
import type { PoRow } from '../types/po';
import { formatCurrency, formatDateTime, releaseStatusLabel, daysSince, isHighValue } from '../lib/formatters';
import StatusBadge from './StatusBadge';

/** SLA/aging indicator for a pending item — 0-2 days is healthy, 3-6 is worth watching, 7+ is
 * overdue and colored to match. A common pattern in approval-workflow tools (ServiceNow, Jira
 * Service Management, etc.) so an approver's own dashboard tells them what's actually urgent
 * instead of a flat, unordered list. */
function AgingBadge({ erdat }: { erdat: string }) {
  const days = daysSince(erdat);
  if (days === null) return null;
  const label = days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`;
  const tone = days <= 2 ? 'text-green' : days <= 6 ? 'text-amber' : 'text-red';
  return (
    <span className={`flex items-center gap-1 text-[10.5px] font-bold ${tone}`}>
      <Clock size={11} /> {label} pending
    </span>
  );
}

interface PoCardProps {
  row: PoRow;
  variant: 'pending' | 'approved' | 'rejected';
  onOpen: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onUnrelease?: () => void;
  onHistory: () => void;
  onPrint: () => void;
  acting: 'A' | 'R' | 'U' | 'print' | null;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export default function PoCard({
  row, variant, onOpen, onApprove, onReject, onUnrelease, onHistory, onPrint, acting, selected, onToggleSelect,
}: PoCardProps) {
  const released = row.zpoInd === 'R';
  const busy = acting !== null;

  return (
    <div className="card group relative overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-cardHover">
      <div className="flex items-start gap-3 p-4">
        {variant === 'pending' && onToggleSelect && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 h-4 w-4 shrink-0 accent-rust cursor-pointer"
            aria-label={`Select PO ${row.ebeln}`}
          />
        )}
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="text-[11px] font-semibold text-inkSoft">{formatDateTime(row.erdat, row.uzeit)}</p>
          <div className="mt-0.5 flex items-center gap-2">
            <p className="text-lg font-extrabold tracking-tight text-ink">{formatCurrency(row.waers, row.netwr)}</p>
            {isHighValue(row.netwr) && (
              <span className="pill bg-rust/10 text-rust !py-0.5" title={`Above the ₹2,00,000 high-value review threshold`}>
                <Gem size={10} /> High Value
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm font-bold text-rust">
            {row.ebeln} <span className="text-inkSoft font-medium">/ {row.lifnr} / {row.name1}</span>
          </p>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge variant={variant} />
          {variant === 'pending' && (
            <span className={`text-[10.5px] font-semibold whitespace-nowrap ${released ? 'text-red' : 'text-inkSoft'}`}>
              {releaseStatusLabel(row.zpoInd)}
            </span>
          )}
          {variant === 'pending' && <AgingBadge erdat={row.erdat} />}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-appBg/50 px-4 py-2.5">
        <button onClick={onHistory} className="btn-ghost !py-1.5 !px-3 text-xs">
          <History size={13} /> History
        </button>
        <button onClick={onPrint} disabled={acting === 'print'} className="btn-ghost !py-1.5 !px-3 text-xs">
          {acting === 'print' ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
        </button>

        {variant === 'pending' && !released && onApprove && (
          <button onClick={onApprove} disabled={busy} className="btn-success !py-1.5 !px-3 text-xs">
            {acting === 'A' ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            Approve
          </button>
        )}
        {variant === 'pending' && !released && onReject && (
          <button onClick={onReject} disabled={busy} className="btn-danger !py-1.5 !px-3 text-xs">
            {acting === 'R' ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
            Reject
          </button>
        )}
        {variant === 'pending' && released && onUnrelease && (
          <button onClick={onUnrelease} disabled={busy} className="btn-primary !py-1.5 !px-3 text-xs">
            {acting === 'U' ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
            Unrelease
          </button>
        )}
      </div>
    </div>
  );
}
