'use strict';
const { ACTIVITY_KINDS } = require('../constants');
const { fail } = require('./util');

// Ticket list filters, views and sorts - one place for the list, the view counts and the export, so they always agree.

// Spam and trashed tickets are left out of every list, count, board, dashboard and scheduled check except their own views.
const LIVE = 'NOT t.spam AND t."deletedAt" IS NULL';
const OVERDUE = '(t."resolutionDueAt" < now() OR (t."firstRespondedAt" IS NULL AND t."firstResponseDueAt" < now()))';
const IST_TODAY = `date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'`;

/** View id -> SQL condition (me = the signed-in agent's parameter). */
// §J: default or AI classification, or keywords below the confidence threshold («0.8»). Backfilled tickets are not included.
const NEEDS_CLASSIFICATION = `(t."classificationSource" IN ('default', 'ai') OR (t."classificationSource" = 'keyword' AND COALESCE(t."classificationConfidence", 0) < 0.8))`;
const VIEWS = {
    '': () => LIVE,
    all: () => LIVE,
    mine: (me) => `${LIVE} AND t."agentId" = ${me} AND NOT s."isClosed"`,
    unassigned: () => `${LIVE} AND t."agentId" IS NULL AND NOT s."isResolved"`,
    open: () => `${LIVE} AND NOT s."isResolved"`,
    // Pending: waiting on someone else (a status that pauses the SLA), not yet resolved.
    pending: () => `${LIVE} AND s."pausesSla" AND NOT s."isResolved"`,
    overdue: () => `${LIVE} AND NOT s."isResolved" AND ${OVERDUE}`,
    resolved: () => `${LIVE} AND s."isResolved"`,
    my_overdue: (me) => `${LIVE} AND t."agentId" = ${me} AND NOT s."isResolved" AND ${OVERDUE}`,
    due_today: () => `${LIVE} AND NOT s."isResolved" AND t."resolutionDueAt" >= ${IST_TODAY} AND t."resolutionDueAt" < ${IST_TODAY} + interval '1 day'`,
    urgent_high: () => `${LIVE} AND t.priority >= 3 AND NOT s."isResolved"`,
    my_groups: (me) => `${LIVE} AND NOT s."isResolved" AND t."groupId" IN (SELECT "groupId" FROM samadhan.group_members WHERE "agentId" = ${me})`,
    watching: (me) => `${LIVE} AND EXISTS (SELECT 1 FROM samadhan.ticket_watchers w WHERE w."ticketId" = t.id AND w."agentId" = ${me})`,
    today: () => `${LIVE} AND t."createdAt" >= ${IST_TODAY}`,
    // v7 Phase 3 (§J): open tickets whose application was not set by a person, a subject tag or a sender rule.
    needs_classification: () => `${LIVE} AND NOT s."isResolved" AND ${NEEDS_CLASSIFICATION}`,
    spam: () => 't.spam AND t."deletedAt" IS NULL',
    trash: () => 't."deletedAt" IS NOT NULL',
};
const VIEW_IDS = Object.keys(VIEWS).filter((v) => v && v !== 'all');

/*
   v7 data scope (Authorization cockpit, middleware/permission.js -> req.scope). visibility 'all' (the default, and
   always for Admins) adds NOTHING, so every query stays exactly as before. 'groups' = my groups' tickets + 'own';
   'own' = assigned to me or watched by me. The agent id is an integer read from the database (never request input),
   so it is written into the SQL directly and existing parameter numbers are untouched.
*/
function scopeSql(scope, agentId) {
    const v = scope?.visibility || 'all';
    if (v === 'all') return '';
    const me = Number(agentId);
    if (!Number.isInteger(me)) throw new Error('scope: invalid agent id');
    const own = `(t."agentId" = ${me} OR EXISTS (SELECT 1 FROM samadhan.ticket_watchers sw WHERE sw."ticketId" = t.id AND sw."agentId" = ${me}))`;
    if (v === 'own') return own;
    return `(${own} OR t."groupId" IN (SELECT sg."groupId" FROM samadhan.group_members sg WHERE sg."agentId" = ${me}))`;
}
/** LIVE plus the caller's scope: drop-in for ${LIVE} in user-facing queries (identical text when the scope is 'all'). */
const liveFor = (req) => { const s = scopeSql(req.scope, req.agent?.id); return s ? `${LIVE} AND ${s}` : LIVE; };
/** True when the caller may see this ticket under their scope (always true for scope 'all'). */
async function ticketVisible(pool, req, ticketId) {
    const s = scopeSql(req.scope, req.agent?.id);
    if (!s) return true;
    const { rows } = await pool.query(`SELECT 1 FROM samadhan.tickets t WHERE t.id = $1 AND ${s}`, [ticketId]);
    return rows.length > 0;
}

const SORTS = {
    created: 't."createdAt" DESC', created_asc: 't."createdAt" ASC', updated: 't."updatedAt" DESC',
    activity: 't."lastActivityAt" DESC NULLS LAST', due: 't."resolutionDueAt" ASC NULLS LAST',
    fr_due: 't."firstResponseDueAt" ASC NULLS LAST', priority: 't.priority DESC, t."createdAt" DESC', status: 's.position, t."createdAt" DESC',
};

// Text filters on ticket columns (multi-value, comma separated).
const TEXT_FILTERS = { source: 'source', type: 'type', category: 'category', region: 'region', state: 'state', depot: 'depot', salesOrg: '"salesOrg"', l2Agent: '"l2Agent"', asmName: '"asmName"',
    recordClass: '"recordClass"' };
// "Created" relative windows, in minutes.
const CREATED_WITHIN = { '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '12h': 720, '24h': 1440, week: 10080, month: 43200, '2months': 86400, '6months': 259200 };
const DUE_OPTIONS = ['overdue', 'today', 'tomorrow', 'next8h'];

/**
 * Builds WHERE / ORDER BY for a ticket list from query-string filters.
 * Returns { where: string (with WHERE), params, order }.
 */
function ticketFilter(qy, agentId, scope = null) {
    const where = [];
    const params = [];
    const p = (v) => { params.push(v); return `$${params.length}`; };
    const view = String(qy.view ?? '');
    if (!VIEWS[view]) throw fail(400, 'Unknown view.');
    // The agent's id becomes a parameter only for views that use it (Postgres refuses unused parameters).
    const viewSql = VIEWS[view]('{{me}}');
    where.push(viewSql.includes('{{me}}') ? viewSql.split('{{me}}').join(p(agentId)) : viewSql);
    const scoped = scopeSql(scope, agentId);
    if (scoped) where.push(scoped);

    // Every list filter takes one value or several, comma separated ("4,5" = Resolved or Closed).
    const ints = (v) => String(v).split(',').map(Number).filter(Number.isInteger);
    const texts = (v) => String(v).split(',').map((x) => x.trim().slice(0, 200)).filter(Boolean).slice(0, 50);
    if (qy.statusId) where.push(`t."statusId" = ANY(${p(ints(qy.statusId))}::int[])`);
    if (qy.priority) where.push(`t.priority = ANY(${p(ints(qy.priority))}::int[])`);
    if (qy.severity) where.push(`t.severity = ANY(${p(texts(qy.severity))}::text[])`);
    if (qy.groupId) {
        const wanted = texts(qy.groupId);
        const ids = ints(wanted.filter((x) => x !== 'none').join(','));
        const parts = [...(ids.length ? [`t."groupId" = ANY(${p(ids)}::int[])`] : []), ...(wanted.includes('none') ? ['t."groupId" IS NULL'] : [])];
        if (parts.length) where.push(`(${parts.join(' OR ')})`);
    }
    if (qy.agentId) {
        const wanted = texts(qy.agentId).map((x) => (x === 'me' ? String(agentId) : x));
        const ids = ints(wanted.filter((x) => x !== 'none').join(','));
        const parts = [...(ids.length ? [`t."agentId" = ANY(${p(ids)}::int[])`] : []), ...(wanted.includes('none') ? ['t."agentId" IS NULL'] : [])];
        if (parts.length) where.push(`(${parts.join(' OR ')})`);
    }
    for (const [key, col] of Object.entries(TEXT_FILTERS)) {
        if (qy[key]) where.push(`t.${col} = ANY(${p(texts(qy[key]))}::text[])`);
    }
    if (qy.activity) where.push(`t."lastActivityKind" = ANY(${p(texts(qy.activity).filter((k) => ACTIVITY_KINDS.includes(k)))}::text[])`);
    // v7: "Has attachments" filter.
    if (qy.hasAttachments === '1') where.push('t."attachmentCount" > 0');
    if (qy.tag) where.push(`t.tags && ${p(texts(qy.tag))}::text[]`);
    if (qy.requesterId) where.push(`t."requesterId" = ${p(Number(qy.requesterId) || 0)}`);
    if (qy.companyId) where.push(`t."companyId" = ${p(Number(qy.companyId) || 0)}`);

    const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v));
    if (qy.from && !isDate(qy.from)) throw fail(400, 'Dates must be YYYY-MM-DD.');
    if (qy.to && !isDate(qy.to)) throw fail(400, 'Dates must be YYYY-MM-DD.');
    if (qy.from) where.push(`t."createdAt" >= ${p(`${qy.from}T00:00:00+05:30`)}::timestamptz`);
    if (qy.to) where.push(`t."createdAt" <= ${p(`${qy.to}T23:59:59.999+05:30`)}::timestamptz`);
    if (qy.created === 'today') where.push(`t."createdAt" >= ${IST_TODAY}`);
    else if (qy.created === 'yesterday') where.push(`t."createdAt" >= ${IST_TODAY} - interval '1 day' AND t."createdAt" < ${IST_TODAY}`);
    else if (CREATED_WITHIN[qy.created]) where.push(`t."createdAt" >= now() - ${p(`${CREATED_WITHIN[qy.created]} minutes`)}::interval`);

    // Legacy "due in N minutes" (dashboard links) and the Freshdesk-style due-by options.
    if (qy.due && [15, 60, 240].includes(Number(qy.due))) {
        where.push('NOT s."isResolved"', `t."resolutionDueAt" BETWEEN now() AND now() + ${p(`${Number(qy.due)} minutes`)}::interval`);
    }
    const dueBy = (col, raw) => {
        const opts = texts(raw).filter((o) => DUE_OPTIONS.includes(o));
        if (!opts.length) return;
        const parts = opts.map((o) => ({
            overdue: `${col} < now()`,
            today: `${col} >= now() AND ${col} < ${IST_TODAY} + interval '1 day'`,
            tomorrow: `${col} >= ${IST_TODAY} + interval '1 day' AND ${col} < ${IST_TODAY} + interval '2 days'`,
            next8h: `${col} BETWEEN now() AND now() + interval '8 hours'`,
        })[o]);
        where.push('NOT s."isResolved"', `(${parts.join(' OR ')})`);
    };
    if (qy.resDue) dueBy('t."resolutionDueAt"', qy.resDue);
    if (qy.frDue) { where.push('t."firstRespondedAt" IS NULL'); dueBy('t."firstResponseDueAt"', qy.frDue); }

    // v7 Phase 3: application / workspace (comma-separated ids) and "needs classification".
    for (const [k, col] of [['applicationId', 't."applicationId"'], ['workspaceId', 't."workspaceId"']]) {
        if (qy[k]) { const ids = ints(qy[k]); if (ids.length) where.push(`${col} = ANY(${p(ids)}::int[])`); }
    }
    if (qy.needsClassification === '1') where.push(NEEDS_CLASSIFICATION);

    if (qy.q) {
        // "#100123", "100123" and the readable reference "MSFA-100123" all find the ticket.
        const term = String(qy.q).trim().replace(/^#/, '').replace(/^[A-Za-z0-9]{2,8}-(?=\d+$)/, '').slice(0, 200);
        if (/^\d+$/.test(term)) where.push(`(t.id = ${p(Number(term) <= 2147483647 ? Number(term) : 0)} OR t."distributorCode" = ${p(term)} OR t."mrUid" = ${p(term)})`);
        else if (term) {
            const like = p(`%${term}%`);
            where.push(`(t.subject ILIKE ${like} OR c.name ILIKE ${like} OR c.email ILIKE ${like} OR t."distributorName" ILIKE ${like} OR t."distributorCode" ILIKE ${like} OR t."mrUid" ILIKE ${like})`);
        }
    }
    return { where: `WHERE ${where.join(' AND ')}`, params, order: SORTS[qy.sort] || SORTS.created };
}

module.exports = { NEEDS_CLASSIFICATION, CREATED_WITHIN, DUE_OPTIONS, IST_TODAY, LIVE, OVERDUE, SORTS, VIEW_IDS, VIEWS, liveFor, scopeSql, ticketFilter, ticketVisible };
