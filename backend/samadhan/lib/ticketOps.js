'use strict';
const crypto = require('crypto');
const { pool } = require('../db/pool');
const { EDITABLE_FIELDS, PRIORITIES } = require('../constants');
const { emailRequester, fillPlaceholders, loadTicket } = require('./notify');
const { addAgentMessage, updateTicket } = require('./tickets');
const { fail, logActivity, setting, textToHtml, updateRow } = require('./util');
// v7 attachments (lib/attachments.js); loaded lazily to keep the require graph simple.
const softly = (p) => p.catch((err) => { if (err.code !== '42P01' && err.code !== '42703') throw err; });

// ---------- Ticket operations beyond create / update: resolve checks, watch, link, merge, spam / trash,
// scenarios, collision detection and the CSAT survey link. ----------

/**
 * Before a ticket is resolved or closed: required fields filled, and no child ticket still open
 * (a parent closes after its children). Throws 400 listing what is missing.
 */
async function assertResolvable(statusId, ticket) {
    const next = (await pool.query('SELECT "isResolved" FROM samadhan.ticket_statuses WHERE id = $1', [statusId])).rows[0];
    if (!next) throw fail(400, 'Unknown status.');
    if (!next.isResolved) return;
    if (ticket.id) {
        const open = await pool.query(
            `SELECT t.id FROM samadhan.tickets t JOIN samadhan.ticket_statuses s ON s.id = t."statusId"
             WHERE t."parentId" = $1 AND NOT s."isResolved" AND t."deletedAt" IS NULL ORDER BY t.id`,
            [ticket.id],
        );
        if (open.rows.length) throw fail(400, `Resolve the child tickets first: ${open.rows.map((r) => `#${r.id}`).join(', ')}.`);
    }
    // v7: a desk with its own field rules (field_workspaces) uses its "required before resolve" list and labels.
    let required;
    try {
        required = (await pool.query(
            `SELECT d.key, COALESCE(fw."labelOverride", d.label) AS label FROM samadhan.field_definitions d
             LEFT JOIN samadhan.field_workspaces fw ON fw."fieldId" = d.id AND fw."workspaceId" = $1
             WHERE CASE WHEN fw.id IS NULL THEN d.required ELSE fw."requiredBeforeResolve" END`, [ticket.workspaceId ?? null])).rows;
    } catch (e) {
        if (e.code !== '42P01' && e.code !== '42703') throw e;
        required = (await pool.query('SELECT key, label FROM samadhan.field_definitions WHERE required')).rows;
    }
    const missing = required.filter((f) => (f.key === 'category' ? !ticket.category || !ticket.function : !ticket[f.key])).map((f) => f.label);
    // SAP incidents also need the environment (SAP details, §P).
    if (ticket.id && ticket.workspaceKey === 'SAP' && (ticket.recordClass ?? 'INCIDENT') === 'INCIDENT') {
        const sap = await require('./sap').getSap(ticket.id);
        if (!sap?.environment) missing.push('Environment (SAP details)');
    }
    if (missing.length) throw fail(400, `Fill in all required fields before resolving: ${missing.join(', ')}.`);
    // v7 Phase 6 (§P): approvals complete; changes with their transports in PRD (or N/A) and test evidence; access approved.
    await require('./change').assertChangeRules(ticket);
    // v7 Phase 7 (§P): a major incident needs its post-incident review before it is resolved.
    await require('./problem').assertPir(ticket);
}

async function setWatching(ticketId, agentId, on) {
    await loadTicket(ticketId);
    if (on) await pool.query('INSERT INTO samadhan.ticket_watchers ("ticketId", "agentId") VALUES ($1, $2) ON CONFLICT DO NOTHING', [ticketId, agentId]);
    else await pool.query('DELETE FROM samadhan.ticket_watchers WHERE "ticketId" = $1 AND "agentId" = $2', [ticketId, agentId]);
}

/** Links (or unlinks) tickets both ways. */
async function linkTickets(ticketId, others, agentId, unlink = false) {
    await loadTicket(ticketId);
    const ids = [...new Set(others.filter((o) => Number.isInteger(o) && o !== ticketId))].slice(0, 20);
    if (!ids.length) throw fail(400, 'Give the ticket numbers to link.');
    const found = (await pool.query('SELECT id FROM samadhan.tickets WHERE id = ANY($1::int[])', [ids])).rows.map((r) => r.id);
    const missing = ids.filter((i) => !found.includes(i));
    if (missing.length) throw fail(404, `Ticket ${missing.map((m) => `#${m}`).join(', ')} not found.`);
    for (const o of found) {
        if (unlink) {
            await pool.query('DELETE FROM samadhan.ticket_links WHERE ("ticketId" = $1 AND "linkedId" = $2) OR ("ticketId" = $2 AND "linkedId" = $1)', [ticketId, o]);
        } else {
            await pool.query('INSERT INTO samadhan.ticket_links ("ticketId", "linkedId") VALUES ($1, $2), ($2, $1) ON CONFLICT DO NOTHING', [ticketId, o]);
        }
        await logActivity(ticketId, unlink ? 'unlinked' : 'linked', { ticket: o }, agentId);
        await logActivity(o, unlink ? 'unlinked' : 'linked', { ticket: ticketId }, agentId);
    }
    return found;
}

/**
 * Merges secondary tickets into the primary: their conversations, calls, time logs and watchers move over, each is
 * closed with a note pointing at the primary, and later email replies to them land on the primary.
 */
async function mergeTickets(primaryId, secondaryIds, agent) {
    const primary = await loadTicket(primaryId);
    if (primary.deletedAt || primary.mergedIntoId) throw fail(400, `Ticket #${primaryId} cannot take merges (it is in the trash or merged itself).`);
    const ids = [...new Set(secondaryIds.filter((i) => Number.isInteger(i) && i !== primaryId))].slice(0, 20);
    if (!ids.length) throw fail(400, 'Pick at least one other ticket to merge.');
    const closed = (await pool.query('SELECT id FROM samadhan.ticket_statuses WHERE "isClosed" ORDER BY position LIMIT 1')).rows[0];
    for (const sid of ids) {
        const s = await loadTicket(sid);
        if (s.mergedIntoId) throw fail(400, `Ticket #${sid} is already merged into #${s.mergedIntoId}.`);
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const intro = textToHtml(`Merged from #${sid} (${s.requesterName}): ${s.subject}`);
            await client.query(
                `INSERT INTO samadhan.conversations ("ticketId", kind, "bodyHtml", "bodyText", "agentId", channel)
                 VALUES ($1, 'NOTE', $2, $3, $4, 'email')`,
                [primaryId, `${intro}${s.description || ''}`, `Merged from #${sid}: ${s.subject}`, agent.id],
            );
            await client.query(
                `INSERT INTO samadhan.conversations ("ticketId", kind, "bodyHtml", "bodyText", "fromEmail", "fromPhone", "toEmails", "ccEmails", "agentId", channel, "createdAt")
                 SELECT $1, kind, '<p><em>From #' || $2::int::text || ':</em></p>' || "bodyHtml", "bodyText", "fromEmail", "fromPhone", "toEmails", "ccEmails", "agentId", channel, "createdAt"
                 FROM samadhan.conversations WHERE "ticketId" = $2::int ORDER BY "createdAt", id`,
                [primaryId, sid],
            );
            await client.query('UPDATE samadhan.call_logs SET "ticketId" = $1 WHERE "ticketId" = $2', [primaryId, sid]);
            await client.query('UPDATE samadhan.time_logs SET "ticketId" = $1 WHERE "ticketId" = $2', [primaryId, sid]);
            await client.query(
                `INSERT INTO samadhan.ticket_watchers ("ticketId", "agentId") SELECT $1, "agentId" FROM samadhan.ticket_watchers WHERE "ticketId" = $2 ON CONFLICT DO NOTHING`,
                [primaryId, sid],
            );
            await client.query('UPDATE samadhan.tickets SET "mergedIntoId" = $1 WHERE id = $2', [primaryId, sid]);
            await client.query(
                `INSERT INTO samadhan.conversations ("ticketId", kind, "bodyHtml", "bodyText", "agentId", channel) VALUES ($1, 'NOTE', $2, $3, $4, 'email')`,
                [sid, textToHtml(`This ticket was merged into #${primaryId}. Continue there.`), `Merged into #${primaryId}`, agent.id],
            );
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK').catch(() => {});
            throw e;
        } finally {
            client.release();
        }
        if (closed && s.statusId !== closed.id) await updateTicket(sid, { statusId: closed.id }, agent.id, { skipAutomations: true });
        await logActivity(sid, 'merged_into', { ticket: primaryId }, agent.id);
        await logActivity(primaryId, 'merged_from', { ticket: sid }, agent.id);
    }
    // v7: the merged tickets' files move to the primary ticket (§L).
    await softly(require('./attachments').moveOnMerge(primaryId, ids));
    await updateRow('tickets', primaryId, { updatedAt: new Date() });
    return ids;
}

/** spam | unspam | trash | restore | purge (purge: Admin, trashed tickets only). Returns the ids it acted on. */
async function hideTickets(ids, action, agentId) {
    const SQL = {
        spam: 'UPDATE samadhan.tickets SET spam = true, "updatedAt" = now() WHERE id = ANY($1::int[]) AND NOT spam RETURNING id',
        unspam: 'UPDATE samadhan.tickets SET spam = false, "updatedAt" = now() WHERE id = ANY($1::int[]) AND spam RETURNING id',
        trash: 'UPDATE samadhan.tickets SET "deletedAt" = now(), "updatedAt" = now() WHERE id = ANY($1::int[]) AND "deletedAt" IS NULL RETURNING id',
        restore: 'UPDATE samadhan.tickets SET "deletedAt" = NULL, spam = false, "updatedAt" = now() WHERE id = ANY($1::int[]) AND ("deletedAt" IS NOT NULL OR spam) RETURNING id',
        purge: 'DELETE FROM samadhan.tickets WHERE id = ANY($1::int[]) AND "deletedAt" IS NOT NULL RETURNING id',
    };
    if (!SQL[action]) throw fail(400, 'Unknown action.');
    if (action === 'purge') {
        // Child / merged tickets point at these; clear the pointers first so the delete is not blocked.
        await pool.query('UPDATE samadhan.tickets SET "parentId" = NULL WHERE "parentId" = ANY($1::int[])', [ids]);
        await pool.query('UPDATE samadhan.tickets SET "mergedIntoId" = NULL WHERE "mergedIntoId" = ANY($1::int[])', [ids]);
        // v7: their files are deleted from storage first (the rows would otherwise vanish with the tickets) (§L).
        const trashed = (await pool.query('SELECT id FROM samadhan.tickets WHERE id = ANY($1::int[]) AND "deletedAt" IS NOT NULL', [ids])).rows.map((r) => r.id);
        if (trashed.length) await softly(require('./attachments').purgeForTickets(trashed));
    }
    const done = (await pool.query(SQL[action], [ids])).rows.map((r) => r.id);
    if (action !== 'purge') for (const id of done) await logActivity(id, action === 'trash' ? 'trashed' : action === 'restore' ? 'restored' : action, {}, agentId);
    return done;
}

/** Runs a scenario's actions on a ticket as the agent: field changes in one update, then any reply / note. */
async function runScenario(ticketId, scenarioId, agent) {
    const sc = (await pool.query('SELECT * FROM samadhan.scenarios WHERE id = $1', [scenarioId])).rows[0];
    if (!sc) throw fail(404, 'Scenario not found.');
    const t = await loadTicket(ticketId);
    const patch = {};
    const messages = [];
    const tags = new Set(t.tags ?? []);
    for (const a of Array.isArray(sc.actions) ? sc.actions : []) {
        switch (a.type) {
            case 'setStatus': patch.statusId = Number(a.value); break;
            case 'setPriority': if (PRIORITIES[a.value]) patch.priority = Number(a.value); break;
            case 'setGroup': if (a.value) patch.groupId = Number(a.value); break;
            case 'setAgent': patch.agentId = a.value === 'me' ? agent.id : Number(a.value) || null; break;
            case 'setField': if (EDITABLE_FIELDS.includes(a.field)) patch[a.field] = a.value == null ? null : String(a.value); break;
            case 'addTag': if (a.value) tags.add(String(a.value).slice(0, 100)); break;
            case 'reply': case 'note': if (a.text) messages.push({ kind: a.type === 'reply' ? 'REPLY' : 'NOTE', text: String(a.text) }); break;
            default: break;
        }
    }
    if (tags.size !== (t.tags ?? []).length) patch.tags = [...tags].slice(0, 20);
    if (patch.statusId !== undefined) await assertResolvable(patch.statusId, { ...t, ...patch });
    if (Object.keys(patch).length) await updateTicket(ticketId, patch, agent.id);
    for (const m of messages) {
        const fresh = await loadTicket(ticketId);
        await addAgentMessage(ticketId, { kind: m.kind, html: textToHtml(fillPlaceholders(m.text, fresh)), to: [], cc: [] }, agent);
    }
    await logActivity(ticketId, 'scenario', { name: sc.name }, agent.id);
    return sc.name;
}

/** Records that an agent has the ticket open (viewing / replying) and returns the others who do, seen in the last 45 s. */
async function presence(ticketId, agentId, mode) {
    if (mode === 'leave') {
        await pool.query('DELETE FROM samadhan.ticket_presence WHERE "ticketId" = $1 AND "agentId" = $2', [ticketId, agentId]);
    } else {
        await pool.query(
            `INSERT INTO samadhan.ticket_presence ("ticketId", "agentId", mode, at) VALUES ($1, $2, $3, now())
             ON CONFLICT ("ticketId", "agentId") DO UPDATE SET mode = EXCLUDED.mode, at = now()`,
            [ticketId, agentId, mode],
        );
    }
    if (Math.random() < 0.02) await pool.query(`DELETE FROM samadhan.ticket_presence WHERE at < now() - interval '10 minutes'`);
    const { rows } = await pool.query(
        `SELECT p."agentId", a.name, p.mode FROM samadhan.ticket_presence p JOIN samadhan.agents a ON a.id = p."agentId"
         WHERE p."ticketId" = $1 AND p."agentId" <> $2 AND p.at > now() - interval '45 seconds' ORDER BY p.mode DESC, a.name`,
        [ticketId, agentId],
    );
    return rows;
}

/**
 * CSAT: when a ticket closes, the requester gets one survey link (no sign-in) - unless the survey is off, the ticket
 * was merged, it has no email, or a link was already sent.
 */
async function maybeSendCsat(t) {
    if (!t.requesterEmail || t.mergedIntoId || t.spam || t.deletedAt) return;
    if ((await setting('csat.enabled')) === false) return;
    const token = crypto.randomBytes(24).toString('base64url');
    const ins = await pool.query('INSERT INTO samadhan.csat_requests ("ticketId", token) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING token', [t.id, token]);
    if (!ins.rows.length) return;
    const { APP_URL } = require('../../ccbTeams');
    await emailRequester(t, 'requester.csat', { 'csat.url': `${APP_URL}/apps/samadhan/portal/?csat=${token}` });
}

module.exports = { assertResolvable, hideTickets, linkTickets, maybeSendCsat, mergeTickets, presence, runScenario, setWatching };
