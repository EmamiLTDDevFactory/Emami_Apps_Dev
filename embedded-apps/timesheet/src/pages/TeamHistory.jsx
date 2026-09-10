import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import StatusBadge from '../components/StatusBadge'
import BackButton from '../components/BackButton'
import { formatDateTime, formatMonthLabel } from '../utils/date'
import { computeTotals, getDisplayStatus } from '../utils/timesheet'

export default function TeamHistory({ navigate }) {
  const { directReports, timesheets } = useApp()
  const { isMinimal } = useTheme()
  const headerBg = isMinimal
    ? 'border-indigo-100 dark:border-indigo-500/20 bg-gradient-to-r from-indigo-50/70 via-indigo-50/40 dark:from-indigo-500/10 dark:via-indigo-500/5 to-transparent'
    : 'border-rose-100 dark:border-rose-500/20 bg-gradient-to-r from-rose-50/70 via-pink-50/40 dark:from-rose-500/10 dark:via-pink-500/5 to-transparent'
  const rowHover = isMinimal ? 'hover:bg-indigo-50/30 dark:hover:bg-indigo-500/10' : 'hover:bg-rose-50/30 dark:hover:bg-rose-500/10'
  const linkColor = isMinimal
    ? 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300'
    : 'text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300'

  const reportIds = new Set(directReports.map((u) => u.id))
  const rows = timesheets
    .filter((t) => reportIds.has(t.userId))
    .sort((a, b) => (a.monthStartDate < b.monthStartDate ? 1 : -1))
    .map((t) => {
      const user = directReports.find((u) => u.id === t.userId)
      const submitEvent = [...t.history].reverse().find((h) => h.status === 'Submitted' || h.status === 'Resubmitted')
      return {
        user,
        timesheet: t,
        status: getDisplayStatus(t),
        submittedDate: submitEvent?.date || null,
        total: computeTotals(t.entries, t.monthStartDate).monthTotal,
      }
    })

  return (
    <div className="space-y-5">
      <BackButton onClick={() => navigate('dashboard')} />
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Team Timesheets History</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Every month your direct reports have logged, with its current status.</p>
      </div>

      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className={`border-b text-left text-slate-600 dark:text-slate-300 ${headerBg}`}>
                <th scope="col" className="px-4 py-3 font-semibold">Team member</th>
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
              {rows.map(({ user, timesheet, status, submittedDate, total }) => (
                <tr key={timesheet.id} className={`border-b border-slate-100 dark:border-slate-800 last:border-0 transition-colors ${rowHover}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800 dark:text-slate-100">{user?.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{user?.email}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{formatMonthLabel(timesheet.monthStartDate)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={status} />
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{submittedDate ? formatDateTime(submittedDate) : '-'}</td>
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200 font-medium">{total.toFixed(2).replace(/\.00$/, '')}h</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => navigate('team-approvals', { reviewUserId: timesheet.userId, reviewMonth: timesheet.monthStartDate })}
                      className={`font-medium focus:outline-none focus-visible:underline ${linkColor}`}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">
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
