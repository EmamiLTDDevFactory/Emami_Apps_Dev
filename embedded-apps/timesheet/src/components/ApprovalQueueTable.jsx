import { useTheme } from '../context/ThemeContext'
import StatusBadge from './StatusBadge'
import { formatDateTime } from '../utils/date'

export default function ApprovalQueueTable({ rows, selectedIds, onToggleSelect, onToggleSelectAll, onOpenRow, onBulkApprove }) {
  const { isMinimal } = useTheme()
  const selectableRows = rows.filter((r) => r.canBulkApprove)
  const allSelected = selectableRows.length > 0 && selectableRows.every((r) => selectedIds.includes(r.key))

  const bannerBg = isMinimal
    ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-100 dark:border-indigo-500/20'
    : 'bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-500/10 dark:to-emerald-500/10 border-teal-100 dark:border-teal-500/20'
  const bannerText = isMinimal ? 'text-indigo-800 dark:text-indigo-300' : 'text-teal-800 dark:text-teal-300'
  const bulkBtn = isMinimal
    ? 'bg-indigo-600 hover:bg-indigo-500 focus-visible:ring-indigo-500'
    : 'bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 focus-visible:ring-teal-500'
  const headerBg = isMinimal
    ? 'border-indigo-100 dark:border-indigo-500/20 bg-indigo-50/70 dark:bg-indigo-500/10'
    : 'border-teal-100 dark:border-teal-500/20 bg-gradient-to-r from-teal-50/70 via-emerald-50/40 dark:from-teal-500/10 dark:via-emerald-500/5 to-transparent'
  const checkboxColor = isMinimal ? 'text-indigo-600 focus:ring-indigo-500' : 'text-teal-600 focus:ring-teal-500'
  const rowHover = isMinimal ? 'hover:bg-indigo-50/30 dark:hover:bg-indigo-500/10' : 'hover:bg-teal-50/30 dark:hover:bg-teal-500/10'
  const linkColor = isMinimal
    ? 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300'
    : 'text-teal-600 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300'

  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      {selectedIds.length > 0 && (
        <div className={`flex items-center justify-between px-4 py-2.5 border-b ${bannerBg}`}>
          <span className={`text-sm font-medium ${bannerText}`}>{selectedIds.length} selected</span>
          <button
            type="button"
            onClick={onBulkApprove}
            className={`rounded-lg text-white text-sm font-medium px-3 py-1.5 shadow-sm hover:shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${bulkBtn}`}
          >
            Approve selected
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className={`border-b text-left text-slate-600 dark:text-slate-300 ${headerBg}`}>
              <th scope="col" className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  aria-label="Select all straightforward submissions"
                  checked={allSelected}
                  disabled={selectableRows.length === 0}
                  onChange={() => onToggleSelectAll(selectableRows.map((r) => r.key))}
                  className={`h-4 w-4 rounded border-slate-300 dark:border-slate-600 ${checkboxColor}`}
                />
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">Team member</th>
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
              <th scope="col" className="px-4 py-3 font-semibold">Submitted</th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">Hours</th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={`border-b border-slate-100 dark:border-slate-800 last:border-0 transition-colors ${rowHover}`}>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.user.name}'s timesheet`}
                    checked={selectedIds.includes(row.key)}
                    disabled={!row.canBulkApprove}
                    onChange={() => onToggleSelect(row.key)}
                    className={`h-4 w-4 rounded border-slate-300 dark:border-slate-600 disabled:opacity-30 ${checkboxColor}`}
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800 dark:text-slate-100">{row.user.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{row.user.email}</div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.displayStatus} />
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.submittedDate ? formatDateTime(row.submittedDate) : '-'}</td>
                <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200 font-medium">{row.monthTotal.toFixed(2).replace(/\.00$/, '')}h</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onOpenRow(row)}
                    className={`font-medium focus:outline-none focus-visible:underline ${linkColor}`}
                  >
                    Review
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">
                  No direct reports to show.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
