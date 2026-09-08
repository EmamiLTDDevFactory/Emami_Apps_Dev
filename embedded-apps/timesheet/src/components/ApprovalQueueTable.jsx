import StatusBadge from './StatusBadge'
import { formatDateTime } from '../utils/date'

export default function ApprovalQueueTable({ rows, selectedIds, onToggleSelect, onToggleSelectAll, onOpenRow, onBulkApprove }) {
  const selectableRows = rows.filter((r) => r.canBulkApprove)
  const allSelected = selectableRows.length > 0 && selectableRows.every((r) => selectedIds.includes(r.key))

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between bg-gradient-to-r from-indigo-50 to-violet-50 px-4 py-2.5 border-b border-indigo-100">
          <span className="text-sm text-indigo-800 font-medium">{selectedIds.length} selected</span>
          <button
            type="button"
            onClick={onBulkApprove}
            className="rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-medium px-3 py-1.5 shadow-sm hover:shadow-md hover:from-indigo-500 hover:to-violet-500 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
          >
            Approve selected
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-violet-50/40 to-transparent text-left text-slate-600">
              <th scope="col" className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  aria-label="Select all straightforward submissions"
                  checked={allSelected}
                  disabled={selectableRows.length === 0}
                  onChange={() => onToggleSelectAll(selectableRows.map((r) => r.key))}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
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
              <tr key={row.key} className="border-b border-slate-100 last:border-0 hover:bg-indigo-50/30 transition-colors">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.user.name}'s timesheet`}
                    checked={selectedIds.includes(row.key)}
                    disabled={!row.canBulkApprove}
                    onChange={() => onToggleSelect(row.key)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-30"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{row.user.name}</div>
                  <div className="text-xs text-slate-500">{row.user.email}</div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.displayStatus} />
                </td>
                <td className="px-4 py-3 text-slate-600">{row.submittedDate ? formatDateTime(row.submittedDate) : '-'}</td>
                <td className="px-4 py-3 text-right text-slate-700 font-medium">{row.monthTotal.toFixed(2).replace(/\.00$/, '')}h</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onOpenRow(row)}
                    className="text-indigo-600 hover:text-indigo-800 font-medium focus:outline-none focus-visible:underline"
                  >
                    Review
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
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
