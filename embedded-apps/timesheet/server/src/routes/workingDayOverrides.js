import { Router } from 'express'
import { pool } from '../db/pool.js'

const router = Router()

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// The manager whose calendar governs a given signed-in user: a manager's own team (their own
// timesheet included), or an employee's assigned manager's team. An employee with no manager yet
// (still pending, see routes/users.js) has no calendar to look up.
async function effectiveManagerId(user) {
  if (user.role === 'manager') return user.userId
  const { rows } = await pool.query('SELECT manager_id FROM users WHERE id = $1', [user.userId])
  return rows[0]?.manager_id || null
}

// Every Saturday the caller's manager (or, if the caller is a manager, they themselves) has
// flipped to a working day - used to render the timesheet grid and expected-hours math for
// anyone on that team, not just the manager who set it.
router.get('/', async (req, res, next) => {
  try {
    const managerId = await effectiveManagerId(req.user)
    if (!managerId) return res.json([])
    const { rows } = await pool.query(
      'SELECT override_date FROM working_day_overrides WHERE manager_id = $1 ORDER BY override_date',
      [managerId],
    )
    res.json(rows.map((r) => r.override_date))
  } catch (err) {
    next(err)
  }
})

// Flips one Saturday to a working day for the manager's own team. Scoped to `req.user.userId` so
// a manager can only ever change their own team's calendar, not another manager's.
router.post('/', async (req, res, next) => {
  try {
    if (req.user.role !== 'manager') return res.status(403).json({ error: 'Only managers can change working days' })
    const date = String(req.body?.date || '').trim()
    if (!ISO_DATE_RE.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
    if (new Date(`${date}T00:00:00Z`).getUTCDay() !== 6) return res.status(400).json({ error: 'Only a Saturday can be made a working day' })
    await pool.query(
      `INSERT INTO working_day_overrides (manager_id, override_date) VALUES ($1, $2)
       ON CONFLICT (manager_id, override_date) DO NOTHING`,
      [req.user.userId, date],
    )
    res.status(201).json({ date })
  } catch (err) {
    next(err)
  }
})

// Reverts a Saturday back to the default rule (2nd/4th off, 1st/3rd/5th working).
router.delete('/:date', async (req, res, next) => {
  try {
    if (req.user.role !== 'manager') return res.status(403).json({ error: 'Only managers can change working days' })
    if (!ISO_DATE_RE.test(req.params.date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
    await pool.query('DELETE FROM working_day_overrides WHERE manager_id = $1 AND override_date = $2', [req.user.userId, req.params.date])
    res.json({ date: req.params.date })
  } catch (err) {
    next(err)
  }
})

export default router
