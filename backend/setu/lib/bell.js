'use strict';
const { pool } = require('../../db');
const { BELL_EVENTS, BELL_SCOPES } = require('../constants');
const { setting } = require('./util');

// ---------- In-app bell (Samadhan header) ----------
// Admin > Channels & bell decides which events reach the bell (default: requester replies only) and, per event, who
// sees them: the ticket's agent (its group while unassigned), the whole group, or every agent. Some events always go to
// specific people (assignment -> the new assignee, @mention -> the people mentioned, watching -> the ticket's watchers).
// Each agent can mute any event for themselves (agents.prefs.bellMuted). Separate from the hub inbox / Outlook
// notifications in notify.js (agents can mute those per template too: agents.prefs.emailMuted).

async function bellConfig() {
    const [events, scope, audience] = await Promise.all([setting('bell.events'), setting('bell.scope'), setting('bell.audience')]);
    const fallback = BELL_SCOPES.includes(scope) ? scope : 'assignee';
    const perEvent = Object.fromEntries(BELL_EVENTS.map((e) => [e, BELL_SCOPES.includes(audience?.[e]) ? audience[e] : fallback]));
    return {
        events: Array.isArray(events) ? events.filter((e) => BELL_EVENTS.includes(e)) : ['requester_reply'],
        scope: fallback,
        audience: perEvent,
    };
}

async function groupMembers(groupId) {
    if (!groupId) return [];
    const { rows } = await pool.query('SELECT "agentId" FROM setu.group_members WHERE "groupId" = $1', [groupId]);
    return rows.map((r) => r.agentId);
}

/**
 * Rings the bell for one ticket event. t is a ticket from loadTicket. `only` sends to those agents instead of the
 * configured audience (an assignment goes to the new assignee only); `except` skips the agent who caused it.
 */
async function ring(t, event, { title, body = '', only = null, except = null } = {}) {
    const cfg = await bellConfig();
    if (!cfg.events.includes(event)) return;
    let ids;
    const scope = cfg.audience[event];
    if (only) ids = only;
    else if (scope === 'all') ids = (await pool.query('SELECT id FROM setu.agents WHERE active')).rows.map((r) => r.id);
    else if (scope === 'group') ids = [...(t.agentId ? [t.agentId] : []), ...(await groupMembers(t.groupId))];
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

/** Agents watching a ticket (optionally leaving some out). */
async function watchersOf(ticketId, except = []) {
    const { rows } = await pool.query('SELECT "agentId" FROM setu.ticket_watchers WHERE "ticketId" = $1', [ticketId]);
    return rows.map((r) => r.agentId).filter((a) => !except.includes(a));
}

/**
 * Agents @mentioned in a note: "@Priya", "@priya.sharma" or a full email. A first name matches every active agent
 * whose name starts with it, so "@Arijit" reaches both Arijits - type more of the name to narrow it down.
 */
async function mentionedAgents(text) {
    const tags = [...new Set([...String(text).matchAll(/(?:^|[\s(])@([\w.+-]+(?:@[\w.-]+)?)/g)].map((m) => m[1].toLowerCase().replace(/[.,;:]+$/, '')))];
    if (!tags.length) return [];
    const { rows } = await pool.query(
        `SELECT DISTINCT a.id FROM setu.agents a, unnest($1::text[]) AS tag
         WHERE a.active AND (lower(a.email) = tag OR split_part(lower(a.email), '@', 1) = tag
            OR lower(replace(a.name, ' ', '.')) = tag OR lower(split_part(a.name, ' ', 1)) = tag)`,
        [tags.slice(0, 20)],
    );
    return rows.map((r) => r.id);
}

module.exports = { bellConfig, mentionedAgents, ring, watchersOf };
