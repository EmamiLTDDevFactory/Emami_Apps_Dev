import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import StatusBadge from '../components/StatusBadge'
import BackButton from '../components/BackButton'
import MonthSelector from '../components/MonthSelector'
import { currentMonthStartIso, formatMonthLabel } from '../utils/date'
import { isOverdue } from '../utils/timesheet'

function BarList({ items, colorClass }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-slate-700 dark:text-slate-200">{item.label}</span>
            <span className="text-slate-500 dark:text-slate-400 font-medium">{item.value.toFixed(2).replace(/\.00$/, '')}h</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
      {items.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500">No data for this month.</p>}
    </ul>
  )
}

export default function TeamReports({ navigate }) {
  const { directReports, projects, getTimesheet, teamSettings } = useApp()
  const { isMinimal } = useTheme()
  const projectBarColor = isMinimal ? 'bg-indigo-500' : 'bg-cyan-500'
  const memberBarColor = isMinimal ? 'bg-indigo-400' : 'bg-sky-500'
  const thisMonth = currentMonthStartIso()
  const [month, setMonth] = useState(thisMonth)

  const monthTimesheets = directReports.map((user) => ({ user, timesheet: getTimesheet(user.id, month) })).filter((r) => r.timesheet)

  const hoursByProject = useMemo(() => {
    const totals = {}
    monthTimesheets.forEach(({ timesheet }) => {
      timesheet.entries.forEach((e) => {
        totals[e.projectId] = (totals[e.projectId] || 0) + Number(e.hours)
      })
    })
    return projects
      .map((p) => ({ label: p.name, value: totals[p.id] || 0 }))
      .filter((p) => p.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [monthTimesheets, projects])

  const hoursByMember = useMemo(() => {
    return directReports
      .map((user) => {
        const ts = getTimesheet(user.id, month)
        const total = ts ? ts.entries.reduce((sum, e) => sum + Number(e.hours), 0) : 0
        return { label: user.name, value: total }
      })
      .sort((a, b) => b.value - a.value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directReports, month])

  const overdue = directReports
    .map((user) => {
      const ts = getTimesheet(user.id, thisMonth)
      return { user, ts, overdue: isOverdue(ts || { status: 'Draft', monthStartDate: thisMonth }, teamSettings) }
    })
    .filter((r) => r.overdue)

  return (
    <div className="space-y-6">
      <BackButton onClick={() => navigate('dashboard')} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Team Reports</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Aggregated hours for your direct reports.</p>
        </div>
        <MonthSelector monthStartDate={month} onChange={setMonth} maxMonthStartDate={thisMonth} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-4">Hours by project - {formatMonthLabel(month)}</h2>
          <BarList items={hoursByProject} colorClass={projectBarColor} />
        </section>
        <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-4">Hours by team member - {formatMonthLabel(month)}</h2>
          <BarList items={hoursByMember} colorClass={memberBarColor} />
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">Overdue this month</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{formatMonthLabel(thisMonth)}</p>
        </div>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {overdue.map(({ user }) => (
            <li key={user.id} className="flex items-center justify-between px-6 py-3.5">
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{user.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
              </div>
              <StatusBadge status="Overdue" />
            </li>
          ))}
          {overdue.length === 0 && <li className="px-6 py-6 text-center text-sm text-slate-400 dark:text-slate-500">Everyone is on track. 🎉</li>}
        </ul>
      </section>
    </div>
  )
}
