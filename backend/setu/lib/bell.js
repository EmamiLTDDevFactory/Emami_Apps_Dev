'use strict';
const { pool } = require('../../db');
const { BELL_EVENTS, BELL_SCOPES } = require('../constants');
const { setting } = require('./util');

// ---------- In-app bell (Setu header) ----------
// Admin > System decides which events reach the bell (default: requester replies only) and who sees them: the
// ticket's agent (its group while unassigned), the whole group, or every agent. Each agent can mute any of those
// events for themselves (agents.prefs.bellMuted). Separate from the hub inbox / Outlook notifications in notify.js.

async function bellConfig() {
    const [events, scope] = await Promise.all([setting('bell.events'), setting('bell.scope')]);
    return {
        events: Array.isArray(events) ? events.filter((e) => BELL_EVENTS.includes(e)) : ['requester_reply'],
        scope: BELL_SCOPES.includes(scope) ? scope : 'assignee',
    };
}

async function groupMembers(groupId) {
    if (!groupId) return [];
    const { rows } = await pool.query('SELECT "agentId" FROM setu.group_members WHERE "groupId" = $1', [groupId]);
    return rows.map((r) => r.agentId);
}

/**
 * Rings the bell for one ticket event. t is a ticket from loadTicket. `only` sends to those agents instead of the
 * configured scope (an assignment goes to the new assignee only); `except` skips the agent who caused it.
 */
async function ring(t, event, { title, body = '', only = null, except = null } = {}) {
    const cfg = await bellConfig();
    if (!cfg.events.includes(event)) return;
    let ids;
    if (only) ids = only;
    else if (cfg.scope === 'all') ids = (await pool.query('SELECT id FROM setu.agents WHERE active')).rows.map((r) => r.id);
    else if (cfg.scope === 'group') ids = [...(t.agentId ? [t.agentId] : []), ...(await groupMembers(t.groupId))];
    else ids = t.agentId ? [t.agentId] : await groupMembers(t.groupId);
    ids = [...new Set(ids.filter((id) => id && id !== except))];
    if (!ids.length) return;
    await pool.query(
        `INSERT INTO setu.notifications ("agentId", "ticketId", event, title, body)
         SELECT a.id, $2, $3, $4, $5 FROM setu.agents a
         WHERE a.id = ANY($1::int[]) AND a.active AND NOT (COALESCE(a.prefs -> 'bellMuted', '[]'::jsonb) ? $3)`,
        [ids, t.id, event, String(title).slice(0, 300), String(body).slice(0, 500)],
    );
}

module.exports = { bellConfig, ring };
