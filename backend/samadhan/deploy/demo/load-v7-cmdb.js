'use strict';
/*
   CMDB demo data on the dev backend server (needs migration 7.12-cmdb; run after load-v7-itsm).
   Run on 172.17.2.21 with:  bash ~/samadhan-demo/run.sh load-v7-cmdb      (remove with:  bash ~/samadhan-demo/run.sh remove)

   Mock data only: Azure VMs / SAP systems / network devices (code DEMO-..., name ending "(demo)"), the demo laptops from
   the ASSET master allocated to users, one in repair, one with warranty ending; relationships (BW runs on the VM, apps
   run on the SAP system, laptops connect to the switch); the demo tickets linked to the CI in their asset tag / server.
*/
const APP = process.env.SAMADHAN_APP_DIR || '/home/emamiadmin/apps/emami-apps-hub-backend-dev';
require(`${APP}/node_modules/dotenv`).config({ path: `${APP}/.env`, quiet: true });
const { pool, resolveSchema, sharedPool } = require(`${APP}/samadhan/db/pool`);
require(`${APP}/notifications`).notify = async () => null;
const cmdb = require(`${APP}/samadhan/lib/cmdb`);
const itsm = require(`${APP}/samadhan/lib/itsm`);

async function main() {
    await resolveSchema();
    if (!(await pool.query(`SELECT to_regclass('samadhan.config_items') AS t`)).rows[0].t) throw new Error('Migration 7.12-cmdb has not run on this database yet - deploy the backend first.');
    if ((await pool.query(`SELECT 1 FROM samadhan.config_items WHERE "seedKey" = 'demo' LIMIT 1`)).rows.length) { console.log('The CMDB demo is already loaded. Run "remove" first to reload.'); return; }
    const agent = (await pool.query(`SELECT id, name FROM samadhan.agents WHERE email LIKE '%demo.samadhan.local' AND active ORDER BY id LIMIT 1`)).rows[0] ?? null;
    const m = await itsm.model();
    const id = async (code) => (await pool.query('SELECT id FROM samadhan.config_items WHERE lower(code) = lower($1)', [code])).rows[0]?.id ?? null;
    const add = async (b) => {
        const cid = await cmdb.save(b, agent);
        await pool.query(`UPDATE samadhan.config_items SET "seedKey" = 'demo' WHERE id = $1`, [cid]);
        return cid;
    };
    const vm = await add({ code: 'DEMO-AZ-VM-BWPRD01', name: 'BW production application server (demo)', ciClass: 'Virtual machine', criticality: 'Critical', environment: 'Production', hostingPartnerId: m.hyperscalerId, supportPartnerId: m.vendorId, ipAddress: '10.20.4.11', siteLocation: 'Azure Central India' });
    const sapPrd = await add({ code: 'DEMO-SAP-ECP', name: 'SAP ECC production system ECP (demo)', ciClass: 'SAP system', criticality: 'Critical', environment: 'Production', hostingPartnerId: m.hyperscalerId, siteLocation: 'Azure Central India' });
    const db = await add({ code: 'DEMO-AZ-HANA-PRD', name: 'SAP HANA database for ECP (demo)', ciClass: 'Database', criticality: 'Critical', environment: 'Production', hostingPartnerId: m.hyperscalerId });
    const fw = await add({ code: 'DEMO-KOL-FW-01', name: 'Kolkata HO firewall (demo)', ciClass: 'Firewall', criticality: 'High', siteLocation: 'Kolkata HO', supportPartnerId: m.vendorId });
    const sw = await id('IND-KOL-S-0002');
    // Relationships.
    const rel = async (from, to, kind) => { if (from && to) await cmdb.relate(from, { toId: to, kind }, agent).catch(() => {}); };
    await rel(sapPrd, db, 'Depends on');
    await rel(await id('APP-SAP'), sapPrd, 'Runs on');
    await rel(await id('APP-FIORI'), sapPrd, 'Depends on');
    await rel(vm, db, 'Connected to');
    await rel(sw, fw, 'Connected to');
    for (const code of ['IND-KOL-L-0042', 'IND-KOL-L-0043', 'IND-KOL-D-0007', 'IND-KOL-P-0007']) await rel(await id(code), sw, 'Connected to');
    // Lifecycle on the demo laptops (copied from the ASSET master by migration 7.12): allocated, in repair, warranty.
    const upd = async (code, b) => { const cid = await id(code); if (cid) await cmdb.save({ id: cid, ...b }, agent); return cid; };
    const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    await upd('IND-KOL-L-0042', { status: 'In use', assignedName: 'Ravi Kumar (demo)', department: 'Finance', manufacturer: 'Dell', model: 'Latitude 5440', serialNo: 'DEMO-SN-0042', warrantyEnd: soon, supportPartnerId: m.vendorId });
    await upd('IND-KOL-L-0043', { status: 'In repair', assignedName: 'Priya Sen (demo)', department: 'HR', manufacturer: 'Lenovo', model: 'ThinkPad E14', notes: 'Keyboard replacement with the OEM (demo).', supportPartnerId: m.vendorId });
    await upd('IND-PNE-L-0110', { status: 'In stock', supportPartnerId: m.vendorId });
    for (const code of ['IND-KOL-L-0042', 'IND-KOL-D-0007', 'DEMO-AZ-VM-BWPRD01', 'DEMO-SAP-ECP']) { const cid = await id(code); if (cid) await cmdb.verify(cid, agent); }
    // Link the demo tickets to the CI named in their asset tag / server.
    const t = (await pool.query(`SELECT t.id, d."assetTag", d."serverName" FROM samadhan.tickets t JOIN samadhan.ticket_it_details d ON d."ticketId" = t.id
        WHERE 'demo' = ANY(t.tags) AND (d."assetTag" IS NOT NULL OR d."serverName" IS NOT NULL)`)).rows;
    let linked = 0;
    for (const r of t) {
        const cid = (await id(r.assetTag || '')) ?? (r.serverName === 'EMBWPRDAPP01' ? vm : null);
        if (cid) { await cmdb.link(r.id, cid, agent); linked++; }
    }
    // Three demo SAP tickets on the SAP system: a "repeat incidents" example.
    const sapT = (await pool.query(`SELECT t.id FROM samadhan.tickets t JOIN samadhan.workspaces w ON w.id = t."workspaceId" WHERE 'demo' = ANY(t.tags) AND w.key = 'SAP' ORDER BY t.id DESC LIMIT 3`)).rows;
    for (const r of sapT) { await cmdb.link(r.id, sapPrd, agent); linked++; }
    await pool.query(`UPDATE samadhan.tickets SET "createdAt" = LEAST("createdAt", now()) WHERE id = ANY($1::int[])`, [sapT.map((r) => r.id)]);
    console.log(`CMDB demo loaded: 4 demo CIs, relationships, lifecycle on the demo laptops, ${linked} ticket links.`);
}

main()
    .catch((e) => { console.error('\nERROR:', e.message); process.exitCode = 1; })
    .finally(() => new Promise((r) => setTimeout(r, 1500)).then(() => sharedPool.end()).then(() => process.exit()));
