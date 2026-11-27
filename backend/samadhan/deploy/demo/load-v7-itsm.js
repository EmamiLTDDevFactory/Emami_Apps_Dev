'use strict';
/*
   ITSM support model demo data on the dev backend server (needs migration 7.11-itsm and the earlier v7 demos).
   Run on 172.17.2.21 with:  bash ~/samadhan-demo/run.sh load-v7-itsm      (remove with:  bash ~/samadhan-demo/run.sh remove)

   Mock data only, all clearly marked:
   - Allied Digital Services gets a DEMO contract (reference "DEMO contract", 95 % resolution SLA target, contract end);
   - a 4-level escalation matrix with @demo.samadhan.local people (no mail can reach them);
   - 8 IT assets (laptops, desktops, printer, switch) in the ASSET master, description ending "(demo)";
   - 6 open ITSM tickets and 4 Secondary Sales tickets moved in through the migration importer (old numbers DEMO-...),
     tagged 'demo' so remove-demo.js deletes them;
   - a few demo Infra tickets made overdue and escalated (manual and automatic), so the scorecard and ladder show data.
*/
const APP = process.env.SAMADHAN_APP_DIR || '/home/emamiadmin/apps/emami-apps-hub-backend-dev';
require(`${APP}/node_modules/dotenv`).config({ path: `${APP}/.env`, quiet: true });
const { pool, resolveSchema, sharedPool } = require(`${APP}/samadhan/db/pool`);
require(`${APP}/notifications`).notify = async () => null;
const itsm = require(`${APP}/samadhan/lib/itsm`);
const imp = require(`${APP}/samadhan/lib/ticketImport`);

const day = (n, hh = '10:00') => {
    const d = new Date(Date.now() - n * 86400000 + 330 * 60000);
    return `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()} ${hh}`;
};

async function main() {
    await resolveSchema();
    if (!(await pool.query(`SELECT to_regclass('samadhan.support_partners') AS t`)).rows[0].t) throw new Error('Migration 7.11-itsm has not run on this database yet - deploy the backend first.');
    if ((await pool.query(`SELECT 1 FROM samadhan.tickets WHERE "legacyRef" LIKE 'DEMO-%' LIMIT 1`)).rows.length) { console.log('The ITSM demo is already loaded. Run "remove" first to reload.'); return; }
    const m = await itsm.model();
    const allied = m.vendorId;
    // Demo contract on the current vendor (only fields that are empty).
    await pool.query(`UPDATE samadhan.support_partners SET "contractRef" = COALESCE("contractRef", 'DEMO contract'), "contractStart" = COALESCE("contractStart", date '2026-04-01'),
                      "contractEnd" = COALESCE("contractEnd", date '2027-03-31'), "slaTargetPct" = COALESCE("slaTargetPct", 95) WHERE id = $1`, [allied]);
    // Escalation matrix (demo people).
    const infra = (await pool.query(`SELECT id FROM samadhan.workspaces WHERE key = 'INFRA_IT'`)).rows[0]?.id ?? null;
    for (const c of [
        { level: 1, party: 'VENDOR', name: 'Vendor Desk Lead (demo)', designation: 'Service desk lead, Allied Digital', email: 'ad.desklead@demo.samadhan.local', afterHours: 0 },
        { level: 2, party: 'VENDOR', name: 'Vendor Delivery Manager (demo)', designation: 'Service delivery manager, Allied Digital', email: 'ad.sdm@demo.samadhan.local', afterHours: 4 },
        { level: 3, party: 'CLIENT', name: 'Emami IT Manager (demo)', designation: 'IT manager, Emami', email: 'it.manager@demo.samadhan.local', afterHours: 8, workspaceId: infra },
        { level: 4, party: 'CLIENT', name: 'Emami Head of IT (demo)', designation: 'Head of IT, Emami', email: 'it.head@demo.samadhan.local', afterHours: 24, priorities: [3, 4] },
    ]) await itsm.saveContact(c);
    // IT assets.
    for (const [code, desc, site] of [
        ['IND-KOL-L-0042', 'Dell Latitude 5440 laptop - Ravi Kumar, Finance (demo)', 'Kolkata HO'], ['IND-KOL-L-0043', 'Lenovo ThinkPad E14 laptop - Priya Sen, HR (demo)', 'Kolkata HO'],
        ['IND-KOL-D-0007', 'HP ProDesk 400 desktop - Reception (demo)', 'Kolkata HO'], ['IND-KOL-P-0007', 'HP LaserJet M404 printer - 3rd floor (demo)', 'Kolkata HO'],
        ['IND-KOL-S-0002', 'Cisco Catalyst 9200 switch - Server room (demo)', 'Kolkata HO'], ['IND-PNE-L-0110', 'Dell Latitude 3440 laptop - Plant QA (demo)', 'Pune plant'],
        ['IND-GUW-D-0021', 'Lenovo ThinkCentre desktop - Depot office (demo)', 'Guwahati depot'], ['IND-AMB-L-0015', 'HP ProBook 440 laptop - Sales (demo)', 'Amingaon plant'],
    ]) {
        await pool.query(`INSERT INTO samadhan.ref_masters (kind, code, description, "parentCode") VALUES ('ASSET', $1, $2, $3) ON CONFLICT (kind, code) DO NOTHING`, [code, desc, site]);
    }
    // Tickets moved in through the importer (the same code the Admin screen uses).
    const agent = (await pool.query(`SELECT id, name FROM samadhan.agents WHERE email LIKE '%demo.samadhan.local' AND active ORDER BY id LIMIT 1`)).rows[0] ?? null;
    const run = async (kind, objs, slaFrom) => {
        const t = await imp.templateInfo(kind);
        const rows = [t.columns.map((c) => c.header), ...objs.map((o) => t.columns.map((c) => o[c.key] ?? ''))];
        return imp.importTickets({ kind, rows, dryRun: false, slaFrom }, agent);
    };
    const base = { requesterEmail: '', status: 'Open' };
    const a = await run('itsm', [
        { ...base, legacyRef: 'DEMO-AD-INC-104501', subject: 'Laptop not connecting to office Wi-Fi (demo)', applicationCode: 'EUC', type: 'Incident', category: 'End-user IT', subCategory: 'Laptop / Desktop', priority: 'P3', loggedOn: day(3, '09:40'), requesterName: 'Ravi Kumar (demo)', site: 'Kolkata HO', assetTag: 'IND-KOL-L-0042', status: 'Work in progress', workNotes: 'Wi-Fi driver re-installed; waiting for the user to test.' },
        { ...base, legacyRef: 'DEMO-AD-INC-104512', subject: 'Printer on 3rd floor shows offline (demo)', applicationCode: 'EUC', type: 'Incident', category: 'End-user IT', subCategory: 'Printer / Scanner', priority: 'P4', loggedOn: day(2, '11:05'), requesterName: 'Finance Team (demo)', assetTag: 'IND-KOL-P-0007', site: 'Kolkata HO' },
        { ...base, legacyRef: 'DEMO-AD-INC-104530', subject: 'Azure VM for BW reporting is slow (demo)', applicationCode: 'CLOUD', type: 'Incident', category: 'Cloud – Azure', subCategory: 'Virtual Machine', priority: 'P2', loggedOn: day(1, '08:15'), requesterName: 'BI Team (demo)', serverName: 'EMBWPRDAPP01', hosting: 'Azure', environment: 'Production', status: 'On hold - awaiting vendor', workNotes: 'Microsoft case raised for the host.' },
        { ...base, legacyRef: 'DEMO-AD-SR-20871', subject: 'New laptop for joiner in Sales (demo)', applicationCode: 'EUC', type: 'Service Request', category: 'End-user IT', subCategory: 'Laptop / Desktop', priority: 'P4', loggedOn: day(4, '15:30'), requesterName: 'HR Desk (demo)', site: 'Amingaon plant' },
        { ...base, legacyRef: 'DEMO-AD-INC-104544', subject: 'VPN drops every 10 minutes at Guwahati depot (demo)', applicationCode: 'NET', type: 'Incident', category: 'Network', subCategory: 'VPN', priority: 'P3', loggedOn: day(1, '17:45'), requesterName: 'Depot Office (demo)', site: 'Guwahati depot', assetTag: 'IND-GUW-D-0021' },
        { ...base, legacyRef: 'DEMO-AD-INC-104550', subject: 'Teams calls dropping for plant users (demo)', applicationCode: 'M365', type: 'Incident', category: 'Email & M365', subCategory: 'Teams', priority: 'P3', loggedOn: day(0, '09:10'), requesterName: 'Plant QA (demo)', site: 'Pune plant' },
    ], 'import');
    const s = await run('sales', [
        { legacyRef: 'DEMO-SS-55101', subject: 'Scheme discount not applied in DMS invoice (demo)', applicationCode: 'DMS', loggedOn: day(2, '12:00'), requesterName: 'Distributor Kolkata (demo)', mobileNo: '9000000101', source: 'Phone', region: '', state: 'West Bengal' },
        { legacyRef: 'DEMO-SS-55107', subject: 'mSFA order sync stuck since morning (demo)', applicationCode: 'MSFA', loggedOn: day(1, '10:30'), requesterName: 'MR Howrah (demo)', mobileNo: '9000000102', mrUid: 'MR-DEMO-07', source: 'Phone' },
        { legacyRef: 'DEMO-SS-55112', subject: 'B2B app shows wrong outstanding (demo)', applicationCode: 'SCB2B', loggedOn: day(1, '16:20'), requesterName: 'Retailer Siliguri (demo)', mobileNo: '9000000103', source: 'WhatsApp' },
        { legacyRef: 'DEMO-SS-55120', subject: 'Claim settlement not visible to distributor (demo)', loggedOn: day(0, '11:45'), requesterName: 'Distributor Patna (demo)', mobileNo: '9000000104', source: 'Email', state: 'Bihar' },
    ], 'import');
    const ids = [...a.created, ...s.created].map((c) => c.id);
    await pool.query(`UPDATE samadhan.tickets SET tags = ARRAY['demo', 'demo-v7', 'demo-v7-itsm', 'migrated'] WHERE id = ANY($1::int[])`, [ids]);
    // Overdue demo Infra tickets: one escalated by hand, the rest by the scheduled check.
    const overdue = (await pool.query(
        `SELECT t.id FROM samadhan.tickets t JOIN samadhan.workspaces w ON w.id = t."workspaceId" JOIN samadhan.ticket_statuses st ON st.id = t."statusId"
         WHERE 'demo' = ANY(t.tags) AND w.key = 'INFRA_IT' AND NOT st."isResolved" AND NOT st."pausesSla" ORDER BY t.id DESC LIMIT 4`)).rows.map((r) => r.id);
    for (const [i, id] of overdue.entries()) {
        await pool.query(`UPDATE samadhan.tickets SET "resolutionDueAt" = now() - ($2::int * interval '1 hour'), "resViolated" = true, "resReminded" = true WHERE id = $1`, [id, [2, 6, 10, 30][i]]);
    }
    if (overdue[0]) await itsm.escalateManually(overdue[0], 'Plant users blocked; vendor engineer not reachable on phone (demo).', agent);
    let auto = 0;
    for (let k = 0; k < 4; k++) auto += await itsm.runEscalations();
    console.log(`ITSM demo loaded: contract on the current vendor, 4 escalation levels, 8 assets; migrated ${a.created.length} ITSM + ${s.created.length} Secondary Sales tickets `
        + `(${a.errors.length + s.errors.length} rows refused${a.errors.length + s.errors.length ? `: ${JSON.stringify([...a.errors, ...s.errors]).slice(0, 400)}` : ''}); ${overdue.length} overdue Infra tickets, ${auto} automatic escalations.`);
}

main()
    .catch((e) => { console.error('\nERROR:', e.message); process.exitCode = 1; })
    .finally(() => new Promise((r) => setTimeout(r, 1500)).then(() => sharedPool.end()).then(() => process.exit()));
