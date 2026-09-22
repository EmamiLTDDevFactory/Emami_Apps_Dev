'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { ACCRUAL_LEAVE_TYPES } from '../utils/timesheet';
import { formatMonthLabel, parseISODate } from '../utils/date';

function formatEntryDate(iso: string) {
  return parseISODate(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// entries: leave-tagged timesheet entries for the viewed user, newest first - see Dashboard's
// myLeaveEntries (own view) or ManageTeam's leaveEntriesByUser (manager view). balance: the same
// { allocated, used, balance } shown on the card/row that opened this.
export default function LeaveDetailsModal({
  title = 'Leave balance details',
  subtitle = "Set by your manager - resets when they adjust it",
  balance,
  entries,
  onClose,
}: {
  title?: string;
  subtitle?: string;
  balance: { allocated: number; used: number; balance: number };
  entries: any[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button type="button" aria-label="Close leave details" onClick={onClose} className="fixed inset-0 bg-plumDeep/50 backdrop-blur-sm" />
      <div role="dialog" aria-modal="true" aria-label="Leave details" className="glass-panel relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b border-glassBorder px-6 py-4">
          <div>
            <h2 className="font-semibold text-ink">{title}</h2>
            <p className="mt-0.5 text-xs text-inkSoft">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-inkSoft hover:bg-white/60 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rust"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid shrink-0 grid-cols-3 gap-px bg-border">
          {[
            { label: 'Allocated', value: balance.allocated },
            { label: 'Used', value: balance.used },
            { label: 'Balance', value: balance.balance, negative: balance.balance < 0 },
          ].map((stat) => (
            <div key={stat.label} className="bg-white p-4 text-center">
              <p className={`text-xl font-bold ${stat.negative ? 'text-red' : 'text-ink'}`}>{stat.value}</p>
              <p className="mt-0.5 text-xs text-inkSoft">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {entries.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-inkSoft">No leave taken yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {entries.map((entry) => {
                const accrual = ACCRUAL_LEAVE_TYPES.includes(entry.leaveType);
                return (
                  <li key={entry.id} className="flex items-center justify-between gap-3 px-6 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{formatEntryDate(entry.date)}</p>
                      <p className="text-xs text-inkSoft">{formatMonthLabel(entry.monthStartDate)}</p>
                      {entry.note && <p className="mt-0.5 text-xs italic text-inkSoft">{entry.note}</p>}
                    </div>
                    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ${accrual ? 'bg-glassRust text-rust' : 'bg-appBg text-inkSoft'}`}>
                      {entry.leaveType}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
