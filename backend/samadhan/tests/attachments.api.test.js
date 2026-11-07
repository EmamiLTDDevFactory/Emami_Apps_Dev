'use strict';
/*
   v7 Phase 2 - attachments end to end against a running backend with SAMADHAN_STORAGE=local (the SFTP adapter is
   checked separately against a real SFTP server; it implements the same put / get / del interface).
   Same safety rules as api.test.js. SAMADHAN_STORAGE_DIR must be the folder the backend under test writes to.
*/
const fs = require('fs');
const path = require('path');
const BACKEND = path.join(__dirname, '..', '..');
require(path.join(BACKEND, 'node_modules/dotenv')).config({ path: path.join(BACKEND, '.env'), quiet: true });
const jwt = require(path.join(BACKEND, 'node_modules/jsonwebtoken'));
const { Client } = require(path.join(BACKEND, 'node_modules/pg'));

const T = (name, fallback) => process.env[`SAMADHAN_TEST_${name}`] || fallback;
const API = T('API', 'http://localhost:4191/api/samadhan');
const PG = T('PG', 'postgres://postgres@localhost:55432/samadhan_test');
const APP = T('APP_ID', 'samadhan');
const S = T('SCHEMA', 'samadhan');
const DIR = process.env.SAMADHAN_STORAGE_DIR;
const SECRET = process.env.HUB_AUTH_JWT_SECRET;
if (T('ALLOW') !== '1' || !/@(localhost|127\.0\.0\.1)[:/]/.test(PG) || !/\/\/(localhost|127\.0\.0\.1)[:/]/.test(API) || !/^[a-z_]+$/.test(S)) {
    console.error('Refusing to run: set SAMADHAN_TEST_ALLOW=1 and point SAMADHAN_TEST_PG / SAMADHAN_TEST_API at localhost only.');
    process.exit(2);
}
if (!SECRET || !DIR) { console.error('HUB_AUTH_JWT_SECRET and SAMADHAN_STORAGE_DIR must be set (same values as the backend under test).'); process.exit(2); }

let fails = 0;
const check = (cond, label, extra) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 240) : ''}`); if (!cond) fails++; };
const auth = (email) => (email ? { Authorization: `Bearer ${jwt.sign({ email }, SECRET, { expiresIn: '1h' })}` } : {});
async function call(email, method, url, body) {
    const r = await fetch(API + url, { method, headers: { 'Content-Type': 'application/json', ...auth(email) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
}
async function upload(email, ticketId, name, buffer, extra = '') {
    const r = await fetch(`${API}/tickets/${ticketId}/attachments${extra}`, {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(name), ...auth(email) }, body: buffer,
    });
    return { status: r.status, body: await r.json().catch(() => null) };
}
const filesOnDisk = () => { const out = []; const walk = (d) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out.push(p); } }; walk(DIR); return out; };

// Small real files (the content check looks at the first bytes).
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 7)]);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(300, 1)]);
const DOCM = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('....word/vbaProject.bin....')]);
const ADMIN = 'f.admin@emamigroup.com';
const SUP = 'f.sup@emamigroup.com';
const A1 = 'f.agent1@emamigroup.com';
const A2 = 'f.agent2@emamigroup.com';

(async () => {
    const db = new Client({ connectionString: PG });
    await db.connect();
    for (const [email, role] of [[ADMIN, 'Admin'], [SUP, 'Supervisor'], [A1, 'Agent'], [A2, 'Agent']]) {
        await db.query('INSERT INTO emami_apps.authorized_user_apps (email, app_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [email, APP, role]);
    }
    const me = (await call(A1, 'GET', '/me')).body;
    const a2 = (await call(A2, 'GET', '/me')).body.me;
    await call(SUP, 'GET', '/me');
    await call(ADMIN, 'GET', '/me');
    check(me.attachments?.enabled === true && me.attachments.adapter === 'local' && me.attachments.limits.agent.perFileMb === 10, '/me: attachments on (local), default limits', me.attachments);

    const t1 = (await call(A1, 'POST', '/tickets', { subject: 'Files one', requesterName: 'Req F', requesterEmail: 'reqf@example.com' })).body.ticket;
    const t2 = (await call(A1, 'POST', '/tickets', { subject: 'Files two', requesterName: 'Req F', requesterEmail: 'reqf@example.com' })).body.ticket;
    await call(ADMIN, 'PATCH', `/tickets/${t1.id}`, { agentId: me.me.id });
    await call(ADMIN, 'PATCH', `/tickets/${t2.id}`, { agentId: me.me.id });

    // ---- upload + type checks ----
    let r = await upload(A1, t1.id, 'screen shot.png', PNG);
    check(r.status === 201 && r.body.attachment.contentType === 'image/png' && r.body.attachment.preview === true, 'upload PNG -> 201', r.body);
    const png = r.body.attachment;
    r = await upload(A1, t1.id, 'report.pdf', PDF); check(r.status === 201, 'upload PDF -> 201');
    const pdf = r.body.attachment;
    r = await upload(A1, t1.id, 'virus.exe', EXE); check(r.status === 415 && /not allowed/.test(r.body.error), '.exe refused');
    r = await upload(A1, t1.id, 'holiday.png', EXE); check(r.status === 415 && /does not look like/.test(r.body.error), 'renamed .exe (as .png) refused by content check');
    r = await upload(A1, t1.id, 'icon.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')); check(r.status === 415, '.svg refused');
    r = await upload(A1, t1.id, 'macro.docx', DOCM); check(r.status === 415 && /macros/.test(r.body.error), 'Office file with macros refused');
    r = await upload(A1, t1.id, 'notes.txt', Buffer.from('hello <script>alert(1)</script>')); check(r.status === 415, 'text with a script tag refused');
    r = await upload(A1, t1.id, 'log.txt', Buffer.from('2026-11-07 all good\n')); check(r.status === 201 && r.body.attachment.contentType === 'text/plain', 'plain text log accepted');
    const log = r.body.attachment;
    r = await upload(A1, t1.id, '../../etc/passwd.txt', Buffer.from('x')); check(r.status === 201 && r.body.attachment.fileName === 'passwd.txt', 'path in the file name is stripped', r.body.attachment && r.body.attachment.fileName);
    check(filesOnDisk().length === 4, 'four files in storage', filesOnDisk().length);

    // ---- list, count, filter, export ----
    r = await call(A1, 'GET', `/tickets/${t1.id}/attachments`); check(r.status === 200 && r.body.items.length === 4, 'list shows 4 files');
    r = await call(A1, 'GET', `/tickets/${t1.id}`); check(r.body.ticket.attachmentCount === 4 && r.body.attachments.length === 4, 'ticket detail: count 4 + files', r.body.ticket.attachmentCount);
    r = await call(A1, 'GET', '/tickets?view=all&hasAttachments=1'); check(r.body.items.some((t) => t.id === t1.id) && !r.body.items.some((t) => t.id === t2.id), '"Has attachments" filter');
    r = await call(SUP, 'GET', `/tickets/export?view=all&columns=${encodeURIComponent('Ticket ID,Attachments')}`);
    check(r.status === 200 && r.body.columns.includes('Attachments') && r.body.rows.some((row) => row[0] === t1.id && row[1] === 4), 'export: optional Attachments column');
    r = await call(SUP, 'GET', '/tickets/export?view=all'); check(!r.body.columns.includes('Attachments'), 'default export unchanged (no Attachments column)');

    // ---- signed download links ----
    r = await call(A1, 'POST', `/tickets/${t1.id}/attachments/${png.id}/link`);
    check(r.status === 200 && /^files\//.test(r.body.url) && r.body.expiresInMinutes === 5, 'download link issued (5 minutes)');
    let f = await fetch(`${API}/${r.body.url}`);
    let bytes = Buffer.from(await f.arrayBuffer());
    check(f.status === 200 && Buffer.compare(bytes, PNG) === 0 && /attachment/.test(f.headers.get('content-disposition')) && f.headers.get('x-content-type-options') === 'nosniff', 'download: same bytes, attachment, nosniff');
    f = await fetch(`${API}/${r.body.url}?inline=1`); check(/^inline/.test(f.headers.get('content-disposition')), 'preview: inline for an image');
    const logLink = (await call(A1, 'POST', `/tickets/${t1.id}/attachments/${log.id}/link`)).body.url;
    f = await fetch(`${API}/${logLink}?inline=1`); check(/^attachment/.test(f.headers.get('content-disposition')), 'text is never shown inline (download only)');
    f = await fetch(`${API}/${r.body.url.slice(0, -2)}xx`); check(f.status === 410, 'tampered link -> 410');
    r = await call(A1, 'POST', `/tickets/${t2.id}/attachments/${png.id}/link`); check(r.status === 404, 'link for a file of another ticket -> 404');

    // ---- permissions and scope ----
    r = await call(ADMIN, 'PUT', `/admin/authz/users/${me.me.id}`, { overrides: [{ key: 'attachment.upload', effect: 'deny' }], reason: 'test' });
    r = await upload(A1, t1.id, 'more.png', PNG); check(r.status === 403, 'upload denied by override -> 403');
    await call(ADMIN, 'PUT', `/admin/authz/users/${me.me.id}`, { overrides: [], reason: 'test done' });
    r = await upload(A2, t1.id, 'agent2.png', PNG); check(r.status === 201, 'another agent uploads');
    const a2file = r.body.attachment;
    r = await call(A1, 'DELETE', `/tickets/${t1.id}/attachments/${a2file.id}`); check(r.status === 403, "agent cannot delete someone else's file");
    r = await call(A2, 'DELETE', `/tickets/${t1.id}/attachments/${a2file.id}`); check(r.status === 200, 'agent deletes own file');
    r = await call(SUP, 'DELETE', `/tickets/${t1.id}/attachments/${log.id}`); check(r.status === 200, "supervisor deletes another's file (attachment.delete)");
    check(filesOnDisk().length === 3, 'deleted files are gone from storage', filesOnDisk().length);
    await call(ADMIN, 'PUT', `/admin/authz/users/${a2.id}`, { scope: { visibility: 'own' }, reason: 'scope test' });
    r = await call(A2, 'GET', `/tickets/${t1.id}/attachments`); check(r.status === 404, 'out-of-scope ticket: files hidden (404)');
    r = await call(A2, 'POST', `/tickets/${t1.id}/attachments/${png.id}/link`); check(r.status === 404, 'out-of-scope ticket: no download link');
    await call(ADMIN, 'PUT', `/admin/authz/users/${a2.id}`, { scope: { visibility: 'all' }, reason: 'scope test done' });

    // ---- reply with files; note keeps them on the conversation ----
    r = await call(A1, 'POST', `/tickets/${t1.id}/messages`, { kind: 'REPLY', text: 'Please see the files', attachmentIds: [png.id, pdf.id] });
    check(r.status === 201, 'reply with two files -> 201', r.body);
    const conv = (await db.query(`SELECT "conversationId" FROM ${S}.ticket_attachments WHERE id = ANY($1::int[])`, [[png.id, pdf.id]])).rows;
    check(conv.length === 2 && conv.every((c) => c.conversationId), 'files linked to the reply (paperclip)');
    r = await call(A1, 'POST', `/tickets/${t1.id}/messages`, { kind: 'REPLY', text: 'x', attachmentIds: [999999] }); check(r.status === 400, 'reply with a file of another ticket -> 400');

    // ---- limits (Admin > General), ceilings ----
    const lim = { agent: { perFileMb: 1, filesPerAction: 10, perTicketMb: 100 }, portal: { perFileMb: 5, filesPerAction: 2, perTicketMb: 25 }, email: { perFileMb: 20, perTicketMb: 100 }, outboundMb: 20 };
    r = await call(ADMIN, 'PUT', '/admin/settings', { 'attachments.limits': { ...lim, agent: { ...lim.agent, perFileMb: 30 } } }); check(r.status === 400, 'limit above the 25 MB ceiling refused');
    r = await call(ADMIN, 'PUT', '/admin/settings', { 'attachments.limits': lim }); check(r.status === 200, 'limits saved');
    r = await upload(A1, t1.id, 'big.png', Buffer.concat([PNG, Buffer.alloc(1.5 * 1024 * 1024)])); check(r.status === 413, 'file over the agent limit -> 413', r.status);

    // ---- merge moves files ----
    r = await upload(A1, t2.id, 'second.png', PNG); check(r.status === 201, 'upload to the second ticket');
    r = await call(A1, 'POST', `/tickets/${t1.id}/merge`, { ids: [t2.id] }); check(r.status === 200, 'merge second into first');
    const moved = (await db.query(`SELECT "ticketId" FROM ${S}.ticket_attachments WHERE id = $1`, [r.status === 200 ? (await db.query(`SELECT id FROM ${S}.ticket_attachments WHERE "fileName" = 'second.png'`)).rows[0].id : 0])).rows[0];
    check(moved && moved.ticketId === t1.id, 'merged ticket files now on the primary');
    const counts = (await db.query(`SELECT id, "attachmentCount" FROM ${S}.tickets WHERE id = ANY($1::int[]) ORDER BY id`, [[t1.id, t2.id]])).rows;
    check(counts[0].attachmentCount === 4 && counts[1].attachmentCount === 0, 'counts updated after merge', counts);

    // ---- portal upload with the create token ----
    r = await fetch(`${API}/portal/tickets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Portal Person', email: 'portalfiles@example.com', phone: '', subject: 'Portal with files', description: 'see files', distributorCode: '', category: '', website: '' }) });
    const created = await r.json();
    check(r.status === 201 && created.files?.uploadToken && created.files.limits.filesPerAction === 2, 'portal create returns an upload token + portal limits', created.files);
    const pid = created.ticket.id;
    const pup = (token, name, buf) => fetch(`${API}/portal/tickets/${pid}/attachments?token=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': name }, body: buf });
    check((await pup(created.files.uploadToken, 'p1.png', PNG)).status === 201, 'portal upload 1');
    check((await pup(created.files.uploadToken, 'p2.pdf', PDF)).status === 201, 'portal upload 2');
    check((await pup(created.files.uploadToken, 'p3.png', PNG)).status === 413, 'portal: third file over the 2-file limit -> 413');
    check((await pup('1.bad', 'p4.png', PNG)).status === 403, 'portal: bad token -> 403');
    check((await fetch(`${API}/portal/tickets/${t1.id}/attachments?token=${encodeURIComponent(created.files.uploadToken)}`, { method: 'POST', headers: { 'X-File-Name': 'x.png' }, body: PNG })).status === 403, "portal token works only for its own ticket");

    // ---- anonymise removes the contact's own uploads; purge removes a ticket's files ----
    const before = filesOnDisk().length;
    r = await call(ADMIN, 'POST', '/admin/contacts/anonymize', { email: 'portalfiles@example.com' }); check(r.status === 200, 'anonymise the portal contact');
    check(filesOnDisk().length === before - 2, "the contact's 2 portal files are deleted", { before, after: filesOnDisk().length });
    r = await call(ADMIN, 'POST', '/tickets/bulk', { ids: [t1.id], action: 'trash' });
    r = await call(ADMIN, 'POST', '/tickets/bulk', { ids: [t1.id], action: 'purge' }); check(r.status === 200 && r.body.done.includes(t1.id), 'purge the first ticket');
    check(filesOnDisk().length === 0, 'purged ticket: its files are deleted from storage', filesOnDisk());

    await db.end();
    console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
    process.exit(fails ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
