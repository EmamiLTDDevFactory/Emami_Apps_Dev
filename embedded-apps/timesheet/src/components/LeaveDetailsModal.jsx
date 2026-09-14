import { useEffect } from 'react'
import { ACCRUAL_LEAVE_TYPES } from '../utils/timesheet'
import { formatMonthLabel, parseISODate } from '../utils/date'

function formatEntryDate(iso) {
  return parseISODate(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

// entries: leave-tagged timesheet entries for the viewed user, newest first - see
// Dashboard's myLeaveEntries (own view) or ManageTeam's leaveEntriesByUser (manager view).
// balance: the same { allocated, used, balance } shown on the card/row that opened this.
export default function LeaveDetailsModal({
  title = 'Leave balance details',
  subtitle = "Set by your manager - resets when they adjust it",
  balance,
  entries,
  onClose,
}) {
  useEffect(() => {
    const onKeyDown = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Close leave details"
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Leave details"
        className="relative w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-px bg-slate-100 dark:bg-slate-800 shrink-0">
          {[
            { label: 'Allocated', value: balance.allocated },
            { label: 'Used', value: balance.used },
            { label: 'Balance', value: balance.balance, negative: balance.balance < 0 },
          ].map((stat) => (
            <div key={stat.label} className="bg-white dark:bg-slate-900 p-4 text-center">
              <p className={`text-xl font-bold ${stat.negative ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-50'}`}>
                {stat.value}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="overflow-y-auto flex-1">
          {entries.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-slate-400 dark:text-slate-500">No leave taken yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {entries.map((entry) => {
                const accrual = ACCRUAL_LEAVE_TYPES.includes(entry.leaveType)
                return (
                  <li key={entry.id} className="px-6 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{formatEntryDate(entry.date)}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{formatMonthLabel(entry.monthStartDate)}</p>
                      {entry.note && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 italic">{entry.note}</p>}
                    </div>
                    <span
                      className={`inline-flex items-center shrink-0 rounded-full text-xs font-medium px-2.5 py-1 ${
                        accrual
                          ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {entry.leaveType}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
