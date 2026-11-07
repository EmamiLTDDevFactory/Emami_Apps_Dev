'use strict';
/*
   v7 Phase 3 demo data on the dev backend server (needs migration 7.2-workspaces and, for the desks, `load-v7` first).
   Run on 172.17.2.21 with:  bash ~/samadhan-demo/run.sh load-v7-apps      (remove with:  bash ~/samadhan-demo/run.sh remove)

   - The demo groups belong to their service desk (SAP / Infra & IT / Digital Apps) and the demo-v7 tickets get the
     matching application (SAP-..., NET-..., HUB-... references); Secondary Sales demo tickets keep what the backfill gave.
   - Mail-style demo tickets classified by the real engine: a subject tag, a sender rule, keywords, and a few that
     nothing recognises - so "Needs classification" and the Confirm / Change hint have something to show.
   - Two demo sender rules (@demo-vendor.example, @demo-plant.example) and keyword suggestions in the learning table.
   - The desks themselves stay OFF (Admin > Service desks switches them on for UAT); nothing outside Samadhan changes.
   Everything is tagged / recorded (settings 'demo.v7apps.manifest') so remove-demo.js deletes exactly it.
*/
const APP = process.env.SAMADHAN_APP_DIR || process.env.SETU_APP_DIR || '/home/emamiadmin/apps/emami-apps-hub-backend-dev';
require(`${APP}/node_modules/dotenv`).config({ path: `${APP}/.env`, quiet: true });
const { pool, resolveSchema, sharedPool } = require(`${APP}/samadhan/db/pool`);
require(`${APP}/notifications`).notify = async () => null;
const { createTicket } = require(`${APP}/samadhan/lib/tickets`);
const { textToHtml } = require(`${APP}/samadhan/lib/util`);

const DOMAIN = 'demo.samadhan.local';
const TAGS = ['demo', 'demo-v7', 'demo-v7-apps'];
// Demo group -> desk, and category / function -> application code.
const GROUP_DESK = { 'SAP Functional (demo)': 'SAP', 'SAP Basis & Security (demo)': 'SAP', 'Infrastructure (demo)': 'INFRA_IT', 'Digital Apps (demo)': 'DIGITAL_APPS' };
const APP_FOR = (category, fn) => {
    if (/^SAP/.test(category ?? '')) return 'SAP';
    if (category === 'IT Infrastructure') return { 'VPN not connecting': 'NET', 'Network down at depot': 'NET', 'Outlook / mailbox': 'M365', 'Laptop / desktop issue': 'EUC', 'Printer not working': 'EUC' }[fn] ?? 'INFRA';
    if (category === 'Digital Apps') return { 'Hub login issue': 'HUB', 'Report not loading': 'HUB', 'App access request': 'HUB', 'Mobile app crash': 'CUST' }[fn] ?? 'CUST';
    return null;
};
const MAILS = [
    ['[DMS] Scheme credit not posted for October', 'Distributor says the scheme credit note is missing.', `accounts@demo-dist.example`],
    ['VPN keeps dropping every 10 minutes', 'Working from the depot, the VPN disconnects.', `depot.it@${DOMAIN}`],
    ['Short dump in ST22 while saving billing', 'Dump TIME_OUT in program SAPMV60A.', `sd.user@${DOMAIN}`],
    ['Need help please', 'Something is not working since morning, please call.', `someone@${DOMAIN}`],
    ['Issue with the new update', 'After the update the screen looks different and orders are missing.', `field.user@${DOMAIN}`],
    ['Laptop battery swelling', 'Battery is swollen, laptop does not close.', `ops@demo-plant.example`],
    ['Invoices pending approval', 'Vendor invoices are not moving, please check.', `billing@demo-vendor.example`],
];

async function main() {
    await resolveSchema();
    const c = await pool.query(`SELECT to_regclass('samadhan.applications') AS t`);
    if (!c.rows[0].t) throw new Error('Migration 7.2-workspaces has not run on this database yet - deploy the Phase 3 backend first.');
    const already = await pool.query(`SELECT 1 FROM samadhan.settings WHERE key = 'demo.v7apps.manifest'`);
    if (already.rows.length) { console.log('Phase 3 demo data is already loaded. Run "remove" first to reload.'); return; }
    const manifest = { ruleIds: [], groupIds: [] };
    const apps = Object.fromEntries((await pool.query('SELECT id, code, "workspaceId" FROM samadhan.applications')).rows.map((a) => [a.code, a]));
    const ws = Object.fromEntries((await pool.query('SELECT id, key FROM samadhan.workspaces')).rows.map((w) => [w.key, w.id]));

    // Demo groups belong to their desk.
    for (const [name, key] of Object.entries(GROUP_DESK)) {
        const { rows } = await pool.query('UPDATE samadhan.groups SET "workspaceId" = $2 WHERE name = $1 AND "workspaceId" IS NULL RETURNING id', [name, ws[key]]);
        manifest.groupIds.push(...rows.map((r) => r.id));
    }
    // demo-v7 tickets: application from their category / function (manual = an agent set it).
    const tickets = (await pool.query(`SELECT id, category, "function" FROM samadhan.tickets WHERE 'demo-v7' = ANY(tags)`)).rows;
    let moved = 0;
    for (const t of tickets) {
        const code = APP_FOR(t.category, t.function);
        if (!code || !apps[code]) continue;
        await pool.query('UPDATE samadhan.tickets SET "applicationId" = $2, "workspaceId" = $3, "classificationSource" = \'manual\', "classificationConfidence" = NULL WHERE id = $1',
            [t.id, apps[code].id, apps[code].workspaceId]);
        moved++;
    }
    // Sender rules (demo domains only).
    for (const [pattern, code] of [['demo-vendor.example', 'SAP'], ['demo-plant.example', 'EUC']]) {
        const { rows } = await pool.query(
            `INSERT INTO samadhan.mail_sender_rules (kind, pattern, "applicationId", note, "createdBy") VALUES ('domain', $1, $2, 'demo', $3) ON CONFLICT DO NOTHING RETURNING id`,
            [pattern, apps[code].id, `admin.demo@${DOMAIN}`]);
        manifest.ruleIds.push(...rows.map((r) => r.id));
    }
    // Mail-style tickets through the real classification (desks off = only Secondary Sales apps are picked).
    const made = [];
    for (const [subject, body, from] of MAILS) {
        const t = await createTicket({
            subject, description: textToHtml(body), requester: { email: from, name: `${from.split('@')[0]} (demo)` }, source: 'Email',
            createdAt: new Date(Date.now() - (made.length + 1) * 40 * 60_000), fields: { tags: TAGS },
        });
        made.push(`${t.ref} (${t.classificationSource})`);
    }
    // Keyword suggestions an Admin can accept (Admin > Mail classification).
    for (const [code, kw, hits] of [['DMS', 'scheme', 5], ['DMS', 'credit', 4], ['NET', 'disconnects', 3], ['EUC', 'battery', 3]]) {
        await pool.query(`INSERT INTO samadhan.classification_learning ("applicationId", keyword, hits) VALUES ($1, $2, $3)
                          ON CONFLICT ("applicationId", keyword) DO UPDATE SET hits = GREATEST(samadhan.classification_learning.hits, EXCLUDED.hits)`, [apps[code].id, kw, hits]);
    }
    manifest.learning = [['DMS', 'scheme'], ['DMS', 'credit'], ['NET', 'disconnects'], ['EUC', 'battery']];
    await pool.query(`INSERT INTO samadhan.settings (key, value) VALUES ('demo.v7apps.manifest', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(manifest)]);
    await pool.query(`DELETE FROM samadhan.ai_insights WHERE key = 'dashboard'`);
    console.log(`Phase 3 demo data loaded: ${moved} demo tickets moved to their desk's application, ${manifest.groupIds.length} demo groups linked to their desk, `
        + `${manifest.ruleIds.length} sender rules, ${made.length} mail tickets: ${made.join(', ')}.`);
}

main()
    .catch((e) => { console.error('\nERROR:', e.message); process.exitCode = 1; })
    .finally(() => new Promise((r) => setTimeout(r, 1500)).then(() => sharedPool.end()).then(() => process.exit()));
