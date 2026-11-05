'use strict';
/*
   Golden files: responses that must stay byte-identical across v7 (the 36-column daily report, the default export).

     node golden.js capture|compare

   Env: GOLDEN_API (e.g. http://localhost:4191/api/samadhan), GOLDEN_PG (postgres://postgres@localhost:55432/<db>),
        GOLDEN_SCHEMA (setu | samadhan), GOLDEN_APP_ID (grant app id, setu | samadhan), HUB_AUTH_JWT_SECRET (test-only).
   Local databases only. The backend under GOLDEN_API must already have created its schema in GOLDEN_PG, with no
   tickets in the 9xxxxx range yet (use a fresh database).
*/
const fs = require('fs');
const path = require('path');
const BACKEND = path.join(__dirname, '..', '..', '..');
const jwt = require(path.join(BACKEND, 'node_modules/jsonwebtoken'));
const { Client } = require(path.join(BACKEND, 'node_modules/pg'));

const mode = process.argv[2];
const { GOLDEN_API: API, GOLDEN_PG: PG, GOLDEN_SCHEMA: S = 'samadhan', GOLDEN_APP_ID: APP = 'samadhan', HUB_AUTH_JWT_SECRET: SECRET } = process.env;
if (!['capture', 'compare'].includes(mode) || !API || !PG || !SECRET) {
    console.error('usage: GOLDEN_API=… GOLDEN_PG=… HUB_AUTH_JWT_SECRET=… node golden.js capture|compare');
    process.exit(2);
}
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(PG) || !/\/\/(localhost|127\.0\.0\.1)[:/]/.test(API)) {
    console.error('Refusing: GOLDEN_PG and GOLDEN_API must point at localhost.');
    process.exit(2);
}
if (!/^[a-z_]+$/.test(S)) { console.error('bad schema name'); process.exit(2); }

const SUP = 'golden.sup@test.samadhan.local';
// What is compared, and how: "exact" = byte-identical body.
const CASES = [
    { file: 'daily-report.json', url: '/reports/daily?from=2026-10-01&to=2026-10-31' },
    { file: 'export-default.json', url: '/tickets/export?view=all&from=2026-10-01&to=2026-10-31&sort=created_asc' },
];

(async () => {
    const db = new Client({ connectionString: PG });
    await db.connect();
    const has = await db.query(`SELECT 1 FROM ${S}.tickets WHERE id = 900001`);
    if (!has.rows.length) {
        await db.query(fs.readFileSync(path.join(__dirname, 'fixture.sql'), 'utf8').split('{{S}}').join(S));
    }
    await db.query(
        `INSERT INTO emami_apps.authorized_user_apps (email, app_id, role) VALUES ($1, $2, 'Supervisor') ON CONFLICT (email, app_id) DO UPDATE SET role = 'Supervisor'`,
        [SUP, APP],
    );
    await db.end();
    const token = jwt.sign({ email: SUP }, SECRET, { expiresIn: '10m' });
    let failed = 0;
    for (const c of CASES) {
        const res = await fetch(API + c.url, { headers: { Authorization: `Bearer ${token}` } });
        const body = Buffer.from(await res.arrayBuffer());
        const file = path.join(__dirname, c.file);
        if (res.status !== 200) { console.log(`FAIL  ${c.file}: HTTP ${res.status} ${body.toString().slice(0, 200)}`); failed++; continue; }
        if (mode === 'capture') { fs.writeFileSync(file, body); console.log(`CAPTURED  ${c.file} (${body.length} bytes)`); continue; }
        const want = fs.readFileSync(file);
        if (Buffer.compare(want, body) === 0) console.log(`PASS  ${c.file} byte-identical (${body.length} bytes)`);
        else {
            failed++;
            fs.writeFileSync(file.replace(/\.json$/, '.actual.json'), body);
            console.log(`FAIL  ${c.file} differs: want ${want.length} bytes, got ${body.length} (saved *.actual.json)`);
        }
    }
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
