import jwt from 'jsonwebtoken'
import { pool } from '../db/pool.js'

// Timesheet's own session token - separate from the hub's HUB_AUTH_JWT_SECRET (see routes/auth.js),
// issued only after that hub token has already been verified. Every route except POST /auth/hub-login
// requires one, via requireAuth below, so the backend knows who's really calling instead of trusting
// whatever id the request body happens to claim.
const SESSION_JWT_SECRET = process.env.SESSION_JWT_SECRET || ''
const SESSION_EXPIRES_IN = process.env.SESSION_EXPIRES_IN || '30d'

if (!SESSION_JWT_SECRET) {
  console.warn('[auth] SESSION_JWT_SECRET is not set - session tokens cannot be issued or verified.')
}

export function issueSessionToken(user) {
  return jwt.sign({ userId: user.id, email: user.email, role: user.role }, SESSION_JWT_SECRET, {
    expiresIn: SESSION_EXPIRES_IN,
  })
}

// The token only proves WHO is calling. Their role is read fresh from the users table on every
// request - a token lives up to SESSION_EXPIRES_IN (30d), so trusting the role frozen into it
// meant a promotion/demotion (e.g. employee -> manager) didn't apply until the token expired:
// the UI (which reads the users table) showed "Manager" while every manager-only route still
// 403'd on the stale token role.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Not signed in.' })

  let payload
  try {
    payload = jwt.verify(token, SESSION_JWT_SECRET)
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Please refresh the page.' })
  }

  try {
    const { rows } = await pool.query('SELECT id, email, role FROM users WHERE id = $1', [payload.userId])
    if (!rows[0]) return res.status(401).json({ error: 'Your account was not found. Please refresh the page.' })
    req.user = { userId: rows[0].id, email: rows[0].email, role: rows[0].role }
    next()
  } catch (err) {
    next(err)
  }
}
