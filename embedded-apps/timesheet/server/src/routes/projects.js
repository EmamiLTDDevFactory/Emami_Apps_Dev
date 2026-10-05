import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { pool } from '../db/pool.js'

const router = Router()

function mapProject(row) {
  return { id: row.id, name: row.name, managerId: row.manager_id || null }
}

// Every project is returned (task names on old timesheets / reports must still resolve), each
// tagged with its owning manager - the Manage Team page only lists the caller's own.
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM projects ORDER BY name')
    res.json(rows.map(mapProject))
  } catch (err) {
    next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    if (req.user.role !== 'manager') return res.status(403).json({ error: 'Only managers can add projects' })
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' })
    const id = `p_${randomUUID()}`
    const { rows } = await pool.query('INSERT INTO projects (id, name, manager_id) VALUES ($1, $2, $3) RETURNING *', [
      id,
      name.trim(),
      req.user.userId,
    ])
    res.status(201).json(mapProject(rows[0]))
  } catch (err) {
    next(err)
  }
})

// Only the owning manager can rename or delete a project.
router.put('/:id', async (req, res, next) => {
  try {
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' })
    const { rows } = await pool.query('UPDATE projects SET name = $1 WHERE id = $2 AND manager_id = $3 RETURNING *', [
      name.trim(),
      req.params.id,
      req.user.userId,
    ])
    if (!rows[0]) return res.status(404).json({ error: 'Project not found' })
    res.json(mapProject(rows[0]))
  } catch (err) {
    next(err)
  }
})

// Deleting a project also removes its tasks (ON DELETE CASCADE) and, with
// them, any assignments referencing those tasks.
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM projects WHERE id = $1 AND manager_id = $2', [req.params.id, req.user.userId])
    if (!rowCount) return res.status(404).json({ error: 'Project not found' })
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

export default router
