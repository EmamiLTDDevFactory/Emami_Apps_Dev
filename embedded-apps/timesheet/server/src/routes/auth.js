import jwt from 'jsonwebtoken'
import { Router } from 'express'
import { pool } from '../db/pool.js'
import { mapUser, upsertHubUser } from './users.js'
import { issueSessionToken } from '../middleware/auth.js'

const router = Router()

// Must match the Emami Apps hub's own HUB_AUTH_JWT_SECRET (backend/sessionAuth.js at the repo
// root) exactly - lets this backend trust a session the hub already authenticated, same pattern
// as embedded-apps/audit-capa/backend/controllers/authController.js.
const HUB_AUTH_JWT_SECRET = process.env.HUB_AUTH_JWT_SECRET || ''

// Explicit opt-in, unset (and therefore off) in production's real .env - keeps the demo "log in
// as anyone" picker from ever being reachable once this is actually deployed for real hub users,
// even by someone calling these two routes directly instead of through the UI.
const ALLOW_DEMO_LOGIN = process.env.ALLOW_DEMO_LOGIN === 'true'

// This app is currently only deployed on the Emami_Apps_Dev environment, so this defaults to the
// dev-pointed hub backend (proxied under /dev-api/) rather than prod - otherwise every Manage
// Access grant made on Emami_Apps_Dev (e.g. Admin for 'timesheet') would be invisible here, since
// prod and dev keep entirely separate Manage Access data. A plain server-side env var, not a Vite
// build-time one, so - unlike the frontend's now-hardcoded API_BASE (see src/context/AppContext.jsx)
// - there's no Amplify-console-global-env-var collision risk here; update HUB_ACCESS_API_BASE in
// this backend's own .env whenever this moves to the prod hub instead of editing code.
const HUB_ACCESS_API_BASE = process.env.HUB_ACCESS_API_BASE || 'https://audit-capa-api.emamiapps.in/dev-api/api'
const APP_ID = 'timesheet'

/** Everyone the hub's Manage Access currently grants Timesheet to (Admin or User), active only -
 * the searchable pool for Manage Team's "Add employee" live search (see routes/users.js's
 * GET /candidates), so a manager picks a real, already-authorized person instead of free-typing
 * an email that might be wrong. Keeps HUB_ACCESS_API_BASE/APP_ID knowledge in this one file rather
 * than leaking those constants into users.js too. */
export async function fetchAllTimesheetGrantedEmails() {
  try {
    const res = await fetch(`${HUB_ACCESS_API_BASE}/access/users`)
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.success) return []
    return (data.users || [])
      .filter((u) => u.isActive && (u.apps || []).some((a) => a.appId === APP_ID))
      .map((u) => u.email)
  } catch {
    return []
  }
}

/** Server-side counterpart of the old client-side src/lib/hubAccess.js's getHubRoleForTimesheet -
 * moved here so the browser never has to be trusted with an already-verified email; this backend
 * looks up the hub's Manage Access grant for 'timesheet' itself once it already knows who's
 * really asking (see POST /hub-login below). Exported for routes/users.js's "Add employee" form
 * to reuse the exact same check, rather than duplicating this call. */
export async function fetchHubRoleForTimesheet(email) {
  try {
    const res = await fetch(`${HUB_ACCESS_API_BASE}/access/me?email=${encodeURIComponent(email)}`)
    const data = await res.json().catch(() => null)
    if (!res.ok || !data) return null
    const apps = Array.isArray(data.apps) ? data.apps : []
    return apps.find((a) => a.appId === APP_ID)?.role || null // 'Admin' | 'User' | null
  } catch {
    return null
  }
}

/**
 * Verifies a session token the Emami Apps hub already issued at its own login (see the hub's
 * backend/sessionAuth.js), instead of trusting a bare email string handed up by the browser -
 * this is what actually proves the caller is who they claim to be. Once verified, looks up their
 * Manage Access role for 'timesheet' specifically and upserts/reads their TimeSheet user record,
 * then issues this app's own session token (see middleware/auth.js) for every other route to
 * require from here on.
 */
router.post('/hub-login', async (req, res, next) => {
  try {
    const hubToken = req.body?.hubToken
    if (!hubToken) return res.status(401).json({ error: 'No Emami Apps session found. Please sign in to Emami Apps first.' })
    if (!HUB_AUTH_JWT_SECRET) {
      console.error('[auth] HUB_AUTH_JWT_SECRET is not set - cannot verify hub sessions.')
      return res.status(503).json({ error: 'Sign-in is not configured yet.' })
    }

    let hubPayload
    try {
      hubPayload = jwt.verify(hubToken, HUB_AUTH_JWT_SECRET)
    } catch {
      return res.status(401).json({ error: 'Your Emami Apps session has expired. Please sign in to Emami Apps again.' })
    }

    const email = String(hubPayload?.email || '').trim().toLowerCase()
    if (!email) return res.status(401).json({ error: 'Invalid Emami Apps session.' })

    const hubRole = await fetchHubRoleForTimesheet(email)
    const role = hubRole === 'Admin' ? 'manager' : 'employee'
    const user = await upsertHubUser(email, role)
    const token = issueSessionToken(user)

    res.json({ user, token })
  } catch (err) {
    next(err)
  }
})

// Lets Login.jsx's "log in as" picker list someone before any session token exists - only reachable
// in local/standalone dev (see ALLOW_DEMO_LOGIN above). The same list POST /hub-sync's frontend
// caller used to get from the now-authenticated GET /users, before a token existed to call it with.
router.get('/demo-users', async (_req, res, next) => {
  if (!ALLOW_DEMO_LOGIN) return res.status(404).json({ error: 'Not found' })
  try {
    const { rows } = await pool.query('SELECT * FROM users ORDER BY name')
    res.json(rows.map(mapUser))
  } catch (err) {
    next(err)
  }
})

// Issues a session token for whichever demo user was picked - no real verification, since this
// only exists for local/standalone dev (see /hub-login above for the real, verified path). Same
// ALLOW_DEMO_LOGIN gate keeps this from ever being reachable once deployed for real hub users.
router.post('/demo-login', async (req, res, next) => {
  if (!ALLOW_DEMO_LOGIN) return res.status(404).json({ error: 'Not found' })
  try {
    const userId = String(req.body?.userId || '').trim()
    if (!userId) return res.status(400).json({ error: 'userId is required' })
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [userId])
    if (!rows[0]) return res.status(404).json({ error: 'User not found' })
    const user = mapUser(rows[0])
    const token = issueSessionToken(user)
    res.json({ user, token })
  } catch (err) {
    next(err)
  }
})

export default router
