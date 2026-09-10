import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { formatDayNum, formatDayOrdinal, formatTime, formatWeekday, isOffDay, isWorkingSaturday, hoursBetween, monthDays, parseISODate, toISODate } from '../utils/date'
import { ACCRUAL_LEAVE_TYPES, MAX_HOURS_PER_DAY } from '../utils/timesheet'
import { useToast } from '../context/ToastContext'
import { useApp } from '../context/AppContext'

const LEAVE_TYPES = ['Sick Leave', 'Casual Leave', 'Earned Leave', 'Public Holiday']
const DEFAULT_IN_TIME = '10:00'
const DEFAULT_OUT_TIME = '18:00'

function emptyLine() {
  return { taskId: '', description: '' }
}

function emptyRow() {
  return { inTime: DEFAULT_IN_TIME, outTime: DEFAULT_OUT_TIME, location: '', locationAt: '', lines: [emptyLine()], leaveType: '', leaveNote: '' }
}

// Pre-fills every working day that has no saved entries yet with the default
// in/out time, so a fresh month starts at the standard 10-18 shift instead of
// a blank grid.
function withDefaultTimes(map, days) {
  const next = { ...map }
  days.forEach((dateIso) => {
    if (next[dateIso]) return
    if (isOffDay(parseISODate(dateIso))) return
    next[dateIso] = emptyRow()
  })
  return next
}

// Groups flat entries (possibly several per date) back into one row per date,
// each carrying a line per task worked that day (or a leaveType if the whole
// day was taken as leave / a public holiday).
function entriesToDayMap(entries) {
  const map = {}
  entries.forEach((e) => {
    if (!map[e.date]) map[e.date] = { inTime: e.inTime || '', outTime: e.outTime || '', location: e.location || '', locationAt: e.locationAt || '', lines: [], leaveType: '', leaveNote: '' }
    if (e.leaveType) {
      map[e.date].leaveType = e.leaveType
      map[e.date].leaveNote = e.note || ''
    } else {
      map[e.date].lines.push({ taskId: e.taskId || '', description: e.note || '' })
    }
  })
  Object.values(map).forEach((row) => {
    if (row.lines.length === 0 && !row.leaveType) row.lines.push(emptyLine())
  })
  return map
}

function isLineEmpty(line) {
  return !line.taskId && !line.description
}

// Row background + accent styling for the day-type of a given date.
function dayRowTone(date) {
  if (isWorkingSaturday(date)) {
    return { row: 'bg-blue-50/60 dark:bg-blue-500/10', dayText: 'text-blue-700 dark:text-blue-300', badge: { label: 'Working Sat', cls: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300' } }
  }
  if (isOffDay(date)) {
    return { row: 'bg-slate-200/80 dark:bg-slate-800', dayText: 'text-slate-600 dark:text-slate-300 font-semibold', badge: { label: 'Off', cls: 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200' } }
  }
  return { row: '', dayText: 'text-slate-500 dark:text-slate-400', badge: null }
}

function LeaveSelect({ dateIso, value, onChange }) {
  return (
    <select
      aria-label={`Leave status on ${formatDayNum(parseISODate(dateIso))}`}
      value={value}
      onChange={(e) => onChange(dateIso, e.target.value)}
      className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-1.5 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
    >
      <option value="">Present</option>
      {LEAVE_TYPES.map((lt) => (
        <option key={lt} value={lt}>
          {lt}
        </option>
      ))}
    </select>
  )
}

function LocationField({ dateIso, value, capturedAt, locating, onCapture, compact, disabled }) {
  const title = disabled ? 'Location can only be captured for today' : undefined
  if (value) {
    return (
      <div className="flex flex-col items-center gap-1">
        <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 break-words">📍 {value}</span>
        {capturedAt && <span className="text-[10px] text-slate-400 dark:text-slate-500">at {formatTime(capturedAt)}</span>}
        <button
          type="button"
          onClick={() => onCapture(dateIso)}
          disabled={locating || disabled}
          title={title}
          className="text-[10px] text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 font-medium focus:outline-none focus-visible:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
        >
          {locating ? 'Locating…' : 'Update'}
        </button>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={() => onCapture(dateIso)}
      disabled={locating || disabled}
      title={title}
      className={`inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent ${
        compact ? 'px-2 py-1.5 text-sm w-full justify-center' : 'px-2 py-1 text-[11px]'
      }`}
    >
      📍 {locating ? 'Locating…' : 'Capture'}
    </button>
  )
}

const TimesheetGrid = forwardRef(function TimesheetGrid(
  { userId, tasks, monthStartDate, initialEntries, readOnly, onEntriesChange, onAutosave, autosaveDelay = 700 },
  ref,
) {
  const days = useMemo(() => monthDays(monthStartDate).map((d) => toISODate(d)), [monthStartDate])
  const todayIso = toISODate(new Date())
  const initDayMap = (entries) => {
    const map = entriesToDayMap(entries)
    return readOnly ? map : withDefaultTimes(map, days)
  }
  const [dayMap, setDayMap] = useState(() => initDayMap(initialEntries))
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved
  const [locatingDate, setLocatingDate] = useState(null)
  const saveTimer = useRef(null)
  const savedAtTimer = useRef(null)
  const { showToast } = useToast()
  const { getLeaveBalance } = useApp()
  // The yearly leave pool a manager has set for this person. `serverBalance` only moves once
  // the server has recomputed it (a network round-trip after autosave), so we track an
  // optimistic `balanceAdjustment` that moves the instant a day is marked/unmarked as leave -
  // same tick as "Total leave this month" below, which is purely local state. The adjustment
  // resets to 0 whenever serverBalance itself changes (the round-trip caught up and now agrees
  // with what was already shown) or the viewed month/user changes.
  const serverBalance = getLeaveBalance(userId).balance
  const [balanceAdjustment, setBalanceAdjustment] = useState(0)
  const leaveBalance = serverBalance + balanceAdjustment

  useEffect(() => {
    setBalanceAdjustment(0)
  }, [serverBalance])

  // reset local edit state when the viewed month/timesheet changes
  useEffect(() => {
    setDayMap(initDayMap(initialEntries))
    setSaveState('idle')
    setBalanceAdjustment(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStartDate, userId])

  // Each meaningful task line for a day shares that day's in/out time and
  // splits the day's total hours evenly between the lines actually used. A
  // day marked as leave (including "Public Holiday") produces a single entry
  // instead, crediting a full day's expected hours on working days.
  function buildEntries(map) {
    const entries = []
    for (const date of days) {
      const row = map[date]
      if (!row) continue
      if (row.leaveType) {
        // Leave days contribute 0h to worked-hours totals - they're tracked
        // separately as "Total leave", not folded into hours worked.
        entries.push({
          id: `${userId}_${date}_leave`,
          userId,
          projectId: null,
          taskId: null,
          date,
          inTime: '',
          outTime: '',
          location: '',
          locationAt: '',
          hours: 0,
          note: row.leaveNote || '',
          leaveType: row.leaveType,
        })
        continue
      }
      const totalHours = hoursBetween(row.inTime, row.outTime)
      const lines = row.lines.length ? row.lines : [emptyLine()]
      // Hours count from In/Out time alone - a task isn't required. A day
      // with no time set at all (both blank) still contributes nothing;
      // days the user didn't work should be marked Leave to exclude them.
      const meaningfulLines = lines.filter((l, i) => !isLineEmpty(l) || (i === 0 && (row.inTime || row.outTime)))
      if (meaningfulLines.length === 0) continue
      const perLineHours = Math.round((totalHours / meaningfulLines.length) * 100) / 100
      meaningfulLines.forEach((line, idx) => {
        const task = tasks.find((t) => t.id === line.taskId)
        entries.push({
          id: `${userId}_${date}_${idx}`,
          userId,
          projectId: task?.projectId || null,
          taskId: line.taskId || null,
          date,
          inTime: row.inTime,
          outTime: row.outTime,
          location: row.location || '',
          locationAt: row.locationAt || '',
          hours: perLineHours,
          note: line.description || '',
        })
      })
    }
    return entries
  }

  // Derived straight from buildEntries so the displayed totals can never
  // drift from what actually gets saved (a day with no logged task/
  // description contributes 0h here, matching what autosave persists).
  const totals = useMemo(() => {
    const perDay = Object.fromEntries(days.map((d) => [d, 0]))
    const perTask = Object.fromEntries(tasks.map((t) => [t.id, 0]))
    let month = 0
    let leaveDays = 0
    buildEntries(dayMap).forEach((e) => {
      perDay[e.date] = (perDay[e.date] || 0) + e.hours
      month += e.hours
      if (e.taskId) perTask[e.taskId] = (perTask[e.taskId] || 0) + e.hours
      if (e.leaveType) leaveDays += 1
    })
    return { perDay, perTask, month, leaveDays }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayMap, tasks, days])

  useEffect(() => {
    onEntriesChange?.(buildEntries(dayMap), totals)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayMap, totals])

  useImperativeHandle(ref, () => ({
    // `entries` must already carry dates within the currently displayed month.
    loadEntries(entries) {
      const mapped = entriesToDayMap(entries)
      setDayMap(mapped)
      scheduleAutosave(mapped)
    },
  }))

  function scheduleAutosave(nextMap) {
    if (readOnly || !onAutosave) return
    setSaveState('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      onAutosave(buildEntries(nextMap))
      setSaveState('saved')
      clearTimeout(savedAtTimer.current)
      savedAtTimer.current = setTimeout(() => setSaveState('idle'), 2500)
    }, autosaveDelay)
  }

  function updateDayField(date, patch) {
    setDayMap((prev) => {
      const current = prev[date] || emptyRow()
      const nextRow = { ...current, ...patch }
      const nextMap = { ...prev, [date]: nextRow }
      scheduleAutosave(nextMap)
      return nextMap
    })
  }

  // Resolves coordinates to a human-readable place name (e.g. "Emami Tower")
  // via OpenStreetMap's free reverse-geocoding lookup, falling back to raw
  // coordinates if the lookup fails or times out.
  async function resolvePlaceName(latitude, longitude) {
    const coords = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
      )
      if (!res.ok) return coords
      const data = await res.json()
      const addr = data.address || {}
      const name = data.name || addr.amenity || addr.building || addr.office || addr.shop || addr.road
      if (name) return name
      return data.display_name ? data.display_name.split(',').slice(0, 2).join(',').trim() : coords
    } catch {
      return coords
    }
  }

  function captureLocation(date) {
    if (!navigator.geolocation) {
      showToast('Location is not supported on this device/browser.', 'error')
      return
    }
    setLocatingDate(date)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        const place = await resolvePlaceName(latitude, longitude)
        updateDayField(date, { location: place, locationAt: new Date().toISOString() })
        setLocatingDate(null)
      },
      (error) => {
        setLocatingDate(null)
        showToast(error.message || 'Could not capture location.', 'error')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  // Setting a leave type clears any time/task entries for that day (leave
  // and working hours are mutually exclusive); clearing it (back to
  // "Present") restores the default in/out time for re-entry.
  function setLeaveType(date, value) {
    // Only Sick/Casual/Earned draw from the yearly pool - adjust the optimistic balance
    // display the instant one of those is picked or cleared, same tick as the day's own
    // "Present"/leave-type badge, well before autosave round-trips to confirm it.
    const wasAccrual = ACCRUAL_LEAVE_TYPES.includes(dayMap[date]?.leaveType)
    const willBeAccrual = ACCRUAL_LEAVE_TYPES.includes(value)
    if (wasAccrual !== willBeAccrual) {
      setBalanceAdjustment((adj) => adj + (willBeAccrual ? -1 : 1))
    }
    setDayMap((prev) => {
      const current = prev[date] || emptyRow()
      const nextRow = value
        ? { ...current, leaveType: value, inTime: '', outTime: '', location: '', locationAt: '', lines: [emptyLine()] }
        : { ...current, leaveType: '', leaveNote: '', inTime: DEFAULT_IN_TIME, outTime: DEFAULT_OUT_TIME }
      const nextMap = { ...prev, [date]: nextRow }
      scheduleAutosave(nextMap)
      return nextMap
    })
  }

  function updateLine(date, lineIndex, patch) {
    setDayMap((prev) => {
      const current = prev[date] || emptyRow()
      const lines = current.lines.length ? [...current.lines] : [emptyLine()]
      lines[lineIndex] = { ...lines[lineIndex], ...patch }
      const nextMap = { ...prev, [date]: { ...current, lines } }
      scheduleAutosave(nextMap)
      return nextMap
    })
  }

  function addLine(date) {
    setDayMap((prev) => {
      const current = prev[date] || emptyRow()
      const lines = [...(current.lines.length ? current.lines : [emptyLine()]), emptyLine()]
      const nextMap = { ...prev, [date]: { ...current, lines } }
      scheduleAutosave(nextMap)
      return nextMap
    })
  }

  function removeLine(date, lineIndex) {
    setDayMap((prev) => {
      const current = prev[date] || emptyRow()
      if (current.lines.length <= 1) return prev
      const lines = current.lines.filter((_, i) => i !== lineIndex)
      const nextMap = { ...prev, [date]: { ...current, lines } }
      scheduleAutosave(nextMap)
      return nextMap
    })
  }

  useEffect(
    () => () => {
      clearTimeout(saveTimer.current)
      clearTimeout(savedAtTimer.current)
    },
    [],
  )

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        No tasks are assigned to you yet. Ask your manager to assign some in Manage Team.
      </div>
    )
  }

  function taskLabel(taskId) {
    const task = tasks.find((t) => t.id === taskId)
    return task ? `${task.projectName} · ${task.name}` : '-'
  }

  // Tasks already picked by this day's other lines are hidden from a line's
  // dropdown so the same module can't be logged twice in one day.
  function availableTasks(lines, lineIndex) {
    const usedElsewhere = new Set(lines.filter((_, i) => i !== lineIndex).map((l) => l.taskId).filter(Boolean))
    return tasks.filter((t) => !usedElsewhere.has(t.id))
  }

  return (
    <div>
      {!readOnly && (
        <div className="mb-2 flex justify-end">
          <SaveIndicator state={saveState} />
        </div>
      )}

      {/* Desktop / tablet: one row per day (multiple lines if 2+ tasks that day) */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-violet-100 dark:border-violet-500/20 bg-gradient-to-b from-slate-50 dark:from-slate-800/60 to-white dark:to-slate-900">
              <th scope="col" className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-800 text-left font-semibold text-slate-600 dark:text-slate-300 px-3 py-3 min-w-[92px] whitespace-nowrap">Date</th>
              <th scope="col" className="text-left font-semibold text-slate-600 dark:text-slate-300 px-3 py-3 min-w-[140px]">Day</th>
              <th scope="col" className="text-center font-semibold text-slate-600 dark:text-slate-300 px-2 py-3 min-w-[110px]">In Time</th>
              <th scope="col" className="text-center font-semibold text-slate-600 dark:text-slate-300 px-2 py-3 min-w-[110px]">Out Time</th>
              <th scope="col" className="text-center font-semibold text-slate-600 dark:text-slate-300 px-2 py-3 min-w-[120px]">Location</th>
              <th scope="col" className="text-center font-semibold text-slate-600 dark:text-slate-300 px-2 py-3 min-w-[90px]">Hours of Work</th>
              <th scope="col" className="text-center font-semibold text-slate-600 dark:text-slate-300 px-2 py-3 min-w-[170px]">Task</th>
              <th scope="col" className="text-left font-semibold text-slate-600 dark:text-slate-300 px-2 py-3 min-w-[200px]">Task Description</th>
            </tr>
          </thead>
          <tbody>
            {days.map((dateIso) => {
              const date = parseISODate(dateIso)
              const tone = dayRowTone(date)
              const row = dayMap[dateIso] || emptyRow()
              const onLeave = !!row.leaveType
              const hours = totals.perDay[dateIso]
              const working = !isOffDay(date)
              const zero = !onLeave && working && hours === 0
              const over = hours > MAX_HOURS_PER_DAY
              const rowTint = onLeave ? 'bg-fuchsia-50/60 dark:bg-fuchsia-500/10' : tone.row

              if (onLeave) {
                return (
                  <tr key={dateIso} className={`border-b border-slate-100 dark:border-slate-800 last:border-0 ${rowTint}`}>
                    <th scope="row" className={`sticky left-0 z-10 text-left font-semibold text-slate-800 dark:text-slate-100 px-3 py-2 align-top whitespace-nowrap ${rowTint || 'bg-white dark:bg-slate-900'}`}>
                      {formatDayOrdinal(date)}
                    </th>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-medium ${tone.dayText}`}>{formatWeekday(date)}</span>
                        <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium bg-fuchsia-100 dark:bg-fuchsia-500/20 text-fuchsia-700 dark:text-fuchsia-300">
                          {row.leaveType}
                        </span>
                      </div>
                      {!readOnly && !isOffDay(date) && <LeaveSelect dateIso={dateIso} value={row.leaveType} onChange={setLeaveType} />}
                    </td>
                    <td className="px-2 py-2 align-top text-center text-slate-400 dark:text-slate-500">-</td>
                    <td className="px-2 py-2 align-top text-center text-slate-400 dark:text-slate-500">-</td>
                    <td className="px-2 py-2 align-top text-center text-slate-400 dark:text-slate-500">-</td>
                    <td className="px-2 py-2 align-top text-center">
                      <span className="inline-block rounded-md px-2 py-1 text-xs font-semibold bg-fuchsia-100 dark:bg-fuchsia-500/20 text-fuchsia-700 dark:text-fuchsia-300">
                        0h
                      </span>
                    </td>
                    <td colSpan={2} className="px-2 py-2 align-top">
                      {readOnly ? (
                        <span className={row.leaveNote ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500 italic'}>
                          {row.leaveNote || 'No reason given'}
                        </span>
                      ) : (
                        <input
                          type="text"
                          aria-label={`Leave reason on ${formatDayNum(date)}`}
                          value={row.leaveNote}
                          onChange={(e) => updateDayField(dateIso, { leaveNote: e.target.value })}
                          placeholder="Reason for leave (optional)"
                          className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                        />
                      )}
                    </td>
                  </tr>
                )
              }

              if (!working) {
                return (
                  <tr key={dateIso} className={`border-b border-slate-100 dark:border-slate-800 last:border-0 ${rowTint}`}>
                    <th scope="row" className={`sticky left-0 z-10 text-left font-semibold text-slate-800 dark:text-slate-100 px-3 py-2 align-top whitespace-nowrap ${rowTint || 'bg-white dark:bg-slate-900'}`}>
                      {formatDayOrdinal(date)}
                    </th>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-medium ${tone.dayText}`}>{formatWeekday(date)}</span>
                        {tone.badge && (
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${tone.badge.cls}`}>
                            {tone.badge.label}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 align-top text-center text-slate-400 dark:text-slate-500">-</td>
                    <td className="px-2 py-2 align-top text-center text-slate-400 dark:text-slate-500">-</td>
                    <td className="px-2 py-2 align-top text-center text-slate-400 dark:text-slate-500">-</td>
                    <td className="px-2 py-2 align-top text-center text-slate-400 dark:text-slate-500">-</td>
                    <td colSpan={2} className="px-2 py-2 align-top text-center text-slate-400 dark:text-slate-500 italic">
                      Non-working day
                    </td>
                  </tr>
                )
              }

              const lines = row.lines.length ? row.lines : [emptyLine()]
              const rowSpan = lines.length
              return lines.map((line, lineIndex) => (
                <tr key={`${dateIso}_${lineIndex}`} className={`border-b border-slate-100 dark:border-slate-800 last:border-0 ${rowTint}`}>
                  {lineIndex === 0 && (
                    <>
                      <th
                        scope="row"
                        rowSpan={rowSpan}
                        className={`sticky left-0 z-10 text-left font-semibold text-slate-800 dark:text-slate-100 px-3 py-2 align-top whitespace-nowrap ${rowTint || 'bg-white dark:bg-slate-900'}`}
                      >
                        {formatDayOrdinal(date)}
                      </th>
                      <td rowSpan={rowSpan} className="px-3 py-2 align-top">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-medium ${tone.dayText}`}>{formatWeekday(date)}</span>
                          {tone.badge && (
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${tone.badge.cls}`}>
                              {tone.badge.label}
                            </span>
                          )}
                        </div>
                        {!readOnly && working && zero && <div className="mt-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">No hours</div>}
                        {over && <div className="mt-1 text-[10px] font-medium text-red-600 dark:text-red-400">Exceeds {MAX_HOURS_PER_DAY}h</div>}
                        {!readOnly && working && <LeaveSelect dateIso={dateIso} value={row.leaveType} onChange={setLeaveType} />}
                      </td>
                      <td rowSpan={rowSpan} className="px-2 py-2 align-top text-center">
                        {readOnly ? (
                          <span className="text-slate-700 dark:text-slate-200">{row.inTime || '-'}</span>
                        ) : (
                          <input
                            type="time"
                            aria-label={`In time on ${formatDayNum(date)}`}
                            value={row.inTime}
                            onChange={(e) => updateDayField(dateIso, { inTime: e.target.value })}
                            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-1.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                          />
                        )}
                      </td>
                      <td rowSpan={rowSpan} className="px-2 py-2 align-top text-center">
                        {readOnly ? (
                          <span className="text-slate-700 dark:text-slate-200">{row.outTime || '-'}</span>
                        ) : (
                          <input
                            type="time"
                            aria-label={`Out time on ${formatDayNum(date)}`}
                            value={row.outTime}
                            onChange={(e) => updateDayField(dateIso, { outTime: e.target.value })}
                            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-1.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                          />
                        )}
                      </td>
                      <td rowSpan={rowSpan} className="px-2 py-2 align-top text-center">
                        {readOnly ? (
                          row.location ? (
                            <span className="text-[11px] text-slate-700 dark:text-slate-200 break-words">
                              📍 {row.location}
                              {row.locationAt && <span className="block text-slate-400 dark:text-slate-500">at {formatTime(row.locationAt)}</span>}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 dark:text-slate-500">-</span>
                          )
                        ) : (
                          <LocationField
                            dateIso={dateIso}
                            value={row.location}
                            capturedAt={row.locationAt}
                            locating={locatingDate === dateIso}
                            onCapture={captureLocation}
                            disabled={dateIso !== todayIso}
                          />
                        )}
                      </td>
                      <td rowSpan={rowSpan} className="px-2 py-2 align-top text-center">
                        <span className={`inline-block rounded-md px-2 py-1 text-xs font-semibold ${over ? 'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300' : 'bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300'}`}>
                          {hours ? hours.toFixed(2).replace(/\.00$/, '') : '0'}h
                        </span>
                      </td>
                    </>
                  )}
                  <td className="px-2 py-2 align-top text-center">
                    {readOnly ? (
                      <span className={line.taskId ? 'font-medium text-violet-700 dark:text-violet-300' : 'text-slate-400 dark:text-slate-500'}>{taskLabel(line.taskId)}</span>
                    ) : (
                      <select
                        aria-label={`Task ${lineIndex + 1} on ${formatDayNum(date)}`}
                        value={line.taskId}
                        onChange={(e) => updateLine(dateIso, lineIndex, { taskId: e.target.value })}
                        className={`w-full rounded-md border px-1.5 py-1.5 text-xs text-center font-medium focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 ${
                          line.taskId
                            ? 'border-violet-300 dark:border-violet-500/40 bg-violet-50 dark:bg-violet-500/15 text-violet-800 dark:text-violet-200'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-normal'
                        }`}
                      >
                        <option value="">Select task</option>
                        {availableTasks(lines, lineIndex).map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.projectName} · {t.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-2 py-2 align-top">
                    {readOnly ? (
                      <span className="text-slate-600 dark:text-slate-300">{line.description || '-'}</span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          aria-label={`Task description ${lineIndex + 1} on ${formatDayNum(date)}`}
                          value={line.description}
                          onChange={(e) => updateLine(dateIso, lineIndex, { description: e.target.value })}
                          placeholder="What did you work on?"
                          className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                        />
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLine(dateIso, lineIndex)}
                            aria-label={`Remove task ${lineIndex + 1} on ${formatDayNum(date)}`}
                            className="shrink-0 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 focus:outline-none focus-visible:text-red-600"
                          >
                            ✕
                          </button>
                        )}
                        {lineIndex === lines.length - 1 && (
                          <button
                            type="button"
                            onClick={() => addLine(dateIso)}
                            className="shrink-0 text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 text-xs font-medium whitespace-nowrap focus:outline-none focus-visible:underline"
                          >
                            + Add task
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gradient-to-r from-violet-50/70 dark:from-violet-500/10 to-violet-50/70 dark:to-violet-500/10 border-t-2 border-violet-100 dark:border-violet-500/20">
              <th scope="row" colSpan={5} className="sticky left-0 z-10 bg-violet-50/90 dark:bg-slate-900 text-left font-semibold text-slate-700 dark:text-slate-200 px-3 py-3">
                Total hours this month
              </th>
              <td className="px-2 py-3 text-center font-bold text-violet-700 dark:text-violet-300">
                {totals.month.toFixed(2).replace(/\.00$/, '')}h
              </td>
              <td colSpan={2}></td>
            </tr>
            <tr className="bg-violet-50/70 dark:bg-violet-500/10 border-t border-violet-100 dark:border-violet-500/20">
              <th scope="row" colSpan={5} className="sticky left-0 z-10 bg-violet-50/90 dark:bg-slate-900 text-left font-semibold text-slate-700 dark:text-slate-200 px-3 py-2.5">
                Total leave this month
              </th>
              <td className="px-2 py-2.5 text-center font-bold text-violet-700 dark:text-violet-300">
                {totals.leaveDays} {totals.leaveDays === 1 ? 'day' : 'days'}
              </td>
              <td colSpan={2} className="px-3 py-2.5 text-right whitespace-nowrap">
                <span className="font-semibold text-slate-700 dark:text-slate-200">Leave balance:</span>{' '}
                <span className={`font-bold ${leaveBalance < 0 ? 'text-red-600 dark:text-red-400' : 'text-violet-700 dark:text-violet-300'}`}>
                  {leaveBalance} {Math.abs(leaveBalance) === 1 ? 'day' : 'days'}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile: stacked card-per-day layout */}
      <div className="md:hidden space-y-4">
        {days.map((dateIso) => {
          const date = parseISODate(dateIso)
          const tone = dayRowTone(date)
          const row = dayMap[dateIso] || emptyRow()
          const onLeave = !!row.leaveType
          const lines = row.lines.length ? row.lines : [emptyLine()]
          const hours = totals.perDay[dateIso]
          const working = !isOffDay(date)
          const zero = !onLeave && working && hours === 0
          const over = hours > MAX_HOURS_PER_DAY
          const cardTint = onLeave ? 'bg-fuchsia-50 dark:bg-fuchsia-500/10' : tone.row || 'bg-white dark:bg-slate-900'
          return (
            <div key={dateIso} className={`rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 ${cardTint}`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className={`font-semibold ${tone.dayText || 'text-slate-800 dark:text-slate-100'}`}>
                    {formatWeekday(date)} {formatDayNum(date)}
                  </div>
                  {onLeave ? (
                    <span className="inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-fuchsia-100 dark:bg-fuchsia-500/20 text-fuchsia-700 dark:text-fuchsia-300">
                      {row.leaveType}
                    </span>
                  ) : (
                    tone.badge && (
                      <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${tone.badge.cls}`}>
                        {tone.badge.label}
                      </span>
                    )
                  )}
                </div>
                <div className="text-right">
                  <span className={`inline-block rounded-md px-2 py-1 text-xs font-semibold ${onLeave ? 'bg-fuchsia-100 dark:bg-fuchsia-500/20 text-fuchsia-700 dark:text-fuchsia-300' : over ? 'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300' : 'bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300'}`}>
                    {onLeave ? '0' : hours ? hours.toFixed(2).replace(/\.00$/, '') : '0'}h
                  </span>
                  {!readOnly && working && zero && <div className="mt-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">No hours logged</div>}
                  {over && <div className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400">Exceeds {MAX_HOURS_PER_DAY}h</div>}
                </div>
              </div>

              {!readOnly && working && (
                <label className="block mb-3">
                  <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Leave</span>
                  <LeaveSelect dateIso={dateIso} value={row.leaveType} onChange={setLeaveType} />
                </label>
              )}

              {onLeave ? (
                <label className="block">
                  <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Reason</span>
                  {readOnly ? (
                    <p className={row.leaveNote ? 'text-sm text-slate-600 dark:text-slate-300' : 'text-sm text-slate-400 dark:text-slate-500 italic'}>
                      {row.leaveNote || 'No reason given'}
                    </p>
                  ) : (
                    <input
                      type="text"
                      aria-label={`Leave reason on ${formatDayNum(date)}`}
                      value={row.leaveNote}
                      onChange={(e) => updateDayField(dateIso, { leaveNote: e.target.value })}
                      placeholder="Reason for leave (optional)"
                      className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                    />
                  )}
                </label>
              ) : !working ? (
                <p className="text-sm text-slate-400 dark:text-slate-500 italic">Non-working day</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">In Time</span>
                      {readOnly ? (
                        <span className="block text-sm text-slate-700 dark:text-slate-200">{row.inTime || '-'}</span>
                      ) : (
                        <input
                          type="time"
                          value={row.inTime}
                          onChange={(e) => updateDayField(dateIso, { inTime: e.target.value })}
                          className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      )}
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Out Time</span>
                      {readOnly ? (
                        <span className="block text-sm text-slate-700 dark:text-slate-200">{row.outTime || '-'}</span>
                      ) : (
                        <input
                          type="time"
                          value={row.outTime}
                          onChange={(e) => updateDayField(dateIso, { outTime: e.target.value })}
                          className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      )}
                    </label>
                  </div>

                  <div className="mt-3">
                    <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Location</span>
                    {readOnly ? (
                      row.location ? (
                        <span className="block text-sm text-slate-700 dark:text-slate-200 break-words">
                          📍 {row.location}
                          {row.locationAt && <span className="block text-xs text-slate-400 dark:text-slate-500">at {formatTime(row.locationAt)}</span>}
                        </span>
                      ) : (
                        <span className="block text-sm text-slate-400 dark:text-slate-500">-</span>
                      )
                    ) : (
                      <LocationField
                        dateIso={dateIso}
                        value={row.location}
                        capturedAt={row.locationAt}
                        locating={locatingDate === dateIso}
                        onCapture={captureLocation}
                        disabled={dateIso !== todayIso}
                        compact
                      />
                    )}
                  </div>

                  <div className="mt-3 space-y-3">
                    {lines.map((line, lineIndex) => (
                      <div key={lineIndex} className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Task {lineIndex + 1}</span>
                          {!readOnly && lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLine(dateIso, lineIndex)}
                              aria-label={`Remove task ${lineIndex + 1}`}
                              className="text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 text-xs focus:outline-none focus-visible:text-red-600"
                            >
                              ✕ Remove
                            </button>
                          )}
                        </div>
                        <label className="block">
                          <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Task</span>
                          {readOnly ? (
                            <span className={`block text-sm ${line.taskId ? 'font-medium text-violet-700 dark:text-violet-300' : 'text-slate-400 dark:text-slate-500'}`}>{taskLabel(line.taskId)}</span>
                          ) : (
                            <select
                              value={line.taskId}
                              onChange={(e) => updateLine(dateIso, lineIndex, { taskId: e.target.value })}
                              className={`w-full rounded-md border px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-500 ${
                                line.taskId
                                  ? 'border-violet-300 dark:border-violet-500/40 bg-violet-50 dark:bg-violet-500/15 text-violet-800 dark:text-violet-200'
                                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-normal'
                              }`}
                            >
                              <option value="">Select task</option>
                              {availableTasks(lines, lineIndex).map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.projectName} · {t.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </label>
                        <label className="block">
                          <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Task Description</span>
                          {readOnly ? (
                            <span className="block text-sm text-slate-600 dark:text-slate-300">{line.description || '-'}</span>
                          ) : (
                            <input
                              type="text"
                              value={line.description}
                              onChange={(e) => updateLine(dateIso, lineIndex, { description: e.target.value })}
                              placeholder="What did you work on?"
                              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                            />
                          )}
                        </label>
                      </div>
                    ))}
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => addLine(dateIso)}
                        className="text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 text-sm font-medium focus:outline-none focus-visible:underline"
                      >
                        + Add task
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
        <div className="sticky bottom-0 rounded-xl border border-violet-200 dark:border-violet-500/30 bg-violet-50 dark:bg-slate-900 shadow-sm divide-y divide-violet-100 dark:divide-violet-500/20 overflow-hidden">
          <div className="p-4 flex items-center justify-between">
            <span className="font-semibold text-violet-800 dark:text-violet-300">Month Total</span>
            <span className="font-bold text-violet-800 dark:text-violet-300 text-lg">{totals.month.toFixed(2).replace(/\.00$/, '')}h</span>
          </div>
          <div className="px-4 py-2.5 flex items-center justify-between bg-violet-50 dark:bg-slate-900">
            <span className="font-medium text-violet-800 dark:text-violet-300 text-sm">Total Leave</span>
            <span className="font-bold text-violet-800 dark:text-violet-300">
              {totals.leaveDays} {totals.leaveDays === 1 ? 'day' : 'days'}
            </span>
          </div>
          <div className="px-4 py-2.5 flex items-center justify-between bg-violet-50 dark:bg-slate-900">
            <span className="font-medium text-violet-800 dark:text-violet-300 text-sm">Leave Balance</span>
            <span className={`font-bold ${leaveBalance < 0 ? 'text-red-600 dark:text-red-400' : 'text-violet-800 dark:text-violet-300'}`}>
              {leaveBalance} {Math.abs(leaveBalance) === 1 ? 'day' : 'days'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
})

function SaveIndicator({ state }) {
  if (state === 'saving') {
    return <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">Saving…</span>
  }
  if (state === 'saved') {
    return <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">✓ Saved</span>
  }
  return <span className="text-xs text-transparent select-none">.</span>
}

export default TimesheetGrid
