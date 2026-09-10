// Read-only check: confirms the connection works and lists what already
// exists in the database, so we never create the "timesheet" schema blind
// or collide with another project's tables.
import { pool } from './pool.js'

async function introspect() {
  const { rows: schemas } = await pool.query(
    `SELECT schema_name FROM information_schema.schemata
     WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
     ORDER BY schema_name`,
  )
  console.log('Schemas found:', schemas.map((s) => s.schema_name).join(', ') || '(none)')

  const { rows: tables } = await pool.query(
    `SELECT table_schema, table_name FROM information_schema.tables
     WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
     ORDER BY table_schema, table_name`,
  )
  if (tables.length === 0) {
    console.log('No tables found outside pg_catalog/information_schema.')
  } else {
    console.log('Existing tables:')
    for (const t of tables) console.log(`  - ${t.table_schema}.${t.table_name}`)
  }

  await pool.end()
}

introspect().catch((err) => {
  console.error('Connection/introspection failed:', err.message)
  process.exit(1)
})
