import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { pool } from '../db/pool.js'

const router = Router()

export function mapUser(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role, managerId: row.manager_id }
}

/** Title-cases an email's local part as a display name when no real name is known yet — same
 * approach the EmamiApps hub's own backend/userProfile.js uses for the same purpose. */
export function nameFromEmail(email) {
  const local = String(email).split('@')[0] || ''
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(' ') || email
  )
}

/** Upserts a TimeSheet user for someone verified via the hub (see routes/auth.js) — keyed by
 * email, which the schema treats as unique. `role` is translated from that person's Manage
 * Access grant for the 'timesheet' app on the hub (Admin -> manager, User -> employee) and
 * re-synced on every hub sign-in, so a Manage Access change takes effect on their next open here
 * instead of waiting on anything else. A brand-new email gets no manager assigned (manager_id
 * stays NULL) - same as any other user, assignable later via /:id/claim. An existing user's name
 * is left untouched on repeat sign-ins, in case it was edited here since.
 *
 * Being promoted to manager also clears manager_id - managers don't report to other managers in
 * this flat structure, and leaving an old manager_id behind left a promoted employee still stuck
 * on their former manager's team (task assignments, an approvals list expecting a timesheet they
 * can no longer submit as a manager, "Reports to X" showing on their own sidebar). Only touched
 * when the NEW role is 'manager' - demoting someone back to employee deliberately does NOT try to
 * guess who they should report to now; they land back in the unassigned pool to be claimed fresh,
 * same as any other employee with no manager yet. */
export async function upsertHubUser(email, role) {
  const { rows } = await pool.query(
    `INSERT INTO users (id, name, email, role, manager_id)
     VALUES ($1, $2, $3, $4, NULL)
     ON CONFLICT (email) DO UPDATE SET
       role = EXCLUDED.role,
       manager_id = CASE WHEN EXCLUDED.role = 'manager' THEN NULL ELSE users.manager_id END
     RETURNING *`,
    [`u_${randomUUID()}`, nameFromEmail(email), email, role],
  )
  return mapUser(rows[0])
}

router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users ORDER BY name')
    res.json(rows.map(mapUser))
  } catch (err) {
    next(err)
  }
})

// Adds a new direct report under the requesting manager — used by Manage Team's "Add employee"
// form. Unlike hub-sync, this always sets manager_id up front since it's created specifically as
// someone's report. The manager is req.user (verified by requireAuth), same reasoning as
// /:id/claim below - otherwise anyone calling this endpoint could create a report under whichever
// manager account they felt like naming.
router.post('/', async (req, res, next) => {
  try {
    if (req.user.role !== 'manager') return res.status(403).json({ error: 'Only managers can add employees' })
    const name = String(req.body?.name || '').trim()
    const email = String(req.body?.email || '').trim().toLowerCase()
    if (!name) return res.status(400).json({ error: 'name is required' })
    if (!email) return res.status(400).json({ error: 'email is required' })
    const { rows } = await pool.query(
      `INSERT INTO users (id, name, email, role, manager_id) VALUES ($1, $2, $3, 'employee', $4) RETURNING *`,
      [`u_${randomUUID()}`, name, email, req.user.userId],
    )
    res.status(201).json(mapUser(rows[0]))
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A user with this email already exists' })
    next(err)
  }
})

// Employees who exist (synced from a hub sign-in, or added directly) but aren't on anyone's
// team yet - e.g. someone the hub's Manage Access already grants Timesheet access to, but who
// hasn't been claimed into a manager's team here. Surfaced in Manage Team as "add to my team"
// candidates, distinct from the "Add employee" form which only ever creates brand-new people.
router.get('/unassigned', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE role = 'employee' AND manager_id IS NULL ORDER BY name`,
    )
    res.json(rows.map(mapUser))
  } catch (err) {
    next(err)
  }
})

// Claims an unassigned employee onto the requesting manager's team. Self-service, no approval
// step - same as the "Add employee" form's own trust model - but the manager_id IS NULL guard
// means whichever manager clicks first wins; a second manager's claim on the same person 409s
// instead of silently reassigning someone already on a team. The manager is req.user (verified by
// requireAuth from their own session token), not a client-supplied id - otherwise anyone calling
// this endpoint could claim employees onto whichever manager account they felt like naming.
router.put('/:id/claim', async (req, res, next) => {
  try {
    if (req.user.role !== 'manager') return res.status(403).json({ error: 'Only managers can add employees to a team' })
    const { rows } = await pool.query(
      `UPDATE users SET manager_id = $1 WHERE id = $2 AND manager_id IS NULL RETURNING *`,
      [req.user.userId, req.params.id],
    )
    if (!rows[0]) return res.status(409).json({ error: 'This employee has already been added to a team' })
    res.json(mapUser(rows[0]))
  } catch (err) {
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
