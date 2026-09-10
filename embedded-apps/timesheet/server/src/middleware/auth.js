import jwt from 'jsonwebtoken'

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

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Not signed in.' })
  try {
    const payload = jwt.verify(token, SESSION_JWT_SECRET)
    req.user = { userId: payload.userId, email: payload.email, role: payload.role }
    next()
  } catch {
    res.status(401).json({ error: 'Your session has expired. Please refresh the page.' })
  }
}
