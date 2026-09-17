import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import TimesheetGrid from '../components/TimesheetGrid'
import StatusBadge from '../components/StatusBadge'
import MonthSelector from '../components/MonthSelector'
import { addMonths, currentMonthStartIso, isOffDay, parseISODate, toISODate } from '../utils/date'
import { expectedHoursToDate, getDisplayStatus, isReadOnly, wasEverRejected } from '../utils/timesheet'
import { exportTimesheetToExcel } from '../utils/exportTimesheet'

// A small ticking "kiosk clock" + today's punch status, purely presentational - the actual
// Clock In/Out buttons live in TimesheetGrid's today row, which is what actually writes this
// data. Reads straight off liveEntries so it never drifts from what's about to be saved.
function TodayStatusCard({ entry }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const timeLabel = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  let statusText = 'Not clocked in yet'
  let statusDot = 'bg-slate-400'
  if (entry?.inTime && !entry.outTime) {
    const [h, m] = entry.inTime.split(':').map(Number)
    const clockedInAt = new Date(now)
    clockedInAt.setHours(h, m, 0, 0)
    const elapsedMin = Math.max(0, Math.round((now.getTime() - clockedInAt.getTime()) / 60000))
    const eh = Math.floor(elapsedMin / 60)
    const em = elapsedMin % 60
    statusText = `Clocked in at ${entry.inTime}${entry.inLocation ? ` · 📍 ${entry.inLocation}` : ''} — ${eh}h ${em}m so far`
    statusDot = 'bg-emerald-500'
  } else if (entry?.inTime && entry.outTime) {
    statusText = `Completed ${entry.inTime}–${entry.outTime}${entry.outLocation ? ` · 📍 ${entry.outLocation}` : ''}`
    statusDot = 'bg-violet-500'
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-800/60 px-5 py-4 shadow-sm">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{dateLabel}</p>
        <p className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
          <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} />
          {statusText}
        </p>
      </div>
      <div className="font-mono text-2xl font-semibold tabular-nums text-slate-800 dark:text-slate-100">{timeLabel}</div>
    </div>
  )
}

export default function MyTimesheet({ monthParam, navigate }) {
  const { currentUser, getTimesheet, getAssignedTasks, projects, saveDraftEntries, submitForApproval } = useApp()
  const { isMinimal } = useTheme()
  const copyFocusRing = isMinimal ? 'focus-visible:ring-indigo-500' : 'focus-visible:ring-violet-500'
  const submitBtn = isMinimal
    ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 shadow-indigo-200 dark:shadow-none hover:from-indigo-500 hover:to-indigo-600 focus-visible:ring-indigo-500'
    : 'bg-gradient-to-r from-violet-600 to-purple-600 shadow-violet-200 dark:shadow-none hover:from-violet-500 hover:to-purple-500 focus-visible:ring-violet-500'
  const { showToast } = useToast()
  const thisMonth = currentMonthStartIso()
  const todayIso = toISODate(new Date())
  const [viewedMonth, setViewedMonth] = useState(monthParam || thisMonth)
  const [liveEntries, setLiveEntries] = useState([])
  const [liveTotal, setLiveTotal] = useState(0)
  const gridRef = useRef(null)

  useEffect(() => {
    setViewedMonth(monthParam || thisMonth)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthParam])

  const timesheet = getTimesheet(currentUser.id, viewedMonth)
  const displayStatus = getDisplayStatus(timesheet || { status: 'Draft' })
  const readOnly = timesheet ? isReadOnly(timesheet) : false

  const tasks = useMemo(() => {
    return getAssignedTasks(currentUser.id).map((t) => ({
      ...t,
      projectName: projects.find((p) => p.id === t.projectId)?.name || 'Unknown project',
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, projects])

  function handleAutosave(entries) {
    saveDraftEntries(currentUser.id, viewedMonth, entries)
  }

  function handleCopyLastMonth() {
    const prevMonth = toISODate(addMonths(parseISODate(viewedMonth), -1))
    const prevTimesheet = getTimesheet(currentUser.id, prevMonth)
    if (!prevTimesheet || prevTimesheet.entries.length === 0) {
      showToast('No entries found on last month to copy.', 'info')
      return
    }
    // Shifting by day-of-month number (not weekday) means a working day last month can land on
    // a Saturday/Sunday this month. Off-day rows in TimesheetGrid always show "-" and ignore
    // whatever's in dayMap for that date, but the hours total has no such check - so an entry
    // silently landing on an off day would still count towards the total while being invisible
    // anywhere in the grid. Drop those instead of carrying them over.
    const shifted = prevTimesheet.entries
      .map((e) => {
        const day = parseISODate(e.date).getDate()
        const shiftedDate = parseISODate(viewedMonth)
        shiftedDate.setDate(Math.min(day, new Date(shiftedDate.getFullYear(), shiftedDate.getMonth() + 1, 0).getDate()))
        return { ...e, date: toISODate(shiftedDate), shiftedDate }
      })
      .filter((e) => !isOffDay(e.shiftedDate))
      .map(({ shiftedDate, ...e }) => e)
    if (shifted.length === 0) {
      showToast('Last month’s entries all fall on non-working days this month.', 'info')
      return
    }
    gridRef.current?.loadEntries(shifted)
    showToast('Copied last month’s entries into this month.', 'info')
  }

  function handleSubmit() {
    submitForApproval(currentUser.id, viewedMonth, liveEntries)
    showToast('Timesheet submitted for approval.', 'success')
  }

  async function handleDownloadExcel() {
    const entries = readOnly ? timesheet?.entries || [] : liveEntries
    try {
      await exportTimesheetToExcel({ entries, tasks, monthStartDate: viewedMonth, userName: currentUser.name })
      showToast('Timesheet downloaded.', 'success')
    } catch (err) {
      showToast(err.message || 'Failed to download timesheet.', 'error')
    }
  }

  const leaveDaysToDate = liveEntries.filter((e) => e.leaveType && parseISODate(e.date) <= new Date()).length
  const expected = expectedHoursToDate(viewedMonth, new Date(), leaveDaysToDate)
  const incomplete = liveTotal < expected
  const showSubmit = !readOnly
  const rejected = timesheet?.status === 'Rejected'
  const todayEntry = liveEntries.find((e) => e.date === todayIso && !e.leaveType)
  const showTodayCard = !readOnly && viewedMonth === thisMonth

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">My Timesheet</h1>
          <div className="mt-1.5 flex items-center gap-2">
            <StatusBadge status={displayStatus} />
            {timesheet && wasEverRejected(timesheet) && timesheet.status !== 'Rejected' && (
              <span className="text-xs text-slate-400 dark:text-slate-500">previously revised after feedback</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!readOnly && (
            <button
              type="button"
              onClick={handleCopyLastMonth}
              className={`inline-flex h-11 w-56 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-white shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                isMinimal ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-violet-600 hover:bg-violet-500'
              } ${copyFocusRing}`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="12" height="12" rx="2" />
                <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
              </svg>
              Copy from last month
            </button>
          )}
          <button
            type="button"
            onClick={handleDownloadExcel}
            className="group relative inline-flex h-11 w-56 items-center justify-center gap-2.5 overflow-hidden rounded-full border border-green-800/50 bg-gradient-to-b from-green-400 via-green-500 to-green-700 pl-2 pr-5 shadow-lg shadow-green-900/40 transition-transform hover:scale-[1.03] hover:from-green-300 hover:via-green-500 hover:to-green-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2"
          >
            {/* Glossy top-half highlight, like a glass pill button. */}
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-full bg-gradient-to-b from-white/50 to-transparent" />
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white/70 bg-green-600/40 shadow-inner">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-white drop-shadow" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 4v10" />
                <path d="M7 10l5 5 5-5" />
                <path d="M5 19h14" />
              </svg>
            </span>
            <span className="relative flex flex-col leading-tight text-left">
              <span className="text-[13px] font-extrabold uppercase tracking-wide text-white drop-shadow-sm">Excel</span>
              <span className="-mt-0.5 text-[10px] font-bold uppercase tracking-widest text-white/90 drop-shadow-sm">Download</span>
            </span>
          </button>
          <MonthSelector monthStartDate={viewedMonth} onChange={setViewedMonth} maxMonthStartDate={thisMonth} />
        </div>
      </div>

      {showTodayCard && <TodayStatusCard entry={todayEntry} />}

      {rejected && timesheet?.managerComment && (
        <div className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-4">
          <p className="text-sm font-semibold text-red-800 dark:text-red-300">Changes requested by your manager</p>
          <p className="mt-1 text-sm text-red-700 dark:text-red-300/90">{timesheet.managerComment}</p>
        </div>
      )}

      {!rejected && timesheet?.managerComment && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Manager comment</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{timesheet.managerComment}</p>
        </div>
      )}

      <TimesheetGrid
        ref={gridRef}
        userId={currentUser.id}
        tasks={tasks}
        monthStartDate={viewedMonth}
        initialEntries={timesheet?.entries || []}
        readOnly={readOnly}
        onEntriesChange={(entries, totals) => {
          setLiveEntries(entries)
          setLiveTotal(totals.month)
        }}
        onAutosave={handleAutosave}
      />

      {showSubmit && (
        <div className="flex flex-col items-start gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={incomplete}
            className={`rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${submitBtn}`}
          >
            {rejected ? 'Resubmit for Approval' : 'Submit for Approval'}
          </button>
          {incomplete && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              You've logged {liveTotal.toFixed(2).replace(/\.00$/, '')}h of {expected}h expected so far this month. Log the rest before submitting.
            </p>
          )}
        </div>
      )}

      {readOnly && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          This timesheet is {displayStatus.toLowerCase()} and can no longer be edited.
        </p>
      )}
    </div>
  )
}
