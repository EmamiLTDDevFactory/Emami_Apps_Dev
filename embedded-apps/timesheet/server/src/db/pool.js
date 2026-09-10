import pg from 'pg'
import 'dotenv/config'

const { Pool } = pg

// By default pg parses DATE columns into a JS Date at local midnight, then
// callers do .toISOString() (UTC) to format it - in a timezone ahead of UTC
// (e.g. IST) that rolls the calendar date back by one day. DATE has no time
// component, so keep it as the raw 'YYYY-MM-DD' string Postgres sends and
// skip Date entirely. OID 1082 = date.
pg.types.setTypeParser(1082, (val) => val)

export const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  // Scopes every connection to our own schema first, so unqualified table
  // names in queries resolve there and never collide with other apps'
  // tables (e.g. audit-capa) living in the same shared database.
  options: '-c search_path=timesheet',
})

export async function query(text, params) {
  return pool.query(text, params)
}
