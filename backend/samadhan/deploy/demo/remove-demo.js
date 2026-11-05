'use strict';
/*
   Removes exactly what load-demo.js added to Samadhan on the dev backend server - nothing else.
   Run on 172.17.2.21 with:  bash ~/samadhan-demo/run.sh remove
*/
const APP = process.env.SAMADHAN_APP_DIR || process.env.SETU_APP_DIR || '/home/emamiadmin/apps/emami-apps-hub-backend-dev';
require(`${APP}/node_modules/dotenv`).config({ path: `${APP}/.env`, quiet: true });
const { pool, resolveSchema, sharedPool } = require(`${APP}/samadhan/db/pool`);

// Demo people: @demo.samadhan.local, and @demo.setu.local from demos loaded before v7 (formerly Setu).
const DOMAINS = ['%@demo.samadhan.local', '%@demo.setu.local'];

async function main() {
  await resolveSchema(); // samadhan, or the legacy setu schema before the v7.0 rename
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tickets = await client.query(`DELETE FROM samadhan.tickets WHERE 'demo' = ANY(tags) RETURNING id`); // conversations, activities, time logs cascade
    await client.query(`DELETE FROM samadhan.ai_insights WHERE key = 'dashboard' OR key = ANY($1)`, [tickets.rows.map((r) => `ticket:${r.id}`)]);
    const contacts = await client.query(`DELETE FROM samadhan.contacts c WHERE c.email LIKE ANY($1::text[]) AND NOT EXISTS (SELECT 1 FROM samadhan.tickets t WHERE t."requesterId" = c.id)`, [DOMAINS]);
    // Demo-less requesters without email that only demo tickets used
    await client.query(`DELETE FROM samadhan.contacts c WHERE c.name LIKE '%(demo)' AND c.email IS NULL AND NOT EXISTS (SELECT 1 FROM samadhan.tickets t WHERE t."requesterId" = c.id)`);
    const agents = await client.query(
      `DELETE FROM samadhan.agents a WHERE a.email LIKE ANY($1::text[])
         AND NOT EXISTS (SELECT 1 FROM samadhan.tickets t WHERE t."agentId" = a.id)
         AND NOT EXISTS (SELECT 1 FROM samadhan.conversations c WHERE c."agentId" = a.id)
         AND NOT EXISTS (SELECT 1 FROM samadhan.activities x WHERE x."actorAgentId" = a.id)`, [DOMAINS],
    );
    const dists = await client.query(`DELETE FROM samadhan.distributors WHERE code LIKE 'DEMO-%'`);
    const canned = await client.query(`DELETE FROM samadhan.canned_responses WHERE folder = 'Demo'`);
    const m = (await client.query(`SELECT value FROM samadhan.settings WHERE key = 'demo.manifest'`)).rows[0]?.value || { choiceIds: [], severityRuleIds: [] };
    // Children first (functions under a category), then parents; ON DELETE CASCADE covers the rest.
    const choices = await client.query('DELETE FROM samadhan.field_choices WHERE id = ANY($1::int[])', [m.choiceIds || []]);
    const rules = await client.query('DELETE FROM samadhan.severity_rules WHERE id = ANY($1::int[])', [m.severityRuleIds || []]);
    await client.query(`DELETE FROM samadhan.settings WHERE key = 'demo.manifest'`);
    // PulseDesk extract (load-pulsedesk.js): its articles and companies. Its tickets, requesters and agents went above
    // (tag demo, @demo.samadhan.local or @demo.setu.local); the configuration values it added are the real Freshdesk set-up and stay.
    const pd = (await client.query(`SELECT value FROM samadhan.settings WHERE key = 'pulsedesk.manifest'`)).rows[0]?.value || { articleIds: [], companyIds: [] };
    const articles = await client.query('DELETE FROM samadhan.articles WHERE id = ANY($1::int[])', [pd.articleIds || []]);
    const companies = await client.query(
      `DELETE FROM samadhan.companies co WHERE co.id = ANY($1::int[])
         AND NOT EXISTS (SELECT 1 FROM samadhan.contacts c WHERE c."companyId" = co.id) AND NOT EXISTS (SELECT 1 FROM samadhan.tickets t WHERE t."companyId" = co.id)`,
      [pd.companyIds || []],
    );
    await client.query(`DELETE FROM samadhan.settings WHERE key = 'pulsedesk.manifest'`);
    // Hub inbox rows the demo created for the demo agents (addresses nobody owns)
    const notes = await client.query(`DELETE FROM emami_apps.notifications WHERE app_id = ANY(ARRAY['samadhan', 'setu']) AND email LIKE ANY($1::text[])`, [DOMAINS]);
    await client.query('COMMIT');
    console.log(`Removed: ${tickets.rowCount} demo tickets, ${contacts.rowCount} demo contacts, ${agents.rowCount} demo agents, ${dists.rowCount} demo distributors, ${canned.rowCount} demo canned replies, ${articles.rowCount} articles and ${companies.rowCount} companies from PulseDesk, ${choices.rowCount} field choices and ${rules.rowCount} severity rules added by the demo, ${notes.rowCount} demo notifications.`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

main()
  .catch((e) => { console.error('ERROR (nothing was removed):', e.message); process.exitCode = 1; })
  .finally(() => new Promise((r) => setTimeout(r, 1500)).then(() => sharedPool.end()).then(() => process.exit()));
