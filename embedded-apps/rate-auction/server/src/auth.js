import jwt from 'jsonwebtoken'

// Rate Auction's own session token - separate from the hub's HUB_AUTH_JWT_SECRET, issued only after
// that hub token has been verified (see POST /api/auth/hub-login in index.js). Same two-token
// pattern as embedded-apps/timesheet/server: the hub token proves who the person is, this one
// carries the Rate Auction role the hub's Manage Access gave them.
const SESSION_JWT_SECRET = process.env.SESSION_JWT_SECRET || ''
// Matches the hub's own 12h session, so a role change in Manage Access applies by the next sign-in.
const SESSION_EXPIRES_IN = process.env.SESSION_EXPIRES_IN || '12h'

// Must match the Emami Apps hub's HUB_AUTH_JWT_SECRET (backend/sessionAuth.js at the repo root)
// exactly. Dev and prod hubs sign with DIFFERENT secrets, so the dev PM2 process needs dev's value
// and the prod process prod's - see embedded-apps/timesheet/src/context/AppContext.tsx's comment.
const HUB_AUTH_JWT_SECRET = process.env.HUB_AUTH_JWT_SECRET || ''

// Explicit opt-in for the "sign in as admin / vendor" picker used when running standalone. Leave
// unset in the deployed .env: /api/auth/demo-login then 404s outright.
export const ALLOW_DEMO_LOGIN = process.env.ALLOW_DEMO_LOGIN === 'true'

if (!SESSION_JWT_SECRET) console.warn('[auth] SESSION_JWT_SECRET is not set - sessions cannot be issued or verified.')

export const APP_ID = 'rate-auction'

// Prod and dev keep separate Manage Access data, so the role is read from whichever hub the caller
// came from (hostname containing 'dev' -> dev). Same rule as timesheet's hubAccessApiBaseFor.
const HUB_ACCESS_API_BASE_PROD = process.env.HUB_ACCESS_API_BASE_PROD || 'https://audit-capa-api.emamiapps.in/api'
const HUB_ACCESS_API_BASE_DEV = process.env.HUB_ACCESS_API_BASE_DEV || 'https://audit-capa-api.emamiapps.in/dev-api/api'
const HUB_ACCESS_API_BASE_FALLBACK = process.env.HUB_ACCESS_API_BASE || HUB_ACCESS_API_BASE_PROD

function hubAccessApiBaseFor(req) {
  const origin = req?.headers?.origin || req?.headers?.referer || ''
  let hostname = ''
  try {
    hostname = new URL(origin).hostname
  } catch {
    return HUB_ACCESS_API_BASE_FALLBACK
  }
  if (hostname === 'localhost' || hostname === '127.0.0.1') return HUB_ACCESS_API_BASE_FALLBACK
  return hostname.includes('dev') ? HUB_ACCESS_API_BASE_DEV : HUB_ACCESS_API_BASE_PROD
}

/** The person's Manage Access role on Rate Auction: 'Admin' | 'User' | null (not granted). */
async function fetchHubRole(email, req) {
  const res = await fetch(`${hubAccessApiBaseFor(req)}/access/me?email=${encodeURIComponent(email)}`)
  const data = await res.json().catch(() => null)
  if (!res.ok || !data) throw new Error(`Manage Access lookup failed (${res.status})`)
  const apps = Array.isArray(data.apps) ? data.apps : []
  return apps.find((a) => a.appId === APP_ID)?.role || null
}

/** Manage Access role -> what this app lets them do. Admin runs auctions (Central Purchase); User
 * is a bidding vendor, matched to an invited SAP vendor by email (see engine.js vendorIdFor). */
export function appRoleFor(hubRole) {
  if (hubRole === 'Admin') return 'admin'
  if (hubRole === 'User') return 'vendor'
  return null
}

export function issueSession(email, role) {
  return jwt.sign({ email, role }, SESSION_JWT_SECRET, { expiresIn: SESSION_EXPIRES_IN })
}

/** Verifies the hub's own session token and looks up the Rate Auction role. Throws an Error with a
 * `status` and a user-facing message on any failure. */
export async function loginWithHubToken(hubToken, req) {
  const fail = (status, message) => Object.assign(new Error(message), { status })
  if (!hubToken) throw fail(401, 'No Emami Apps session found. Please sign in to Emami Apps first.')
  if (!HUB_AUTH_JWT_SECRET) {
    console.error('[auth] HUB_AUTH_JWT_SECRET is not set - cannot verify hub sessions.')
    throw fail(503, 'Sign-in is not configured yet.')
  }
  let payload
  try {
    payload = jwt.verify(hubToken, HUB_AUTH_JWT_SECRET)
  } catch (err) {
    if (err?.name === 'TokenExpiredError') throw fail(401, 'Your Emami Apps session has expired. Please sign in to Emami Apps again.')
    // Anything but expiry means this server's secret doesn't match the hub that signed the token -
    // signing in again can't fix that, so say so.
    console.error(`[auth] hub token rejected: ${err?.name}: ${err?.message}`)
    throw fail(401, `Couldn't verify your Emami Apps session (${err?.message || 'invalid token'}). Please contact IT.`)
  }
  const email = String(payload?.email || '').trim().toLowerCase()
  if (!email) throw fail(401, 'Invalid Emami Apps session.')

  let hubRole
  try {
    hubRole = await fetchHubRole(email, req)
  } catch (err) {
    console.error('[auth] role lookup failed for', email, err.message)
    throw fail(502, 'Could not check your access in Manage Access. Please try again.')
  }
  const role = appRoleFor(hubRole)
  if (!role) throw fail(403, "You don't have access to Rate Auction. Ask your Emami Apps admin to grant it in Manage Access.")
  return { email, role, token: issueSession(email, role) }
}

/** Reads this app's session token from `Authorization: Bearer` or, for the SSE stream (EventSource
 * cannot send headers), from `?token=`. Puts { email, role } on req.session. */
export function requireSession(req, res, next) {
  const header = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')
  const token = header ? header[1].trim() : String(req.query.token || '')
  if (!token) return res.status(401).json({ ok: false, error: 'Not signed in.' })
  try {
    const p = jwt.verify(token, SESSION_JWT_SECRET)
    req.session = { email: p.email, role: p.role }
    next()
  } catch {
    res.status(401).json({ ok: false, error: 'Your session has expired. Please reload the page.' })
  }
}

export function requireAdmin(req, res, next) {
  if (req.session?.role !== 'admin') return res.status(403).json({ ok: false, error: 'Admins only.' })
  next()
}
