import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { pool } from '../db/pool.js'

const router = Router()

router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM projects ORDER BY name')
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' })
    const id = `p_${randomUUID()}`
    await pool.query('INSERT INTO projects (id, name) VALUES ($1, $2)', [id, name.trim()])
    res.status(201).json({ id, name: name.trim() })
  } catch (err) {
    next(err)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' })
    const { rows } = await pool.query('UPDATE projects SET name = $1 WHERE id = $2 RETURNING *', [name.trim(), req.params.id])
    if (!rows[0]) return res.status(404).json({ error: 'Project not found' })
    res.json(rows[0])
  } catch (err) {
    next(err)
  }
})

// Deleting a project also removes its tasks (ON DELETE CASCADE) and, with
// them, any assignments referencing those tasks.
router.delete('/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM projects WHERE id = $1', [req.params.id])
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

export default router
