import { Router } from 'express'
import { pool } from '../db/pool.js'

const router = Router()

// Returns { userId: [taskId, ...] } for every user, matching the shape
// AppContext keeps in state.assignments.
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT user_id, task_id FROM assignments')
    const byUser = {}
    for (const r of rows) {
      byUser[r.user_id] = byUser[r.user_id] || []
      byUser[r.user_id].push(r.task_id)
    }
    res.json(byUser)
  } catch (err) {
    next(err)
  }
})

// Replaces a user's full assignment list. Only that user's manager can do it, and only with
// tasks from their own projects - a task already assigned (e.g. from before projects had owners)
// may stay, but nothing new can be added from another manager's projects.
router.put('/:userId', async (req, res, next) => {
  const { taskIds } = req.body
  if (!Array.isArray(taskIds)) return res.status(400).json({ error: 'taskIds must be an array' })
  if (req.user.role !== 'manager') return res.status(403).json({ error: 'Only managers can assign tasks' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: target } = await client.query('SELECT manager_id FROM users WHERE id = $1', [req.params.userId])
    if (target[0]?.manager_id !== req.user.userId) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'You can only assign tasks to your own team.' })
    }
    const { rows: current } = await client.query('SELECT task_id FROM assignments WHERE user_id = $1', [req.params.userId])
    const added = [...new Set(taskIds.filter((id) => !current.some((r) => r.task_id === id)))]
    if (added.length) {
      const { rows: own } = await client.query(
        'SELECT t.id FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = ANY($1) AND p.manager_id = $2',
        [added, req.user.userId],
      )
      if (own.length !== added.length) {
        await client.query('ROLLBACK')
        return res.status(403).json({ error: 'You can only assign tasks from your own projects.' })
      }
    }
    await client.query('DELETE FROM assignments WHERE user_id = $1', [req.params.userId])
    for (const taskId of taskIds) {
      await client.query('INSERT INTO assignments (user_id, task_id) VALUES ($1, $2)', [req.params.userId, taskId])
    }
    await client.query('COMMIT')
    res.json({ userId: req.params.userId, taskIds })
  } catch (err) {
    await client.query('ROLLBACK')
    next(err)
  } finally {
    client.release()
  }
})

export default router
