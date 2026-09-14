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

// Replaces a user's full assignment list.
router.put('/:userId', async (req, res, next) => {
  const { taskIds } = req.body
  if (!Array.isArray(taskIds)) return res.status(400).json({ error: 'taskIds must be an array' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
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
