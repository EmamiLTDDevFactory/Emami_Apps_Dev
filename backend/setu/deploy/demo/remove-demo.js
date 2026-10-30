'use strict';
/*
   Removes exactly what load-demo.js added to Setu on the dev backend server - nothing else.
   Run on 172.17.2.21 with:  bash ~/setu-demo/run.sh remove
*/
const APP = process.env.SETU_APP_DIR || '/home/emamiadmin/apps/emami-apps-hub-backend-dev';
require(`${APP}/node_modules/dotenv`).config({ path: `${APP}/.env`, quiet: true });
const { pool } = require(`${APP}/db`);

const DOMAIN = '%@demo.setu.local';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tickets = await client.query(`DELETE FROM setu.tickets WHERE 'demo' = ANY(tags) RETURNING id`); // conversations, activities, time logs cascade
    await client.query(`DELETE FROM setu.ai_insights WHERE key = 'dashboard' OR key = ANY($1)`, [tickets.rows.map((r) => `ticket:${r.id}`)]);
    const contacts = await client.query(`DELETE FROM setu.contacts c WHERE c.email LIKE $1 AND NOT EXISTS (SELECT 1 FROM setu.tickets t WHERE t."requesterId" = c.id)`, [DOMAIN]);
    // Demo-less requesters without email that only demo tickets used
    await client.query(`DELETE FROM setu.contacts c WHERE c.name LIKE '%(demo)' AND c.email IS NULL AND NOT EXISTS (SELECT 1 FROM setu.tickets t WHERE t."requesterId" = c.id)`);
    const agents = await client.query(
      `DELETE FROM setu.agents a WHERE a.email LIKE $1
         AND NOT EXISTS (SELECT 1 FROM setu.tickets t WHERE t."agentId" = a.id)
         AND NOT EXISTS (SELECT 1 FROM setu.conversations c WHERE c."agentId" = a.id)
         AND NOT EXISTS (SELECT 1 FROM setu.activities x WHERE x."actorAgentId" = a.id)`, [DOMAIN],
    );
    const dists = await client.query(`DELETE FROM setu.distributors WHERE code LIKE 'DEMO-%'`);
    const canned = await client.query(`DELETE FROM setu.canned_responses WHERE folder = 'Demo'`);
    const m = (await client.query(`SELECT value FROM setu.settings WHERE key = 'demo.manifest'`)).rows[0]?.value || { choiceIds: [], severityRuleIds: [] };
    // Children first (functions under a category), then parents; ON DELETE CASCADE covers the rest.
    const choices = await client.query('DELETE FROM setu.field_choices WHERE id = ANY($1::int[])', [m.choiceIds || []]);
    const rules = await client.query('DELETE FROM setu.severity_rules WHERE id = ANY($1::int[])', [m.severityRuleIds || []]);
    await client.query(`DELETE FROM setu.settings WHERE key = 'demo.manifest'`);
    // Hub inbox rows the demo created for the demo agents (addresses nobody owns)
    const notes = await client.query(`DELETE FROM emami_apps.notifications WHERE app_id = 'setu' AND email LIKE $1`, [DOMAIN]);
    await client.query('COMMIT');
    console.log(`Removed: ${tickets.rowCount} demo tickets, ${contacts.rowCount} demo contacts, ${agents.rowCount} demo agents, ${dists.rowCount} demo distributors, ${canned.rowCount} demo canned replies, ${choices.rowCount} field choices and ${rules.rowCount} severity rules added by the demo, ${notes.rowCount} demo notifications.`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

main()
  .catch((e) => { console.error('ERROR (nothing was removed):', e.message); process.exitCode = 1; })
  .finally(() => new Promise((r) => setTimeout(r, 1500)).then(() => pool.end()).then(() => process.exit()));
