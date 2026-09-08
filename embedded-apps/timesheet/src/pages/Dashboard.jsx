import { useMemo } from 'react'
import { useApp } from '../context/AppContext'
import StatusBadge from '../components/StatusBadge'
import { addMonths, currentMonthStartIso, formatMonthLabel, formatMonthShort, parseISODate, recentMonthStarts, toISODate } from '../utils/date'
import { computeTotals, expectedMonthlyHours, getDisplayStatus, isActionable, isOverdue } from '../utils/timesheet'

const MANAGER_CARDS = [
  {
    key: 'team-approvals',
    label: 'Team Approvals',
    description: "Review and approve your team's submitted timesheets.",
    icon: '✅',
    gradient: 'from-emerald-500 to-teal-500',
  },
  {
    key: 'team-history',
    label: 'Team Timesheets History',
    description: "Browse your team's timesheets from past months.",
    icon: '📜',
    gradient: 'from-amber-500 to-orange-500',
  },
  {
    key: 'manage-team',
    label: 'Manage Team',
    description: 'Manage projects, tasks and task assignments.',
    icon: '👥',
    gradient: 'from-fuchsia-500 to-pink-500',
  },
  {
    key: 'team-reports',
    label: 'Team Reports',
    description: "See hours and trends across your team.",
    icon: '📊',
    gradient: 'from-sky-500 to-indigo-500',
  },
]

export default function Dashboard({ navigate }) {
  const { currentUser, getTimesheet, teamSettings, directReports } = useApp()
  const thisMonth = currentMonthStartIso()
  const isManager = currentUser.role === 'manager'
  const lastCompletedMonth = toISODate(addMonths(parseISODate(thisMonth), -1))
  const pendingApprovals = isManager
    ? directReports.filter((u) => isActionable(getTimesheet(u.id, lastCompletedMonth) || {})).length
    : 0

  const currentTimesheet = getTimesheet(currentUser.id, thisMonth)
  const totals = useMemo(
    () => computeTotals(currentTimesheet?.entries || [], thisMonth),
    [currentTimesheet, thisMonth],
  )
  const overdue = isOverdue(currentTimesheet || { status: 'Draft', monthStartDate: thisMonth }, teamSettings)
  const displayStatus = overdue ? 'Overdue' : getDisplayStatus(currentTimesheet || { status: 'Draft' })
  const expected = expectedMonthlyHours(thisMonth)

  const pastMonths = recentMonthStarts(thisMonth, 5)
    .slice(1)
    .map((month) => {
      const ts = getTimesheet(currentUser.id, month)
      const leaveCount = ts ? ts.entries.filter((e) => e.leaveType).length : 0
      return { month, timesheet: ts, status: ts ? getDisplayStatus(ts) : 'Draft', leaveCount }
    })

  const pct = Math.min(100, Math.round((totals.monthTotal / expected) * 100))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Welcome back, {currentUser.name.split(' ')[0]} 👋</h1>
        <p className="text-sm text-slate-500 mt-1">Here's where things stand this month.</p>
      </div>

      {isManager && (
        <div className="grid gap-5 sm:grid-cols-2">
          {MANAGER_CARDS.map((card) => (
            <button
              key={card.key}
              type="button"
              onClick={() => navigate(card.key)}
              className="group rounded-2xl border border-slate-200/80 bg-white p-6 text-left shadow-sm hover:shadow-md transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center text-white text-lg shadow-sm`}>
                  {card.icon}
                </div>
                <h2 className="text-sm font-semibold text-slate-700 group-hover:text-indigo-700">{card.label}</h2>
                {card.key === 'team-approvals' && pendingApprovals > 0 && (
                  <span className="ml-auto inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-0.5">
                    {pendingApprovals} pending
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm text-slate-500">{card.description}</p>
            </button>
          ))}
        </div>
      )}

      {!isManager && (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-lg shadow-sm shadow-indigo-200">
                🗓️
              </div>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Current month status</h2>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <StatusBadge status={displayStatus} className="text-sm px-3 py-1.5" />
              <span className="text-sm text-slate-500">{formatMonthLabel(thisMonth)}</span>
            </div>
            {displayStatus === 'Rejected' && currentTimesheet?.managerComment && (
              <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                Manager feedback: {currentTimesheet.managerComment}
              </p>
            )}
            <button
              type="button"
              onClick={() => navigate('my-timesheet')}
              className="mt-4 inline-flex items-center rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-200 hover:shadow-md hover:from-indigo-500 hover:to-violet-500 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              Open this month's timesheet
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white text-lg shadow-sm shadow-emerald-200">
                ⏱️
              </div>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Hours logged this month</h2>
            </div>
            <div className="mt-4 flex items-end gap-2">
              <span className="text-3xl font-bold text-slate-900">{totals.monthTotal.toFixed(2).replace(/\.00$/, '')}</span>
              <span className="text-slate-400 mb-1">/ {expected}h expected</span>
            </div>
            <div className="mt-3 h-2.5 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-500">{pct}% of expected monthly hours logged</p>
          </div>
        </div>
      )}

      {!isManager && (
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-indigo-100/70 bg-gradient-to-r from-indigo-50/70 via-violet-50/50 to-transparent">
            <h2 className="font-semibold text-slate-800">Recent months</h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {pastMonths.map(({ month, timesheet, status, leaveCount }) => (
              <li key={month}>
                <button
                  type="button"
                  onClick={() => navigate('my-timesheet', { month })}
                  className="w-full flex items-center justify-between px-6 py-3.5 text-left hover:bg-indigo-50/40 transition-colors focus:outline-none focus-visible:bg-indigo-50/40"
                >
                  <span className="text-sm font-medium text-slate-700">{formatMonthShort(month)}</span>
                  <span className="flex items-center gap-3">
                    {leaveCount > 0 && (
                      <span className="inline-flex items-center rounded-full bg-violet-100 text-violet-700 text-xs font-medium px-2 py-0.5">
                        {leaveCount} leave{leaveCount === 1 ? '' : 's'}
                      </span>
                    )}
                    {timesheet && (
                      <span className="text-xs text-slate-400">
                        {computeTotals(timesheet.entries, month).monthTotal.toFixed(2).replace(/\.00$/, '')}h
                      </span>
                    )}
                    <StatusBadge status={status} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
