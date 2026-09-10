import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import TimesheetGrid from '../components/TimesheetGrid'
import StatusBadge from '../components/StatusBadge'
import MonthSelector from '../components/MonthSelector'
import { addMonths, currentMonthStartIso, parseISODate, toISODate } from '../utils/date'
import { expectedHoursToDate, getDisplayStatus, isReadOnly, wasEverRejected } from '../utils/timesheet'
import { exportTimesheetToExcel } from '../utils/exportTimesheet'

export default function MyTimesheet({ monthParam, navigate }) {
  const { currentUser, getTimesheet, getAssignedTasks, projects, saveDraftEntries, submitForApproval } = useApp()
  const { isMinimal } = useTheme()
  const copyFocusRing = isMinimal ? 'focus-visible:ring-indigo-500' : 'focus-visible:ring-violet-500'
  const submitBtn = isMinimal
    ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 shadow-indigo-200 dark:shadow-none hover:from-indigo-500 hover:to-indigo-600 focus-visible:ring-indigo-500'
    : 'bg-gradient-to-r from-violet-600 to-purple-600 shadow-violet-200 dark:shadow-none hover:from-violet-500 hover:to-purple-500 focus-visible:ring-violet-500'
  const { showToast } = useToast()
  const thisMonth = currentMonthStartIso()
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
    const shifted = prevTimesheet.entries.map((e) => {
      const day = parseISODate(e.date).getDate()
      const shiftedDate = parseISODate(viewedMonth)
      shiftedDate.setDate(Math.min(day, new Date(shiftedDate.getFullYear(), shiftedDate.getMonth() + 1, 0).getDate()))
      return { ...e, date: toISODate(shiftedDate) }
    })
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
        <MonthSelector monthStartDate={viewedMonth} onChange={setViewedMonth} maxMonthStartDate={thisMonth} />
      </div>

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

      <div className="flex flex-wrap items-center gap-3">
        {!readOnly && (
          <button
            type="button"
            onClick={handleCopyLastMonth}
            className={`rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none focus-visible:ring-2 ${copyFocusRing}`}
          >
            Copy from last month
          </button>
        )}
        <button
          type="button"
          onClick={handleDownloadExcel}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          ⬇ Download Excel
        </button>
      </div>

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
