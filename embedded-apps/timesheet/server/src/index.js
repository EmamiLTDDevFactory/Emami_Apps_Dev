import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { pool } from './db/pool.js'
import { requireAuth } from './middleware/auth.js'
import authRouter from './routes/auth.js'
import usersRouter from './routes/users.js'
import projectsRouter from './routes/projects.js'
import tasksRouter from './routes/tasks.js'
import assignmentsRouter from './routes/assignments.js'
import teamSettingsRouter from './routes/teamSettings.js'
import timesheetsRouter from './routes/timesheets.js'
import leaveBalancesRouter from './routes/leaveBalances.js'
import workingDayOverridesRouter from './routes/workingDayOverrides.js'

const app = express()

// Restricted like embedded-apps/audit-capa/backend/server.js's CORS setup, not a bare
// app.use(cors()) — this server will sit on the same always-on internal machine as that backend,
// publicly reachable, so it shouldn't accept requests from arbitrary origins.
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true)
    else callback(new Error(`Origin ${origin} not allowed by CORS`))
  },
}))
app.use(express.json())

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ ok: true, db: 'connected' })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Unauthenticated - this IS the login step that hands out the session token every other route
// below requires (see middleware/auth.js).
app.use('/api/auth', authRouter)

// Every route below here requires a valid session token - proof the caller is who they claim to
// be, instead of the API trusting whatever id a request body happens to name.
app.use('/api/users', requireAuth, usersRouter)
app.use('/api/projects', requireAuth, projectsRouter)
app.use('/api/tasks', requireAuth, tasksRouter)
app.use('/api/assignments', requireAuth, assignmentsRouter)
app.use('/api/team-settings', requireAuth, teamSettingsRouter)
app.use('/api/timesheets', requireAuth, timesheetsRouter)
app.use('/api/leave-balances', requireAuth, leaveBalancesRouter)
app.use('/api/working-day-overrides', requireAuth, workingDayOverridesRouter)

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: err.message || 'Internal server error' })
})

const port = process.env.PORT || 4000
app.listen(port, () => console.log(`TimeSheet API listening on http://localhost:${port}`))
