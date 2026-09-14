import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { pool } from '../db/pool.js'

const router = Router()

function mapTask(row) {
  return { id: row.id, projectId: row.project_id, name: row.name }
}

router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tasks ORDER BY name')
    res.json(rows.map(mapTask))
  } catch (err) {
    next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const { projectId, name } = req.body
    if (!projectId || !name?.trim()) return res.status(400).json({ error: 'projectId and name are required' })
    const id = `t_${randomUUID()}`
    await pool.query('INSERT INTO tasks (id, project_id, name) VALUES ($1, $2, $3)', [id, projectId, name.trim()])
    res.status(201).json({ id, projectId, name: name.trim() })
  } catch (err) {
    next(err)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' })
    const { rows } = await pool.query('UPDATE tasks SET name = $1 WHERE id = $2 RETURNING *', [name.trim(), req.params.id])
    if (!rows[0]) return res.status(404).json({ error: 'Task not found' })
    res.json(mapTask(rows[0]))
  } catch (err) {
    next(err)
  }
})

// Dropping the task from every user's assignments happens automatically via
// ON DELETE CASCADE on assignments.task_id.
router.delete('/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM tasks WHERE id = $1', [req.params.id])
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

export default router
