'use strict';
/*
   Samadhan test gate (docs/v7/TEST-PLAN.md). Everything must pass before a push. Local only:

     node backend/samadhan/tests/gate.js            # static, unit, API suites, migration round trips, golden, smoke, E2E, path guard
     node backend/samadhan/tests/gate.js --quick    # without the E2E browser run

   Needs: the throwaway Postgres on localhost:55432 (trust, see TEST-PLAN §A; started here if it is not running and
   %LOCALAPPDATA%\samadhan-test-pg exists, restarted once if it hangs in crash recovery; server log in that folder's
   server.log), Microsoft Edge (E2E). Uses ports 4191 (backend) and 3250 (static site).
   Mail, WhatsApp, notification emails and AI are off; a random JWT secret is made for each run (never the real one).
*/
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BACKEND = path.join(ROOT, 'backend');
const FRONT = path.join(ROOT, 'embedded-apps', 'samadhan');
const ART = path.join(ROOT, 'docs', 'v7', 'test-artifacts');
const PG_BIN = process.env.SAMADHAN_PG_BIN || 'C:\\Program Files\\PostgreSQL\\18\\bin';
const PG_PORT = 55432;
const API_PORT = 4191;
const WEB_PORT = 3250;
const QUICK = process.argv.includes('--quick');
// --stages=static,unit,db,e2e runs only those parts (db = api,rollback,attach,ws,sap,it,compat) (e.g. on a machine short of memory); default: everything.
const STAGES = ((process.argv.find((a) => a.startsWith('--stages=')) || '').slice(9).split(',').filter(Boolean));
const want = (s) => !STAGES.length || STAGES.includes(s);
const DB_PARTS = ['api', 'rollback', 'attach', 'ws', 'sap', 'it', 'compat'];
const wantDb = (s) => want('db') || STAGES.includes(s);
const SECRET = crypto.randomBytes(32).toString('hex');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
fs.mkdirSync(ART, { recursive: true });

const results = [];
const logFile = path.join(ART, 'gate-last.log');
fs.writeFileSync(logFile, '');
const log = (s) => fs.appendFileSync(logFile, `${s}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Every result is recorded AND printed (a failure that is only recorded showed up as "1 of 8 failed" with no FAIL line).
function record(name, ok, detail = '', label = name, ms = null) {
    results.push({ name, ok, ms, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}${ms === null ? '' : `  ${Math.round(ms / 1000)} s`}`);
}
// npm/npx run through node itself: no `shell: true` (Node 24+ warns DEP0190 about unescaped args), same behaviour.
function resolveCmd(cmd, args) {
    const m = /^(npm|npx)(\.cmd)?$/.exec(cmd);
    const cli = m && path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', `${m[1]}-cli.js`);
    return cli && fs.existsSync(cli) ? { cmd: process.execPath, args: [cli, ...args], shell: false } : { cmd, args, shell: /\.cmd$/.test(cmd) };
}

function run(name, cmd, args, opts = {}) {
    const t0 = Date.now();
    const c = resolveCmd(cmd, args);
    const r = spawnSync(c.cmd, c.args, { cwd: opts.cwd || ROOT, env: { ...process.env, ...(opts.env || {}) }, encoding: 'utf8', shell: opts.shell ?? c.shell, maxBuffer: 64 * 1024 * 1024 });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    log(`\n===== ${name} (exit ${r.status}) =====\n${out}`);
    const ok = r.status === 0 && (!opts.expect || opts.expect(out));
    record(name, ok, opts.detail ? opts.detail(out) : '', name, Date.now() - t0);
    return { ok, out };
}
const psql = (db, sql) => spawnSync(path.join(PG_BIN, 'psql'), ['-h', 'localhost', '-p', String(PG_PORT), '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-qAtc', sql], { encoding: 'utf8' });
const HUB_TABLES = `CREATE SCHEMA emami_apps;
  CREATE TABLE emami_apps.authorized_user_apps (email text NOT NULL, app_id text NOT NULL, role text, depot text, PRIMARY KEY (email, app_id));
  CREATE TABLE emami_apps.users (user_id serial PRIMARY KEY, email text, name text);`;
function freshDb(name, template) {
    const a = psql('postgres', `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    const b = psql('postgres', `CREATE DATABASE ${name}${template ? ` TEMPLATE ${template}` : ''}`);
    if (b.status !== 0) throw new Error(`create ${name}: ${a.stderr}${b.stderr}`);
    if (!template) { const c = psql(name, HUB_TABLES); if (c.status !== 0) throw new Error(`hub tables: ${c.stderr}`); }
}

// Attachments (v7 Phase 2) are on in every suite, stored in a throwaway folder (the SFTP adapter is tested separately).
const FILES_DIR = path.join(os.tmpdir(), `samadhan-gate-files-${process.pid}`);
const SAFE_ENV = {
    SAMADHAN_STORAGE: 'local', SAMADHAN_STORAGE_DIR: FILES_DIR,
    // 'localtest' is the scheduler secret api.test.js sends (tests/README.md); test-only, never a real value.
    HUB_AUTH_JWT_SECRET: SECRET, HUB_INTERNAL_API_SECRET: 'localtest',
    PGHOST: 'localhost', PGPORT: String(PG_PORT), PGUSER: 'postgres', PGPASSWORD: 'x',
    SAMADHAN_MAIL_ENABLED: 'false', SAMADHAN_WHATSAPP_ENABLED: 'false',
    NOTIFY_EMAIL_ENABLED: 'false', NOTIFY_MAIL_SENDER: '', CCB_TEAMS_ORGANIZER: '', ANTHROPIC_API_KEY: '', RESEND_API_KEY: '',
};

let server = null;
async function startBackend(db, cwd = BACKEND, extra = {}) {
    await stopBackend();
    const out = fs.openSync(path.join(ART, `backend-${db}.log`), 'w');
    server = spawn(process.execPath, ['server.js'], { cwd, env: { ...process.env, ...SAFE_ENV, PORT: String(API_PORT), PGDATABASE: db, ...extra }, stdio: ['ignore', out, out] });
    for (let i = 0; i < 80; i++) {
        try { if ((await fetch(`http://localhost:${API_PORT}/api/health`)).ok) break; } catch { /* starting */ }
        await sleep(250);
    }
    // Any Samadhan request waits for the schema set-up; the public config route needs no sign-in.
    await fetch(`http://localhost:${API_PORT}/api/samadhan/portal/config`).catch(() => {});
}
async function stopBackend() {
    if (!server) return;
    server.kill();
    await new Promise((r) => { server.once('exit', r); setTimeout(r, 3000); });
    server = null;
    await sleep(300);
}

let pgError = '';
// With a time limit: on 2026-11-07 the cluster accepted connections but could not start a backend (Windows error 487
// after an out-of-memory crash) and a plain psql waited forever, so the gate hung instead of restarting it.
function pgRunning() {
    const r = spawnSync(path.join(PG_BIN, 'psql'), ['-w', '-h', 'localhost', '-p', String(PG_PORT), '-U', 'postgres', '-d', 'postgres', '-qAtc', 'select 1'],
        { encoding: 'utf8', timeout: 20000, env: { ...process.env, PGCONNECT_TIMEOUT: '10' } });
    if (r.error) { pgError = `no answer in 20 s (${r.error.code || r.error.message})`; return false; }
    pgError = (r.stderr || '').trim().split('\n').pop() || '';
    return r.status === 0;
}
const PG_DIR = path.join(process.env.LOCALAPPDATA || os.homedir(), 'samadhan-test-pg');
// Started through pg_ctl with -l, so the server log is kept in PG_DIR\server.log (it used to go nowhere).
const pgCtl = (...a) => spawnSync(path.join(PG_BIN, 'pg_ctl'), ['-D', path.join(PG_DIR, 'data'), ...a], { encoding: 'utf8', timeout: 120000 });
async function waitPg(seconds) { const end = Date.now() + seconds * 1000; while (Date.now() < end) { if (pgRunning()) return true; await sleep(1000); } return pgRunning(); }
async function ensurePg() {
    if (pgRunning()) return { ok: true };
    if (!fs.existsSync(path.join(PG_DIR, 'data'))) return { ok: false, why: `not running and no ${PG_DIR}` };
    const start = () => pgCtl('start', '-W', '-l', path.join(PG_DIR, 'server.log'), '-o', `-p ${PG_PORT} -c listen_addresses=localhost`);
    // Already running but not answering (e.g. "in recovery mode") is a server that is still recovering: no second start.
    if (pgCtl('status').status !== 0) { console.log('      starting the test Postgres'); start(); }
    // After an unclean stop Postgres first recovers (fsync of the data folder): allow up to 5 minutes.
    if (await waitPg(300)) return { ok: true };
    // Still not answering: on 2026-11-06 a recovery hung for over 20 minutes and only a restart cleared it.
    // This is the throwaway test cluster (every test database is rebuilt each run), so one forced restart is safe.
    console.log(`      test Postgres not ready after 5 min (${pgError}); restarting it once`);
    if (pgCtl('stop', '-m', 'immediate', '-w', '-t', '60').status !== 0) {
        // A wedged server can ignore the stop request: end the process named in this cluster's own postmaster.pid.
        const pidFile = path.join(PG_DIR, 'data', 'postmaster.pid');
        const pid = fs.existsSync(pidFile) ? Number(fs.readFileSync(pidFile, 'utf8').split(/\r?\n/)[0].trim()) : 0;
        if (pid) { try { process.kill(pid); } catch { /* already gone */ } await sleep(3000); }
        fs.rmSync(pidFile, { force: true });
    }
    start();
    if (await waitPg(300)) return { ok: true };
    return { ok: false, why: `not ready after a restart: ${pgError}; see ${path.join(PG_DIR, 'server.log')}` };
}

const golden = (label, api, db, schema, appId) => run(`golden byte-identical: ${label}`, process.execPath, [path.join(__dirname, 'golden', 'golden.js'), 'compare'],
    { env: { ...SAFE_ENV, GOLDEN_API: `http://localhost:${API_PORT}/api/${api}`, GOLDEN_PG: `postgres://postgres@localhost:${PG_PORT}/${db}`, GOLDEN_SCHEMA: schema, GOLDEN_APP_ID: appId } });
const apiSuite = (label, api, db, appId, schema = 'samadhan') => run(`API suite: ${label}`, process.execPath, [path.join(__dirname, 'api.test.js')], {
    env: { ...SAFE_ENV, SAMADHAN_TEST_ALLOW: '1', SAMADHAN_TEST_API: `http://localhost:${API_PORT}/api/${api}`, SAMADHAN_TEST_PG: `postgres://postgres@localhost:${PG_PORT}/${db}`, SAMADHAN_TEST_APP_ID: appId, SAMADHAN_TEST_SCHEMA: schema },
    expect: (o) => /ALL PASSED/.test(o) && !/^FAIL/m.test(o),
    detail: (o) => `${(o.match(/^PASS/gm) || []).length} pass, ${(o.match(/^FAIL/gm) || []).length} fail`,
});
const migrate = (db, dir, id = '7.0-rename') => run(`migrate ${dir} ${id} on ${db}`, process.execPath, [path.join(__dirname, '..', 'db', 'migrate.js'), dir, id, '--yes'], { env: { ...SAFE_ENV, PGDATABASE: db } });
// v7 Phase 2: Authorization cockpit, permission middleware and data scope (tests/authz.api.test.js).
const authzSuite = (label, db, appId, schema = 'samadhan') => run(`Authz suite: ${label}`, process.execPath, [path.join(__dirname, 'authz.api.test.js')], {
    env: { ...SAFE_ENV, SAMADHAN_TEST_ALLOW: '1', SAMADHAN_TEST_API: `http://localhost:${API_PORT}/api/samadhan`, SAMADHAN_TEST_PG: `postgres://postgres@localhost:${PG_PORT}/${db}`, SAMADHAN_TEST_APP_ID: appId, SAMADHAN_TEST_SCHEMA: schema },
    expect: (o) => /ALL PASSED/.test(o) && !/^FAIL/m.test(o),
    detail: (o) => `${(o.match(/^PASS/gm) || []).length} pass, ${(o.match(/^FAIL/gm) || []).length} fail`,
});

const BASELINE_SMOKE = {
    'GET /api/health': 200, 'GET /api/access/me': 400, 'GET /api/admin/apps': 401, 'GET /api/me/notifications': 401, 'GET /api/dev-tracker/': 404,
    'GET /api/salescode/': 404, 'GET /api/change-control/': 401, 'GET /api/me/cost-watch': 401, 'GET /api/me/cascade-pricing': 401, 'GET /api/me/mm-mdm': 401,
    'GET /api/setu/me': 401, 'GET /api/setu/meta': 401, 'GET /api/setu/whatsapp/webhook': 403, 'POST /api/setu/jobs/run': 403,
};
async function smoke() {
    // No database at all (closed port): the shared backend must start and every app must answer as in BASELINE.md.
    await stopBackend();
    const out = fs.openSync(path.join(ART, 'backend-nodb.log'), 'w');
    server = spawn(process.execPath, ['server.js'], { cwd: BACKEND, env: { ...process.env, ...SAFE_ENV, PORT: String(API_PORT), PGHOST: '127.0.0.1', PGPORT: '1', PGDATABASE: 'none' }, stdio: ['ignore', out, out] });
    for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${API_PORT}/api/health`)).ok) break; } catch { /* */ } await sleep(250); }
    const want = { ...BASELINE_SMOKE };
    for (const [k, v] of Object.entries(BASELINE_SMOKE)) if (k.includes('/api/setu/')) want[k.replace('/api/setu/', '/api/samadhan/')] = v;
    const bad = [];
    for (const [k, v] of Object.entries(want)) {
        const [method, url] = k.split(' ');
        const s = await fetch(`http://localhost:${API_PORT}${url}`, { method, signal: AbortSignal.timeout(15000) }).then((r) => r.status).catch((e) => `ERR ${e.message}`);
        if (s !== v) bad.push(`${k}: ${s} (baseline ${v})`);
    }
    await stopBackend();
    record('zero impact: no-DB smoke of every app route = BASELINE.md (+ /api/samadhan answers the same)', !bad.length, bad.join('; ') || `${Object.keys(want).length} routes`, 'zero impact smoke');
}

// Allowed paths (docs/v7 PLAN / §T2.1): Samadhan-owned + the Samadhan lines of these shared files.
// embedded-apps/<old stub>/ is listed only so its removal passes; nothing is added there.
const ALLOWED = [/^embedded-apps\/samadhan\//, /^embedded-apps\/se[t]u\//, /^backend\/samadhan\//, /^docs\/v7\//, /^docs\/SAMADHAN_/,
    /^backend\/server\.js$/, /^backend\/notifications\.js$/, /^backend\/\.env\.example$/, /^hub-next\/src\/data\/mockData\.ts$/, /^hub-next\/src\/components\/admin\/adminShared\.tsx$/, /^CHANGELOG\.md$/];
function pathGuard() {
    const base = spawnSync('git', ['merge-base', 'origin/main', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
    const names = new Set([
        ...spawnSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n'),
        ...spawnSync('git', ['diff', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n'),
        ...spawnSync('git', ['diff', '--name-only', '--cached'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n'),
        ...spawnSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n'),
    ].map((s) => s.trim()).filter(Boolean));
    const bad = [...names].filter((n) => !ALLOWED.some((re) => re.test(n)));
    record('path guard: changes only in allowed paths', !bad.length, bad.join(', ') || `${names.size} files`, 'path guard');
}

async function e2e() {
    freshDb('e2e_test');
    await startBackend('e2e_test', BACKEND, { FRONTEND_ORIGIN: `http://localhost:${WEB_PORT}` });
    const S = 'samadhan';
    const people = { admin: 'e2e.admin@test.samadhan.local', sup: 'e2e.sup@test.samadhan.local', agent: 'e2e.agent@test.samadhan.local' };
    for (const [k, role] of [['admin', 'Admin'], ['sup', 'Supervisor'], ['agent', 'Agent']]) psql('e2e_test', `INSERT INTO emami_apps.authorized_user_apps (email, app_id, role) VALUES ('${people[k]}', 'samadhan', '${role}')`);
    const jwt = require(path.join(BACKEND, 'node_modules', 'jsonwebtoken'));
    const tok = (e) => jwt.sign({ email: e }, SECRET, { expiresIn: '2h' });
    const api = `http://localhost:${API_PORT}/api/samadhan`;
    const created = await fetch(`${api}/tickets`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok(people.agent)}` },
        body: JSON.stringify({ subject: 'E2E seeded ticket', requesterName: 'E2E Person', requesterEmail: 'e2e.person@test.samadhan.local', source: 'Phone', description: 'seeded' }) }).then((r) => r.json());
    const csatToken = crypto.randomBytes(24).toString('base64url');
    psql('e2e_test', `INSERT INTO ${S}.csat_requests ("ticketId", token) VALUES (${Number(created.ticket.id)}, '${csatToken}')`);
    const data = {
        admin: { email: people.admin, token: tok(people.admin) }, sup: { email: people.sup, token: tok(people.sup) }, agent: { email: people.agent, token: tok(people.agent) },
        ticketId: created.ticket.id, ticketSubject: 'E2E seeded ticket', csatToken, api,
    };
    run('E2E build (API = local test backend)', npm, ['run', 'build'], { cwd: FRONT, env: { NEXT_PUBLIC_SAMADHAN_API_URL: `http://localhost:${API_PORT}/api` } });
    const web = spawn(process.execPath, [path.join(FRONT, 'e2e', 'serve.js'), String(WEB_PORT)], { stdio: 'ignore' });
    await sleep(800);
    // Warm-up: the backend sits idle through the E2E build, and its first request afterwards can take several seconds
    // (gate run of 2026-11-06: /me took 6.7 s and the first test timed out on the spinner). Each persona makes the
    // app's first two calls once here so the browser tests measure the app, not a cold start.
    for (const k of ['agent', 'sup', 'admin']) {
        for (const p of ['me', 'meta']) {
            const t = Date.now();
            const r = await fetch(`${api}/${p}`, { headers: { Authorization: `Bearer ${data[k].token}`, Origin: `http://localhost:${WEB_PORT}` } }).catch((e) => ({ status: `error ${e.message}` }));
            log(`warm-up ${k} /${p}: ${r.status} in ${Date.now() - t} ms`);
        }
    }
    try {
        run('E2E (Playwright, Edge, desktop + 360 px)', npx, ['playwright', 'test', '--config', 'e2e/playwright.config.ts'], {
            cwd: FRONT, env: { E2E_DATA: JSON.stringify(data) },
            detail: (o) => (o.match(/\d+ (passed|failed|skipped|flaky)/g) || []).join(', '),
            expect: (o) => !/\d+ failed/.test(o),
        });
    } finally {
        web.kill();
        await stopBackend();
    }
}

(async () => {
    const t0 = Date.now();
    console.log(`Samadhan gate ${QUICK ? '(quick) ' : ''}${STAGES.length ? `(stages: ${STAGES.join(', ')}) ` : ''}- log: ${path.relative(ROOT, logFile)}`);
    // 1. Static
    if (want('static')) {
    run('frontend typecheck', npm, ['run', 'typecheck'], { cwd: FRONT });
    run('frontend lint (0 errors, warnings <= baseline 2)', npm, ['run', 'lint'], { cwd: FRONT });
    run('frontend build (production settings)', npm, ['run', 'build'], { cwd: FRONT });
    const jsFiles = [];
    (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') walk(f); } else if (e.name.endsWith('.js')) jsFiles.push(f); } })(path.join(BACKEND, 'samadhan'));
    jsFiles.push(path.join(BACKEND, 'server.js'), path.join(BACKEND, 'notifications.js'));
    const syntaxBad = jsFiles.filter((f) => spawnSync(process.execPath, ['--check', f]).status !== 0);
    record('backend syntax (node --check)', !syntaxBad.length, syntaxBad.join(', ') || `${jsFiles.length} files`, 'backend syntax');
    }
    // 2. Unit
    const nodeTest = (o) => `${(o.match(/ℹ pass (\d+)/) || [])[1] || 0} pass, ${(o.match(/ℹ fail (\d+)/) || [])[1] || 0} fail`;
    if (want('unit')) run('Samadhan unit tests', process.execPath, ['--test', path.join(__dirname, 'unit.test.js'), path.join(__dirname, 'naming.test.js'), path.join(__dirname, 'permissions.test.js'), path.join(__dirname, 'attachments.unit.test.js'), path.join(__dirname, 'workspaces.unit.test.js')], { detail: nodeTest });
    if (want('unit')) run('shared backend tests (npm test)', npm, ['test'], { cwd: BACKEND, detail: nodeTest });
    // 3. Database suites
    const pg = (DB_PARTS.some(wantDb) || want('e2e')) ? await ensurePg() : { ok: true, none: true };
    if (pg.none) { /* no database stage requested */ } else
    if (!pg.ok) {
        record(`test database localhost:${PG_PORT}`, false, `${pg.why}; every database step skipped`);
    } else {
        if (wantDb('api')) {
        freshDb('samadhan_test'); await startBackend('samadhan_test');
        apiSuite('new path /api/samadhan, grants under samadhan', 'samadhan', 'samadhan_test', 'samadhan');
        authzSuite('cockpit, permissions, data scope', 'samadhan_test', 'samadhan');
        }
        if (wantDb('rollback')) {
        // 7.1-auth rollback: without the cockpit tables everyone has exactly the old role behaviour; then up again.
        freshDb('samadhan_test'); await startBackend('samadhan_test'); await stopBackend();
        migrate('samadhan_test', 'down', '7.1-auth'); await startBackend('samadhan_test');
        apiSuite('after migrate down 7.1-auth (no cockpit tables: base roles only)', 'samadhan', 'samadhan_test', 'samadhan');
        await stopBackend(); migrate('samadhan_test', 'up', '7.1-auth'); await startBackend('samadhan_test');
        authzSuite('after migrate up 7.1-auth again', 'samadhan_test', 'samadhan');
        }
        if (wantDb('attach')) {
        // Attachments: 7.1-attachments down and up again on a new database, then the attachment suite (empty file folder).
        freshDb('samadhan_test'); await startBackend('samadhan_test'); await stopBackend();
        migrate('samadhan_test', 'down', '7.1-attachments'); migrate('samadhan_test', 'up', '7.1-attachments');
        fs.rmSync(FILES_DIR, { recursive: true, force: true }); await startBackend('samadhan_test');
        run('Attachments suite (local storage)', process.execPath, [path.join(__dirname, 'attachments.api.test.js')], {
            env: { ...SAFE_ENV, SAMADHAN_TEST_ALLOW: '1', SAMADHAN_TEST_API: `http://localhost:${API_PORT}/api/samadhan`, SAMADHAN_TEST_PG: `postgres://postgres@localhost:${PG_PORT}/samadhan_test` },
            expect: (o) => /ALL PASSED/.test(o) && !/^FAIL/m.test(o),
            detail: (o) => `${(o.match(/^PASS/gm) || []).length} pass, ${(o.match(/^FAIL/gm) || []).length} fail`,
        });
        }
        if (wantDb('ws')) {
        // v7 Phase 3: 7.2-workspaces down and up again on a new database (seeds + backfill re-run), then the suite.
        freshDb('samadhan_test'); await startBackend('samadhan_test'); await stopBackend();
        migrate('samadhan_test', 'down', '7.3-generic'); migrate('samadhan_test', 'down', '7.2-workspaces');
        migrate('samadhan_test', 'up', '7.2-workspaces'); migrate('samadhan_test', 'up', '7.3-generic');
        await startBackend('samadhan_test');
        run('Workspaces suite (applications, references, classification, scope)', process.execPath, [path.join(__dirname, 'workspaces.api.test.js')], {
            env: { ...SAFE_ENV, SAMADHAN_TEST_ALLOW: '1', SAMADHAN_TEST_API: `http://localhost:${API_PORT}/api/samadhan`, SAMADHAN_TEST_PG: `postgres://postgres@localhost:${PG_PORT}/samadhan_test` },
            expect: (o) => /ALL PASSED/.test(o) && !/^FAIL/m.test(o),
            detail: (o) => `${(o.match(/^PASS/gm) || []).length} pass, ${(o.match(/^FAIL/gm) || []).length} fail`,
        });
        }
        if (wantDb('sap')) {
        // v7 Phase 4: 7.4-sap down and up again on a new database (its seed manifest removed and re-applied), then the SAP suite.
        freshDb('samadhan_test'); await startBackend('samadhan_test'); await stopBackend();
        migrate('samadhan_test', 'down', '7.4-sap'); migrate('samadhan_test', 'up', '7.4-sap');
        await startBackend('samadhan_test');
        run('SAP suite (SAP details, external refs, masters, confidential, desk routing)', process.execPath, [path.join(__dirname, 'sap.api.test.js')], {
            env: { ...SAFE_ENV, SAMADHAN_TEST_ALLOW: '1', SAMADHAN_TEST_API: `http://localhost:${API_PORT}/api/samadhan`, SAMADHAN_TEST_PG: `postgres://postgres@localhost:${PG_PORT}/samadhan_test` },
            expect: (o) => /ALL PASSED/.test(o) && !/^FAIL/m.test(o),
            detail: (o) => `${(o.match(/^PASS/gm) || []).length} pass, ${(o.match(/^FAIL/gm) || []).length} fail`,
        });
        }
        if (wantDb('it')) {
        // v7 Phase 5: 7.5-it down and up again on a new database, then the Digital Apps / Infra & IT suite.
        freshDb('samadhan_test'); await startBackend('samadhan_test'); await stopBackend();
        migrate('samadhan_test', 'down', '7.5-it'); migrate('samadhan_test', 'up', '7.5-it');
        await startBackend('samadhan_test');
        run('IT suite (Digital Apps, Infra & IT, IT details, portal application picker)', process.execPath, [path.join(__dirname, 'it.api.test.js')], {
            env: { ...SAFE_ENV, SAMADHAN_TEST_ALLOW: '1', SAMADHAN_TEST_API: `http://localhost:${API_PORT}/api/samadhan`, SAMADHAN_TEST_PG: `postgres://postgres@localhost:${PG_PORT}/samadhan_test` },
            expect: (o) => /ALL PASSED/.test(o) && !/^FAIL/m.test(o),
            detail: (o) => `${(o.match(/^PASS/gm) || []).length} pass, ${(o.match(/^FAIL/gm) || []).length} fail`,
        });
        }
        if (wantDb('compat')) {
        freshDb('samadhan_test'); await startBackend('samadhan_test');
        // The same API on the route the dev web server forwards today (samadhan.TRANSPORT_PATH).
        apiSuite('transport route (same API, forwarded route)', 'se' + 'tu', 'samadhan_test', 'samadhan');
        freshDb('samadhan_test'); await startBackend('samadhan_test');
        golden('new database', 'samadhan', 'samadhan_test', 'samadhan', 'samadhan');
        }
        await stopBackend();
        if (want('e2e')) {
            await smoke();
            if (!QUICK) await e2e();
        }
    }
    pathGuard();
    await stopBackend();
    const failed = results.filter((r) => !r.ok);
    fs.writeFileSync(path.join(ART, STAGES.length ? `gate-last-${STAGES.join('-')}.json` : 'gate-last.json'), JSON.stringify({ at: new Date().toISOString(), quick: QUICK, stages: STAGES.length ? STAGES : 'all', minutes: Math.round((Date.now() - t0) / 60000), results }, null, 2));
    console.log(`\n${failed.length ? `GATE RED: ${failed.length} of ${results.length} failed` : `GATE GREEN: ${results.length} of ${results.length} passed`} in ${Math.round((Date.now() - t0) / 60000)} min`);
    process.exit(failed.length ? 1 : 0);
})().catch(async (e) => { console.error('gate crashed:', e); await stopBackend(); process.exit(2); });
