'use strict';
/*
   v7 Phase 5: IT details per ticket (Digital Apps and Infra & IT) - layer, environment, platform, device, browser, app
   version, URL / API endpoint / OData service, HTTP status, correlation id, database, hosting, server, IP / host, asset
   tag, site and users affected (master prompt §I ticket_it_details). Tolerates a database before migration 7.5.
*/
const { pool } = require('../db/pool');
const { fail } = require('./util');
const { IT_LISTS } = require('./itSeed');

const TEXT = ['layer', 'environment', 'platform', 'deviceModel', 'os', 'browser', 'appVersion', 'url', 'apiEndpoint', 'odataService', 'httpStatus',
    'correlationId', 'database', 'hosting', 'serverName', 'ipOrHost', 'assetTag', 'siteLocation'];
const LONG = { url: 1000, apiEndpoint: 1000 };
const LISTED = { layer: 'layer', environment: 'environment', platform: 'platform', browser: 'browser', database: 'database', hosting: 'hosting', os: 'os' };
const missingTable = (e) => e.code === '42P01' || e.code === '42703';

/** Cleans and validates an IT details body; returns only the keys that were sent. Throws 400 with a readable message. */
function cleanIt(b = {}) {
    const out = {};
    for (const k of TEXT) {
        if (b[k] === undefined) continue;
        out[k] = String(b[k] ?? '').trim().slice(0, LONG[k] ?? 200) || null;
    }
    for (const [k, list] of Object.entries(LISTED)) {
        if (out[k] && !IT_LISTS[list].includes(out[k])) throw fail(400, `${k === 'os' ? 'Operating system' : k[0].toUpperCase() + k.slice(1)}: one of ${IT_LISTS[list].join(', ')}.`);
    }
    if (out.httpStatus && !/^[1-5]\d{2}$/.test(out.httpStatus)) throw fail(400, 'HTTP status: three digits, e.g. 500.');
    if (out.url && !/^https?:\/\//i.test(out.url)) throw fail(400, 'URL: start with http:// or https://');
    if (out.ipOrHost && !/^[A-Za-z0-9.:\-_]+$/.test(out.ipOrHost)) throw fail(400, 'IP / host: letters, digits, dots, colons and dashes only.');
    if (b.usersAffected !== undefined) {
        const n = b.usersAffected === null || b.usersAffected === '' ? null : Number(b.usersAffected);
        if (n !== null && !(Number.isInteger(n) && n >= 0 && n < 1e6)) throw fail(400, 'Users affected: a whole number.');
        out.usersAffected = n;
    }
    return out;
}

async function getIt(ticketId) {
    try {
        return (await pool.query('SELECT * FROM samadhan.ticket_it_details WHERE "ticketId" = $1', [ticketId])).rows[0] ?? null;
    } catch (e) { if (missingTable(e)) return null; throw e; }
}

/** Insert or update the IT details of a ticket (only the keys sent change). */
async function saveIt(ticketId, body) {
    const data = cleanIt(body);
    const keys = Object.keys(data);
    if (!keys.length) return getIt(ticketId);
    const cols = keys.map((k) => `"${k}"`);
    const { rows } = await pool.query(
        `INSERT INTO samadhan.ticket_it_details ("ticketId", ${cols.join(', ')}) VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')})
         ON CONFLICT ("ticketId") DO UPDATE SET ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}, "updatedAt" = now() RETURNING *`,
        [ticketId, ...keys.map((k) => data[k])],
    );
    return rows[0];
}

module.exports = { cleanIt, getIt, saveIt, IT_FIELDS: [...TEXT, 'usersAffected'] };
