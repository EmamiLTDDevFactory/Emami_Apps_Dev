'use strict';
/*
   v7 Phase 4 demo data on the dev backend server (needs migration 7.4-sap and `load-v7-apps` first).
   Run on 172.17.2.21 with:  bash ~/samadhan-demo/run.sh load-v7-sap      (remove with:  bash ~/samadhan-demo/run.sh remove)

   Gives the demo tickets of the SAP desk realistic SAP details (system / client / T-code / message / dump / IDoc),
   SAP for Me cases and vendor tickets with different ages (so the "no update for N days" nudge has something to show),
   and marks one payroll demo ticket confidential. Only tickets tagged 'demo' are touched; SAP details and external
   references are removed with the tickets (ON DELETE CASCADE), so remove-demo.js needs nothing new.
*/
const APP = process.env.SAMADHAN_APP_DIR || '/home/emamiadmin/apps/emami-apps-hub-backend-dev';
require(`${APP}/node_modules/dotenv`).config({ path: `${APP}/.env`, quiet: true });
const { pool, resolveSchema, sharedPool } = require(`${APP}/samadhan/db/pool`);
const { saveSap } = require(`${APP}/samadhan/lib/sap`);

const SAMPLES = [
    { environment: 'Production', sapSystem: 'ECP', sapClient: '500', tcode: 'VA01', errorMessageClass: 'V1', errorMessageNo: '801', errorText: 'Pricing error: mandatory condition ZPR0 is missing', companyCode: '1000', salesOrg: '1000', usersAffected: 12, sapComponent: 'SD-BF-PR' },
    { environment: 'Production', sapSystem: 'ECP', sapClient: '500', tcode: 'VF01', shortDumpId: 'TIME_OUT', programName: 'SAPMV60A', errorText: 'Short dump TIME_OUT while saving the billing document', usersAffected: 4, sapComponent: 'SD-BIL' },
    { environment: 'Production', sapSystem: 'ECP', sapClient: '500', tcode: 'WE02', idocNumber: '0000000048213377', idocMessageType: 'ORDERS', errorText: 'IDoc status 51: application document not posted', sapComponent: 'SD-SLS' },
    { environment: 'Production', sapSystem: 'ECP', sapClient: '500', tcode: 'MIGO', errorMessageClass: 'M7', errorMessageNo: '021', errorText: 'Deficit of SL unrestricted-use stock', plant: '1100', sapComponent: 'MM-IM' },
    { environment: 'Production', sapSystem: 'ECP', sapClient: '500', tcode: 'F110', batchJob: 'Z_FI_PAYMENT_RUN', errorText: 'Payment run cancelled: no valid payment method', companyCode: '1000', sapComponent: 'FI-AP' },
    { environment: 'Quality / Test', sapSystem: 'ECQ', sapClient: '300', tcode: 'SE38', programName: 'ZSD_PRICE_REPORT', errorText: 'Report runs out of memory in quality', sapNotes: ['2399707'], sapComponent: 'BC-ABA' },
    { environment: 'Production', sapSystem: 'ECP', sapClient: '500', tcode: 'SU01', errorText: 'User locked after password attempts', usersAffected: 1, sapComponent: 'BC-SEC' },
    { environment: 'Production', sapSystem: 'ECP', sapClient: '500', tcode: 'PC00_M40_CALC', errorText: 'Payroll simulation stops for one employee group', sapComponent: 'PY-IN' },
];
const REFS = [
    { system: 'SAP for Me Case', ref: '0000412345/2026', priority: 'High', status: 'In Process', days: 3 },
    { system: 'AMS Partner Ticket', ref: 'AMS-55120', priority: 'Medium', status: 'Customer Action', days: 1 },
    { system: 'SAP for Me Case', ref: '0000419876/2026', priority: 'Very High', status: 'Open', days: 0, justification: 'Billing stopped for all depots' },
    { system: 'App Vendor (Salescode.AI, Arteria etc.)', ref: 'SC-20931', priority: 'Medium', status: 'In Process', days: 5 },
];

async function main() {
    await resolveSchema();
    const c = await pool.query(`SELECT to_regclass('samadhan.ticket_sap_details') AS t`);
    if (!c.rows[0].t) throw new Error('Migration 7.4-sap has not run on this database yet - deploy the Phase 4 backend first.');
    const tickets = (await pool.query(
        `SELECT t.id, t.category, t."function" FROM samadhan.tickets t JOIN samadhan.workspaces w ON w.id = t."workspaceId"
         WHERE 'demo' = ANY(t.tags) AND w.key IN ('SAP', 'S4_PROGRAM')
           AND NOT EXISTS (SELECT 1 FROM samadhan.ticket_sap_details d WHERE d."ticketId" = t.id)
         ORDER BY t.id LIMIT 40`)).rows;
    if (!tickets.length) { console.log('No demo SAP tickets without SAP details (run load-v7 and load-v7-apps first, or the SAP demo is already loaded).'); return; }
    let refs = 0;
    for (const [i, t] of tickets.entries()) {
        await saveSap(t.id, SAMPLES[i % SAMPLES.length]);
        if (i < REFS.length) {
            const r = REFS[i];
            const at = new Date(Date.now() - r.days * 86_400_000);
            await pool.query(
                `INSERT INTO samadhan.ticket_external_refs ("ticketId", system, ref, status, priority, justification, "openedAt", "lastUpdateAt")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $7) ON CONFLICT DO NOTHING`, [t.id, r.system, r.ref, r.status, r.priority, r.justification ?? null, at]);
            refs++;
        }
    }
    // One payroll demo ticket confidential (only people with "View confidential tickets" see it).
    const conf = await pool.query(
        `UPDATE samadhan.tickets SET confidential = true WHERE id = $1 RETURNING id`,
        [tickets[Math.min(7, tickets.length - 1)].id]); // the payroll sample
    await pool.query(`DELETE FROM samadhan.ai_insights WHERE key = 'dashboard'`);
    console.log(`Phase 4 demo data loaded: SAP details on ${tickets.length} demo SAP tickets, ${refs} external cases, ${conf.rowCount} confidential.`);
}

main()
    .catch((e) => { console.error('\nERROR:', e.message); process.exitCode = 1; })
    .finally(() => new Promise((r) => setTimeout(r, 1500)).then(() => sharedPool.end()).then(() => process.exit()));
