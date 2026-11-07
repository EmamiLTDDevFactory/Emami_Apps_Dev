'use strict';
/*
   v7 Phase 2 attachments - unit tests, no database and no network:
     file type rules (lib/fileCheck.js), storage reference + host fingerprint rules (lib/storage.js),
     inbound mail files (lib/mailAttachments.js) with Graph and storage replaced by stubs.
     node --test backend/samadhan/tests/attachments.unit.test.js
*/
process.env.PGHOST = '127.0.0.1';
process.env.PGPORT = '1';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const path = require('path');

const { checkFile, cleanName } = require('../lib/fileCheck');
const { fingerprintMatcher, objectKey, safeRef } = require('../lib/storage');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);

test('allowed types pass only with matching content', () => {
    assert.strictEqual(checkFile('a.png', PNG).type, 'image/png');
    assert.strictEqual(checkFile('A.PDF', Buffer.from('%PDF-1.7 x')).type, 'application/pdf');
    assert.strictEqual(checkFile('book.xlsx', Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2])).ok, true);
    assert.strictEqual(checkFile('old.xls', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])).ok, true);
    assert.strictEqual(checkFile('mail.msg', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])).ok, true);
    assert.strictEqual(checkFile('data.csv', Buffer.from('a,b\n1,2\n')).ok, true);
    assert.strictEqual(checkFile('photo.heic', Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic')])).ok, true);
});

test('blocked and unknown types are refused', () => {
    for (const n of ['x.exe', 'x.msi', 'x.bat', 'x.cmd', 'x.ps1', 'x.sh', 'x.js', 'x.vbs', 'x.jar', 'x.html', 'x.htm', 'x.svg', 'x.xlsm', 'x.docm']) {
        assert.strictEqual(checkFile(n, Buffer.from('abc')).ok, false, n);
    }
    assert.strictEqual(checkFile('noext', Buffer.from('abc')).ok, false);
    assert.strictEqual(checkFile('x.dwg', Buffer.from('abc')).ok, false);
});

test('content sniffing: renamed programs, HTML in text, macros', () => {
    assert.match(checkFile('cat.png', Buffer.from('MZ\x90\x00')).error, /does not look like/);
    assert.match(checkFile('doc.pdf', PNG).error, /does not look like/);
    assert.strictEqual(checkFile('notes.txt', Buffer.from('<html><body>x</body></html>')).ok, false);
    assert.strictEqual(checkFile('notes.txt', Buffer.from('a\u0000b')).ok, false);
    assert.match(checkFile('m.docx', Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('xl/vbaProject.bin')])).error, /macros/);
    assert.strictEqual(checkFile('empty.png', Buffer.alloc(0)).ok, false);
});

test('file names are cleaned', () => {
    assert.strictEqual(cleanName('C:\\Users\\x\\..\\evil.png'), 'evil.png');
    assert.strictEqual(cleanName('a/b/c.pdf'), 'c.pdf');
    assert.strictEqual(cleanName('bad"<>|*?:name.txt'), 'badname.txt');
    const long = cleanName(`${'n'.repeat(400)}.xlsx`);
    assert.ok(long.length === 200 && long.endsWith('.xlsx'));
    assert.strictEqual(cleanName(''), 'file');
});

test('storage references: only safe relative paths', () => {
    assert.strictEqual(safeRef('samadhan/attachments/2026/11/100001/abc-1'), 'samadhan/attachments/2026/11/100001/abc-1');
    for (const bad of ['../etc/passwd', '/abs/path', 'a/../b', 'a//b', 'a/./b', 'a\\b', '', 'a/b c']) assert.throws(() => safeRef(bad), /bad storage reference/, bad);
    assert.match(objectKey(100001, new Date('2026-01-05T00:00:00Z')), /^samadhan\/attachments\/2026\/01\/100001\/[0-9a-f-]{36}$/);
});

test('host key fingerprints: SHA256 base64 (ssh-keygen form), hex, several values', () => {
    const key = crypto.randomBytes(64);
    const h = crypto.createHash('sha256').update(key).digest();
    const b64 = `SHA256:${h.toString('base64').replace(/=+$/, '')}`;
    assert.strictEqual(fingerprintMatcher(b64)(key), true);
    assert.strictEqual(fingerprintMatcher(h.toString('hex'))(key), true);
    assert.strictEqual(fingerprintMatcher(`SHA256:AAAA, ${b64}`)(key), true);
    assert.strictEqual(fingerprintMatcher('SHA256:AAAA')(key), false);
    assert.strictEqual(fingerprintMatcher(''), null);
});

test('inbound mail: files saved, too-large / blocked / item attachments skipped with a private note', async () => {
    const dbCalls = [];
    const saved = [];
    // Stubs: database, Graph, storage and the attachment saver (loaded before lib/mailAttachments.js).
    const stub = (rel, exports) => { const p = require.resolve(path.join(__dirname, '..', rel)); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
    stub('db/pool.js', { pool: { query: async (sql, params) => { dbCalls.push([sql, params]); return { rows: /SELECT id FROM samadhan.conversations/.test(sql) ? [{ id: 77 }] : [] }; } } });
    stub('lib/storage.js', { storage: () => ({ name: 'local' }) });
    stub('lib/mail.js', {
        graph: async () => ({
            value: [
                { '@odata.type': '#microsoft.graph.fileAttachment', name: 'shot.png', contentBytes: PNG.toString('base64'), isInline: true, contentId: 'img1' },
                { '@odata.type': '#microsoft.graph.fileAttachment', name: 'huge.pdf', contentBytes: Buffer.alloc(3 * 1024 * 1024).toString('base64') },
                { '@odata.type': '#microsoft.graph.fileAttachment', name: 'tool.exe', contentBytes: Buffer.from('MZ').toString('base64') },
                { '@odata.type': '#microsoft.graph.itemAttachment', name: 'Forwarded mail' },
            ],
        }),
    });
    stub('lib/attachments.js', {
        limits: async () => ({ email: { perFileMb: 2, perTicketMb: 100 } }),
        saveAttachment: async (ticketId, f) => {
            if (f.name.endsWith('.exe')) throw Object.assign(new Error('.exe files are not allowed'), { status: 415 });
            saved.push({ ticketId, ...f });
            return { id: saved.length };
        },
    });
    stub('lib/util.js', { esc: (s) => s, logActivity: async () => {} });
    const { ingestMailAttachments } = require('../lib/mailAttachments');
    const out = await ingestMailAttachments({ id: 'm1', internetMessageId: '<a@b>', hasAttachments: true }, 100500);
    assert.deepStrictEqual(out, { saved: 1, skipped: 3 });
    assert.strictEqual(saved[0].name, 'shot.png');
    assert.strictEqual(saved[0].channel, 'email');
    assert.strictEqual(saved[0].conversationId, 77);
    assert.ok(dbCalls.some(([sql, p]) => /"inlineCid"/.test(sql) && p[1] === 'img1'), 'inline cid recorded');
    const note = dbCalls.find(([sql]) => /INSERT INTO samadhan.conversations/.test(sql));
    assert.ok(note && /huge\.pdf/.test(note[1][2]) && /tool\.exe/.test(note[1][2]) && /Forwarded mail/.test(note[1][2]) && /portal/.test(note[1][2]), 'private note lists the skipped files');
    // No attachments on the mail: nothing happens.
    assert.deepStrictEqual(await ingestMailAttachments({ id: 'm2', hasAttachments: false }, 1), { saved: 0, skipped: 0 });
});
