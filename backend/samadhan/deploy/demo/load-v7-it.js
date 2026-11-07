'use strict';
/*
   v7 Phase 5 demo data on the dev backend server (needs migration 7.5-it and `load-v7-apps` first).
   Run on 172.17.2.21 with:  bash ~/samadhan-demo/run.sh load-v7-it      (remove with:  bash ~/samadhan-demo/run.sh remove)

   Gives the demo tickets of the Digital Apps and Infra & IT desks realistic IT details (layer, URL, HTTP status,
   correlation id / server, asset tag, site). Only tickets tagged 'demo' are touched; IT details are removed with the
   tickets (ON DELETE CASCADE), so remove-demo.js needs nothing new.
*/
const APP = process.env.SAMADHAN_APP_DIR || '/home/emamiadmin/apps/emami-apps-hub-backend-dev';
require(`${APP}/node_modules/dotenv`).config({ path: `${APP}/.env`, quiet: true });
const { pool, resolveSchema, sharedPool } = require(`${APP}/samadhan/db/pool`);
const { saveIt } = require(`${APP}/samadhan/lib/it`);

const DIGITAL = [
    { layer: 'API', environment: 'Production', httpStatus: '503', apiEndpoint: '/api/orders', correlationId: 'c0a8-77f1-4e2b', hosting: 'AWS', usersAffected: 35 },
    { layer: 'Frontend', environment: 'Production', platform: 'Android', browser: 'Chrome', appVersion: '3.2.0', url: 'https://apps.example.com/b2b/cart' },
    { layer: 'OData', environment: 'Quality / Test', odataService: 'ZSD_ORDER_SRV', httpStatus: '500', correlationId: 'odata-5d1e-9a', hosting: 'SAP BTP' },
    { layer: 'PostgreSQL DB', environment: 'Production', database: 'PostgreSQL', hosting: 'AWS', usersAffected: 120 },
];
const INFRA = [
    { environment: 'Production', serverName: 'EMDC-APP-01', ipOrHost: '10.17.2.40', hosting: 'On-premise data centre', usersAffected: 60 },
    { assetTag: 'EML-LT-04521', deviceModel: 'Dell Latitude 5440', os: 'Windows 11', siteLocation: 'Kolkata HO - 4th floor' },
    { environment: 'Production', hosting: 'Azure', serverName: 'az-sql-reporting', usersAffected: 15 },
    { assetTag: 'EML-PR-00877', deviceModel: 'HP LaserJet M428', siteLocation: 'Amingaon plant - dispatch' },
];

async function main() {
    await resolveSchema();
    const c = await pool.query(`SELECT to_regclass('samadhan.ticket_it_details') AS t`);
    if (!c.rows[0].t) throw new Error('Migration 7.5-it has not run on this database yet - deploy the Phase 5 backend first.');
    const tickets = (await pool.query(
        `SELECT t.id, w.key FROM samadhan.tickets t JOIN samadhan.workspaces w ON w.id = t."workspaceId"
         WHERE 'demo' = ANY(t.tags) AND w.key IN ('DIGITAL_APPS', 'INFRA_IT')
           AND NOT EXISTS (SELECT 1 FROM samadhan.ticket_it_details d WHERE d."ticketId" = t.id)
         ORDER BY t.id LIMIT 60`)).rows;
    if (!tickets.length) { console.log('No demo Digital / Infra tickets without IT details (run load-v7 and load-v7-apps first, or the IT demo is already loaded).'); return; }
    const n = { DIGITAL_APPS: 0, INFRA_IT: 0 };
    for (const t of tickets) {
        const list = t.key === 'INFRA_IT' ? INFRA : DIGITAL;
        await saveIt(t.id, list[n[t.key]++ % list.length]);
    }
    console.log(`Phase 5 demo data loaded: IT details on ${n.DIGITAL_APPS} Digital Apps and ${n.INFRA_IT} Infra & IT demo tickets.`);
}

main()
    .catch((e) => { console.error('\nERROR:', e.message); process.exitCode = 1; })
    .finally(() => new Promise((r) => setTimeout(r, 1500)).then(() => sharedPool.end()).then(() => process.exit()));
