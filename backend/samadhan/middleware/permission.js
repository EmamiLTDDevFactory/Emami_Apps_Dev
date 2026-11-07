'use strict';
const { pool } = require('../db/pool');
const { DEFAULT_SCOPE, effective } = require('../lib/permissions');

/*
   requirePermission for EVERY signed-in route (master prompt §K 9.1). One table below maps method + path to a
   permission key; the gate runs after requireAccess for the whole router, so a new route without an entry is refused
   (403) instead of silently open - and tests/permissions.test.js fails if any registered route has no entry.

   A rule's key is a string, null (any signed-in person: own preferences, bell, to-dos ...) or a function of the
   request returning the key(s) needed - for routes whose body decides the action (bulk, messages). An array means
   ALL of the keys are needed.
*/

const ANY = null;
const RULES = [
    // me.js
    ['GET', '/me', ANY], ['PUT', '/me/preferences', ANY], ['GET', '/notifications', ANY], ['POST', '/notifications/clear', ANY],
    ['POST', '/notifications/read', ANY], ['POST', '/me/canned', 'canned.personal'], ['DELETE', '/me/canned/:id', 'canned.personal'],
    ['GET', '/contacts/search', 'ticket.view'], ['PATCH', '/me/availability', ANY], ['GET', '/meta', ANY], ['GET', '/distributors/lookup', 'ticket.view'],
    // tickets.js
    ['GET', '/tickets', 'ticket.view'], ['GET', '/tickets/counts', 'ticket.view'], ['GET', '/tickets/export', 'ticket.export'],
    ['GET', '/tickets/export/columns', 'ticket.view'], ['POST', '/tickets', 'ticket.create'], ['GET', '/tickets/:id', 'ticket.view'],
    ['PATCH', '/tickets/:id', (req) => {
        const b = req.body ?? {};
        return ['ticket.edit', ...(b.agentId !== undefined || b.groupId !== undefined ? ['ticket.assign'] : []),
            ...(b.applicationId !== undefined ? ['ticket.changeApplication'] : [])];
    }],
    ['POST', '/tickets/bulk', (req) => {
        const a = String(req.body?.action || '');
        const extra = { spam: 'ticket.spam', unspam: 'ticket.spam', trash: 'ticket.trash', restore: 'ticket.trash', purge: 'ticket.purge', merge: 'ticket.merge' }[a];
        return ['ticket.bulk', ...(extra ? [extra] : []), ...(a === 'update' || a === 'close' ? ['ticket.edit'] : []),
            ...(req.body?.patch?.applicationId !== undefined ? ['ticket.changeApplication'] : [])];
    }],
    ['POST', '/tickets/:id/merge', 'ticket.merge'], ['POST', '/tickets/:id/links', 'ticket.link'], ['POST', '/tickets/:id/watch', 'ticket.view'],
    ['POST', '/tickets/:id/scenarios/:sid', 'scenario.run'], ['POST', '/tickets/:id/presence', 'ticket.view'],
    ['POST', '/tickets/:id/messages', (req) => ({ REPLY: 'ticket.reply', NOTE: 'ticket.note', FORWARD: 'ticket.forward' })[String(req.body?.kind || '')] || 'ticket.reply'],
    ['POST', '/tickets/:id/time-logs', 'ticket.edit'], ['POST', '/tickets/:id/calls', 'ticket.edit'],
    ['POST', '/tickets/:id/classify', (req) => ['ticket.classify', ...(req.body?.applicationId !== undefined ? ['ticket.changeApplication'] : [])]],
    // work.js
    ['GET', '/todos', ANY], ['POST', '/todos', ANY], ['PATCH', '/todos/:id', ANY], ['DELETE', '/todos/:id', ANY],
    ['GET', '/views', ANY], ['POST', '/views', (req) => (req.body?.shared ? 'views.share' : ANY)], ['DELETE', '/views/:id', ANY],
    ['GET', '/variants', ANY], ['POST', '/variants', (req) => (req.body?.shared ? 'report.variants.share' : ANY)], ['DELETE', '/variants/:id', ANY],
    ['GET', '/search', 'ticket.view'], ['GET', '/contacts', 'screen.contacts'], ['GET', '/contacts/:id', 'screen.contacts'],
    ['PATCH', '/contacts/:id', 'contact.edit'], ['GET', '/companies', ANY], ['POST', '/companies', 'company.create'],
    ['GET', '/articles', 'screen.solutions'], ['GET', '/articles/:id', 'screen.solutions'], ['POST', '/articles', 'article.edit'],
    ['DELETE', '/articles/:id', 'article.edit'], ['POST', '/articles/:id/feedback', 'screen.solutions'],
    // reports.js
    ['GET', '/board', 'screen.board'], ['GET', '/dashboard', 'screen.dashboard'], ['GET', '/dashboard/overview', 'screen.dashboard'],
    ['GET', '/dashboard/breakdown', 'screen.dashboard'], ['GET', '/analytics', 'screen.analytics'], ['GET', '/reports/daily', 'screen.reports'],
    // attachments.js (v7 Phase 2; deleting someone else's file also needs attachment.delete - checked in the route)
    ['GET', '/tickets/:id/attachments', 'ticket.view'], ['POST', '/tickets/:id/attachments', 'attachment.upload'],
    ['POST', '/tickets/:id/attachments/:aid/link', 'attachment.download'], ['DELETE', '/tickets/:id/attachments/:aid', 'attachment.upload'],
    // insights.js
    ['GET', '/insights/dashboard', 'insights.dashboard'], ['GET', '/tickets/:id/insights', 'insights.ticket'],
    // admin.js (Admin base role only - admin.* keys exist nowhere else; admin.js keeps its own Admin check too)
    ['GET', '/admin/agents', 'admin.people'], ['POST', '/admin/agents', 'admin.people'], ['GET', '/admin/groups', 'admin.groups'],
    ['POST', '/admin/groups', 'admin.groups'], ['GET', '/admin/settings', 'admin.general'], ['PUT', '/admin/settings', 'admin.general'],
    ['GET', '/admin/scenarios', 'admin.scenarios'], ['POST', '/admin/scenarios', 'admin.scenarios'], ['DELETE', '/admin/scenarios/:id', 'admin.scenarios'],
    ['GET', '/admin/templates', 'admin.templates'], ['PUT', '/admin/templates/:key', 'admin.templates'],
    ['POST', '/admin/canned', ['admin.canned', 'canned.shared.manage']], ['DELETE', '/admin/canned/:id', ['admin.canned', 'canned.shared.manage']],
    ['GET', '/admin/distributors', 'admin.masters'], ['POST', '/admin/distributors/import', 'admin.masters'],
    ['POST', '/admin/contacts/anonymize', 'contact.anonymize'],
    ['GET', '/admin/sla', 'admin.sla'], ['PUT', '/admin/sla/targets/:id', 'admin.sla'], ['PUT', '/admin/sla/policies/:id/groups', 'admin.sla'],
    ['GET', '/admin/severity-rules', 'admin.sla'], ['POST', '/admin/severity-rules', 'admin.sla'], ['DELETE', '/admin/severity-rules/:id', 'admin.sla'],
    ['GET', '/admin/fields', 'admin.fields'], ['PATCH', '/admin/fields/:id', 'admin.fields'], ['POST', '/admin/fields/:id/choices', 'admin.fields'],
    ['PATCH', '/admin/choices/:id', 'admin.fields'],
    ['GET', '/admin/business-hours', 'admin.sla'], ['PUT', '/admin/business-hours', 'admin.sla'], ['POST', '/admin/holidays', 'admin.sla'],
    ['DELETE', '/admin/holidays/:id', 'admin.sla'],
    ['GET', '/admin/automations', 'admin.automations'], ['PATCH', '/admin/automations/:id', 'admin.automations'],
    ['POST', '/admin/statuses', 'admin.statuses'], ['PUT', '/admin/statuses/order', 'admin.statuses'], ['DELETE', '/admin/statuses/:id', 'admin.statuses'],
    ['GET', '/admin/access', 'admin.people'], ['PUT', '/admin/access/:email', 'admin.people'], ['DELETE', '/admin/access/:email', 'admin.people'],
    ['GET', '/admin/audit', 'admin.audit'], ['GET', '/admin/parked-mail', 'admin.parkedMail'],
    // Authorization cockpit (routes/authz.js)
    ['GET', '/admin/authz/catalogue', 'admin.authorization'], ['GET', '/admin/authz/overview', 'admin.authorization'],
    ['GET', '/admin/authz/profiles', 'admin.authorization'], ['POST', '/admin/authz/profiles', 'admin.authorization'],
    ['PUT', '/admin/authz/profiles/:id', 'admin.authorization'], ['GET', '/admin/authz/users', 'admin.authorization'],
    ['GET', '/admin/authz/users/:id', 'admin.authorization'], ['PUT', '/admin/authz/users/:id', 'admin.authorization'],
    ['GET', '/admin/authz/review', 'admin.authorization'], ['POST', '/admin/authz/review/revoke-expired', 'admin.authorization'],
    ['GET', '/admin/authz/log', 'admin.authorization'],
    // Workspaces, applications, priority matrix, mail classification (routes/workspaces.js, v7 Phase 3)
    ['GET', '/admin/workspaces', 'admin.workspaces'], ['PUT', '/admin/workspaces/flag', 'admin.workspaces'], ['PUT', '/admin/workspaces/:id', 'admin.workspaces'],
    ['PUT', '/admin/workspaces/:id/matrix', 'admin.workspaces'],
    ['POST', '/admin/applications', 'admin.applications'], ['PUT', '/admin/applications/:id', 'admin.applications'],
    ['POST', '/admin/applications/:id/aliases', 'admin.applications'],
    ['GET', '/admin/mail-classification', 'admin.channels'], ['PUT', '/admin/mail-classification', 'admin.channels'],
    ['POST', '/admin/mail-rules', 'admin.channels'], ['DELETE', '/admin/mail-rules/:id', 'admin.channels'],
];

const compiled = RULES.map(([method, path, key]) => ({
    method, path, key, re: new RegExp(`^${path.replace(/:[a-z]+/gi, '[^/]+')}/?$`),
}));
// A literal path wins over a pattern (/tickets/counts before /tickets/:id).
compiled.sort((a, b) => Number(a.path.includes(':')) - Number(b.path.includes(':')));
const ruleFor = (method, path) => compiled.find((r) => r.method === method && r.re.test(path));

// ---------- Loading a person's effective access (cached for 60 s, §K 9.5) ----------
const CACHE_MS = 60_000;
const cache = new Map();
const invalidate = (agentId) => (agentId === undefined ? cache.clear() : cache.delete(agentId));

async function loadAccess(agent) {
    const hit = cache.get(agent.id);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.access;
    let profiles = [];
    let overrides = [];
    let scope = { ...DEFAULT_SCOPE };
    try {
        [profiles, overrides, scope] = await Promise.all([
            pool.query(`SELECT p.keys, p.mode, p.active, up."validFrom", up."validTo" FROM samadhan.auth_user_profiles up
                        JOIN samadhan.auth_profiles p ON p.id = up."profileId" WHERE up."agentId" = $1`, [agent.id]).then((r) => r.rows),
            pool.query('SELECT key, effect, "expiresAt" FROM samadhan.auth_permission_overrides WHERE "agentId" = $1', [agent.id]).then((r) => r.rows),
            pool.query('SELECT visibility FROM samadhan.auth_user_scope WHERE "agentId" = $1', [agent.id])
                .then((r) => (r.rows[0] ? { visibility: r.rows[0].visibility } : { ...DEFAULT_SCOPE })),
        ]);
    } catch (err) {
        // Cockpit tables not there (migration 7.1-auth rolled back): base role only, exactly as before v7.
        if (err.code !== '42P01') throw err;
    }
    // Admins always see everything (§K 9.3: confidential "Admins always").
    if (agent.role === 'Admin') scope = { ...DEFAULT_SCOPE };
    const access = { permissions: effective(agent.role, { profiles, overrides }), scope };
    cache.set(agent.id, { at: Date.now(), access });
    if (cache.size > 2000) cache.delete(cache.keys().next().value);
    return access;
}

// ---------- Last use of each permission (Access review "unused in 90 days") ----------
// Kept in memory and written at most once a minute in one statement, so a request never waits for it.
const usage = new Map(); // "agentId|key" -> Date
let lastFlush = Date.now();
function noteUse(agentId, keys) {
    for (const k of keys) usage.set(`${agentId}|${k}`, new Date());
    if (Date.now() - lastFlush < 60_000 || !usage.size) return;
    lastFlush = Date.now();
    const rows = [...usage.entries()].map(([ak, at]) => { const [a, ...k] = ak.split('|'); return [Number(a), k.join('|'), at]; });
    usage.clear();
    pool.query(`INSERT INTO samadhan.auth_permission_usage ("agentId", key, "lastUsedAt")
                SELECT * FROM unnest($1::int[], $2::text[], $3::timestamptz[])
                ON CONFLICT ("agentId", key) DO UPDATE SET "lastUsedAt" = GREATEST(samadhan.auth_permission_usage."lastUsedAt", EXCLUDED."lastUsedAt")`,
    [rows.map((r) => r[0]), rows.map((r) => r[1]), rows.map((r) => r[2])]).catch(() => {});
}

/** Runs after requireAccess: attaches req.permissions / req.scope / req.can, then checks the route's rule. */
async function permissionGate(req, res, next) {
    try {
        const access = await loadAccess(req.agent);
        req.permissions = access.permissions;
        req.scope = access.scope;
        req.can = (key) => access.permissions.has(key);
        const rule = ruleFor(req.method, req.path);
        if (!rule) return res.status(403).json({ success: false, error: 'This action is not available.' });
        let needed = typeof rule.key === 'function' ? rule.key(req) : rule.key;
        if (needed === null || needed === undefined) return next();
        needed = [].concat(needed).filter(Boolean);
        if (!needed.every((k) => req.can(k))) {
            return res.status(403).json({ success: false, error: "You don't have access to this. Ask a Samadhan admin if you need it." });
        }
        noteUse(req.agent.id, needed);
        if (!(await withinScope(req))) return res.status(404).json({ success: false, error: 'Ticket not found.' });
        return next();
    } catch (err) {
        console.error('[samadhan] permission check', err);
        return res.status(500).json({ success: false, error: 'Could not verify your access.' });
    }
}

/**
 * Data scope on single tickets (§K 9.3): /tickets/<id>/... and the other tickets named in bulk / merge / link bodies
 * must be visible to the caller. Outside the scope a ticket simply does not exist (404), as for a wrong number.
 * Scope 'all' (the default) skips this entirely.
 */
async function withinScope(req) {
    if (!req.scope || req.scope.visibility === 'all') return true;
    const { ticketVisible } = require('../lib/ticketQuery');
    const ids = [];
    const m = /^\/tickets\/(\d+)(?:\/|$)/.exec(req.path);
    if (m) ids.push(Number(m[1]));
    if (/^\/tickets\/(bulk|\d+\/(merge|links))$/.test(req.path) && Array.isArray(req.body?.ids)) ids.push(...req.body.ids.map(Number).filter(Number.isInteger));
    for (const id of [...new Set(ids)]) {
        if (!(await ticketVisible(pool, req, id))) return false;
    }
    return true;
}

module.exports = { RULES, invalidate, loadAccess, permissionGate, ruleFor };
