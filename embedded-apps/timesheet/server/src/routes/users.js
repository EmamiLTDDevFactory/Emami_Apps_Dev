import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { pool } from '../db/pool.js'

const router = Router()

function mapUser(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role, managerId: row.manager_id }
}

/** Title-cases an email's local part as a display name when no real name is known yet — same
 * approach the EmamiApps hub's own backend/userProfile.js uses for the same purpose. */
function nameFromEmail(email) {
  const local = String(email).split('@')[0] || ''
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(' ') || email
  )
}

router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users ORDER BY name')
    res.json(rows.map(mapUser))
  } catch (err) {
    next(err)
  }
})

/**
 * Upserts a TimeSheet user for someone signing in via the EmamiApps hub (see
 * src/lib/hubAccess.js) — keyed by email, which the schema already treats as unique. `role` is
 * translated from that person's Manage Access grant for the 'timesheet' app on the hub
 * (Admin -> manager, User -> employee) and re-synced on every hub sign-in, so a Manage Access
 * change takes effect on their next open here instead of waiting on anything else. A brand-new
 * email gets no manager assigned (manager_id stays NULL) - same as any other user, assignable
 * later the same way. An existing user's name is left untouched on repeat sign-ins, in case it
 * was edited here since.
 */
router.post('/hub-sync', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase()
    if (!email) return res.status(400).json({ error: 'email is required' })
    const role = req.body?.role === 'manager' ? 'manager' : 'employee'
    const { rows } = await pool.query(
      `INSERT INTO users (id, name, email, role, manager_id)
       VALUES ($1, $2, $3, $4, NULL)
       ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role
       RETURNING *`,
      [`u_${randomUUID()}`, nameFromEmail(email), email, role],
    )
    res.json(mapUser(rows[0]))
  } catch (err) {
    next(err)
  }
})

// Adds a new direct report under the requesting manager — used by Manage Team's "Add employee"
// form. Unlike hub-sync, this always sets manager_id up front since it's created specifically as
// someone's report.
router.post('/', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim()
    const email = String(req.body?.email || '').trim().toLowerCase()
    const managerId = req.body?.managerId || null
    if (!name) return res.status(400).json({ error: 'name is required' })
    if (!email) return res.status(400).json({ error: 'email is required' })
    const { rows } = await pool.query(
      `INSERT INTO users (id, name, email, role, manager_id) VALUES ($1, $2, $3, 'employee', $4) RETURNING *`,
      [`u_${randomUUID()}`, name, email, managerId],
    )
    res.status(201).json(mapUser(rows[0]))
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A user with this email already exists' })
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id])
    if (!rows[0]) return res.status(404).json({ error: 'User not found' })
    res.json(mapUser(rows[0]))
  } catch (err) {
    next(err)
  }
})

export default router
