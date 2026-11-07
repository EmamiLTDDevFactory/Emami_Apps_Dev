'use strict';
/*
   v7 Phase 6 demo data on the dev backend server (needs migration 7.6-change and `load-v7-apps` first).
   Run on 172.17.2.21 with:  bash ~/samadhan-demo/run.sh load-v7-change      (remove with:  bash ~/samadhan-demo/run.sh remove)

   - A month-end FREEZE window for the SAP desk and a Saturday MAINTENANCE window (note 'demo'; remove-demo.js deletes them).
   - Up to 6 demo SAP tickets become changes: a plan on the calendar (type, risk, window) and transports at different stages.
   - Up to 3 demo tickets become access requests with a running approval (role owner / IT Security), so My approvals shows them.
   Only tickets tagged 'demo' are touched; the rest goes with the tickets (ON DELETE CASCADE).
*/
const APP = process.env.SAMADHAN_APP_DIR || '/home/emamiadmin/apps/emami-apps-hub-backend-dev';
require(`${APP}/node_modules/dotenv`).config({ path: `${APP}/.env`, quiet: true });
const { pool, resolveSchema, sharedPool } = require(`${APP}/samadhan/db/pool`);

const DAY = 86_400_000;
const at = (days, hour) => { const d = new Date(Date.now() + days * DAY); d.setUTCHours(hour - 5, 30, 0, 0); return d; }; // IST hour
const TRS = [['Imported to PRD', 0, 'Tested OK'], ['Approved for PRD', null, 'Tested OK'], ['Tested OK in QAS', null, 'Tested OK'], ['Imported to QAS', null, null], ['Released', null, null], ['Failed (RC ≥ 8)', 8, null]];

async function main() {
    await resolveSchema();
    const c = await pool.query(`SELECT to_regclass('samadhan.ticket_transports') AS t`);
    if (!c.rows[0].t) throw new Error('Migration 7.6-change has not run on this database yet - deploy the Phase 6 backend first.');
    if ((await pool.query(`SELECT 1 FROM samadhan.change_windows WHERE note = 'demo'`)).rows.length) { console.log('The Phase 6 demo is already loaded. Run "remove" first to reload.'); return; }
    const ws = Object.fromEntries((await pool.query('SELECT id, key FROM samadhan.workspaces')).rows.map((r) => [r.key, r.id]));
    const now = new Date();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const daysToEnd = Math.max(2, Math.round((monthEnd - now) / DAY));
    await pool.query(`INSERT INTO samadhan.change_windows (kind, name, "workspaceId", "startsAt", "endsAt", note) VALUES ('FREEZE', 'Month-end close', $1, $2, $3, 'demo'), ('MAINTENANCE', 'Saturday patching', NULL, $4, $5, 'demo')`,
        [ws.SAP ?? null, at(daysToEnd - 2, 0), at(daysToEnd + 2, 0), at(6 - now.getDay() || 7, 22), at((6 - now.getDay() || 7) + 1, 4)]);
    const sap = (await pool.query(
        `SELECT t.id FROM samadhan.tickets t JOIN samadhan.workspaces w ON w.id = t."workspaceId" WHERE 'demo' = ANY(t.tags) AND w.key = 'SAP'
           AND NOT EXISTS (SELECT 1 FROM samadhan.ticket_change_details d WHERE d."ticketId" = t.id) ORDER BY t.id DESC LIMIT 9`)).rows.map((r) => r.id);
    let changes = 0;
    for (const [i, id] of sap.slice(0, 6).entries()) {
        await pool.query(`UPDATE samadhan.tickets SET "recordClass" = 'CHANGE' WHERE id = $1`, [id]);
        await pool.query(`INSERT INTO samadhan.ticket_change_details ("ticketId", "changeType", "changeRisk", "plannedStart", "plannedEnd", "implementationPlan", "backoutPlan")
                          VALUES ($1, $2, $3, $4, $5, 'Import the transports in STMS, run the smoke test.', 'Re-import the previous version.')`,
        [id, ['Normal', 'Standard', 'Emergency'][i % 3], ['Medium', 'Low', 'High'][i % 3], at(i * 2 - 3, 19), at(i * 2 - 3, 21)]);
        const [status, rc, tested] = TRS[i];
        await pool.query(`INSERT INTO samadhan.ticket_transports ("ticketId", "trNumber", description, "trType", owner, "sourceSystem", status, "returnCode", "testedOkBy", "approvedForPrdBy", "importedQasAt", "importedPrdAt")
                          VALUES ($1, $2, 'Demo transport', 'Workbench', 'Demo consultant', 'ECD', $3, $4, $5, $6, now() - interval '2 days', $7) ON CONFLICT DO NOTHING`,
        [id, `ECDK9${String(10100 + i).padStart(5, '0')}`, status, rc, tested ? 'Demo tester' : null, ['Imported to PRD', 'Approved for PRD'].includes(status) ? 'Demo module lead' : null, status === 'Imported to PRD' ? new Date() : null]);
        changes++;
    }
    const chain = (await pool.query(`SELECT id, steps FROM samadhan.approval_chains WHERE "seedKey" = '7.6:ACCESS'`)).rows[0];
    let access = 0;
    for (const id of chain ? sap.slice(6, 9) : []) {
        await pool.query(`UPDATE samadhan.tickets SET "recordClass" = 'ACCESS_REQUEST' WHERE id = $1`, [id]);
        const steps = chain.steps;
        for (const [i, s] of steps.entries()) {
            await pool.query(`INSERT INTO samadhan.ticket_approvals ("ticketId", "chainId", round, "stepNo", "stepName", "approverType", "approverEmail", state, decision, "decidedAt", "decidedBy", "dueAt")
                              VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [id, chain.id, i + 1, s.name, s.type, s.type === 'manager' ? 'manager.demo@demo.samadhan.local' : null, i === 0 ? 'Approved' : i === 1 ? 'Pending' : 'Waiting',
                i === 0 ? 'Approved' : null, i === 0 ? new Date() : null, i === 0 ? 'manager.demo@demo.samadhan.local' : null, i === 1 ? new Date(Date.now() + 2 * DAY) : null]);
        }
        await pool.query(`UPDATE samadhan.tickets SET "statusId" = 100 WHERE id = $1 AND EXISTS (SELECT 1 FROM samadhan.ticket_statuses WHERE id = 100)`, [id]);
        access++;
    }
    console.log(`Phase 6 demo data loaded: 2 change windows, ${changes} planned changes with transports, ${access} access requests awaiting approval.`);
}

main()
    .catch((e) => { console.error('\nERROR:', e.message); process.exitCode = 1; })
    .finally(() => new Promise((r) => setTimeout(r, 1500)).then(() => sharedPool.end()).then(() => process.exit()));
