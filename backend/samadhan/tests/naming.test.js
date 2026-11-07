'use strict';
/*
   Naming: Samadhan is the only name. No settings, app ids, schema names or texts of the earlier tool remain, except the
   few lines listed in ALLOWED (the transport route the web server forwards today, and the one migration that moved the
   old rows). Without a database:  node --test backend/samadhan/tests/naming.test.js
*/
process.env.PGHOST = '127.0.0.1';
process.env.PGPORT = '1';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const OLD = /(?<![a-z])setu(?![a-z])/i; // the whole word only ("setup", "setUsers" are other words)
// Lines that may still carry the old name, and why.
const ALLOWED = [
    [/backend[\\/]samadhan[\\/]index\.js$/, /^const TRANSPORT_PATH = '\/setu';$/], // forwarded route until the nginx block exists
    [/embedded-apps[\\/]samadhan[\\/]src[\\/]lib[\\/]api\.ts$/, /^const FALLBACK_ROUTE: string \| null = 'setu';$/], // the same route, client side
    [/backend[\\/]samadhan[\\/]db[\\/]migrate\.js$/, /app_id = 'setu'|'setu:%'|'setu' = ANY\(aliases\)|array_remove\(aliases, 'setu'\)/], // 7.3-generic moves old rows
    [/backend[\\/]samadhan[\\/]deploy[\\/]deploy-dev-server\.sh$/, /replace\(\/,\\s\*'?setu'?:/], // removes the old role / name entries on the server
    [/backend[\\/]samadhan[\\/]deploy[\\/]add-samadhan-nginx-route\.sh$/, /./], // replaces the old nginx block (root, one time)
    [/backend[\\/]samadhan[\\/]tests[\\/]gate\.js$/, /\/api\/setu\//], // zero-impact smoke: the forwarded route still answers like the baseline
    [/backend[\\/]samadhan[\\/]tests[\\/]naming\.test\.js$/, /./],
    [/backend[\\/]samadhan[\\/]tests[\\/]golden[\\/]/, /./], // byte-identical reference files (data only)
];

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', 'dist', '.next', 'out', 'test-results'].includes(e.name)) continue;
        const f = path.join(dir, e.name);
        if (e.isDirectory()) walk(f, out);
        else if (/\.(js|mjs|ts|tsx|json|sql|sh|md|css)$/.test(e.name) && e.name !== 'package-lock.json') out.push(f);
    }
    return out;
}

test('the earlier name appears nowhere in Samadhan code, tests, scripts or docs (apart from the listed lines)', () => {
    const files = [...walk(path.join(ROOT, 'backend', 'samadhan')), ...walk(path.join(ROOT, 'embedded-apps', 'samadhan'))];
    const found = [];
    for (const f of files) {
        fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
            if (!OLD.test(line)) return;
            const ok = ALLOWED.some(([file, re]) => file.test(f) && re.test(line.trim()));
            if (!ok) found.push(`${path.relative(ROOT, f)}:${i + 1}: ${line.trim().slice(0, 120)}`);
        });
    }
    assert.deepStrictEqual(found, []);
});

test('settings: only SAMADHAN_<name> is read', () => {
    const { env } = require('../constants');
    process.env.SETU_ZZ_TEST = 'old';
    try {
        assert.strictEqual(env('ZZ_TEST', 'default'), 'default');
        process.env.SAMADHAN_ZZ_TEST = 'new';
        assert.strictEqual(env('ZZ_TEST', 'default'), 'new');
    } finally {
        delete process.env.SETU_ZZ_TEST; delete process.env.SAMADHAN_ZZ_TEST;
    }
});

test('one app id and one schema', () => {
    const c = require('../constants');
    assert.strictEqual(c.APP_ID, 'samadhan');
    assert.deepStrictEqual(c.APP_IDS, ['samadhan']);
    const p = require('../db/pool');
    assert.strictEqual(p.CONFIGURED, 'samadhan');
    assert.strictEqual(p.LEGACY, undefined);
    assert.strictEqual(p.rewrite('SELECT 1 FROM samadhan.tickets'), 'SELECT 1 FROM samadhan.tickets');
});
