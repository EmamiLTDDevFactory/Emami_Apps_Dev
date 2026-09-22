import { addDays, countWorkingDays, countWorkingDaysUpTo, monthDays, monthEndDate, toISODate } from './date.js'

export const STATUS = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  RESUBMITTED: 'Resubmitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  LOCKED: 'Locked',
}

export const MAX_HOURS_PER_DAY = 12
export const HOURS_PER_WEEKDAY = 8
export const PAYROLL_CUTOFF_DAYS = 10 // days after month end an Approved timesheet becomes Locked

// Leave types that draw from the yearly leave balance pool. Mirrors
// server/src/routes/leaveBalances.js's own copy (the server can't import from src/). Unpaid
// Leave and Public Holiday are excluded on purpose - neither is capped.
export const ACCRUAL_LEAVE_TYPES = ['Sick Leave', 'Casual Leave', 'Earned Leave']

// Hub-palette status colors (no dark: variants — this app ships one consistent hub-matched
// look, see the removed ThemeContext/midnight-minimal picker).
export const STATUS_STYLES = {
  [STATUS.DRAFT]: { badge: 'bg-white text-inkSoft ring-border', dot: 'bg-inkSoft' },
  [STATUS.SUBMITTED]: { badge: 'bg-amberBg text-amber ring-amber/30', dot: 'bg-amber' },
  [STATUS.RESUBMITTED]: { badge: 'bg-amberBg text-amber ring-amber/30', dot: 'bg-amber' },
  [STATUS.APPROVED]: { badge: 'bg-greenBg text-green ring-green/30', dot: 'bg-green' },
  [STATUS.REJECTED]: { badge: 'bg-redBg text-red ring-red/30', dot: 'bg-red' },
  [STATUS.LOCKED]: { badge: 'bg-glassRust text-inkSoft ring-border', dot: 'bg-inkSoft' },
  Overdue: { badge: 'bg-redBg text-red ring-red/30', dot: 'bg-red' },
}

// Expected hours for a month = 8h for every working day in it (Mon-Fri, plus
// working Saturdays - the 1st/3rd/5th of the month, plus any the manager has
// individually flipped to working - see date.js's `overrides` param).
export function expectedMonthlyHours(monthStartIso, overrides) {
  return countWorkingDays(monthStartIso, overrides) * HOURS_PER_WEEKDAY
}

// Whether an Approved timesheet is past the mock payroll cutoff and should be
// treated as read-only/Locked for everyone, including managers.
export function isPastPayrollCutoff(timesheet, referenceDate = new Date()) {
  if (timesheet.status !== STATUS.APPROVED) return false
  const cutoff = addDays(monthEndDate(timesheet.monthStartDate), PAYROLL_CUTOFF_DAYS)
  return referenceDate.getTime() > cutoff.getTime()
}

export function getDisplayStatus(timesheet, referenceDate = new Date()) {
  if (isPastPayrollCutoff(timesheet, referenceDate)) return STATUS.LOCKED
  return timesheet.status
}

export function isReadOnly(timesheet, referenceDate = new Date()) {
  const status = getDisplayStatus(timesheet, referenceDate)
  return status !== STATUS.DRAFT && status !== STATUS.REJECTED
}

export function isActionable(timesheet) {
  return timesheet.status === STATUS.SUBMITTED || timesheet.status === STATUS.RESUBMITTED
}

export function wasEverRejected(timesheet) {
  return timesheet.history?.some((h) => h.status === STATUS.REJECTED)
}

// Sum hours per day (keyed by ISO date) and overall total for a set of entries.
export function computeTotals(entries, monthStartIso) {
  const days = monthDays(monthStartIso).map((d) => toISODate(d))
  const perDay = Object.fromEntries(days.map((d) => [d, 0]))
  let monthTotal = 0
  for (const entry of entries) {
    const hours = Number(entry.hours) || 0
    if (perDay[entry.date] !== undefined) perDay[entry.date] += hours
    monthTotal += hours
  }
  return { perDay, monthTotal, days }
}

export function computeRowTotal(entries, taskId) {
  return entries.filter((e) => e.taskId === taskId).reduce((sum, e) => sum + (Number(e.hours) || 0), 0)
}

// Hours expected so far: the full month once it has fully elapsed, or just
// the working days up to today for the in-progress month - so submitting
// doesn't require hours for days that haven't happened yet. Since leave days
// contribute 0h to worked-hours totals, each leave day taken on or before
// `referenceDate` also lowers what's expected, so taking leave doesn't
// create an artificial shortfall.
export function expectedHoursToDate(monthStartIso, referenceDate = new Date(), leaveDaysToDate = 0, overrides) {
  const base = countWorkingDaysUpTo(monthStartIso, referenceDate, overrides) * HOURS_PER_WEEKDAY
  return Math.max(0, base - leaveDaysToDate * HOURS_PER_WEEKDAY)
}

export function isMonthIncomplete(entries, monthStartIso, referenceDate = new Date()) {
  const { monthTotal } = computeTotals(entries, monthStartIso)
  const leaveDaysToDate = entries.filter((e) => e.leaveType && new Date(e.date) <= referenceDate).length
  return monthTotal < expectedHoursToDate(monthStartIso, referenceDate, leaveDaysToDate)
}

// A team's monthly timesheets are due `deadlineDaysAfterMonthEnd` days after
// the month ends. Only an untouched Draft (never submitted) can be Overdue -
// a Rejected timesheet was already submitted and bounced back, so it keeps
// showing its Rejected status instead of being masked as Overdue.
export function isOverdue(timesheet, teamSettings, referenceDate = new Date()) {
  if (!timesheet) return false
  if (timesheet.status !== STATUS.DRAFT) return false
  const deadline = addDays(monthEndDate(timesheet.monthStartDate), teamSettings.deadlineDaysAfterMonthEnd)
  deadline.setHours(23, 59, 59, 999)
  return referenceDate.getTime() > deadline.getTime()
}
