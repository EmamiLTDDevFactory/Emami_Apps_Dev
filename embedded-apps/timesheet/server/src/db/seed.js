// Seeds the database with the same demo data the frontend currently ships in
// src/data/mockData.js, so the DB starts out matching what's already on
// screen. mockData.js has no React dependency, so it's safe to reuse here.
import { seedState } from '../../../src/data/mockData.js'
import { pool } from './pool.js'

function timeOrNull(v) {
  return v ? v : null
}

async function seed() {
  const state = seedState()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await client.query(
      'TRUNCATE timesheet_history, timesheet_entries, timesheets, assignments, tasks, projects, users RESTART IDENTITY CASCADE',
    )

    for (const u of state.users) {
      await client.query(
        'INSERT INTO users (id, name, email, role, manager_id) VALUES ($1, $2, $3, $4, $5)',
        [u.id, u.name, u.email, u.role, u.managerId],
      )
    }

    for (const p of state.projects) {
      await client.query('INSERT INTO projects (id, name) VALUES ($1, $2)', [p.id, p.name])
    }

    for (const t of state.tasks) {
      await client.query('INSERT INTO tasks (id, project_id, name) VALUES ($1, $2, $3)', [t.id, t.projectId, t.name])
    }

    for (const [userId, taskIds] of Object.entries(state.assignments)) {
      for (const taskId of taskIds) {
        await client.query('INSERT INTO assignments (user_id, task_id) VALUES ($1, $2)', [userId, taskId])
      }
    }

    await client.query('UPDATE team_settings SET deadline_days_after_month_end = $1', [
      state.teamSettings.deadlineDaysAfterMonthEnd,
    ])

    for (const ts of state.timesheets) {
      await client.query(
        'INSERT INTO timesheets (id, user_id, month_start_date, status, manager_comment) VALUES ($1, $2, $3, $4, $5)',
        [ts.id, ts.userId, ts.monthStartDate, ts.status, ts.managerComment],
      )

      for (const h of ts.history) {
        await client.query(
          'INSERT INTO timesheet_history (timesheet_id, status, occurred_at, comment, action) VALUES ($1, $2, $3, $4, $5)',
          [ts.id, h.status, h.date, h.comment, h.action || null],
        )
      }

      for (const e of ts.entries) {
        await client.query(
          `INSERT INTO timesheet_entries
             (id, timesheet_id, user_id, project_id, task_id, entry_date, in_time, out_time, hours, note, leave_type, location, location_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            e.id,
            ts.id,
            e.userId,
            e.projectId,
            e.taskId,
            e.date,
            timeOrNull(e.inTime),
            timeOrNull(e.outTime),
            e.hours,
            e.note || null,
            e.leaveType || null,
            e.location || null,
            e.locationAt || null,
          ],
        )
      }
    }

    await client.query('COMMIT')
    console.log('Seed complete.')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err.message)
  process.exit(1)
})
