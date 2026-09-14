import { Router } from 'express'
import { pool } from '../db/pool.js'

const router = Router()

router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT deadline_days_after_month_end FROM team_settings WHERE id = TRUE')
    res.json({ deadlineDaysAfterMonthEnd: rows[0]?.deadline_days_after_month_end ?? 2 })
  } catch (err) {
    next(err)
  }
})

router.put('/', async (req, res, next) => {
  try {
    const { deadlineDaysAfterMonthEnd } = req.body
    if (!Number.isInteger(deadlineDaysAfterMonthEnd)) {
      return res.status(400).json({ error: 'deadlineDaysAfterMonthEnd must be an integer' })
    }
    await pool.query('UPDATE team_settings SET deadline_days_after_month_end = $1 WHERE id = TRUE', [deadlineDaysAfterMonthEnd])
    res.json({ deadlineDaysAfterMonthEnd })
  } catch (err) {
    next(err)
  }
})

export default router
