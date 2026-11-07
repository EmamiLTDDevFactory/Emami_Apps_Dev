'use strict';
/*
   v7 Phase 3 - unit tests without a database: the approved application mapping (APP-MAPPING.md §0), the Impact x
   Urgency matrix, ticket references and the workspace / application data-scope SQL.
     node --test backend/samadhan/tests/workspaces.unit.test.js
*/
process.env.PGHOST = '127.0.0.1';
process.env.PGPORT = '1';
const test = require('node:test');
const assert = require('node:assert');

const { APPLICATIONS, MATRIX, TYPE_MAP, WORKSPACES, backfillCode, matrixPriority } = require('../lib/workspaceSeed');
const { parseTicketNumber, ref } = require('../lib/workspaces');
const { isNarrowed, scopeSql } = require('../lib/ticketQuery');

test('approved mapping: the user\'s answers Q-M1..M5', () => {
    assert.strictEqual(backfillCode('mSFA', ''), 'MSFA');
    assert.strictEqual(backfillCode('Rural mSFA', 'anything'), 'RMSFA'); // Q-M2: own code
    assert.strictEqual(backfillCode('CDMS', ''), 'CDMS'); // Q-M3: own code
    assert.strictEqual(backfillCode('SalesCode DMS', ''), 'DMS');
    assert.strictEqual(backfillCode('SalesCode SFA', ''), 'MR'); // Q-M4
    assert.strictEqual(backfillCode('SalesCode Manager App', ''), 'SUP');
    assert.strictEqual(backfillCode('SalesCode Portal', ''), 'DMS');
    assert.strictEqual(backfillCode('Salescode B2B App', ''), 'SCB2B'); // Q-M5: stays in Secondary Sales
    assert.strictEqual(backfillCode('Wrong ticket', 'mSecSales Application - Login Screen'), 'SS'); // type wins
    assert.strictEqual(backfillCode('  msfa ', ''), 'MSFA');
});

test('mapping by category when the type is empty or unknown; fallback SS', () => {
    assert.strictEqual(backfillCode('', 'mSecSales Application - Sync Issue'), 'MSFA'); // Q-M1
    assert.strictEqual(backfillCode(null, 'mSFA Reports'), 'MSFA');
    assert.strictEqual(backfillCode('', 'Rural mSFA Order'), 'RMSFA');
    assert.strictEqual(backfillCode('', 'CDMS Purchase Issue'), 'CDMS');
    assert.strictEqual(backfillCode('', 'MR Expense'), 'MR');
    assert.strictEqual(backfillCode('', 'SalesCode SFA'), 'DMS');
    assert.strictEqual(backfillCode('Something new', 'E Invoice'), 'SS');
    assert.strictEqual(backfillCode(undefined, undefined), 'SS');
});

test('seeds: every mapped code exists in Secondary Sales; codes are valid and unique', () => {
    const codes = new Map(APPLICATIONS.map(([code, , ws]) => [code, ws]));
    assert.strictEqual(codes.size, APPLICATIONS.length);
    for (const c of new Set([...Object.values(TYPE_MAP), 'MSFA', 'RMSFA', 'CDMS', 'MR', 'DMS', 'SS'])) assert.strictEqual(codes.get(c), 'SEC_SALES', c);
    assert.strictEqual(codes.get('B2B'), 'DIGITAL_APPS');
    for (const [code] of APPLICATIONS) assert.match(code, /^[A-Z0-9]{2,8}$/);
    assert.deepStrictEqual(WORKSPACES.filter((w) => w.enabled).map((w) => w.key), ['SEC_SALES']);
});

test('Impact x Urgency matrix (§O): 1x1 Urgent, 1x3 High, 1x4 Medium, 4x4 Low', () => {
    assert.strictEqual(MATRIX.length, 16);
    const p = (i, u) => matrixPriority(i, u);
    assert.deepStrictEqual([p(1, 1), p(1, 2), p(2, 1)], [4, 4, 4]);
    assert.deepStrictEqual([p(1, 3), p(2, 2), p(3, 1)], [3, 3, 3]);
    assert.deepStrictEqual([p(1, 4), p(2, 3), p(3, 2), p(4, 1)], [2, 2, 2, 2]);
    assert.deepStrictEqual([p(2, 4), p(3, 3), p(4, 4)], [1, 1, 1]);
});

test('references: APPCODE-id and parsing', () => {
    assert.strictEqual(ref('MSFA', 100123), 'MSFA-100123');
    assert.strictEqual(ref(null, 100123), '100123');
    for (const s of ['MSFA-100123', 'msfa-100123', '#100123', '100123', ' SAP-100123 ']) assert.strictEqual(parseTicketNumber(s), 100123, s);
    for (const s of ['', 'MSFA', 'TOOLONGCODE-1', 'MSFA-12a', 'MSFA 100123', null]) assert.strictEqual(parseTicketNumber(s), null, String(s));
});

test('data scope SQL: workspaces / applications narrow; bad keys are ignored; all = nothing', () => {
    assert.strictEqual(scopeSql({ visibility: 'all' }, 1), '');
    assert.strictEqual(scopeSql({ visibility: 'all', workspaces: 'all', applications: [] }, 1), '');
    assert.strictEqual(isNarrowed({ visibility: 'all', workspaces: 'all' }), false);
    const ws = scopeSql({ visibility: 'all', workspaces: ['SAP', "x'; drop"] }, 1);
    assert.match(ws, /key IN \('SAP'\)/);
    assert.ok(!ws.includes('drop'));
    assert.strictEqual(isNarrowed({ visibility: 'all', workspaces: ['SAP'] }), true);
    const both = scopeSql({ visibility: 'own', workspaces: ['SAP'], applications: ['MSFA'] }, 7);
    assert.match(both, /^\(.* AND .* AND .*\)$/s);
    assert.match(both, /code IN \('MSFA'\)/);
    assert.throws(() => scopeSql({ visibility: 'own' }, 'x'), /invalid agent id/);
});
