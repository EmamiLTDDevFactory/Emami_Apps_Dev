'use strict';
/*
   Samadhan unit tests - pure logic, no database or network. Run: node --test backend/samadhan/tests/unit.test.js
*/
// WhatsApp signature tests sign with this secret (read when constants.js loads, so set before any require).
process.env.SAMADHAN_WHATSAPP_APP_SECRET = 'unit-test-secret';
const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const { ticketNumberFromSubject, noiseReason, senderUnverified } = require('../lib/mail');
const { addMinutes, businessMinutesBetween, minutesBetween } = require('../lib/businessHours');
const { ruleMatches } = require('../lib/automation');
const { htmlToWhatsAppText, inboundMessages, metaJson, validSignature } = require('../lib/whatsapp');

const IST_CAL = { timezone: 'Asia/Kolkata', days: [1, 2, 3, 4, 5, 6].map((day) => ({ day, start: '09:00', end: '20:00' })), holidays: ['2026-10-19'] };
const ist = (s) => new Date(`${s}+05:30`);

test('ticket number from subject: the three formats, bounded to valid ticket ids', () => {
    assert.equal(ticketNumberFromSubject('Re: Login issue [#100123]'), 100123);
    assert.equal(ticketNumberFromSubject('Ticket Received - Login || 100123'), 100123);
    assert.equal(ticketNumberFromSubject('#TICKET No - 100123 thanks'), 100123);
    assert.equal(ticketNumberFromSubject('Re: [#99999999999]'), null, 'too large to be a ticket id');
    assert.equal(ticketNumberFromSubject('Re: [#1234]'), null, 'too short');
    assert.equal(ticketNumberFromSubject('no number here'), null);
    assert.equal(ticketNumberFromSubject(null), null);
});

test('deliverable: real addresses yes, reserved / demo domains no (they keep the in-app bell only)', () => {
    const { deliverable } = require('../constants');
    for (const ok of ['ravi@abctraders.in', 'animesh@emamigroup.com', 'a.b@sub.example-corp.com', 'x@localstore.in']) assert.equal(deliverable(ok), true, ok);
    for (const no of ['agent1@demo.samadhan.local', 'x@localhost', 'a@b.test', 'a@example.com', 'a@mail.example.org', 'a@x.invalid', 'not-an-email', '', null]) assert.equal(deliverable(no), false, String(no));
});

test('noise filter parks auto-replies, out-of-office and our own notifications', () => {
    const msg = (from, subject, headers = []) => ({ from: { emailAddress: { address: from } }, subject, internetMessageHeaders: headers });
    assert.equal(noiseReason(msg('noreply@vendor.com', 'Hello')), 'auto_reply');
    assert.equal(noiseReason(msg('a@b.com', 'Automatic reply: away')), 'out_of_office');
    assert.equal(noiseReason(msg('a@b.com', 'Ticket Received - x || 100001')), 'notification_loop');
    assert.equal(noiseReason(msg('a@b.com', 'Hi', [{ name: 'Auto-Submitted', value: 'auto-replied' }])), 'auto_reply');
    assert.equal(noiseReason(msg('ravi@abctraders.in', 'Orders not syncing')), null);
});

test('sender verification: DMARC fail or SPF fail without DKIM pass is unverified', () => {
    const msg = (v) => ({ internetMessageHeaders: v === null ? [] : [{ name: 'Authentication-Results', value: v }] });
    assert.equal(senderUnverified(msg('spf=pass smtp.mailfrom=x.com; dkim=pass; dmarc=pass action=none')), false);
    assert.equal(senderUnverified(msg('spf=fail smtp.mailfrom=x.com; dkim=none; dmarc=fail action=none')), true);
    assert.equal(senderUnverified(msg('spf=softfail; dkim=pass; dmarc=pass')), false, 'DKIM pass vouches for it');
    assert.equal(senderUnverified(msg('spf=fail; dkim=none; dmarc=none')), true);
    assert.equal(senderUnverified(msg(null)), false, 'no header (internal mail) is not treated as forged');
});

test('business hours: due dates skip nights, Sundays and holidays', () => {
    // Saturday 19:00 + 2 working hours -> 1 h Saturday, Sunday off, Monday 19 Oct holiday -> Tuesday 20 Oct 10:00
    assert.equal(addMinutes(ist('2026-10-17T19:00:00'), 120, true, IST_CAL).toISOString(), ist('2026-10-20T10:00:00').toISOString());
    // Before opening: starts counting at 09:00
    assert.equal(addMinutes(ist('2026-10-21T07:00:00'), 30, true, IST_CAL).toISOString(), ist('2026-10-21T09:30:00').toISOString());
    // Calendar-hours targets ignore the calendar
    assert.equal(addMinutes(ist('2026-10-17T19:00:00'), 120, false, IST_CAL).toISOString(), ist('2026-10-17T21:00:00').toISOString());
    assert.equal(businessMinutesBetween(ist('2026-10-17T19:00:00'), ist('2026-10-20T10:00:00'), IST_CAL), 120);
    assert.equal(minutesBetween(ist('2026-10-21T10:00:00'), ist('2026-10-21T09:00:00'), true, IST_CAL), 0);
});

test('automation conditions: all / any, operators and time measures', () => {
    const now = new Date('2026-10-17T12:00:00Z');
    const ticket = { statusId: 4, groupId: null, resolvedAt: new Date('2026-10-15T10:00:00Z'), escalatedAt: null };
    assert.equal(ruleMatches({ all: [{ field: 'statusId', op: 'in', value: [4] }, { field: 'hoursSinceResolved', op: 'gt', value: 48 }] }, { ticket, now }), true);
    assert.equal(ruleMatches({ all: [{ field: 'hoursSinceResolved', op: 'gt', value: 72 }] }, { ticket, now }), false);
    assert.equal(ruleMatches({ all: [{ field: 'groupId', op: 'is_empty' }] }, { ticket }), true);
    assert.equal(ruleMatches({ all: [{ field: 'changed', op: 'in', value: ['statusId'] }] }, { ticket, changed: ['priority'] }), false);
    assert.equal(ruleMatches({ any: [{ field: 'statusId', op: 'eq', value: 2 }, { field: 'statusId', op: 'eq', value: 4 }] }, { ticket }), true);
    assert.equal(ruleMatches({ all: [{ field: 'statusId', op: 'unknown_op', value: 4 }] }, { ticket }), false, 'unknown operators never match');
});

test('whatsapp: webhook signature over the body exactly as Meta serialises it', () => {
    const B = String.fromCharCode(92); // a backslash
    // Meta escapes "/" and every non-ASCII character (an accented letter, an emoji as a surrogate pair).
    const raw = `{"entry":[{"changes":[{"field":"messages","value":{"messages":[{"from":"919830012345","id":"wamid.1","type":"text","text":{"body":"caf${B}u00e9 ${B}ud83d${B}ude00 http:${B}/${B}/x"}}]}}]}]}`;
    const sig = `sha256=${crypto.createHmac('sha256', 'unit-test-secret').update(raw).digest('hex')}`;
    assert.equal(metaJson(JSON.parse(raw)), raw, 're-serialised body matches the signed bytes');
    assert.equal(validSignature(Buffer.from(metaJson(JSON.parse(raw))), sig), true);
    assert.equal(validSignature(Buffer.from(raw), sig.replace(/.$/, (c) => (c === '0' ? '1' : '0'))), false, 'tampered signature');
    assert.equal(validSignature(Buffer.from(`${raw} `), sig), false, 'tampered body');
    assert.equal(validSignature(Buffer.from(raw), ''), false, 'missing signature');
});

test('whatsapp: messages from a webhook payload, receipts ignored, media as a placeholder', () => {
    const payload = { entry: [{ changes: [
        { field: 'messages', value: { contacts: [{ wa_id: '919830012345', profile: { name: 'Ravi' } }], messages: [
            { from: '919830012345', id: 'wamid.1', timestamp: '1761700000', type: 'text', text: { body: 'Order not syncing' } },
            { from: '919830012345', id: 'wamid.2', type: 'image', image: { caption: 'screenshot' } },
        ] } },
        { field: 'messages', value: { statuses: [{ id: 'wamid.0', status: 'read' }] } },
    ] }] };
    const out = inboundMessages(payload);
    assert.equal(out.length, 2);
    assert.deepEqual([out[0].from, out[0].name, out[0].text], ['+919830012345', 'Ravi', 'Order not syncing']);
    assert.equal(out[0].at.toISOString(), new Date(1761700000 * 1000).toISOString());
    assert.match(out[1].text, /^\[image received on WhatsApp.*\]\nscreenshot$/);
    assert.deepEqual(inboundMessages({}), []);
});

test('whatsapp: reply HTML becomes plain text with line breaks', () => {
    assert.equal(htmlToWhatsAppText('<p>Hi Ravi,</p><p>Done &amp; dusted<br>Line 2</p><br><br><br>#TICKET No - 100001'), 'Hi Ravi,\nDone & dusted\nLine 2\n\n#TICKET No - 100001');
});

test('ticket list filter: views, multi-value filters and placeholders line up', () => {
    const { ticketFilter, VIEW_IDS } = require('../lib/ticketQuery');
    // Every view builds; only views that use the agent get the agent as a parameter.
    for (const view of ['', ...VIEW_IDS]) {
        const f = ticketFilter({ view }, 7);
        const used = new Set((f.where.match(/\$\d+/g) ?? []).map((x) => Number(x.slice(1))));
        assert.equal(used.size, f.params.length, `view ${view || 'all'}: every parameter is used`);
    }
    assert.match(ticketFilter({ view: 'trash' }, 7).where, /"deletedAt" IS NOT NULL/);
    assert.match(ticketFilter({ view: 'open' }, 7).where, /NOT t\.spam AND t\."deletedAt" IS NULL/);
    const f = ticketFilter({ view: 'mine', region: 'EAST, WEST', agentId: 'me,none', created: 'week', resDue: 'overdue,bogus', q: '#100123' }, 7);
    assert.deepEqual(f.params.slice(0, 3), [7, [7], ['EAST', 'WEST']]);
    assert.ok(f.params.includes(100123));
    assert.match(f.where, /t\."agentId" IS NULL/);
    assert.throws(() => ticketFilter({ view: 'nope' }, 7), /Unknown view/);
    assert.throws(() => ticketFilter({ from: '30-10-2026' }, 7), /YYYY-MM-DD/);
    assert.equal(ticketFilter({ sort: 'x; DROP TABLE' }, 7).order, 't."createdAt" DESC');
});
