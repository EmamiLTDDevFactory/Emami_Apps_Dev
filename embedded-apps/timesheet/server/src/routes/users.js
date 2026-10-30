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
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    managerId: row.manager_id,
    status: row.status,
    vendorId: row.vendor_id,
    isSuperAdmin: !!row.is_super_admin,
  }
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
export async function upsertHubUser(email, role, isSuperAdmin = false) {
  const { rows } = await pool.query(
    `INSERT INTO users (id, name, email, role, manager_id, status, is_super_admin)
     VALUES ($1, $2, $3, $4, NULL, CASE WHEN $4 = 'manager' THEN 'active' ELSE 'pending' END, $5)
     ON CONFLICT (email) DO UPDATE SET
       role = EXCLUDED.role,
       manager_id = CASE WHEN EXCLUDED.role = 'manager' THEN NULL ELSE users.manager_id END,
       is_super_admin = EXCLUDED.is_super_admin
     RETURNING *`,
    [`u_${randomUUID()}`, nameFromEmail(email), email, role, isSuperAdmin],
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

/** Validates a client-supplied vendor code against timesheet.vendors (the fixed 4-vendor list) -
 * an empty/missing value means "no vendor" (NULL), anything else must match a real vendor row so
 * a typo'd or stale code can't get silently saved onto an employee. */
async function resolveVendorId(vendorId) {
  const trimmed = String(vendorId || '').trim()
  if (!trimmed) return null
  const { rows } = await pool.query('SELECT code FROM vendors WHERE code = $1', [trimmed])
  if (!rows[0]) throw Object.assign(new Error('Unknown vendor'), { status: 400 })
  return trimmed
}

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

    const hubRole = await fetchHubRoleForTimesheet(email, req)
    if (!hubRole) {
      return res.status(400).json({
        error: 'This email has not been granted Timesheet access yet. Ask a hub admin to add it in Manage Access first.',
      })
    }

    const vendorId = await resolveVendorId(req.body?.vendorId)
    if (!vendorId) return res.status(400).json({ error: 'Select a vendor for this employee' })

    const { rows } = await pool.query(
      `INSERT INTO users (id, name, email, role, manager_id, vendor_id) VALUES ($1, $2, $3, 'employee', $4, $5) RETURNING *`,
      [`u_${randomUUID()}`, name, email, req.user.userId, vendorId],
    )
    res.status(201).json(mapUser(rows[0]))
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A user with this email already exists' })
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

// Employees who exist (synced from a hub sign-in, or added directly) but aren't on anyone's
// team yet - e.g. someone the hub's Manage Access already grants Timesheet access to, but who
// hasn't been claimed into a manager's team here. Surfaced in Manage Team as "add to my team"
// candidates, distinct from the "Add employee" form which only ever creates brand-new people.
//
// status = 'active' on purpose - this is the legacy passive pool for people who predate the
// pick-a-manager flow (see PUT /me/manager above). A 'pending' employee (brand-new, or just
// removed from a team - see DELETE /:id/team below) goes through that self-service flow instead
// of showing up here for a manager to claim; the two pools don't overlap.
router.get('/unassigned', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE role = 'employee' AND manager_id IS NULL AND status = 'active' ORDER BY name`,
    )
    res.json(rows.map(mapUser))
  } catch (err) {
    next(err)
  }
})

// The live-search pool for Manage Team's "Add employee" box: everyone a manager could type in
// here and grab. Two kinds of person, told apart by whether `id` is present:
//   - No `id`: genuinely new to Timesheet - the hub's Manage Access grants them access, but
//     they've never opened the app, so there's no user row to attach to yet. Picking one calls
//     POST / (addDirectReport) to create them.
//   - Has `id`: an existing Timesheet user with no manager yet - either the old "waiting to be
//     claimed" pool, or someone brand-new who hasn't picked a manager for themselves yet (see
//     PUT /me/manager). Picking one calls PUT /:id/claim (claimEmployee) instead of creating a
//     duplicate - same self-service trust model as that route already has.
// Names for the "no id" group are guessed from email since Manage Access has no name field of
// its own. Manager-only, same reasoning as the routes around it.
router.get('/candidates', async (req, res, next) => {
  try {
    if (req.user.role !== 'manager') return res.status(403).json({ error: 'Only managers can see this' })
    const grantedEmails = await fetchAllTimesheetGrantedEmails(req)
    const existing = await pool.query('SELECT email FROM users')
    const existingEmails = new Set(existing.rows.map((r) => r.email))
    const brandNew = grantedEmails
      .filter((email) => !existingEmails.has(email))
      .map((email) => ({ name: nameFromEmail(email), email }))
    const { rows: unassigned } = await pool.query(
      `SELECT id, name, email FROM users WHERE role = 'employee' AND manager_id IS NULL ORDER BY name`,
    )
    res.json([...unassigned, ...brandNew])
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
    const vendorId = await resolveVendorId(req.body?.vendorId)
    if (!vendorId) return res.status(400).json({ error: 'Select a vendor for this employee' })
    const { rows } = await pool.query(
      `UPDATE users SET manager_id = $1, vendor_id = $3 WHERE id = $2 AND manager_id IS NULL RETURNING *`,
      [req.user.userId, req.params.id, vendorId],
    )
    if (!rows[0]) return res.status(409).json({ error: 'This employee has already been added to a team' })
    res.json(mapUser(rows[0]))
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

// Sets or changes the vendor for someone already on the requesting manager's team - covers both
// people claimed without picking a vendor up front, and correcting a mistaken pick later. Scoped
// to `manager_id = req.user.userId` for the same reason as the delete routes below: a manager can
// only touch their own direct reports. vendorId omitted/empty clears it back to "no vendor".
router.put('/:id/vendor', async (req, res, next) => {
  try {
    if (req.user.role !== 'manager') return res.status(403).json({ error: 'Only managers can set an employee\'s vendor' })
    const vendorId = await resolveVendorId(req.body?.vendorId)
    const { rows } = await pool.query(
      `UPDATE users SET vendor_id = $1 WHERE id = $2 AND manager_id = $3 RETURNING *`,
      [vendorId, req.params.id, req.user.userId],
    )
    if (!rows[0]) return res.status(404).json({ error: 'This employee is not on your team' })
    res.json(mapUser(rows[0]))
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
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

// Removes an employee from the requesting manager's team - the inverse of /:id/claim above. Also
// sends them back to 'pending' (see PUT /me/manager above), same as a brand-new employee - having
// no approved manager means no access everywhere, not just on day one, so someone removed here
// goes straight to the pick-a-manager screen again instead of quietly sitting in the old
// unassigned pool with full access still intact. Their timesheets, leave history, and task
// assignments all stay untouched server-side either way - only manager_id and status change.
// Scoped to `manager_id = req.user.userId` so a manager can only remove their own reports, not
// someone else's.
router.delete('/:id/team', async (req, res, next) => {
  try {
    if (req.user.role !== 'manager') return res.status(403).json({ error: 'Only managers can remove employees' })
    const { rows } = await pool.query(
      `UPDATE users SET manager_id = NULL, status = 'pending' WHERE id = $1 AND manager_id = $2 RETURNING *`,
      [req.params.id, req.user.userId],
    )
    if (!rows[0]) return res.status(404).json({ error: 'This employee is not on your team' })
    res.json(mapUser(rows[0]))
  } catch (err) {
    next(err)
  }
})

// Permanently deletes an employee - unlike DELETE /:id/team above (which just unassigns them),
// this removes the user row entirely. FK constraints (ON DELETE CASCADE) take their assignments,
// timesheets, timesheet entries/history, and leave balance down with them. Scoped to
// `manager_id = req.user.userId` so a manager can only delete their own direct reports.
router.delete('/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'manager') return res.status(403).json({ error: 'Only managers can delete employees' })
    const { rows } = await pool.query(
      `DELETE FROM users WHERE id = $1 AND manager_id = $2 RETURNING *`,
      [req.params.id, req.user.userId],
    )
    if (!rows[0]) return res.status(404).json({ error: 'This employee is not on your team' })
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
