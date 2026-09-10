import { Router } from 'express'
import { pool } from '../db/pool.js'

const router = Router()

// Only these draw from the yearly pool - mirrors src/utils/timesheet.js's
// ACCRUAL_LEAVE_TYPES since this file can't import from src/ (server has its own module
// boundary). Unpaid Leave and Public Holiday are excluded on purpose.
const ACCRUAL_LEAVE_TYPES = ['Sick Leave', 'Casual Leave', 'Earned Leave']

// Returns one row per user: allocated (24 by default, until a manager adjusts it), used
// (COUNT of timesheet_entries already carrying an accrual leave_type), and
// balance = allocated - used. Always derived fresh from actual entries so it can never drift
// out of sync with what someone has actually taken.
router.get('/', async (_req, res, next) => {
  try {
    const [{ rows: userRows }, { rows: allocatedRows }, { rows: usedRows }] = await Promise.all([
      pool.query('SELECT id FROM users'),
      pool.query('SELECT user_id, allocated FROM leave_balances'),
      pool.query(
        `SELECT user_id, COUNT(*)::int AS used FROM timesheet_entries WHERE leave_type = ANY($1) GROUP BY user_id`,
        [ACCRUAL_LEAVE_TYPES],
      ),
    ])

    const allocatedByUser = new Map(allocatedRows.map((r) => [r.user_id, Number(r.allocated)]))
    const usedByUser = new Map(usedRows.map((r) => [r.user_id, r.used]))

    const balances = userRows.map(({ id: userId }) => {
      const allocated = allocatedByUser.has(userId) ? allocatedByUser.get(userId) : 24
      const used = usedByUser.get(userId) || 0
      return { userId, allocated, used, balance: allocated - used }
    })
    res.json(balances)
  } catch (err) {
    next(err)
  }
})

// Single-user version of the above - used to refresh just one person's balance (e.g. right
// after their own autosave) without pulling and recomputing the whole team's.
router.get('/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params
    const [{ rows: allocatedRows }, { rows: usedRows }] = await Promise.all([
      pool.query('SELECT allocated FROM leave_balances WHERE user_id = $1', [userId]),
      pool.query('SELECT COUNT(*)::int AS used FROM timesheet_entries WHERE user_id = $1 AND leave_type = ANY($2)', [
        userId,
        ACCRUAL_LEAVE_TYPES,
      ]),
    ])
    const allocated = allocatedRows[0] ? Number(allocatedRows[0].allocated) : 24
    const used = usedRows[0].used
    res.json({ userId, allocated, used, balance: allocated - used })
  } catch (err) {
    next(err)
  }
})

// Sets a direct report's yearly allocation directly (like editing the deadline-days field or
// toggling an assigned task - direct state, not a delta) - the action a manager takes from
// Manage Team.
router.put('/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params
    const allocated = Number(req.body?.allocated)
    if (!Number.isFinite(allocated) || allocated < 0) {
      return res.status(400).json({ error: 'allocated must be a non-negative number' })
    }
    await pool.query(
      `INSERT INTO leave_balances (user_id, allocated)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET allocated = $2`,
      [userId, allocated],
    )
    const { rows: usedRows } = await pool.query(
      'SELECT COUNT(*)::int AS used FROM timesheet_entries WHERE user_id = $1 AND leave_type = ANY($2)',
      [userId, ACCRUAL_LEAVE_TYPES],
    )
    const used = usedRows[0].used
    res.json({ userId, allocated, used, balance: allocated - used })
  } catch (err) {
    next(err)
  }
})

export default router
