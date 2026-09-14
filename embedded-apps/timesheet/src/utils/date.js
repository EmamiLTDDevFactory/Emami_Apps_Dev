// Date helpers. Timesheet periods are calendar months, represented by the
// ISO date of their first day ("YYYY-MM-01"). Individual entries still use
// plain "YYYY-MM-DD" ISO date strings.

export function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() + n)
  return d
}

export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function addMonths(date, n) {
  return new Date(date.getFullYear(), date.getMonth() + n, 1)
}

export function daysInMonth(monthStartIso) {
  const d = parseISODate(monthStartIso)
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

export function monthEndDate(monthStartIso) {
  const d = parseISODate(monthStartIso)
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

// every day in the month, as Date objects
export function monthDays(monthStartIso) {
  const count = daysInMonth(monthStartIso)
  const start = parseISODate(monthStartIso)
  return Array.from({ length: count }, (_, i) => addDays(start, i))
}

export function isWeekend(date) {
  const day = date.getDay()
  return day === 0 || day === 6
}

// Which occurrence of its own weekday this date is within its month (1st,
// 2nd, 3rd Saturday, etc).
export function nthWeekdayOfMonth(date) {
  return Math.ceil(date.getDate() / 7)
}

// Company policy: the 1st, 3rd and 5th Saturday of the month are working
// Saturdays; the 2nd and 4th are off.
export function isWorkingSaturday(date) {
  return date.getDay() === 6 && [1, 3, 5].includes(nthWeekdayOfMonth(date))
}

export function isSunday(date) {
  return date.getDay() === 0
}

export function isOffDay(date) {
  if (isSunday(date)) return true
  if (date.getDay() === 6) return !isWorkingSaturday(date)
  return false
}

export function isWorkingDay(date) {
  return !isOffDay(date)
}

export function countWorkingDays(monthStartIso) {
  return monthDays(monthStartIso).filter((d) => isWorkingDay(d)).length
}

// Working days in the month up to and including `referenceDate` (capped to
// the month's own range) - used to size "hours expected so far" for an
// in-progress month, rather than requiring the whole month up front.
export function countWorkingDaysUpTo(monthStartIso, referenceDate) {
  const start = parseISODate(monthStartIso)
  if (referenceDate < start) return 0
  return monthDays(monthStartIso).filter((d) => isWorkingDay(d) && d <= referenceDate).length
}

// Parses "HH:MM" 24h strings and returns decimal hours between them (0 if
// either is missing or out is not after in).
export function hoursBetween(inTime, outTime) {
  if (!inTime || !outTime) return 0
  const [inH, inM] = inTime.split(':').map(Number)
  const [outH, outM] = outTime.split(':').map(Number)
  const minutes = outH * 60 + outM - (inH * 60 + inM)
  if (!Number.isFinite(minutes) || minutes <= 0) return 0
  return Math.round((minutes / 60) * 100) / 100
}

export function formatShort(date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatDayNum(date) {
  return String(date.getDate())
}

function ordinalSuffix(n) {
  const j = n % 10
  const k = n % 100
  if (j === 1 && k !== 11) return 'st'
  if (j === 2 && k !== 12) return 'nd'
  if (j === 3 && k !== 13) return 'rd'
  return 'th'
}

// e.g. "1st Aug"
export function formatDayOrdinal(date) {
  const day = date.getDate()
  const month = date.toLocaleDateString(undefined, { month: 'short' })
  return `${day}${ordinalSuffix(day)} ${month}`
}

export function formatWeekday(date) {
  return date.toLocaleDateString(undefined, { weekday: 'short' })
}

export function formatMonthLabel(monthStartIso) {
  return parseISODate(monthStartIso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export function formatMonthShort(monthStartIso) {
  return parseISODate(monthStartIso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

export function formatDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function currentMonthStartIso(referenceDate = new Date()) {
  return toISODate(startOfMonth(referenceDate))
}

// list of the last `count` month-start ISO dates ending at (and including) the given month
export function recentMonthStarts(currentMonthIso, count) {
  const start = parseISODate(currentMonthIso)
  return Array.from({ length: count }, (_, i) => toISODate(addMonths(start, -i)))
}
