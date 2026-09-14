import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import StatusBadge from '../components/StatusBadge'
import TimesheetGrid from '../components/TimesheetGrid'
import ApprovalQueueTable from '../components/ApprovalQueueTable'
import BackButton from '../components/BackButton'
import MonthSelector from '../components/MonthSelector'
import { addMonths, currentMonthStartIso, formatMonthLabel, parseISODate, toISODate } from '../utils/date'
import { computeTotals, expectedMonthlyHours, getDisplayStatus, isOverdue, MAX_HOURS_PER_DAY } from '../utils/timesheet'
import { exportTimesheetToExcel } from '../utils/exportTimesheet'

export default function TeamApprovals({ navigate, reviewUserId, reviewMonth }) {
  if (reviewUserId) {
    return <ApprovalDetail userId={reviewUserId} month={reviewMonth} navigate={navigate} />
  }
  return <ApprovalList navigate={navigate} />
}

function ApprovalList({ navigate }) {
  const { directReports, getTimesheet, teamSettings, bulkApprove } = useApp()
  const thisMonth = currentMonthStartIso()
  const lastCompletedMonth = toISODate(addMonths(parseISODate(thisMonth), -1))
  const [month, setMonth] = useState(lastCompletedMonth)
  const { showToast } = useToast()
  const [selected, setSelected] = useState([])

  const expected = expectedMonthlyHours(month)

  const rows = directReports.map((user) => {
    const timesheet = getTimesheet(user.id, month)
    const overdue = isOverdue(timesheet || { status: 'Draft', monthStartDate: month }, teamSettings)
    const displayStatus = overdue ? 'Overdue' : getDisplayStatus(timesheet || { status: 'Draft' })
    const { monthTotal, perDay } = computeTotals(timesheet?.entries || [], month)
    const actionable = timesheet && (timesheet.status === 'Submitted' || timesheet.status === 'Resubmitted')
    const straightforward = actionable && monthTotal >= expected && Object.values(perDay).every((h) => h <= MAX_HOURS_PER_DAY)
    const submitEvent = timesheet ? [...timesheet.history].reverse().find((h) => h.status === 'Submitted' || h.status === 'Resubmitted') : null
    return {
      key: user.id,
      user,
      timesheet,
      displayStatus,
      submittedDate: submitEvent?.date || null,
      monthTotal,
      canBulkApprove: !!straightforward,
    }
  })

  function toggleSelect(key) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  function toggleSelectAll(keys) {
    setSelected((prev) => (keys.every((k) => prev.includes(k)) ? prev.filter((k) => !keys.includes(k)) : Array.from(new Set([...prev, ...keys]))))
  }

  function handleBulkApprove() {
    const ids = rows.filter((r) => selected.includes(r.key) && r.timesheet).map((r) => r.timesheet.id)
    bulkApprove(ids)
    showToast(`Approved ${ids.length} timesheet${ids.length === 1 ? '' : 's'}.`, 'success')
    setSelected([])
  }

  return (
    <div className="space-y-5">
      <BackButton onClick={() => navigate('dashboard')} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Team Approvals</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{formatMonthLabel(month)} - direct report submissions</p>
        </div>
        <MonthSelector monthStartDate={month} onChange={setMonth} maxMonthStartDate={thisMonth} />
      </div>
      <ApprovalQueueTable
        rows={rows}
        selectedIds={selected}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onOpenRow={(row) => navigate('team-approvals', { reviewUserId: row.user.id, reviewMonth: month })}
        onBulkApprove={handleBulkApprove}
      />
    </div>
  )
}

function ApprovalDetail({ userId, month, navigate }) {
  const { getUserById, getTimesheet, getAssignedTasks, projects, approveTimesheet, rejectTimesheet } = useApp()
  const { isMinimal } = useTheme()
  const linkColor = isMinimal
    ? 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300'
    : 'text-teal-600 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300'
  const textareaFocus = isMinimal
    ? 'focus:ring-indigo-500 focus:border-indigo-500'
    : 'focus:ring-teal-500 focus:border-teal-500'
  const { showToast } = useToast()
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')

  const user = getUserById(userId)
  const timesheet = getTimesheet(userId, month)
  const displayStatus = getDisplayStatus(timesheet || { status: 'Draft' })
  const actionable = timesheet && (timesheet.status === 'Submitted' || timesheet.status === 'Resubmitted')

  const tasks = useMemo(
    () =>
      getAssignedTasks(userId).map((t) => ({
        ...t,
        projectName: projects.find((p) => p.id === t.projectId)?.name || 'Unknown project',
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, projects],
  )

  function handleApprove() {
    approveTimesheet(timesheet.id, comment)
    showToast(`Approved ${user.name}'s timesheet.`, 'success')
    navigate('team-approvals')
  }

  function handleReject(actionLabel) {
    if (!comment.trim()) {
      setError('A comment is required to reject or request changes.')
      return
    }
    rejectTimesheet(timesheet.id, comment, actionLabel)
    showToast(`${actionLabel === 'Rejected' ? 'Rejected' : 'Requested changes to'} ${user.name}'s timesheet.`, 'success')
    navigate('team-approvals')
  }

  async function handleDownloadExcel() {
    try {
      await exportTimesheetToExcel({ entries: timesheet.entries, tasks, monthStartDate: month, userName: user.name })
      showToast('Timesheet downloaded.', 'success')
    } catch (err) {
      showToast(err.message || 'Failed to download timesheet.', 'error')
    }
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => navigate('team-approvals')}
        className={`text-sm font-medium focus:outline-none focus-visible:underline ${linkColor}`}
      >
        ‹ Back to Team Approvals
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">{user.name}'s Timesheet</h1>
          <div className="mt-1.5 flex items-center gap-2">
            <StatusBadge status={displayStatus} />
            <span className="text-sm text-slate-500 dark:text-slate-400">{formatMonthLabel(month)}</span>
          </div>
        </div>
        {timesheet && (
          <button
            type="button"
            onClick={handleDownloadExcel}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            ⬇ Download Excel
          </button>
        )}
      </div>

      {!timesheet && (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          {user.name} hasn't started this month's timesheet yet.
        </div>
      )}

      {timesheet && (
        <>
          <TimesheetGrid
            userId={userId}
            tasks={tasks}
            monthStartDate={month}
            initialEntries={timesheet.entries}
            readOnly
          />

          {actionable && (
            <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-3">
              <label htmlFor="manager-comment" className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Comment {' '}
                <span className="font-normal text-slate-400 dark:text-slate-500">(required to reject or request changes)</span>
              </label>
              <textarea
                id="manager-comment"
                value={comment}
                onChange={(e) => {
                  setComment(e.target.value)
                  if (error) setError('')
                }}
                rows={3}
                className={`w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 ${textareaFocus}`}
                placeholder="Add a note for this review…"
              />
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleApprove}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => handleReject('Changes Requested')}
                  className="rounded-lg border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
                >
                  Request Changes
                </button>
                <button
                  type="button"
                  onClick={() => handleReject('Rejected')}
                  className="rounded-lg border border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                >
                  Reject
                </button>
              </div>
            </div>
          )}

          {!actionable && timesheet.managerComment && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Manager comment</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{timesheet.managerComment}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
