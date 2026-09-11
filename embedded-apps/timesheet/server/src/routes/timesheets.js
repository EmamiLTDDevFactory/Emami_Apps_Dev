import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { pool } from '../db/pool.js'

const router = Router()

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
