import { useApp } from '../context/AppContext'
import StatusBadge from '../components/StatusBadge'
import { formatDateTime, formatMonthLabel } from '../utils/date'
import { computeTotals, getDisplayStatus } from '../utils/timesheet'

export default function TimesheetHistory({ navigate }) {
  const { currentUser, timesheets } = useApp()

  const rows = timesheets
    .filter((t) => t.userId === currentUser.id)
    .sort((a, b) => (a.monthStartDate < b.monthStartDate ? 1 : -1))
    .map((t) => {
      const submitEvent = [...t.history].reverse().find((h) => h.status === 'Submitted' || h.status === 'Resubmitted')
      return {
        timesheet: t,
        status: getDisplayStatus(t),
        submittedDate: submitEvent?.date || null,
        total: computeTotals(t.entries, t.monthStartDate).monthTotal,
      }
    })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">My Timesheets History</h1>
        <p className="text-sm text-slate-500 mt-1">Every month you've logged, with its current status.</p>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-violet-50/40 to-transparent text-left text-slate-600">
                <th scope="col" className="px-4 py-3 font-semibold">Month</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3 font-semibold">Submitted</th>
                <th scope="col" className="px-4 py-3 font-semibold text-right">Hours</th>
                <th scope="col" className="px-4 py-3 font-semibold text-right">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ timesheet, status, submittedDate, total }) => (
                <tr key={timesheet.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700">{formatMonthLabel(timesheet.monthStartDate)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={status} />
                  </td>
                  <td className="px-4 py-3 text-slate-500">{submittedDate ? formatDateTime(submittedDate) : '-'}</td>
                  <td className="px-4 py-3 text-right text-slate-700 font-medium">{total.toFixed(2).replace(/\.00$/, '')}h</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => navigate('my-timesheet', { month: timesheet.monthStartDate })}
                      className="text-indigo-600 hover:text-indigo-800 font-medium focus:outline-none focus-visible:underline"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    No timesheets yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
