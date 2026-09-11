import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { pool } from '../db/pool.js'
import { fetchHubRoleForTimesheet, fetchAllTimesheetGrantedEmails } from './auth.js'

const router = Router()

// A plain, ordinary-looking email address - "someone@somewhere.something". Not trying to cover
// every edge case the real email spec allows, just enough to catch an obvious typo (missing @,
// no dot in the domain) before ever bothering the hub with it.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function mapUser(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role, managerId: row.manager_id, status: row.status }
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
 * same as any other employee with no manager yet.
 *
 * status only gets set on the INSERT branch (a genuinely brand-new email) - a fresh employee
 * starts 'pending' (blocked behind the pick-a-manager / awaiting-approval screens, see
 * PUT /me/manager and /:id/approve below) while a fresh manager starts 'active' (managers are
 * never gated). Left out of the UPDATE branch entirely so it's never touched on repeat sign-ins -
 * an already-active employee re-syncing their role stays active, and someone still sitting in
 * 'pending' stays there until approved, regardless of how many times they open the app. */
export async function upsertHubUser(email, role) {
  const { rows } = await pool.query(
    `INSERT INTO users (id, name, email, role, manager_id, status)
     VALUES ($1, $2, $3, $4, NULL, CASE WHEN $4 = 'manager' THEN 'active' ELSE 'pending' END)
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
//
// Two checks happen before anything is created, in order (cheapest first):
//   1. Does this look like a real email address at all - catches an obvious typo instantly,
//      without spending a network call on it.
//   2. Does the hub's own Manage Access actually grant this email Timesheet access - without
//      this, a manager could type any email and create a phantom employee who could never
//      actually sign in (Manage Access gates every embedded app before someone even reaches it).
router.post('/', async (req, res, next) => {
  try {
    if (req.user.role !== 'manager') return res.status(403).json({ error: 'Only managers can add employees' })
    const name = String(req.body?.name || '').trim()
    const email = String(req.body?.email || '').trim().toLowerCase()
    if (!name) return res.status(400).json({ error: 'name is required' })
    if (!email) return res.status(400).json({ error: 'email is required' })
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address' })

    const hubRole = await fetchHubRoleForTimesheet(email)
    if (!hubRole) {
      return res.status(400).json({
        error: 'This email has not been granted Timesheet access yet. Ask a hub admin to add it in Manage Access first.',
      })
    }

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

// The live-search pool for Manage Team's "Add employee" box: everyone the hub's Manage Access
// currently grants Timesheet to, who ISN'T a Timesheet user of any kind yet (not an employee, not
// a manager, not sitting unassigned) - those people have their own paths already (claim, or
// they're already on a team), so this form is only ever for someone genuinely new to Timesheet.
// Names are guessed from email since Manage Access has no name field of its own. Manager-only,
// same reasoning as the routes around it - this exists to feed that one form, not as a general
// people directory.
router.get('/candidates', async (req, res, next) => {
  try {
    if (req.user.role !== 'manager') return res.status(403).json({ error: 'Only managers can see this' })
    const grantedEmails = await fetchAllTimesheetGrantedEmails()
    const existing = await pool.query('SELECT email FROM users')
    const existingEmails = new Set(existing.rows.map((r) => r.email))
    const candidates = grantedEmails
      .filter((email) => !existingEmails.has(email))
      .map((email) => ({ name: nameFromEmail(email), email }))
    res.json(candidates)
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

// Everyone who could be picked as "my reporting manager" on the first-login screen (see
// PUT /me/manager below) - open to any signed-in user, not manager-only like most routes here,
// since it's exactly the employees who haven't been approved by anyone yet who need this list.
router.get('/managers', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM users WHERE role = 'manager' ORDER BY name`)
    res.json(rows.map(mapUser))
  } catch (err) {
    next(err)
  }
})

// An employee's own first-login pick of who they report to (or a change of mind while still
// pending - see AwaitingApproval.jsx's "Pick someone else" link). Sets manager_id but leaves
// status 'pending' - they're now in that manager's queue (GET /pending-requests below) but still
// blocked from everything else until PUT /:id/approve. Scoped to the caller's own row via
// req.user, not a client-supplied id - otherwise anyone could attach someone else to a manager of
// their choosing.
router.put('/me/manager', async (req, res, next) => {
  try {
    if (req.user.role !== 'employee') return res.status(403).json({ error: 'Only employees can pick a reporting manager' })
    const managerId = String(req.body?.managerId || '').trim()
    if (!managerId) return res.status(400).json({ error: 'managerId is required' })
    const managerCheck = await pool.query(`SELECT id FROM users WHERE id = $1 AND role = 'manager'`, [managerId])
    if (!managerCheck.rows[0]) return res.status(400).json({ error: 'That manager could not be found' })
    const { rows } = await pool.query(
      `UPDATE users SET manager_id = $1, status = 'pending' WHERE id = $2 RETURNING *`,
      [managerId, req.user.userId],
    )
    res.json(mapUser(rows[0]))
  } catch (err) {
    next(err)
  }
})

// People who've specifically named the requesting manager as theirs and are waiting for a yes/no
// - distinct from GET /unassigned above (nobody's picked those people at all yet). Manager-only,
// scoped to req.user's own id so one manager never sees another's incoming requests.
router.get('/pending-requests', async (req, res, next) => {
  try {
    if (req.user.role !== 'manager') return res.status(403).json({ error: 'Only managers can see this' })
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE manager_id = $1 AND status = 'pending' ORDER BY name`,
      [req.user.userId],
    )
    res.json(rows.map(mapUser))
  } catch (err) {
    next(err)
  }
})

// Approves someone who named this manager as theirs - flips them to 'active', unblocking every
// other route for them immediately (their next poll/reload picks it up, see
// AwaitingApproval.jsx). The manager_id = req.user.userId guard means a manager can only approve
// their own incoming requests, never someone who picked a different manager.
router.put('/:id/approve', async (req, res, next) => {
  try {
    if (req.user.role !== 'manager') return res.status(403).json({ error: 'Only managers can approve employees' })
    const { rows } = await pool.query(
      `UPDATE users SET status = 'active' WHERE id = $1 AND manager_id = $2 AND status = 'pending' RETURNING *`,
      [req.params.id, req.user.userId],
    )
    if (!rows[0]) return res.status(404).json({ error: 'No pending request found for this employee' })
    res.json(mapUser(rows[0]))
  } catch (err) {
    next(err)
  }
})

// Turns down a request - clears manager_id (stays 'pending') so the employee lands back on the
// pick-a-manager screen to choose again, instead of being stuck waiting on a manager who already
// said no.
router.put('/:id/reject', async (req, res, next) => {
  try {
    if (req.user.role !== 'manager') return res.status(403).json({ error: 'Only managers can reject requests' })
    const { rows } = await pool.query(
      `UPDATE users SET manager_id = NULL WHERE id = $1 AND manager_id = $2 AND status = 'pending' RETURNING *`,
      [req.params.id, req.user.userId],
    )
    if (!rows[0]) return res.status(404).json({ error: 'No pending request found for this employee' })
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
