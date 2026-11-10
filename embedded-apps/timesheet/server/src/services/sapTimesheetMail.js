import { pool } from '../db/pool.js'

// Tells SAP (ZIT_TIMESHEET_SRV on the NWP gateway) that a manager approved or rejected a
// timesheet. SAP's CREATE_DEEP_ENTITY then e-mails the employee (TO = MailId, CC = whatever is
// maintained for the vendor in ZIT_TSHEET_MAIL) with the month attached as an Excel sheet.
//
// Deliberately fire-and-forget and fully isolated from the approve/reject routes: it runs after
// the route has already responded, never throws, and only logs on failure - an SAP or gateway
// outage must never block or undo an approval. Off unless SAP_TIMESHEET_MAIL_ENABLED=true, and
// skipped for any employee with no vendor_id maintained in timesheet.users.
//
// Payload shape (property names/formats confirmed against the live service):
//   { Lifnr, MailId, Flag: 'A' | 'R', Comment, ManagerMail, NAV_EMPTOMAIL: [one row per calendar day of the month] }
// Comment carries the manager's rejection reason (blank on approval) for SAP's mail body.
// ManagerMail is whoever actually clicked approve/reject just now (from their own session, see
// routes/timesheets.js) - not a stored "this employee's manager" lookup, so it's still correct if
// someone other than the employee's usual manager acted on it.

const SAP_TIMESHEET_URL =
  process.env.SAP_TIMESHEET_URL ||
  'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NWP/ZIT_TIMESHEET_SRV/EmpSet'
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
    // SAP rejects the whole call when several tasks are joined into Task/TaskDesc, so send only
    // the day's first task (and its own description).
    const firstTask = dayEntries.find((e) => e.task_id) || dayEntries[0]
    return {
      ...row,
      InTime: toEdmTime(dayEntries[0].in_time),
      InLocation: dayEntries.find((e) => e.in_location)?.in_location || '',
      OutTime: toEdmTime(dayEntries[0].out_time),
      OutLocation: dayEntries.find((e) => e.out_location)?.out_location || '',
      WorkHours: totalHours.toFixed(2),
      Task: taskNames[firstTask.task_id] || '',
      TaskDesc: firstTask.note || '',
      Status: 'Present',
    }
  })
}

async function buildPayload(timesheetId, flag, managerEmail) {
  const { rows: tsRows } = await pool.query(
    `SELECT ts.month_start_date, ts.manager_comment, u.email, u.vendor_id, u.manager_id
     FROM timesheets ts JOIN users u ON u.id = ts.user_id
     WHERE ts.id = $1`,
    [timesheetId],
  )
  const ts = tsRows[0]
  if (!ts) return { skip: 'timesheet not found' }
  if (!ts.vendor_id) return { skip: 'no vendor_id maintained for this employee' }
  if (!ts.email) return { skip: 'employee has no e-mail' }

  const [{ rows: entries }, { rows: tasks }, { rows: overrideRows }, { rows: managerRows }] = await Promise.all([
    pool.query('SELECT * FROM timesheet_entries WHERE timesheet_id = $1 ORDER BY entry_date', [timesheetId]),
    pool.query('SELECT t.id, t.name, p.name AS project_name FROM tasks t JOIN projects p ON p.id = t.project_id'),
    ts.manager_id
      ? pool.query('SELECT override_date FROM working_day_overrides WHERE manager_id = $1', [ts.manager_id])
      : Promise.resolve({ rows: [] }),
    // Only needed on Submit (see ManagerMail below) - harmless to run otherwise, but skipped when
    // there's no manager_id so a brand-new/unassigned employee's submit doesn't error.
    flag === 'S' && ts.manager_id
      ? pool.query('SELECT email FROM users WHERE id = $1', [ts.manager_id])
      : Promise.resolve({ rows: [] }),
  ])
  const taskNames = Object.fromEntries(tasks.map((t) => [t.id, `${t.project_name} - ${t.name}`]))
  const overrides = new Set(overrideRows.map((r) => r.override_date))
  // On Submit, ManagerMail is the employee's ASSIGNED manager (who needs to review this) - looked
  // up via manager_id, not whoever's session is doing the submitting (the employee themselves).
  // Approve/Reject keep using the acting manager's own email, passed straight through.
  const resolvedManagerEmail = flag === 'S' ? managerRows[0]?.email || '' : managerEmail

  return {
    payload: {
      Lifnr: ts.vendor_id,
      MailId: ts.email,
      Flag: flag,
      Comment: flag === 'R' ? ts.manager_comment || '' : '',
      ManagerMail: resolvedManagerEmail || '',
      NAV_EMPTOMAIL: buildDayRows(ts.month_start_date, entries, taskNames, overrides),
    },
  }
}

async function send(timesheetId, flag, managerEmail) {
  const { payload, skip } = await buildPayload(timesheetId, flag, managerEmail)
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

// decision: 'Submitted' | 'Approved' | 'Rejected' -> Flag 'S' | 'A' | 'R'. Submitted covers both a
// fresh submit and a resubmit after rejection - both are the same Flag 'S' call (see routes/
// timesheets.js's /submit). managerEmail is whoever's session performed this action - for a
// submit that's the employee themselves, same mechanism as approve/reject. Returns immediately;
// never throws.
export function notifySapTimesheetDecision(timesheetId, decision, managerEmail) {
  if (!isEnabled()) return
  const flag = decision === 'Rejected' ? 'R' : decision === 'Submitted' ? 'S' : 'A'
  send(timesheetId, flag, managerEmail).catch((err) => {
    console.error(`[sap-timesheet-mail] ${timesheetId}: failed (Flag ${flag}) - ${err.message}`)
  })
}
