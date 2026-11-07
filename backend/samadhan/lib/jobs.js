'use strict';
const { ready } = require('../db/ready');
const { pool } = require('../db/pool');
const { MIN } = require('../constants');
const { ruleApplies, ruleMatches, rulesFor } = require('./automation');
const { ring } = require('./bell');
const { ingestMail } = require('./mailIngest');
const { loadTicket, notifyAgents } = require('./notify');
const { runActions } = require('./tickets');
const { setting, updateRow } = require('./util');

// ---------- Scheduled checks ----------

async function runSlaChecks(now = new Date()) {
    const lead = Number((await setting('sla.reminderMinutes')) ?? 30) * MIN;
    // Only tickets that are due within the reminder lead time or already late and not yet flagged - not every open
    // ticket - are loaded, so the check stays cheap however large the queue grows.
    const { rows } = await pool.query(
        `SELECT t.id FROM samadhan.tickets t JOIN samadhan.ticket_statuses s ON s.id = t."statusId"
         WHERE NOT s."pausesSla" AND NOT t.spam AND t."deletedAt" IS NULL AND (
               (t."firstRespondedAt" IS NULL AND t."firstResponseDueAt" <= $1 AND (NOT t."frReminded" OR NOT t."frViolated"))
            OR (t."resolvedAt" IS NULL AND t."resolutionDueAt" <= $1 AND (NOT t."resReminded" OR NOT t."resViolated")))`,
        [new Date(now.getTime() + lead)],
    );
    for (const { id } of rows) {
        const t = await loadTicket(id);
        const to = t.agentId ? 'assignee' : 'group';
        const fr = t.firstResponseDueAt && new Date(t.firstResponseDueAt);
        const res = t.resolutionDueAt && new Date(t.resolutionDueAt);
        if (!t.firstRespondedAt && !t.frReminded && fr && now < fr && fr - now <= lead) {
            await updateRow('tickets', id, { frReminded: true });
            await notifyAgents(t, 'agent.first_response_reminder', to);
            await ring(t, 'sla_warning', { title: `First response due soon: #${t.id}`, body: t.subject });
        }
        if (!t.resolvedAt && !t.resReminded && res && now < res && res - now <= lead) {
            await updateRow('tickets', id, { resReminded: true });
            await notifyAgents(t, 'agent.resolution_reminder', to);
            await ring(t, 'sla_warning', { title: `Resolution due soon: #${t.id}`, body: t.subject });
        }
        if (!t.firstRespondedAt && !t.frViolated && fr && now > fr) {
            await updateRow('tickets', id, { frViolated: true });
            await notifyAgents(t, 'agent.first_response_violated', to);
            await ring(t, 'sla_breach', { title: `First response overdue: #${t.id}`, body: t.subject });
        }
        if (!t.resolvedAt && !t.resViolated && res && now > res) {
            await updateRow('tickets', id, { resViolated: true });
            await notifyAgents(t, 'agent.resolution_violated', to);
            await ring(t, 'sla_breach', { title: `Resolution overdue: #${t.id}`, body: t.subject });
        }
    }
}

/** External references with no update for 2 business days (§P): one bell nudge per day to the ticket's agent. */
async function externalRefNudges() {
    const { loadCalendar, minutesBetween } = require('./businessHours');
    const { BH_DAY } = require('./sapSeed');
    const cal = await loadCalendar();
    const { rows } = await pool.query(
        `SELECT r.id, r.system, r.ref, r."lastUpdateAt", t.id AS "ticketId" FROM samadhan.ticket_external_refs r
         JOIN samadhan.tickets t ON t.id = r."ticketId" JOIN samadhan.ticket_statuses s ON s.id = t."statusId"
         WHERE NOT s."isResolved" AND t."deletedAt" IS NULL AND COALESCE(r.status, '') NOT IN ('Closed', 'Confirmed')
           AND (r."nudgedAt" IS NULL OR r."nudgedAt" < now() - interval '1 day')`);
    const { loadTicket } = require('./notify');
    let n = 0;
    for (const r of rows) {
        if (minutesBetween(new Date(r.lastUpdateAt), new Date(), true, cal) < 2 * BH_DAY) continue;
        const t = await loadTicket(r.ticketId);
        await ring(t, 'external_ref', { title: `No update from ${r.system} ${r.ref} for 2+ business days: #${t.id}`, body: t.subject });
        await pool.query('UPDATE samadhan.ticket_external_refs SET "nudgedAt" = now() WHERE id = $1', [r.id]);
        n++;
    }
    return n;
}

async function runTimeTriggers(now = new Date()) {
    const rules = await rulesFor('TIME');
    if (!rules.length) return 0;
    const { rows } = await pool.query(
        `SELECT t.* FROM samadhan.tickets t JOIN samadhan.ticket_statuses s ON s.id = t."statusId" WHERE NOT s."isClosed" AND NOT t.spam AND t."deletedAt" IS NULL`,
    );
    let fired = 0;
    for (const r of rules) {
        for (const ticket of rows) {
            if (ruleApplies(r, ticket) && ruleMatches(r.conditions, { ticket, now })) {
                await runActions(ticket.id, r.actions, r.name);
                fired++;
            }
        }
    }
    return fired;
}

let jobsRunning = null;
let lastJobsAt = 0;
// The backend can run as several copies at once (Lambda instances); a Postgres advisory lock makes sure only one
// copy runs the checks at a time, so nobody gets duplicate reminders or double automation actions.
const JOBS_LOCK = "hashtext('samadhan.scheduled_jobs')";

async function runJobs({ force = false } = {}) {
    if (jobsRunning) return jobsRunning;
    jobsRunning = (async () => {
        const client = await pool.connect();
        let locked = false;
        try {
            locked = (await client.query(`SELECT pg_try_advisory_lock(${JOBS_LOCK}) AS ok`)).rows[0].ok;
            if (!locked) return { skipped: 'another copy of the backend is running the checks' };
            const last = (await client.query(`SELECT value FROM samadhan.settings WHERE key = 'jobs.lastRunAt'`)).rows[0]?.value;
            if (!force && last && Date.now() - Number(last) < JOB_INTERVAL_MS - MIN) return { skipped: 'ran recently' };
            const out = {};
            try { out.mail = await ingestMail(); } catch (err) { out.mail = { error: err.message }; console.error('[samadhan] mail ingest:', err.message); }
            try { await runSlaChecks(); out.sla = 'ok'; } catch (err) { out.sla = { error: err.message }; console.error('[samadhan] sla checks:', err.message); }
            try { out.timeRules = await runTimeTriggers(); } catch (err) { out.timeRules = { error: err.message }; console.error('[samadhan] time rules:', err.message); }
            // v7 Authorization cockpit: temporary access ends by itself; Admins get a quarterly access-review reminder.
            try { const authz = require('./authz'); out.accessExpired = await authz.revokeExpired(); out.recertReminder = await authz.recertificationReminder(); } catch (err) { if (err.code !== '42P01') console.error('[samadhan] authz jobs:', err.message); }
            // v7 Phase 4: external cases (SAP, vendors) without an update for 2 business days nudge the ticket's agent.
            try { out.externalNudges = await externalRefNudges(); } catch (err) { if (err.code !== '42P01') console.error('[samadhan] external refs:', err.message); }
            // Bell entries are kept for 30 days.
            try { out.bellPurged = (await pool.query(`DELETE FROM samadhan.notifications WHERE "createdAt" < now() - interval '30 days'`)).rowCount; } catch (err) { console.error('[samadhan] bell purge:', err.message); }
            await client.query(
                `INSERT INTO samadhan.settings (key, value) VALUES ('jobs.lastRunAt', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
                [JSON.stringify(Date.now())],
            );
            return out;
        } finally {
            if (locked) await client.query(`SELECT pg_advisory_unlock(${JOBS_LOCK})`).catch(() => {});
            client.release();
            lastJobsAt = Date.now();
        }
    })().finally(() => { jobsRunning = null; });
    return jobsRunning;
}

/** True when this copy has not tried the scheduled checks for a while (normal traffic then kicks them off). */
const jobsDue = () => Date.now() - lastJobsAt > JOB_INTERVAL_MS;
const JOB_INTERVAL_MS = 5 * MIN;
setInterval(() => { ready.then(runJobs).catch(() => {}); }, JOB_INTERVAL_MS).unref();

module.exports = { jobsDue, runJobs };
