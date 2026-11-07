'use strict';
/*
   v7 Phase 7 demo data on the dev backend server (needs migration 7.7-problem and `load-v7-it` first).
   Run on 172.17.2.21 with:  bash ~/samadhan-demo/run.sh load-v7-problem      (remove with:  bash ~/samadhan-demo/run.sh remove)

   - One demo SAP ticket becomes a major incident (bridge link, next update due) and one resolved demo ticket gets a reviewed PIR.
   - A problem record links 3 demo Infra incidents and is published as a known error (workaround in the KEDB).
   - Problem-candidate detection runs, so "Possible problems" has something to show when the demo has repeats.
   Only tickets tagged 'demo' are touched; the problem ticket is tagged 'demo' too, so remove-demo.js deletes everything.
*/
const APP = process.env.SAMADHAN_APP_DIR || '/home/emamiadmin/apps/emami-apps-hub-backend-dev';
require(`${APP}/node_modules/dotenv`).config({ path: `${APP}/.env`, quiet: true });
const { pool, resolveSchema, sharedPool } = require(`${APP}/samadhan/db/pool`);
require(`${APP}/notifications`).notify = async () => null;
const pr = require(`${APP}/samadhan/lib/problem`);

async function main() {
    await resolveSchema();
    const c = await pool.query(`SELECT to_regclass('samadhan.problem_details') AS t`);
    if (!c.rows[0].t) throw new Error('Migration 7.7-problem has not run on this database yet - deploy the Phase 7 backend first.');
    if ((await pool.query(`SELECT 1 FROM samadhan.tickets WHERE 'demo-v7-problem' = ANY(tags) AND "recordClass" = 'PROBLEM'`)).rows.length) { console.log('The Phase 7 demo is already loaded. Run "remove" first to reload.'); return; }
    const majorDone = (await pool.query(`SELECT 1 FROM samadhan.tickets WHERE 'demo-v7-problem' = ANY(tags)`)).rows.length > 0;
    const pick = async (desk, resolved, n) => (await pool.query(
        `SELECT t.id FROM samadhan.tickets t JOIN samadhan.workspaces w ON w.id = t."workspaceId" JOIN samadhan.ticket_statuses s ON s.id = t."statusId"
         WHERE 'demo' = ANY(t.tags) AND w.key = $1 AND s."isResolved" = $2 AND NOT t."isMajorIncident" AND t."problemId" IS NULL AND COALESCE(t."recordClass", 'INCIDENT') = 'INCIDENT'
         ORDER BY t.id DESC LIMIT $3`, [desk, resolved, n])).rows.map((r) => r.id);
    const [open] = majorDone ? [] : await pick('SAP', false, 1);
    if (open) {
        await pr.declareMajor(open, { bridgeUrl: 'https://teams.microsoft.com/l/meetup-join/demo', note: 'Order creation failing for all plants (demo).' });
        await pool.query(`UPDATE samadhan.tickets SET tags = array_append(tags, 'demo-v7-problem') WHERE id = $1`, [open]);
    }
    const [done] = majorDone ? [] : await pick('SAP', true, 1);
    if (done) {
        await pool.query(`UPDATE samadhan.tickets SET "isMajorIncident" = false, "majorDeclaredAt" = "createdAt" + interval '10 minutes' WHERE id = $1`, [done]);
        await pr.savePir(done, { summary: 'Invoices could not be posted for 45 minutes (demo).', rootCause: 'A pricing condition was deleted by a customizing transport.', rootCauseCategory: 'Configuration',
            timeline: '09:10 first calls\n09:20 major incident declared\n09:55 condition restored\n10:05 confirmed', correctiveActions: 'Restore the condition record', preventiveActions: 'Peer review for pricing transports', reviewed: true }, { name: 'Demo reviewer' });
    }
    const infra = await pick('INFRA_IT', false, 3);
    let probRef = '';
    if (infra.length) {
        const agent = (await pool.query(`SELECT id, name, email FROM samadhan.agents WHERE email LIKE '%demo.samadhan.local' AND active ORDER BY id LIMIT 1`)).rows[0] ?? null;
        const p = await pr.createProblem(infra, { subject: 'Problem: intermittent VPN disconnects at depots (demo)' }, agent);
        await pool.query(`UPDATE samadhan.tickets SET tags = ARRAY['demo', 'demo-v7', 'demo-v7-problem'] WHERE id = $1`, [p.id]);
        await pr.saveKnownError(p.id, { status: 'Known error', knownError: true, symptom: 'VPN drops every 10-15 minutes on depot broadband', workaround: 'Switch to the backup VPN gateway (vpn2) in the client', rootCause: 'MTU mismatch on the depot firewall profile' }, agent);
        probRef = p.ref;
    }
    const cands = await pr.detectCandidates();
    console.log(`Phase 7 demo data loaded: ${open ? 1 : 0} major incident, ${done ? 1 : 0} reviewed PIR, problem ${probRef || 'none'} with ${infra.length} incidents (known error), ${cands} new problem candidates.`);
}

main()
    .catch((e) => { console.error('\nERROR:', e.message); process.exitCode = 1; })
    .finally(() => new Promise((r) => setTimeout(r, 1500)).then(() => sharedPool.end()).then(() => process.exit()));
