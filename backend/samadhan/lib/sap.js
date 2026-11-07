'use strict';
/*
   v7 Phase 4: SAP details per ticket, external references (SAP for Me cases, vendor tickets ...) and the reference
   masters (systems, clients, plants, T-codes ...). Validation per master prompt §P: T-codes upper case, transport
   numbers by pattern, SAP Notes numeric, IDoc numbers 16 digits, "Very High" outside Production needs a justification.
   Every function tolerates a database before migration 7.4 (returns empty / null).
*/
const { pool } = require('../db/pool');
const { fail } = require('./util');
const { IDOC_RE, LISTS, NOTE_RE, TCODE_RE } = require('./sapSeed');

const TEXT = ['landscape', 'sapSystem', 'sapClient', 'environment', 'tcode', 'fioriAppId', 'programName', 'errorMessageClass', 'errorMessageNo', 'errorText',
    'shortDumpId', 'idocNumber', 'idocMessageType', 'batchJob', 'companyCode', 'plant', 'salesOrg', 'purchOrg', 'businessProcess', 'workaroundText',
    'stepsToReproduce', 'expectedResult', 'actualResult', 'sapComponent', 'riseOwner'];
const LONG = ['errorText', 'workaroundText', 'stepsToReproduce', 'expectedResult', 'actualResult'];
const missingTable = (e) => e.code === '42P01' || e.code === '42703';

/** Cleans and validates a SAP details body; returns only the keys that were sent. Throws 400 with a readable message. */
function cleanSap(b = {}) {
    const out = {};
    for (const k of TEXT) {
        if (b[k] === undefined) continue;
        const v = String(b[k] ?? '').trim().slice(0, LONG.includes(k) ? 20000 : 200);
        out[k] = v || null;
    }
    if (out.tcode) {
        out.tcode = out.tcode.toUpperCase().replace(/^\/N/, '');
        if (!TCODE_RE.test(out.tcode)) throw fail(400, 'T-code: letters, digits, _ and / only (e.g. VA01, /SCWM/MON).');
    }
    if (out.sapSystem) out.sapSystem = out.sapSystem.toUpperCase();
    if (out.idocNumber && !IDOC_RE.test(out.idocNumber.replace(/\s/g, ''))) throw fail(400, 'IDoc number: 16 digits.');
    if (out.idocNumber) out.idocNumber = out.idocNumber.replace(/\s/g, '');
    if (out.environment && !LISTS.environment.includes(out.environment)) throw fail(400, `Environment: one of ${LISTS.environment.join(', ')}.`);
    if (out.riseOwner && !LISTS.riseOwner.includes(out.riseOwner)) throw fail(400, `RISE owner: one of ${LISTS.riseOwner.join(', ')}.`);
    if (out.landscape && !LISTS.landscape.includes(out.landscape)) throw fail(400, 'Unknown landscape.');
    if (b.sapNotes !== undefined) {
        const notes = (Array.isArray(b.sapNotes) ? b.sapNotes : String(b.sapNotes || '').split(/[\s,;]+/)).map((x) => String(x).trim()).filter(Boolean);
        const bad = notes.filter((n) => !NOTE_RE.test(n));
        if (bad.length) throw fail(400, `SAP Note numbers are digits only: ${bad.join(', ')}.`);
        out.sapNotes = [...new Set(notes)].slice(0, 30);
    }
    if (b.documentNumbers !== undefined) {
        const docs = (Array.isArray(b.documentNumbers) ? b.documentNumbers : String(b.documentNumbers || '').split(/[\s,;]+/)).map((x) => String(x).trim()).filter(Boolean);
        out.documentNumbers = JSON.stringify(docs.slice(0, 50));
    }
    if (b.usersAffected !== undefined) {
        const n = b.usersAffected === null || b.usersAffected === '' ? null : Number(b.usersAffected);
        if (n !== null && !(Number.isInteger(n) && n >= 0 && n < 1e6)) throw fail(400, 'Users affected: a whole number.');
        out.usersAffected = n;
    }
    for (const k of ['workaroundAvailable', 'reproducible']) if (b[k] !== undefined) out[k] = b[k] === null ? null : b[k] === true;
    return out;
}

async function getSap(ticketId) {
    try {
        return (await pool.query('SELECT * FROM samadhan.ticket_sap_details WHERE "ticketId" = $1', [ticketId])).rows[0] ?? null;
    } catch (e) { if (missingTable(e)) return null; throw e; }
}

/** Insert or update the SAP details of a ticket (only the keys sent change). */
async function saveSap(ticketId, body) {
    const data = cleanSap(body);
    const keys = Object.keys(data);
    if (!keys.length) return getSap(ticketId);
    const cols = keys.map((k) => `"${k}"`);
    const { rows } = await pool.query(
        `INSERT INTO samadhan.ticket_sap_details ("ticketId", ${cols.join(', ')}) VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')})
         ON CONFLICT ("ticketId") DO UPDATE SET ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}, "updatedAt" = now() RETURNING *`,
        [ticketId, ...keys.map((k) => data[k])],
    );
    return rows[0];
}

// ---------- external references ----------
function cleanRef(b = {}, partial = false) {
    const out = {};
    const t = (v, n = 200) => String(v ?? '').trim().slice(0, n);
    for (const [k, n] of [['system', 80], ['ref', 80], ['status', 40], ['priority', 20], ['url', 500], ['owner', 120], ['justification', 1000], ['notes', 2000]]) {
        if (b[k] !== undefined) out[k] = t(b[k], n) || null;
    }
    if (!partial && (!out.system || !out.ref)) throw fail(400, 'Choose the external system and enter its reference number.');
    if (out.system && !LISTS.externalSystem.includes(out.system)) throw fail(400, `System: one of ${LISTS.externalSystem.join(', ')}.`);
    if (out.priority && !LISTS.sapCasePriority.includes(out.priority)) throw fail(400, `Priority: one of ${LISTS.sapCasePriority.join(', ')}.`);
    if (out.url && !/^https:\/\//i.test(out.url)) throw fail(400, 'The link must start with https://');
    return out;
}

async function listRefs(ticketId) {
    try {
        return (await pool.query(
            `SELECT r.*, a.name AS "createdByName", round(extract(epoch FROM now() - r."lastUpdateAt") / 86400)::int AS "ageDays"
             FROM samadhan.ticket_external_refs r LEFT JOIN samadhan.agents a ON a.id = r."createdBy" WHERE r."ticketId" = $1 ORDER BY r.id`, [ticketId])).rows;
    } catch (e) { if (missingTable(e)) return []; throw e; }
}

/** "Very High" (SAP case priority) outside Production needs a justification (§P). */
async function checkVeryHigh(ticketId, data) {
    if (data.priority !== 'Very High') return;
    const env = (await getSap(ticketId))?.environment;
    if (env !== 'Production' && !data.justification) throw fail(400, 'Very High outside Production needs a justification (SAP accepts Very High only for production down situations).');
}

async function addRef(ticketId, body, agentId) {
    const data = cleanRef(body);
    await checkVeryHigh(ticketId, data);
    const keys = Object.keys(data);
    const { rows } = await pool.query(
        `INSERT INTO samadhan.ticket_external_refs ("ticketId", "createdBy", ${keys.map((k) => `"${k}"`).join(', ')})
         VALUES ($1, $2, ${keys.map((_, i) => `$${i + 3}`).join(', ')}) RETURNING *`, [ticketId, agentId, ...keys.map((k) => data[k])]);
    return rows[0];
}

async function updateRef(ticketId, refId, body) {
    const data = cleanRef(body, true);
    const before = (await pool.query('SELECT * FROM samadhan.ticket_external_refs WHERE id = $1 AND "ticketId" = $2', [refId, ticketId])).rows[0];
    if (!before) throw fail(404, 'External reference not found.');
    await checkVeryHigh(ticketId, { ...before, ...data });
    const keys = Object.keys(data);
    if (!keys.length) return before;
    // Any change counts as an update from the other side (resets the ageing nudge).
    const { rows } = await pool.query(
        `UPDATE samadhan.ticket_external_refs SET ${keys.map((k, i) => `"${k}" = $${i + 3}`).join(', ')}, "lastUpdateAt" = now(), "nudgedAt" = NULL
         WHERE id = $1 AND "ticketId" = $2 RETURNING *`, [refId, ticketId, ...keys.map((k) => data[k])]);
    return rows[0];
}

async function deleteRef(ticketId, refId) {
    const { rowCount } = await pool.query('DELETE FROM samadhan.ticket_external_refs WHERE id = $1 AND "ticketId" = $2', [refId, ticketId]);
    if (!rowCount) throw fail(404, 'External reference not found.');
}

// ---------- reference masters (Admin; typeahead for agents) ----------
const KINDS = ['SAP_SYSTEM', 'SAP_CLIENT', 'COMPANY_CODE', 'PLANT', 'STORAGE_LOCATION', 'SALES_ORG', 'PURCH_ORG', 'TCODE', 'FIORI_APP', 'SAP_ROLE', 'INTERFACE',
    'BATCH_JOB', 'SERVER', 'CLOUD_ACCOUNT', 'SITE'];

async function searchMasters(kind, q, parent) {
    if (!KINDS.includes(kind)) throw fail(400, 'Unknown master.');
    const params = [kind];
    let where = 'kind = $1 AND active';
    if (q) { params.push(`%${String(q).slice(0, 60)}%`); where += ` AND (code ILIKE $${params.length} OR description ILIKE $${params.length})`; }
    if (parent) { params.push(String(parent).slice(0, 60)); where += ` AND ("parentCode" = $${params.length} OR "parentCode" IS NULL)`; }
    try {
        return (await pool.query(`SELECT code, description, "parentCode" FROM samadhan.ref_masters WHERE ${where} ORDER BY code LIMIT 30`, params)).rows;
    } catch (e) { if (missingTable(e)) return []; throw e; }
}

/** Upsert rows from the Admin's Excel import: [{ code, description, parentCode, active }]. */
async function importMasters(kind, rows) {
    if (!KINDS.includes(kind)) throw fail(400, 'Unknown master.');
    if (!Array.isArray(rows) || !rows.length) throw fail(400, 'No rows to import.');
    if (rows.length > 20000) throw fail(400, 'At most 20,000 rows per import.');
    const clean = rows.map((r) => ({
        code: String(r.code ?? '').trim().slice(0, 60), description: String(r.description ?? '').trim().slice(0, 300) || null,
        parentCode: String(r.parentCode ?? '').trim().slice(0, 60) || null, active: r.active === undefined ? true : !['no', 'false', '0', 'n'].includes(String(r.active).toLowerCase()),
    })).filter((r) => r.code);
    if (!clean.length) throw fail(400, 'No row has a code.');
    const client = await pool.connect();
    let n = 0;
    try {
        await client.query('BEGIN');
        for (let i = 0; i < clean.length; i += 500) {
            const part = clean.slice(i, i + 500);
            const values = part.map((_, j) => `($1, $${j * 4 + 2}, $${j * 4 + 3}, $${j * 4 + 4}, $${j * 4 + 5})`).join(', ');
            const r = await client.query(
                `INSERT INTO samadhan.ref_masters (kind, code, description, "parentCode", active) VALUES ${values}
                 ON CONFLICT (kind, code) DO UPDATE SET description = EXCLUDED.description, "parentCode" = EXCLUDED."parentCode", active = EXCLUDED.active, "updatedAt" = now()`,
                [kind, ...part.flatMap((r) => [r.code, r.description, r.parentCode, r.active])]);
            n += r.rowCount;
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
    } finally {
        client.release();
    }
    return n;
}

module.exports = { KINDS, addRef, cleanSap, deleteRef, getSap, importMasters, listRefs, saveSap, searchMasters, updateRef };
