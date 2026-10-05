import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { pool } from '../db/pool.js'

const router = Router()

// A month can be edited (draft-saved) and submitted during the month itself and up to the SUBMIT_WINDOW_LAST_DAY-th of the
// following month (e.g. September until 5 October). Mirrors src/utils/timesheet.js's
// getSubmitWindow (the server can't import from src/).
const SUBMIT_WINDOW_LAST_DAY = 5

function isWithinSubmitWindow(monthStartDate, now = new Date()) {
  const [y, m] = monthStartDate.split('-').map(Number)
  const closesOn = new Date(y, m, SUBMIT_WINDOW_LAST_DAY, 23, 59, 59, 999) // m is 1-based, so this is next month
  return now <= closesOn
}

function mapEntry(row) {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    taskId: row.task_id,
    date: row.entry_date instanceof Date ? row.entry_date.toISOString().slice(0, 10) : row.entry_date,
    inTime: row.in_time ? row.in_time.slice(0, 5) : '',
    outTime: row.out_time ? row.out_time.slice(0, 5) : '',
    hours: Number(row.hours),
    note: row.note || '',
    leaveType: row.leave_type || '',
    inLocation: row.in_location || '',
    inLocationAt: row.in_location_at ? row.in_location_at.toISOString() : '',
    outLocation: row.out_location || '',
    outLocationAt: row.out_location_at ? row.out_location_at.toISOString() : '',
  }
}

function mapHistory(row) {
  return { status: row.status, date: row.occurred_at.toISOString(), comment: row.comment, action: row.action || undefined }
}

// A pending employee (picked a manager but not yet approved, or hasn't picked one at all - see
// server/src/routes/users.js) shouldn't be able to log any hours yet, even by calling this route
// directly instead of through the UI's own gate. Checked against the DB rather than the request's
// JWT payload since approval doesn't require a fresh sign-in - status can flip while an already-
// issued session token is still being used.
async function isPendingUser(userId) {
  const { rows } = await pool.query('SELECT status FROM users WHERE id = $1', [userId])
  return rows[0]?.status === 'pending'
}

async function loadTimesheet(client, id) {
  const { rows: tsRows } = await client.query('SELECT * FROM timesheets WHERE id = $1', [id])
  if (!tsRows[0]) return null
  const ts = tsRows[0]
  const [{ rows: entryRows }, { rows: historyRows }] = await Promise.all([
    client.query('SELECT * FROM timesheet_entries WHERE timesheet_id = $1 ORDER BY entry_date', [id]),
    client.query('SELECT * FROM timesheet_history WHERE timesheet_id = $1 ORDER BY occurred_at', [id]),
  ])
  return {
    id: ts.id,
    userId: ts.user_id,
    monthStartDate: ts.month_start_date,
    status: ts.status,
    managerComment: ts.manager_comment,
    entries: entryRows.map(mapEntry),
    history: historyRows.map(mapHistory),
  }
}

const ENTRY_COLUMNS = [
  'id', 'timesheet_id', 'user_id', 'project_id', 'task_id', 'entry_date',
  'in_time', 'out_time', 'hours', 'note', 'leave_type',
  'in_location', 'in_location_at', 'out_location', 'out_location_at',
]

// One INSERT for every row instead of one round-trip per entry - a full month can be 25-60+
// entries, and each round-trip to a remote DB adds up fast (this used to make autosave, and
// anything waiting on it like the leave balance refresh, visibly lag).
async function replaceEntries(client, timesheetId, userId, entries) {
  await client.query('DELETE FROM timesheet_entries WHERE timesheet_id = $1', [timesheetId])
  if (entries.length === 0) return
  const values = []
  const rowPlaceholders = entries.map((e, i) => {
    const row = [
      e.id || `e_${randomUUID()}`,
      timesheetId,
      userId,
      e.projectId || null,
      e.taskId || null,
      e.date,
      e.inTime || null,
      e.outTime || null,
      e.hours || 0,
      e.note || null,
      e.leaveType || null,
      e.inLocation || null,
      e.inLocationAt || null,
      e.outLocation || null,
      e.outLocationAt || null,
    ]
    values.push(...row)
    const base = i * ENTRY_COLUMNS.length
    return `(${ENTRY_COLUMNS.map((_, j) => `$${base + j + 1}`).join(', ')})`
  })
  await client.query(
    `INSERT INTO timesheet_entries (${ENTRY_COLUMNS.join(', ')}) VALUES ${rowPlaceholders.join(', ')}`,
    values,
  )
}

// GET /api/timesheets?userId=X&monthStartDate=Y  -> single timesheet or null
// GET /api/timesheets?userId=X                   -> all of that user's timesheets
// GET /api/timesheets?managerId=X                -> latest timesheets for X's direct reports
router.get('/', async (req, res, next) => {
  const { userId, monthStartDate, managerId } = req.query
  try {
    if (userId && monthStartDate) {
      const { rows } = await pool.query(
        'SELECT id FROM timesheets WHERE user_id = $1 AND month_start_date = $2',
        [userId, monthStartDate],
      )
      if (!rows[0]) return res.json(null)
      return res.json(await loadTimesheet(pool, rows[0].id))
    }
    if (userId) {
      const { rows } = await pool.query('SELECT id FROM timesheets WHERE user_id = $1 ORDER BY month_start_date DESC', [userId])
      return res.json(await Promise.all(rows.map((r) => loadTimesheet(pool, r.id))))
    }
    if (managerId) {
      const { rows } = await pool.query(
        `SELECT ts.id FROM timesheets ts
         JOIN users u ON u.id = ts.user_id
         WHERE u.manager_id = $1
         ORDER BY ts.month_start_date DESC`,
        [managerId],
      )
      return res.json(await Promise.all(rows.map((r) => loadTimesheet(pool, r.id))))
    }
    res.status(400).json({ error: 'Provide userId and/or monthStartDate, or managerId' })
  } catch (err) {
    next(err)
  }
})

// Persist in-progress entries as a Draft. Editing a Rejected timesheet
// intentionally keeps its status Rejected until the user explicitly
// resubmits (mirrors AppContext.saveDraftEntries).
router.post('/draft', async (req, res, next) => {
  const { userId, monthStartDate, entries } = req.body
  if (!userId || !monthStartDate || !Array.isArray(entries)) {
    return res.status(400).json({ error: 'userId, monthStartDate and entries are required' })
  }
  if (await isPendingUser(userId)) {
    return res.status(403).json({ error: 'Your manager still needs to approve you before you can log hours.' })
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      'SELECT * FROM timesheets WHERE user_id = $1 AND month_start_date = $2',
      [userId, monthStartDate],
    )
    const existing = rows[0]
    if (existing?.status !== 'Rejected' && !isWithinSubmitWindow(monthStartDate)) {
      await client.query('ROLLBACK')
      return res.status(400).json({
        error: `A month's timesheet can only be edited until the ${SUBMIT_WINDOW_LAST_DAY}th of the following month.`,
      })
    }
    if (existing) {
      if (existing.status !== 'Draft' && existing.status !== 'Rejected') {
        await client.query('ROLLBACK')
        return res.json(await loadTimesheet(pool, existing.id))
      }
      await replaceEntries(client, existing.id, userId, entries)
      await client.query('COMMIT')
      return res.json(await loadTimesheet(pool, existing.id))
    }
    const id = `ts_${randomUUID()}`
    await client.query(
      'INSERT INTO timesheets (id, user_id, month_start_date, status) VALUES ($1, $2, $3, $4)',
      [id, userId, monthStartDate, 'Draft'],
    )
    await replaceEntries(client, id, userId, entries)
    await client.query(
      'INSERT INTO timesheet_history (timesheet_id, status, occurred_at, comment) VALUES ($1, $2, now(), NULL)',
      [id, 'Draft'],
    )
    await client.query('COMMIT')
    res.status(201).json(await loadTimesheet(pool, id))
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
})

// Upserts entries and transitions the month to Submitted (or Resubmitted, if
// it was previously Rejected) - mirrors AppContext.submitForApproval.
router.post('/submit', async (req, res, next) => {
  const { userId, monthStartDate, entries } = req.body
  if (!userId || !monthStartDate || !Array.isArray(entries)) {
    return res.status(400).json({ error: 'userId, monthStartDate and entries are required' })
  }
  if (await isPendingUser(userId)) {
    return res.status(403).json({ error: 'Your manager still needs to approve you before you can log hours.' })
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      'SELECT * FROM timesheets WHERE user_id = $1 AND month_start_date = $2',
      [userId, monthStartDate],
    )
    const existing = rows[0]
    if (existing?.status !== 'Rejected' && !isWithinSubmitWindow(monthStartDate)) {
      await client.query('ROLLBACK')
      return res.status(400).json({
        error: `A month's timesheet can only be submitted until the ${SUBMIT_WINDOW_LAST_DAY}th of the following month.`,
      })
    }
    const nextStatus = existing?.status === 'Rejected' ? 'Resubmitted' : 'Submitted'
    let id = existing?.id
    if (existing) {
      await replaceEntries(client, id, userId, entries)
      await client.query('UPDATE timesheets SET status = $1 WHERE id = $2', [nextStatus, id])
    } else {
      id = `ts_${randomUUID()}`
      await client.query(
        'INSERT INTO timesheets (id, user_id, month_start_date, status) VALUES ($1, $2, $3, $4)',
        [id, userId, monthStartDate, nextStatus],
      )
      await replaceEntries(client, id, userId, entries)
    }
    await client.query(
      'INSERT INTO timesheet_history (timesheet_id, status, occurred_at, comment) VALUES ($1, $2, now(), NULL)',
      [id, nextStatus],
    )
    await client.query('COMMIT')
    res.json(await loadTimesheet(pool, id))
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
})

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

// Mirrors src/utils/date.js's hoursBetween.
function hoursBetween(inTime, outTime) {
  if (!inTime || !outTime) return 0
  const [inH, inM] = inTime.split(':').map(Number)
  const [outH, outM] = outTime.split(':').map(Number)
  const minutes = outH * 60 + outM - (inH * 60 + inM)
  if (!Number.isFinite(minutes) || minutes <= 0) return 0
  return Math.round((minutes / 60) * 100) / 100
}

// Once an employee has submitted, their manager can correct Clock In / Clock Out times (and only
// those - tasks, descriptions and leave stay exactly as the employee entered them) before
// approving. Body: { times: { 'YYYY-MM-DD': { inTime: 'HH:MM' | '', outTime: 'HH:MM' | '' } } }.
// A day's hours are recomputed from the new times, split evenly across its task lines like the
// grid does; a working day the employee never punched gets a single task-less entry.
router.post('/:id/manager-times', async (req, res, next) => {
  if (req.user.role !== 'manager') return res.status(403).json({ error: 'Only managers can edit clock times.' })
  const { times } = req.body
  if (!times || typeof times !== 'object' || Array.isArray(times)) {
    return res.status(400).json({ error: 'times is required' })
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT ts.*, u.manager_id FROM timesheets ts JOIN users u ON u.id = ts.user_id WHERE ts.id = $1 FOR UPDATE OF ts`,
      [req.params.id],
    )
    const ts = rows[0]
    if (!ts) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Timesheet not found.' })
    }
    if (ts.manager_id !== req.user.userId) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: "You can only edit your own team's timesheets." })
    }
    if (ts.status !== 'Submitted' && ts.status !== 'Resubmitted') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Clock times can only be edited while the timesheet is waiting for approval.' })
    }

    const monthPrefix = (ts.month_start_date instanceof Date ? ts.month_start_date.toISOString() : String(ts.month_start_date)).slice(0, 7)
    const { rows: entryRows } = await client.query('SELECT * FROM timesheet_entries WHERE timesheet_id = $1', [ts.id])
    const entries = entryRows.map(mapEntry)

    let changedDays = 0
    for (const [date, value] of Object.entries(times)) {
      const inTime = value?.inTime || ''
      const outTime = value?.outTime || ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.slice(0, 7) !== monthPrefix) {
        throw Object.assign(new Error(`${date} is not in this timesheet's month.`), { status: 400 })
      }
      if ((inTime && !TIME_RE.test(inTime)) || (outTime && !TIME_RE.test(outTime))) {
        throw Object.assign(new Error(`Invalid time on ${date}.`), { status: 400 })
      }
      if (inTime && outTime && hoursBetween(inTime, outTime) === 0) {
        throw Object.assign(new Error(`Out time must be after In time on ${date}.`), { status: 400 })
      }
      const dayEntries = entries.filter((e) => e.date === date)
      if (dayEntries.some((e) => e.leaveType)) {
        throw Object.assign(new Error(`${date} is marked as leave - its times can't be edited.`), { status: 400 })
      }
      if (dayEntries.length) {
        if (dayEntries.every((e) => e.inTime === inTime && e.outTime === outTime)) continue
        const perLine = Math.round((hoursBetween(inTime, outTime) / dayEntries.length) * 100) / 100
        await client.query(
          'UPDATE timesheet_entries SET in_time = $1, out_time = $2, hours = $3 WHERE timesheet_id = $4 AND entry_date = $5',
          [inTime || null, outTime || null, perLine, ts.id, date],
        )
        changedDays += 1
      } else if (inTime || outTime) {
        await client.query(
          `INSERT INTO timesheet_entries (id, timesheet_id, user_id, entry_date, in_time, out_time, hours)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [`${ts.user_id}_${date}_0`, ts.id, ts.user_id, date, inTime || null, outTime || null, hoursBetween(inTime, outTime)],
        )
        changedDays += 1
      }
    }

    if (changedDays > 0) {
      await client.query(
        'INSERT INTO timesheet_history (timesheet_id, status, occurred_at, comment, action) VALUES ($1, $2, now(), $3, $4)',
        [ts.id, 'Edited', `Manager edited Clock In / Clock Out on ${changedDays} day${changedDays === 1 ? '' : 's'}`, 'Times Edited'],
      )
    }
    await client.query('COMMIT')
    res.json(await loadTimesheet(pool, ts.id))
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  } finally {
    client.release()
  }
})

router.post('/:id/approve', async (req, res, next) => {
  const comment = (req.body.comment || '').trim()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      'UPDATE timesheets SET status = $1, manager_comment = COALESCE(NULLIF($2, \'\'), manager_comment) WHERE id = $3',
      ['Approved', comment, req.params.id],
    )
    await client.query(
      'INSERT INTO timesheet_history (timesheet_id, status, occurred_at, comment) VALUES ($1, $2, now(), $3)',
      [req.params.id, 'Approved', comment || null],
    )
    await client.query('COMMIT')
    res.json(await loadTimesheet(pool, req.params.id))
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
})

router.post('/:id/reject', async (req, res, next) => {
  const comment = (req.body.comment || '').trim()
  const actionLabel = req.body.actionLabel || 'Rejected'
  if (!comment) return res.status(400).json({ error: 'A comment is required to reject a timesheet.' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('UPDATE timesheets SET status = $1, manager_comment = $2 WHERE id = $3', [
      'Rejected',
      comment,
      req.params.id,
    ])
    await client.query(
      'INSERT INTO timesheet_history (timesheet_id, status, occurred_at, comment, action) VALUES ($1, $2, now(), $3, $4)',
      [req.params.id, 'Rejected', comment, actionLabel],
    )
    await client.query('COMMIT')
    res.json(await loadTimesheet(pool, req.params.id))
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
})

router.post('/bulk-approve', async (req, res, next) => {
  const { timesheetIds } = req.body
  if (!Array.isArray(timesheetIds) || timesheetIds.length === 0) {
    return res.status(400).json({ error: 'timesheetIds must be a non-empty array' })
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('UPDATE timesheets SET status = $1 WHERE id = ANY($2)', ['Approved', timesheetIds])
    for (const id of timesheetIds) {
      await client.query(
        'INSERT INTO timesheet_history (timesheet_id, status, occurred_at, comment) VALUES ($1, $2, now(), NULL)',
        [id, 'Approved'],
      )
    }
    await client.query('COMMIT')
    res.json(await Promise.all(timesheetIds.map((id) => loadTimesheet(pool, id))))
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
})

export default router
