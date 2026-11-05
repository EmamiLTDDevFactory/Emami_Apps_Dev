'use strict';
/*
   Samadhan test gate (docs/v7/TEST-PLAN.md). Everything must pass before a push. Local only:

     node backend/samadhan/tests/gate.js            # static, unit, API (new + old path), upgrade round-trip, golden, smoke, E2E, path guard
     node backend/samadhan/tests/gate.js --quick    # without the E2E browser run

   Needs: the throwaway Postgres on localhost:55432 (trust, see TEST-PLAN §A; started here if it is not running and
   %LOCALAPPDATA%\samadhan-test-pg exists), Microsoft Edge (E2E). Uses ports 4191 (backend) and 3250 (static site).
   Mail, WhatsApp, notification emails and AI are off; a random JWT secret is made for each run (never the real one).
   The v6 template database `golden_v6` is made once from the v6 code (git commit V6_COMMIT) in a temporary worktree.
*/
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BACKEND = path.join(ROOT, 'backend');
const FRONT = path.join(ROOT, 'embedded-apps', 'samadhan');
const STUB = path.join(ROOT, 'embedded-apps', 'setu');
const ART = path.join(ROOT, 'docs', 'v7', 'test-artifacts');
const V6_COMMIT = '9090e09';
const PG_BIN = process.env.SAMADHAN_PG_BIN || 'C:\\Program Files\\PostgreSQL\\18\\bin';
const PG_PORT = 55432;
const API_PORT = 4191;
const WEB_PORT = 3250;
const QUICK = process.argv.includes('--quick');
const SECRET = crypto.randomBytes(32).toString('hex');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
fs.mkdirSync(ART, { recursive: true });

const results = [];
const logFile = path.join(ART, 'gate-last.log');
fs.writeFileSync(logFile, '');
const log = (s) => fs.appendFileSync(logFile, `${s}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(name, cmd, args, opts = {}) {
    const t0 = Date.now();
    const r = spawnSync(cmd, args, { cwd: opts.cwd || ROOT, env: { ...process.env, ...(opts.env || {}) }, encoding: 'utf8', shell: opts.shell ?? /\.cmd$/.test(cmd), maxBuffer: 64 * 1024 * 1024 });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    log(`\n===== ${name} (exit ${r.status}) =====\n${out}`);
    const ok = r.status === 0 && (!opts.expect || opts.expect(out));
    const detail = opts.detail ? opts.detail(out) : '';
    results.push({ name, ok, ms: Date.now() - t0, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}  ${Math.round((Date.now() - t0) / 1000)} s`);
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

const SAFE_ENV = {
    // 'localtest' is the scheduler secret api.test.js sends (tests/README.md); test-only, never a real value.
    HUB_AUTH_JWT_SECRET: SECRET, HUB_INTERNAL_API_SECRET: 'localtest',
    PGHOST: 'localhost', PGPORT: String(PG_PORT), PGUSER: 'postgres', PGPASSWORD: 'x',
    SAMADHAN_MAIL_ENABLED: 'false', SETU_MAIL_ENABLED: 'false', SAMADHAN_WHATSAPP_ENABLED: 'false', SETU_WHATSAPP_ENABLED: 'false',
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
    const prefix = fs.existsSync(path.join(cwd, 'samadhan')) ? 'samadhan' : 'setu';
    await fetch(`http://localhost:${API_PORT}/api/${prefix}/portal/config`).catch(() => {});
}
async function stopBackend() {
    if (!server) return;
    server.kill();
    await new Promise((r) => { server.once('exit', r); setTimeout(r, 3000); });
    server = null;
    await sleep(300);
}

function pgRunning() { return psql('postgres', 'select 1').status === 0; }
async function ensurePg() {
    if (pgRunning()) return true;
    const dir = path.join(process.env.LOCALAPPDATA || os.homedir(), 'samadhan-test-pg');
    if (!fs.existsSync(path.join(dir, 'data'))) return false;
    spawn(path.join(PG_BIN, 'postgres'), ['-D', path.join(dir, 'data'), '-p', String(PG_PORT), '-c', 'listen_addresses=localhost'], { cwd: dir, detached: true, stdio: 'ignore' }).unref();
    for (let i = 0; i < 40 && !pgRunning(); i++) await sleep(500);
    return pgRunning();
}

// The v6 database, made by the v6 code itself: the starting point of the upgrade test.
async function ensureV6Template() {
    if (psql('postgres', "SELECT 1 FROM pg_database WHERE datname = 'golden_v6'").stdout.trim() === '1') return true;
    const wt = path.join(os.tmpdir(), `samadhan-v6-${process.pid}`);
    spawnSync('git', ['worktree', 'add', '-q', '--detach', wt, V6_COMMIT], { cwd: ROOT });
    try {
        if (process.platform === 'win32') spawnSync('cmd', ['/c', 'mklink', '/J', path.join(wt, 'backend', 'node_modules'), path.join(BACKEND, 'node_modules')]);
        else fs.symlinkSync(path.join(BACKEND, 'node_modules'), path.join(wt, 'backend', 'node_modules'));
        freshDb('golden_v6');
        await startBackend('golden_v6', path.join(wt, 'backend'));
        const r = run('v6 template: golden compare on the v6 code', process.execPath, [path.join(__dirname, 'golden', 'golden.js'), 'compare'],
            { env: { ...SAFE_ENV, GOLDEN_API: `http://localhost:${API_PORT}/api/setu`, GOLDEN_PG: `postgres://postgres@localhost:${PG_PORT}/golden_v6`, GOLDEN_SCHEMA: 'setu', GOLDEN_APP_ID: 'setu' } });
        await stopBackend();
        return r.ok;
    } finally {
        if (process.platform === 'win32') spawnSync('cmd', ['/c', 'rmdir', path.join(wt, 'backend', 'node_modules')]);
        spawnSync('git', ['worktree', 'remove', '--force', wt], { cwd: ROOT });
    }
}

const golden = (label, api, db, schema, appId) => run(`golden byte-identical: ${label}`, process.execPath, [path.join(__dirname, 'golden', 'golden.js'), 'compare'],
    { env: { ...SAFE_ENV, GOLDEN_API: `http://localhost:${API_PORT}/api/${api}`, GOLDEN_PG: `postgres://postgres@localhost:${PG_PORT}/${db}`, GOLDEN_SCHEMA: schema, GOLDEN_APP_ID: appId } });
const apiSuite = (label, api, db, appId, schema = 'samadhan') => run(`API suite: ${label}`, process.execPath, [path.join(__dirname, 'api.test.js')], {
    env: { ...SAFE_ENV, SAMADHAN_TEST_ALLOW: '1', SAMADHAN_TEST_API: `http://localhost:${API_PORT}/api/${api}`, SAMADHAN_TEST_PG: `postgres://postgres@localhost:${PG_PORT}/${db}`, SAMADHAN_TEST_APP_ID: appId, SAMADHAN_TEST_SCHEMA: schema },
    expect: (o) => /ALL PASSED/.test(o) && !/^FAIL/m.test(o),
    detail: (o) => `${(o.match(/^PASS/gm) || []).length} pass, ${(o.match(/^FAIL/gm) || []).length} fail`,
});
const migrate = (db, dir) => run(`migrate ${dir} 7.0-rename on ${db}`, process.execPath, [path.join(__dirname, '..', 'db', 'migrate.js'), dir, '7.0-rename', '--yes'], { env: { ...SAFE_ENV, PGDATABASE: db } });

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
    results.push({ name: 'zero impact: no-DB smoke of every app route = BASELINE.md (+ /api/samadhan = /api/setu)', ok: !bad.length, detail: bad.join('; ') || `${Object.keys(want).length} routes` });
    console.log(`${bad.length ? 'FAIL' : 'PASS'}  zero impact smoke  ${bad.join('; ')}`);
}

// Allowed paths (docs/v7 PLAN / §T2.1): Samadhan-owned + the Samadhan lines of these shared files.
const ALLOWED = [/^embedded-apps\/samadhan\//, /^embedded-apps\/setu\//, /^backend\/samadhan\//, /^backend\/setu\//, /^docs\/v7\//, /^docs\/SAMADHAN_/,
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
    results.push({ name: 'path guard: changes only in allowed paths', ok: !bad.length, detail: bad.join(', ') || `${names.size} files` });
    console.log(`${bad.length ? 'FAIL' : 'PASS'}  path guard  ${bad.join(', ') || `${names.size} files`}`);
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
    run('redirect stub build', process.execPath, ['build.js'], { cwd: STUB });
    const web = spawn(process.execPath, [path.join(FRONT, 'e2e', 'serve.js'), String(WEB_PORT)], { stdio: 'ignore' });
    await sleep(800);
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
    console.log(`Samadhan gate ${QUICK ? '(quick) ' : ''}- log: ${path.relative(ROOT, logFile)}`);
    // 1. Static
    run('frontend typecheck', npm, ['run', 'typecheck'], { cwd: FRONT });
    run('frontend lint (0 errors, warnings <= baseline 2)', npm, ['run', 'lint'], { cwd: FRONT });
    run('frontend build (production settings)', npm, ['run', 'build'], { cwd: FRONT });
    const jsFiles = [];
    (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') walk(f); } else if (e.name.endsWith('.js')) jsFiles.push(f); } })(path.join(BACKEND, 'samadhan'));
    jsFiles.push(path.join(BACKEND, 'server.js'), path.join(BACKEND, 'notifications.js'), path.join(STUB, 'build.js'));
    const syntaxBad = jsFiles.filter((f) => spawnSync(process.execPath, ['--check', f]).status !== 0);
    results.push({ name: 'backend syntax (node --check)', ok: !syntaxBad.length, detail: syntaxBad.join(', ') || `${jsFiles.length} files` });
    console.log(`${syntaxBad.length ? 'FAIL' : 'PASS'}  backend syntax  ${jsFiles.length} files`);
    // 2. Unit
    const nodeTest = (o) => `${(o.match(/ℹ pass (\d+)/) || [])[1] || 0} pass, ${(o.match(/ℹ fail (\d+)/) || [])[1] || 0} fail`;
    run('Samadhan unit tests', process.execPath, ['--test', path.join(__dirname, 'unit.test.js'), path.join(__dirname, 'rename.test.js')], { detail: nodeTest });
    run('shared backend tests (npm test)', npm, ['test'], { cwd: BACKEND, detail: nodeTest });
    // 3. Database suites
    if (!(await ensurePg())) {
        results.push({ name: 'test database localhost:55432', ok: false, detail: 'not running and no %LOCALAPPDATA%\\samadhan-test-pg' });
    } else {
        freshDb('samadhan_test'); await startBackend('samadhan_test');
        apiSuite('new path /api/samadhan, grants under samadhan', 'samadhan', 'samadhan_test', 'samadhan');
        freshDb('samadhan_test'); await startBackend('samadhan_test');
        apiSuite('old path /api/setu, grants under setu (compatibility)', 'setu', 'samadhan_test', 'setu');
        freshDb('samadhan_test'); await startBackend('samadhan_test');
        golden('new database', 'samadhan', 'samadhan_test', 'samadhan', 'samadhan');
        await stopBackend();
        if (await ensureV6Template()) {
            freshDb('upg_test', 'golden_v6'); await startBackend('upg_test');
            golden('v6 database, before the rename (legacy schema)', 'samadhan', 'upg_test', 'setu', 'setu');
            await stopBackend(); migrate('upg_test', 'up'); await startBackend('upg_test');
            golden('v6 database after migrate up', 'samadhan', 'upg_test', 'samadhan', 'setu');
            await stopBackend(); migrate('upg_test', 'down'); await startBackend('upg_test');
            golden('after migrate down (legacy path)', 'setu', 'upg_test', 'setu', 'setu');
            await stopBackend(); migrate('upg_test', 'up'); await startBackend('upg_test');
            golden('after up again (round trip)', 'samadhan', 'upg_test', 'samadhan', 'setu');
            await stopBackend();
            // A database still on the legacy schema name (the rename not run yet): the full suite must pass as well.
            freshDb('legacy_test'); await startBackend('legacy_test'); await stopBackend();
            migrate('legacy_test', 'down'); await startBackend('legacy_test');
            apiSuite('legacy schema setu (rename not run yet), old grants', 'samadhan', 'legacy_test', 'setu', 'setu');
            await stopBackend();
        } else results.push({ name: 'v6 template database', ok: false, detail: 'could not be built from the v6 code' });
        await smoke();
        if (!QUICK) await e2e();
    }
    pathGuard();
    await stopBackend();
    const failed = results.filter((r) => !r.ok);
    fs.writeFileSync(path.join(ART, 'gate-last.json'), JSON.stringify({ at: new Date().toISOString(), quick: QUICK, minutes: Math.round((Date.now() - t0) / 60000), results }, null, 2));
    console.log(`\n${failed.length ? `GATE RED: ${failed.length} of ${results.length} failed` : `GATE GREEN: ${results.length} of ${results.length} passed`} in ${Math.round((Date.now() - t0) / 60000)} min`);
    process.exit(failed.length ? 1 : 0);
})().catch(async (e) => { console.error('gate crashed:', e); await stopBackend(); process.exit(2); });
