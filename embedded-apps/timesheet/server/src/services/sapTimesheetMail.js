import { pool } from '../db/pool.js'

// Tells SAP (ZIT_TIMESHEET_SRV on the shared NGD gateway) that a manager approved or rejected a
// timesheet. SAP's CREATE_DEEP_ENTITY then e-mails the employee (TO = MailId, CC = whatever is
// maintained for the vendor in ZIT_TSHEET_MAIL) with the month attached as an Excel sheet.
//
// Deliberately fire-and-forget and fully isolated from the approve/reject routes: it runs after
// the route has already responded, never throws, and only logs on failure - an SAP or gateway
// outage must never block or undo an approval. Off unless SAP_TIMESHEET_MAIL_ENABLED=true, and
// skipped for any employee with no vendor_id maintained in timesheet.users.
//
// Payload shape (property names/formats confirmed against the live service):
//   { Lifnr, MailId, Flag: 'A' | 'R', NAV_EMPTOMAIL: [one row per calendar day of the month] }

const SAP_TIMESHEET_URL =
  process.env.SAP_TIMESHEET_URL ||
  'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NGD/ZIT_TIMESHEET_SRV/EmpSet'
const REQUEST_TIMEOUT_MS = Number(process.env.SAP_TIMESHEET_TIMEOUT_MS || 30000)

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function isEnabled() {
  return process.env.SAP_TIMESHEET_MAIL_ENABLED === 'true'
}

// Same off-day rule as src/utils/date.js isOffDay (the server can't import from src/): Sundays,
// plus the 2nd/4th Saturday unless the manager flipped that date to working.
function isOffDay(date, iso, overrides) {
  if (date.getDay() === 0) return true
  if (date.getDay() !== 6) return false
  if (overrides.has(iso)) return false
  return ![1, 3, 5].includes(Math.ceil(date.getDate() / 7))
}

// "HH:MM" or "HH:MM:SS" -> OData V2 Edm.Time "PT09H00M00S"; blank -> midnight (SAP's initial time).
function toEdmTime(value) {
  const [h = '00', m = '00', s = '00'] = (value || '').split(':')
  return `PT${h.padStart(2, '0')}H${m.padStart(2, '0')}M${s.slice(0, 2).padStart(2, '0')}S`
}

// One row per calendar day, mirroring src/utils/exportTimesheet.js so the Excel SAP mails out
// reads the same as the one the app downloads.
function buildDayRows(monthStartDate, entries, taskNames, overrides) {
  const [y, m] = monthStartDate.split('-').map(Number)
  const dayCount = new Date(y, m, 0).getDate()
  const byDate = {}
  entries.forEach((e) => {
    ;(byDate[e.entry_date] ||= []).push(e)
  })

  return Array.from({ length: dayCount }, (_, i) => {
    const date = new Date(y, m - 1, i + 1)
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
    const dayEntries = byDate[iso] || []
    const leaveEntry = dayEntries.find((e) => e.leave_type)
    const row = {
      WorkDate: `${iso}T00:00:00`,
      WorkDay: WEEKDAYS[date.getDay()],
      InTime: toEdmTime(''),
      InLocation: '',
      OutTime: toEdmTime(''),
      OutLocation: '',
      WorkHours: '0.00',
      Task: '',
      TaskDesc: '',
      Status: '',
    }

    if (leaveEntry) return { ...row, Status: leaveEntry.leave_type }
    const offDay = isOffDay(date, iso, overrides)
    if (offDay || dayEntries.length === 0) return { ...row, Status: offDay ? 'Off' : '' }

    const totalHours = dayEntries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0)
    return {
      ...row,
      InTime: toEdmTime(dayEntries[0].in_time),
      InLocation: dayEntries.find((e) => e.in_location)?.in_location || '',
      OutTime: toEdmTime(dayEntries[0].out_time),
      OutLocation: dayEntries.find((e) => e.out_location)?.out_location || '',
      WorkHours: totalHours.toFixed(2),
      Task: dayEntries.map((e) => taskNames[e.task_id]).filter(Boolean).join('; '),
      TaskDesc: dayEntries.map((e) => e.note).filter(Boolean).join('; '),
      Status: 'Present',
    }
  })
}

async function buildPayload(timesheetId, flag) {
  const { rows: tsRows } = await pool.query(
    `SELECT ts.month_start_date, u.email, u.vendor_id, u.manager_id
     FROM timesheets ts JOIN users u ON u.id = ts.user_id
     WHERE ts.id = $1`,
    [timesheetId],
  )
  const ts = tsRows[0]
  if (!ts) return { skip: 'timesheet not found' }
  if (!ts.vendor_id) return { skip: 'no vendor_id maintained for this employee' }
  if (!ts.email) return { skip: 'employee has no e-mail' }

  const [{ rows: entries }, { rows: tasks }, { rows: overrideRows }] = await Promise.all([
    pool.query('SELECT * FROM timesheet_entries WHERE timesheet_id = $1 ORDER BY entry_date', [timesheetId]),
    pool.query('SELECT t.id, t.name, p.name AS project_name FROM tasks t JOIN projects p ON p.id = t.project_id'),
    ts.manager_id
      ? pool.query('SELECT override_date FROM working_day_overrides WHERE manager_id = $1', [ts.manager_id])
      : Promise.resolve({ rows: [] }),
  ])
  const taskNames = Object.fromEntries(tasks.map((t) => [t.id, `${t.project_name} - ${t.name}`]))
  const overrides = new Set(overrideRows.map((r) => r.override_date))

  return {
    payload: {
      Lifnr: ts.vendor_id,
      MailId: ts.email,
      Flag: flag,
      NAV_EMPTOMAIL: buildDayRows(ts.month_start_date, entries, taskNames, overrides),
    },
  }
}

async function send(timesheetId, flag) {
  const { payload, skip } = await buildPayload(timesheetId, flag)
  if (skip) {
    console.log(`[sap-timesheet-mail] ${timesheetId}: skipped (${skip})`)
    return
  }
  const res = await fetch(SAP_TIMESHEET_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 500)}`)
  }
  console.log(`[sap-timesheet-mail] ${timesheetId}: sent (Flag ${flag}, vendor ${payload.Lifnr})`)
}

// decision: 'Approved' | 'Rejected'. Returns immediately; never throws.
export function notifySapTimesheetDecision(timesheetId, decision) {
  if (!isEnabled()) return
  const flag = decision === 'Rejected' ? 'R' : 'A'
  send(timesheetId, flag).catch((err) => {
    console.error(`[sap-timesheet-mail] ${timesheetId}: failed (Flag ${flag}) - ${err.message}`)
  })
}
