'use strict';
/*
   v7 Phase 8 demo data on the dev backend server (needs migration 7.8-program).
   Run on 172.17.2.21 with:  bash ~/samadhan-demo/run.sh load-v7-program      (remove with:  bash ~/samadhan-demo/run.sh remove)

   About 40 S/4HANA Programme tickets over the last 30 days: test defects across SIT / UAT / mock cutovers with
   severities and retest results (so the burn-down, KPIs and leakage have a shape), data-migration and cutover tasks,
   RAID items and a few hypercare incidents raised today. Tagged 'demo' / 'demo-v7-program' (remove-demo.js deletes them).
   The S/4 desk itself stays OFF (Admin > Service desks switches it on for UAT).
*/
const APP = process.env.SAMADHAN_APP_DIR || '/home/emamiadmin/apps/emami-apps-hub-backend-dev';
require(`${APP}/node_modules/dotenv`).config({ path: `${APP}/.env`, quiet: true });
const { pool, resolveSchema, sharedPool } = require(`${APP}/samadhan/db/pool`);
require(`${APP}/notifications`).notify = async () => null;
const { createTicket } = require(`${APP}/samadhan/lib/tickets`);
const { saveProgram } = require(`${APP}/samadhan/lib/program`);
const { textToHtml } = require(`${APP}/samadhan/lib/util`);

const DOMAIN = 'demo.samadhan.local';
const TAGS = ['demo', 'demo-v7', 'demo-v7-program'];
const DAY = 86_400_000;
const DEFECTS = [
    ['Pricing condition ZPR0 not determined for export orders', 'Defect – SIT', 'Order to Cash (SD)', 'Pricing', 'SIT-1', 'S2 High'],
    ['GST e-invoice IRN not generated for credit notes', 'Defect – UAT', 'Order to Cash (SD)', 'Billing / e-Invoice', 'UAT', 'S1 Critical'],
    ['Release strategy skips plant head for capex POs', 'Defect – SIT', 'Procure to Pay (MM)', 'Purchase Order', 'SIT-1', 'S3 Medium'],
    ['MIRO tolerance message blocks small differences', 'Defect – UAT', 'Procure to Pay (MM)', 'Invoice Verification', 'UAT', 'S3 Medium'],
    ['MRP creates duplicate planned orders for co-products', 'Defect – SIT', 'Plan to Produce (PP / QM)', 'MRP', 'SIT-2', 'S2 High'],
    ['Asset depreciation run posts to wrong cost centre', 'Defect – UAT', 'Record to Report (FI / CO)', 'Asset Accounting', 'UAT', 'S2 High'],
    ['TDS not deducted on advance payments', 'Defect – Regression', 'Record to Report (FI / CO)', 'GST / TDS', 'Regression', 'S1 Critical'],
    ['Customer BP load rejects GSTIN with lowercase letters', 'Data Migration Issue', 'Data Migration', 'Customer / BP', 'Mock Cutover 1', 'S3 Medium'],
    ['Open sales orders load misses schedule lines', 'Data Migration Issue', 'Data Migration', 'Open Sales Orders', 'Mock Cutover 2', 'S2 High'],
    ['Role Z_SD_CLERK lacks VF04 in S/4', 'Authorization / Role Issue', 'Security & Roles', 'Role Design', 'SIT-2', 'S4 Low'],
    ['Fiori My Inbox does not show PR approvals', 'Defect – UAT', 'Custom Code & Integration', 'Fiori', 'UAT', 'S3 Medium'],
    ['Batch job for credit exposure runs over 3 hours', 'Defect – Performance', 'Order to Cash (SD)', 'Credit', 'Performance', 'S2 High'],
];
const OTHER = [
    ['Cutover step 22: freeze open POs', 'Cutover Task', 'Cutover', 'Business Cutover', { cutoverStepId: 'CO-22', mockCycle: 'Mock 2' }],
    ['Remediate ATC findings in ZSD_PRICING', 'Custom Code Remediation', 'Custom Code & Integration', 'ATC Finding', { atcFinding: 'SAP_STD_OBJECT', ricefwId: 'R-SD-014' }],
    ['Delta: rebate settlement by depot', 'Fit-Gap / Delta', 'Order to Cash (SD)', 'Schemes & Rebates', { fitGapId: 'FG-SD-07' }],
    ['Risk: key user availability during UAT', 'Risk', 'PMO & Change Management', 'RAID', {}],
    ['Training material for Fiori approvals', 'Training / Documentation', 'PMO & Change Management', 'Training', {}],
];
const HYPERCARE = ['Invoice print missing company logo', 'Delivery due list empty for depot 12', 'Stock transfer not visible in MMBE'];

async function main() {
    await resolveSchema();
    const c = await pool.query(`SELECT to_regclass('samadhan.ticket_program_details') AS t`);
    if (!c.rows[0].t) throw new Error('Migration 7.8-program has not run on this database yet - deploy the Phase 8 backend first.');
    if ((await pool.query(`SELECT 1 FROM samadhan.tickets WHERE 'demo-v7-program' = ANY(tags) LIMIT 1`)).rows.length) { console.log('The Phase 8 demo is already loaded. Run "remove" first to reload.'); return; }
    const app = (await pool.query(`SELECT id FROM samadhan.applications WHERE code = 'S4P'`)).rows[0];
    if (!app) throw new Error('Application S4P not found.');
    const make = async (subject, type, category, fn, daysAgo, program) => {
        const t = await createTicket({
            applicationId: app.id, allowAnyDesk: true, subject, description: textToHtml(`${subject} (demo).`), source: 'Internal',
            requester: { email: `keyuser${(subject.length % 4) + 1}@${DOMAIN}`, name: `Key User ${(subject.length % 4) + 1} (demo)` },
            createdAt: new Date(Date.now() - daysAgo * DAY - (subject.length % 9) * 3_600_000), fields: { type, category, function: fn, tags: TAGS },
        });
        if (program) await saveProgram(t.id, program);
        return t;
    };
    let n = 0;
    for (let round = 0; round < 3; round++) {
        for (const [i, [subject, type, area, fn, cycle, sev]] of DEFECTS.entries()) {
            const age = 29 - round * 9 - (i % 9);
            const t = await make(`${subject}${round ? ` (${['', 'retest', 'repeat'][round]})` : ''}`, type, area, fn, Math.max(0, age), {
                testCycle: cycle, defectSeverity: sev, processArea: area, testCaseId: `TC-${area.slice(0, 2).toUpperCase()}-${100 + i}`, activatePhase: 'Realize' });
            n++;
            // Most older defects are fixed and retested; a few failed once.
            if (age > 6 && (i + round) % 4 !== 0) {
                await saveProgram(t.id, { retestStatus: (i + round) % 5 === 0 ? 'Failed' : 'Passed' });
                await pool.query(`UPDATE samadhan.tickets SET "statusId" = 4, "resolvedAt" = "createdAt" + ($2 || ' days')::interval WHERE id = $1 AND EXISTS (SELECT 1 FROM samadhan.ticket_program_details d WHERE d."ticketId" = $1 AND d."retestStatus" = 'Passed')`,
                    [t.id, String(1 + (i % 5))]);
            }
        }
    }
    for (const [i, [subject, type, area, fn, extra]] of OTHER.entries()) { await make(subject, type, area, fn, 3 + i * 4, { activatePhase: 'Realize', ...extra }); n++; }
    for (const subject of HYPERCARE) { await make(subject, 'Hypercare Incident', 'Order to Cash (SD)', null, 0, { activatePhase: 'Hypercare' }); n++; }
    await pool.query(`DELETE FROM samadhan.ai_insights WHERE key = 'dashboard'`);
    console.log(`Phase 8 demo data loaded: ${n} S/4 Programme tickets (defects with retests, tasks, RAID, hypercare today).`);
}

main()
    .catch((e) => { console.error('\nERROR:', e.message); process.exitCode = 1; })
    .finally(() => new Promise((r) => setTimeout(r, 1500)).then(() => sharedPool.end()).then(() => process.exit()));
