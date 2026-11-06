'use strict';
/*
   v7 Phase 1 (rename setu -> samadhan, formerly Setu): the compatibility layer, without a database.
   Run: node --test backend/samadhan/tests/rename.test.js
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

test('email threading: the existing tokens still win; an APPCODE-id reference never threads by itself', () => {
    const { ticketNumberFromSubject } = require('../lib/mail');
    assert.equal(ticketNumberFromSubject('Re: Login fails [#100123]'), 100123);
    assert.equal(ticketNumberFromSubject('Re: Login fails [MSFA-100123] [#100123]'), 100123);
    assert.equal(ticketNumberFromSubject('Ticket Received - Login fails [MSFA-100123] || 100123'), 100123);
    assert.equal(ticketNumberFromSubject('[MSFA-100123] Login fails'), null);
    assert.equal(ticketNumberFromSubject('MSFA-100123 Login fails'), null);
    assert.equal(ticketNumberFromSubject('#TICKET No - 100124'), 100124);
});

test('settings: SAMADHAN_<X> first, then the old SETU_<X>, then the default; empty counts as not set', () => {
    const { env } = require('../constants');
    const keep = { ...process.env };
    try {
        delete process.env.SAMADHAN_ZZ_TEST; delete process.env.SETU_ZZ_TEST;
        assert.equal(env('ZZ_TEST', 'dflt'), 'dflt');
        process.env.SETU_ZZ_TEST = 'old';
        assert.equal(env('ZZ_TEST', 'dflt'), 'old');
        process.env.SAMADHAN_ZZ_TEST = '';
        assert.equal(env('ZZ_TEST', 'dflt'), 'old');
        process.env.SAMADHAN_ZZ_TEST = 'new';
        assert.equal(env('ZZ_TEST', 'dflt'), 'new');
    } finally {
        process.env = keep;
    }
});

test('settings: the pre-v7 SETU_WHATSAPP_APP_SECRET is still read (unit.test.js sets only the old name)', () => {
    // unit.test.js sets process.env.SETU_WHATSAPP_APP_SECRET before loading constants; here the constant is checked
    // through the same helper the constants use.
    const { env } = require('../constants');
    const keep = process.env.SETU_WHATSAPP_APP_SECRET;
    process.env.SETU_WHATSAPP_APP_SECRET = 'x';
    try { assert.equal(env('WHATSAPP_APP_SECRET'), process.env.SAMADHAN_WHATSAPP_APP_SECRET || 'x'); } finally {
        if (keep === undefined) delete process.env.SETU_WHATSAPP_APP_SECRET; else process.env.SETU_WHATSAPP_APP_SECRET = keep;
    }
});

test('schema name: queries are written once as samadhan.<table> and rewritten only on a legacy (setu) database', () => {
    const p = require('../db/pool');
    assert.equal(p.CONFIGURED, 'samadhan');
    const sql = `SELECT * FROM samadhan.tickets t JOIN samadhan.contacts c ON c.id = t."requesterId" WHERE c.email LIKE '%@demo.samadhan.local' AND x = nextval('samadhan.ticket_id_seq')`;
    p.setActiveSchema('samadhan');
    assert.equal(p.rewrite(sql), sql);
    p.setActiveSchema('setu');
    assert.equal(p.legacyMode(), true);
    assert.equal(
        p.rewrite(sql),
        `SELECT * FROM setu.tickets t JOIN setu.contacts c ON c.id = t."requesterId" WHERE c.email LIKE '%@demo.samadhan.local' AND x = nextval('setu.ticket_id_seq')`,
    );
    assert.equal(p.rewrite('UPDATE "samadhan".x SET a = 1'), 'UPDATE "samadhan".x SET a = 1', 'a quoted identifier is left alone');
    p.setActiveSchema('samadhan');
    assert.equal(p.legacyMode(), false);
});

test('no bare setu. table reference is left in Samadhan code (everything goes through the samadhan. prefix)', () => {
    const root = path.join(__dirname, '..');
    const offenders = [];
    const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const full = path.join(d, e.name);
            if (e.isDirectory()) { if (!['node_modules', 'golden'].includes(e.name)) walk(full); continue; }
            if (!/\.(js|sql)$/.test(e.name) || full.includes(`${path.sep}tests${path.sep}`)) continue;
            fs.readFileSync(full, 'utf8').split(/\r?\n/).forEach((line, i) => {
                // Allowed: the legacy names spelled out on purpose (lock, schema constants, migration, comments).
                if (/(?<![\w.\/-])setu\.(?!scheduled_jobs|local)/.test(line) && !/^\s*(\/\/|\/?\*|--)/.test(line) && !/LEGACY|'setu\.'|`\$\{name\}\.|setu\.\s*by name/.test(line)) {
                    offenders.push(`${path.relative(root, full)}:${i + 1}: ${line.trim().slice(0, 100)}`);
                }
            });
        }
    };
    walk(root);
    assert.deepEqual(offenders, []);
});

test('old links: the /apps/setu stub forwards path, query and hash to /apps/samadhan', () => {
    const stub = path.join(__dirname, '..', '..', '..', 'embedded-apps', 'setu');
    require('child_process').execFileSync(process.execPath, [path.join(stub, 'build.js')], { stdio: 'ignore' });
    for (const page of ['index.html', path.join('portal', 'index.html')]) {
        const html = fs.readFileSync(path.join(stub, 'dist', page), 'utf8');
        const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
        const go = (pathname, search = '', hash = '') => {
            let out = null;
            new Function('window', code)({ location: { pathname, search, hash, replace: (u) => { out = u; } } });
            return out;
        };
        assert.equal(go('/apps/setu/', '?ticket=100123'), '/apps/samadhan/?ticket=100123');
        assert.equal(go('/apps/setu/portal/', '?csat=abc', '#top'), '/apps/samadhan/portal/?csat=abc#top');
        assert.equal(go('/apps/setu'), '/apps/samadhan');
        assert.ok(['/apps/samadhan/', '/apps/samadhan/portal/'].includes(go('/apps/setux/')), 'a different path goes to the fallback');
        assert.ok(!/setu/i.test(html.replace(/'\/apps\/setu'/g, '').replace(/\/apps\/setu/g, '')), 'no visible "Setu" on the page');
    }
});
