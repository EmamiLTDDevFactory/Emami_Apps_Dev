import { Router } from 'express'
import { pool } from '../db/pool.js'

const router = Router()

// The fixed list of vendor companies for Manage Team's vendor dropdown - see schema.sql for
// where these 4 rows are seeded. Read-only from the client; these aren't managed in the UI.
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT code, name FROM vendors ORDER BY name')
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

export default router
