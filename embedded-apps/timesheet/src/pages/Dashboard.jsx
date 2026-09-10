import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import StatusBadge from '../components/StatusBadge'
import LeaveDetailsModal from '../components/LeaveDetailsModal'
import { addMonths, currentMonthStartIso, formatMonthLabel, formatMonthShort, parseISODate, recentMonthStarts, toISODate } from '../utils/date'
import { computeTotals, expectedMonthlyHours, getDisplayStatus, isActionable, isOverdue } from '../utils/timesheet'

// Icon paths follow the Heroicons outline set (stroke, no fill) to match the
// floating circular-badge card design.
const ICON_PATHS = {
  approvals: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  history: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  users: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  chart: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
}

const MANAGER_CARDS = [
  {
    key: 'team-approvals',
    label: 'Team Approvals',
    description: "Review and approve your team's submitted timesheets.",
    icon: ICON_PATHS.approvals,
    solid: 'bg-pink-500',
  },
  {
    key: 'team-history',
    label: 'Team Timesheets History',
    description: "Browse your team's timesheets from past months.",
    icon: ICON_PATHS.history,
    solid: 'bg-green-500',
  },
  {
    key: 'manage-team',
    label: 'Manage Team',
    description: 'Manage projects, tasks and task assignments.',
    icon: ICON_PATHS.users,
    solid: 'bg-blue-500',
  },
  {
    key: 'team-reports',
    label: 'Team Reports',
    description: "See hours and trends across your team.",
    icon: ICON_PATHS.chart,
    solid: 'bg-yellow-500',
  },
]


export default function Dashboard({ navigate }) {
  const { currentUser, getTimesheet, teamSettings, directReports, getLeaveBalance, timesheets } = useApp()
  const [showLeaveDetails, setShowLeaveDetails] = useState(false)
  const { isMinimal } = useTheme()
  const primaryFrom = isMinimal ? 'from-indigo-500' : 'from-blue-500'
  const primaryTo = isMinimal ? 'to-indigo-600' : 'to-sky-500'
  const primaryShadow = isMinimal ? 'shadow-indigo-200' : 'shadow-blue-200'
  const secondaryFrom = isMinimal ? 'from-indigo-500' : 'from-emerald-500'
  const secondaryTo = isMinimal ? 'to-indigo-600' : 'to-teal-500'
  const secondaryShadow = isMinimal ? 'shadow-indigo-200' : 'shadow-emerald-200'
  const btnFrom = isMinimal ? 'from-indigo-600' : 'from-blue-600'
  const btnTo = isMinimal ? 'to-indigo-700' : 'to-sky-600'
  const btnHoverFrom = isMinimal ? 'hover:from-indigo-500' : 'hover:from-blue-500'
  const btnHoverTo = isMinimal ? 'hover:to-indigo-600' : 'hover:to-sky-500'
  const ringColor = isMinimal ? 'focus-visible:ring-indigo-500' : 'focus-visible:ring-blue-500'
  const sectionHeaderBg = isMinimal
    ? 'border-indigo-100/70 dark:border-indigo-500/20 bg-gradient-to-r from-indigo-50/70 via-indigo-50/40 dark:from-indigo-500/10 dark:via-indigo-500/5 to-transparent'
    : 'border-blue-100/70 dark:border-blue-500/20 bg-gradient-to-r from-blue-50/70 via-sky-50/50 dark:from-blue-500/10 dark:via-sky-500/5 to-transparent'
  const rowHover = isMinimal
    ? 'hover:bg-indigo-50/40 dark:hover:bg-indigo-500/10 focus-visible:bg-indigo-50/40 dark:focus-visible:bg-indigo-500/10'
    : 'hover:bg-blue-50/40 dark:hover:bg-blue-500/10 focus-visible:bg-blue-50/40 dark:focus-visible:bg-blue-500/10'
  const thisMonth = currentMonthStartIso()
  const isManager = currentUser.role === 'manager'
  const lastCompletedMonth = toISODate(addMonths(parseISODate(thisMonth), -1))
  const pendingApprovals = isManager
    ? directReports.filter((u) => isActionable(getTimesheet(u.id, lastCompletedMonth) || {})).length
    : 0

  // Team pulse: each direct report's standing for the last fully-completed month, used for
  // both the stat tiles and the roster list below the section cards.
  const teamPulse = useMemo(() => {
    if (!isManager) return []
    return directReports
      .map((user) => {
        const ts = getTimesheet(user.id, lastCompletedMonth)
        const overdueTs = isOverdue(ts || { status: 'Draft', monthStartDate: lastCompletedMonth }, teamSettings)
        const status = overdueTs ? 'Overdue' : getDisplayStatus(ts || { status: 'Draft' })
        const hours = ts ? computeTotals(ts.entries, lastCompletedMonth).monthTotal : 0
        return { user, status, hours }
      })
      .sort((a, b) => a.user.name.localeCompare(b.user.name))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager, directReports, lastCompletedMonth])

  const teamStats = useMemo(
    () => ({
      size: teamPulse.length,
      approved: teamPulse.filter((r) => r.status === 'Approved' || r.status === 'Locked').length,
      pending: teamPulse.filter((r) => r.status === 'Submitted' || r.status === 'Resubmitted').length,
      overdue: teamPulse.filter((r) => r.status === 'Overdue').length,
      totalHours: teamPulse.reduce((sum, r) => sum + r.hours, 0),
    }),
    [teamPulse],
  )

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
  const myLeaveBalance = getLeaveBalance(currentUser.id)

  // Every leave-tagged entry across this user's timesheets, newest first - the breakdown
  // behind the balance card's allocated/used/balance numbers.
  const myLeaveEntries = useMemo(
    () =>
      timesheets
        .filter((t) => t.userId === currentUser.id)
        .flatMap((t) =>
          t.entries.filter((e) => e.leaveType && e.leaveType !== 'Public Holiday').map((e) => ({ ...e, monthStartDate: t.monthStartDate })),
        )
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [timesheets, currentUser.id],
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Welcome back, {currentUser.name.split(' ')[0]} 👋</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Here's where things stand this month.</p>
      </div>

      {isManager && (
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {MANAGER_CARDS.map((card) => (
            <button
              key={card.key}
              type="button"
              onClick={() => navigate(card.key)}
              className="group relative bg-white dark:bg-slate-900 py-6 px-6 rounded-3xl shadow-xl text-left hover:shadow-2xl transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <div className={`text-white flex items-center justify-center absolute rounded-full h-14 w-14 shadow-xl left-4 -top-6 ${card.solid}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={card.icon} />
                </svg>
              </div>
              <div className="mt-8">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xl font-semibold text-slate-900 dark:text-slate-50">{card.label}</p>
                  {card.key === 'team-approvals' && pendingApprovals > 0 && (
                    <span className="inline-flex items-center justify-center whitespace-nowrap shrink-0 rounded-full bg-pink-100 dark:bg-pink-500/20 text-pink-700 dark:text-pink-300 text-xs font-semibold px-2.5 py-0.5">
                      {pendingApprovals} pendings
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-gray-400 dark:text-slate-500">{card.description}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {isManager && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <div className={`px-6 py-4 border-b ${sectionHeaderBg}`}>
              <h2 className="font-semibold text-slate-800 dark:text-slate-100">Team pulse</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{formatMonthLabel(lastCompletedMonth)}</p>
            </div>
            <div className="grid grid-cols-2 gap-px bg-slate-100 dark:bg-slate-800">
              {[
                { label: 'Team size', value: teamStats.size, dot: 'bg-blue-500' },
                { label: 'Approved', value: teamStats.approved, dot: 'bg-green-500' },
                { label: 'Pending review', value: teamStats.pending, dot: 'bg-pink-500' },
                { label: 'Overdue', value: teamStats.overdue, dot: 'bg-yellow-500' },
              ].map((stat) => (
                <div key={stat.label} className="bg-white dark:bg-slate-900 p-5">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${stat.dot}`} aria-hidden="true" />
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{stat.label}</span>
                  </div>
                  <p className="mt-1.5 text-2xl font-bold text-slate-900 dark:text-slate-50">{stat.value}</p>
                </div>
              ))}
            </div>
            <div className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total hours logged</span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{teamStats.totalHours.toFixed(2).replace(/\.00$/, '')}h</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <div className={`px-6 py-4 border-b ${sectionHeaderBg}`}>
              <h2 className="font-semibold text-slate-800 dark:text-slate-100">Team status</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Who's done, who's waiting on review</p>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
              {teamPulse.map(({ user, status, hours }) => {
                const reviewable = status === 'Submitted' || status === 'Resubmitted'
                return (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() =>
                        reviewable && navigate('team-approvals', { reviewUserId: user.id, reviewMonth: lastCompletedMonth })
                      }
                      disabled={!reviewable}
                      className={`w-full flex items-center gap-3 px-6 py-3 text-left transition-colors focus:outline-none disabled:cursor-default ${
                        reviewable ? rowHover : ''
                      }`}
                    >
                      <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-slate-400 to-slate-500 dark:from-slate-600 dark:to-slate-700 flex items-center justify-center text-xs font-semibold text-white">
                        {user.name[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{user.name}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">{hours.toFixed(2).replace(/\.00$/, '')}h logged</p>
                      </div>
                      <StatusBadge status={status} />
                    </button>
                  </li>
                )
              })}
              {teamPulse.length === 0 && (
                <li className="px-6 py-6 text-center text-sm text-slate-400 dark:text-slate-500">No direct reports yet.</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {!isManager && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br ${primaryFrom} ${primaryTo} flex items-center justify-center text-white text-lg shadow-sm ${primaryShadow}`}>
                🗓️
              </div>
              <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Current month status</h2>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <StatusBadge status={displayStatus} className="text-sm px-3 py-1.5" />
              <span className="text-sm text-slate-500 dark:text-slate-400">{formatMonthLabel(thisMonth)}</span>
            </div>
            {displayStatus === 'Rejected' && currentTimesheet?.managerComment && (
              <p className="mt-3 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-lg px-3 py-2">
                Manager feedback: {currentTimesheet.managerComment}
              </p>
            )}
            <button
              type="button"
              onClick={() => navigate('my-timesheet')}
              className={`mt-4 inline-flex items-center rounded-lg bg-gradient-to-r ${btnFrom} ${btnTo} px-4 py-2 text-sm font-semibold text-white shadow-sm ${primaryShadow} hover:shadow-md ${btnHoverFrom} ${btnHoverTo} transition-all focus:outline-none focus-visible:ring-2 ${ringColor} focus-visible:ring-offset-2`}
            >
              Open this month's timesheet
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br ${secondaryFrom} ${secondaryTo} flex items-center justify-center text-white text-lg shadow-sm ${secondaryShadow}`}>
                ⏱️
              </div>
              <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Hours logged this month</h2>
            </div>
            <div className="mt-4 flex items-end gap-2">
              <span className="text-3xl font-bold text-slate-900 dark:text-slate-50">{totals.monthTotal.toFixed(2).replace(/\.00$/, '')}</span>
              <span className="text-slate-400 dark:text-slate-500 mb-1">/ {expected}h expected</span>
            </div>
            <div className="mt-3 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full rounded-full bg-gradient-to-r ${secondaryFrom} ${secondaryTo} transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{pct}% of expected monthly hours logged</p>
          </div>

          <button
            type="button"
            onClick={() => setShowLeaveDetails(true)}
            className="text-left rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm hover:shadow-md transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white text-lg shadow-sm shadow-amber-200 dark:shadow-none">
                🌴
              </div>
              <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Leave balance</h2>
            </div>
            <div className="mt-4 flex items-end gap-2">
              <span className={`text-3xl font-bold ${myLeaveBalance.balance < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-50'}`}>
                {myLeaveBalance.balance}
              </span>
              <span className="text-slate-400 dark:text-slate-500 mb-1">/ {myLeaveBalance.allocated} days a year</span>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {myLeaveBalance.used} taken so far - set by your manager
            </p>
          </button>
        </div>
      )}

      {showLeaveDetails && (
        <LeaveDetailsModal balance={myLeaveBalance} entries={myLeaveEntries} onClose={() => setShowLeaveDetails(false)} />
      )}

      {!isManager && (
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          <div className={`px-6 py-4 border-b ${sectionHeaderBg}`}>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Recent months</h2>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {pastMonths.map(({ month, timesheet, status, leaveCount }) => (
              <li key={month}>
                <button
                  type="button"
                  onClick={() => navigate('my-timesheet', { month })}
                  className={`w-full flex items-center justify-between px-6 py-3.5 text-left transition-colors focus:outline-none ${rowHover}`}
                >
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{formatMonthShort(month)}</span>
                  <span className="flex items-center gap-3">
                    {leaveCount > 0 && (
                      <span className="inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 text-xs font-medium px-2 py-0.5">
                        {leaveCount} leave{leaveCount === 1 ? '' : 's'}
                      </span>
                    )}
                    {timesheet && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">
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
