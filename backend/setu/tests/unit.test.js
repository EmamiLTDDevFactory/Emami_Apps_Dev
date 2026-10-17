'use strict';
/*
   Setu unit tests - pure logic, no database or network. Run: node --test backend/setu/tests/unit.test.js
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const { ticketNumberFromSubject, noiseReason, senderUnverified } = require('../lib/mail');
const { addMinutes, businessMinutesBetween, minutesBetween } = require('../lib/businessHours');
const { ruleMatches } = require('../lib/automation');

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
