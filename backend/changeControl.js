const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const { JWT_SECRET } = require('./sessionAuth');
const teams = require('./ccbTeams');
const { recordAccessChange } = require('./accessHistory');

/*
   CHANGE CONTROL BOARD (CCB) — the governance half of "SAP Change & Development" (the Dev Tracker
   embedded app, embedded-apps/dev-tracker/src/ccb). Own `ccb` schema, own routes under
   /change-control. Implements the SAP Change Management process approved for Emami (Oct 2026):

     1  Function raises the requirement with a BRD
     2  IT SPOC logs it here                                         -> draft
     3  IT SPOC categorises it against the CCB scope                 -> submit -> feasibility_review
     4  IT Application Head checks scope, feasibility and inter-module impact
          - in scope        -> recommend to CCB                      -> awaiting_ccb
          - out of scope    -> approve directly (reports / cosmetic) -> approved
          - urgent/critical -> emergency approval, CCB informed within 5 business days and the
                               approval ratified at the next CCB meeting
     5  CCB approves, approves with modifications, rejects or defers — in a meeting with quorum
     6-9 SAP Module Lead assigns a developer, build, UAT, transport — tracked in Dev Tracker: every
        approval creates the Dev Tracker assignment in the same transaction.

   Access: anyone with a Dev Tracker grant (Manage Access) can open the CCB register. What they may
   do comes from their CCB roles (ccb.roles, assigned in the Emami Apps Admin Center - ccbRolesAdminRouter):
     IT SPOC              log, categorise, submit and withdraw requests
     SAP Module Lead      same as IT SPOC (logs on behalf of a function), named owner of delivery
     IT Application Head  feasibility review, recommend / return / reject, out-of-scope and
                          emergency approval, edit requests after CCB discussion, terminate
     CCB Secretary        schedule meetings, run them (attendance, decisions, minutes)
     CCB Member           counts toward quorum
   Segregation of duties: nobody reviews or approves a request they logged themselves.
   Every action is written to ccb.history, which is only ever inserted into.
*/

const HOST_APP_ID = 'dev-tracker';
const router = express.Router();

function verifiedHubEmail(req) {
    const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    if (!match || !JWT_SECRET) return '';
    try {
        return String(jwt.verify(match[1].trim(), JWT_SECRET)?.email || '').trim().toLowerCase();
    } catch {
        return '';
    }
}

const q = (col) => `"${col}"`;
const sqlList = (arr) => arr.map((v) => `'${v}'`).join(', ');

const ROLES = ['IT SPOC', 'SAP Module Lead', 'IT Application Head', 'CCB Secretary', 'CCB Member'];
const LOGGER_ROLES = ['IT SPOC', 'SAP Module Lead', 'IT Application Head'];
const CATEGORIES = {
    major: { inScope: true, label: 'Major CR / project' },
    financial: { inScope: true, label: 'Financial impact' },
    control: { inScope: true, label: 'Control-level change' },
    strategic: { inScope: true, label: 'Strategic change' },
    report: { inScope: false, label: 'Report (new / modification)' },
    cosmetic: { inScope: false, label: 'Cosmetic change' },
};
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const SAP_SYSTEMS = ['ECC', 'BW', 'ECC & BW'];
const FEASIBILITY = ['feasible', 'feasible_with_conditions', 'not_feasible'];
const STATUSES = ['draft', 'feasibility_review', 'awaiting_ccb', 'approved', 'rejected', 'withdrawn', 'terminated'];
const ROUTES_TAKEN = ['ccb', 'out_of_scope', 'emergency'];
const MEETING_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'];
const ITEM_DECISIONS = {
    decision: ['approved', 'approved_with_modifications', 'rejected', 'deferred'],
    ratification: ['ratified', 'not_ratified'],
};
const DEFAULT_SETTINGS = { quorum: '3', informDays: '5', meetingTime: '15:00', meetingMode: 'online', reviewSlaDays: '5', ccbSlaDays: '30' };
const REVIEW_POSITIONS = ['support', 'concerns', 'oppose'];
const ACTION_STATUSES = ['open', 'done', 'dropped'];
const BOARD_ROLES = ['CCB Member', 'CCB Secretary', 'IT Application Head'];
const OPEN_MEETING = `('scheduled', 'in_progress')`;

async function initSchema() {
    await pool.query('CREATE SCHEMA IF NOT EXISTS ccb');
    await pool.query('CREATE SEQUENCE IF NOT EXISTS ccb.cr_no_seq START 1');
    await pool.query('CREATE SEQUENCE IF NOT EXISTS ccb.meeting_no_seq START 1');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ccb.roles (
            email text NOT NULL,
            role text NOT NULL CHECK (role IN (${sqlList(ROLES)})),
            "assignedBy" text,
            "assignedAt" timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (email, role)
        )
    `);
    await pool.query(`CREATE TABLE IF NOT EXISTS ccb.settings (key text PRIMARY KEY, value text NOT NULL)`);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ccb.meetings (
            id serial PRIMARY KEY,
            "meetingNo" text NOT NULL UNIQUE,
            title text NOT NULL,
            "scheduledAt" timestamptz NOT NULL,
            mode text NOT NULL DEFAULT 'online' CHECK (mode IN ('online', 'offline', 'hybrid')),
            venue text NOT NULL DEFAULT '',
            "isEmergency" boolean NOT NULL DEFAULT false,
            status text NOT NULL DEFAULT 'scheduled' CHECK (status IN (${sqlList(MEETING_STATUSES)})),
            minutes text NOT NULL DEFAULT '',
            "createdBy" text NOT NULL,
            "startedAt" timestamptz,
            "completedAt" timestamptz,
            "createdAt" timestamptz NOT NULL DEFAULT now(),
            "updatedAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ccb.requests (
            id serial PRIMARY KEY,
            "crNo" text NOT NULL UNIQUE,
            title text NOT NULL,
            "requestingFunction" text NOT NULL,
            "requestedBy" text NOT NULL,
            "brdReference" text NOT NULL DEFAULT '',
            description text NOT NULL,
            justification text NOT NULL,
            "sapSystem" text NOT NULL CHECK ("sapSystem" IN (${sqlList(SAP_SYSTEMS)})),
            "sapModules" text[] NOT NULL DEFAULT '{}',
            category text NOT NULL CHECK (category IN (${sqlList(Object.keys(CATEGORIES))})),
            "financialImpact" text NOT NULL DEFAULT '',
            priority text NOT NULL CHECK (priority IN (${sqlList(PRIORITIES)})),
            "requiredBy" date,
            "isEmergency" boolean NOT NULL DEFAULT false,
            "emergencyReason" text NOT NULL DEFAULT '',
            "moduleLeadEmail" text,
            status text NOT NULL DEFAULT 'draft' CHECK (status IN (${sqlList(STATUSES)})),
            "loggedBy" text NOT NULL,
            "returnNote" text,
            feasibility text CHECK (feasibility IN (${sqlList(FEASIBILITY)})),
            "crossModuleImpact" text,
            "reviewNotes" text,
            "reviewedBy" text,
            "reviewedAt" timestamptz,
            "approvalRoute" text CHECK ("approvalRoute" IN (${sqlList(ROUTES_TAKEN)})),
            decision text,
            "decisionNotes" text,
            "decidedBy" text,
            "decidedAt" timestamptz,
            "meetingId" int REFERENCES ccb.meetings(id) ON DELETE SET NULL,
            "ratificationStatus" text CHECK ("ratificationStatus" IN ('pending', 'ratified', 'not_ratified')),
            "informDueBy" date,
            "ccbInformedAt" timestamptz,
            "ratifiedAt" timestamptz,
            "ratificationMeetingId" int REFERENCES ccb.meetings(id) ON DELETE SET NULL,
            "devTrackerItemId" text,
            "devTrackerIssueNo" int,
            "submittedAt" timestamptz,
            "closedAt" timestamptz,
            "createdAt" timestamptz NOT NULL DEFAULT now(),
            "updatedAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS ccb_requests_status_idx ON ccb.requests (status)');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ccb.meeting_items (
            id serial PRIMARY KEY,
            "meetingId" int NOT NULL REFERENCES ccb.meetings(id) ON DELETE CASCADE,
            "requestId" int NOT NULL REFERENCES ccb.requests(id) ON DELETE CASCADE,
            kind text NOT NULL CHECK (kind IN ('decision', 'ratification')),
            position int NOT NULL DEFAULT 0,
            decision text,
            notes text NOT NULL DEFAULT '',
            "decidedBy" text,
            "decidedAt" timestamptz,
            UNIQUE ("meetingId", "requestId", kind)
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ccb.attendance (
            "meetingId" int NOT NULL REFERENCES ccb.meetings(id) ON DELETE CASCADE,
            email text NOT NULL,
            present boolean NOT NULL DEFAULT false,
            "markedBy" text,
            "markedAt" timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY ("meetingId", email)
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ccb.comments (
            id serial PRIMARY KEY,
            "requestId" int NOT NULL REFERENCES ccb.requests(id) ON DELETE CASCADE,
            "authorEmail" text NOT NULL,
            body text NOT NULL,
            "createdAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    // Append-only audit trail: no route updates or deletes rows here.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ccb.history (
            id serial PRIMARY KEY,
            "requestId" int REFERENCES ccb.requests(id) ON DELETE SET NULL,
            "meetingId" int REFERENCES ccb.meetings(id) ON DELETE SET NULL,
            "actorEmail" text NOT NULL,
            action text NOT NULL,
            "fromStatus" text,
            "toStatus" text,
            details jsonb,
            "occurredAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS ccb_history_request_idx ON ccb.history ("requestId")');
    // Microsoft Teams link of a meeting (ccbTeams.js). Additive columns; existing meetings keep teamsStatus 'none'.
    await pool.query(`
        ALTER TABLE ccb.meetings
            ADD COLUMN IF NOT EXISTS "durationMin" int NOT NULL DEFAULT 60,
            ADD COLUMN IF NOT EXISTS "teamsStatus" text NOT NULL DEFAULT 'none',
            ADD COLUMN IF NOT EXISTS "teamsEventId" text,
            ADD COLUMN IF NOT EXISTS "teamsOrganizer" text,
            ADD COLUMN IF NOT EXISTS "teamsJoinUrl" text NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS "teamsWebLink" text NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS "teamsError" text NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS "teamsSyncedAt" timestamptz
    `);
    // Board members' positions on agenda items before / during the meeting (advisory; the decision stays the board's).
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ccb.reviews (
            id serial PRIMARY KEY,
            "meetingItemId" int NOT NULL REFERENCES ccb.meeting_items(id) ON DELETE CASCADE,
            email text NOT NULL,
            position text NOT NULL CHECK (position IN (${sqlList(REVIEW_POSITIONS)})),
            note text NOT NULL DEFAULT '',
            "updatedAt" timestamptz NOT NULL DEFAULT now(),
            UNIQUE ("meetingItemId", email)
        )
    `);
    // Action items raised in CCB meetings, tracked to closure across meetings.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ccb.action_items (
            id serial PRIMARY KEY,
            "meetingId" int REFERENCES ccb.meetings(id) ON DELETE SET NULL,
            "requestId" int REFERENCES ccb.requests(id) ON DELETE SET NULL,
            title text NOT NULL,
            owner text NOT NULL,
            "dueDate" date,
            status text NOT NULL DEFAULT 'open' CHECK (status IN (${sqlList(ACTION_STATUSES)})),
            "closeNote" text NOT NULL DEFAULT '',
            "createdBy" text NOT NULL,
            "createdAt" timestamptz NOT NULL DEFAULT now(),
            "closedBy" text,
            "closedAt" timestamptz
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS ccb_action_items_status_idx ON ccb.action_items (status)');
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        await pool.query('INSERT INTO ccb.settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, value]);
    }
    console.log('[change-control] CCB schema up to date (ccb.requests, meetings, meeting_items, attendance, roles, history).');
}

// Awaited inside every handler so the first request after a cold start never races table creation.
const ready = initSchema().catch((err) => {
    console.error('[change-control] Schema init failed:', err);
    throw err;
});
ready.catch(() => {});

/* ---------- Helpers ---------- */

const str = (v, max = 5000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

function addBusinessDays(from, days) {
    const d = new Date(from);
    let added = 0;
    while (added < days) {
        d.setDate(d.getDate() + 1);
        const wd = d.getDay();
        if (wd !== 0 && wd !== 6) added++;
    }
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

async function getSettings(db = pool) {
    const { rows } = await db.query('SELECT key, value FROM ccb.settings');
    const out = { ...DEFAULT_SETTINGS };
    rows.forEach((r) => { out[r.key] = r.value; });
    return {
        quorum: Number(out.quorum) || 3, informDays: Number(out.informDays) || 5, meetingTime: out.meetingTime, meetingMode: out.meetingMode,
        reviewSlaDays: Number(out.reviewSlaDays) || 5, ccbSlaDays: Number(out.ccbSlaDays) || 30,
    };
}

async function logHistory(db, e) {
    await db.query(
        `INSERT INTO ccb.history ("requestId", "meetingId", "actorEmail", action, "fromStatus", "toStatus", details)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [e.requestId ?? null, e.meetingId ?? null, e.actorEmail, e.action, e.fromStatus ?? null, e.toStatus ?? null, e.details ? JSON.stringify(e.details) : null]
    );
}

async function namesFor(emails) {
    const list = [...new Set(emails.filter(Boolean))];
    if (!list.length) return {};
    try {
        const { rows } = await pool.query('SELECT email, name FROM emami_apps.users WHERE email = ANY($1)', [list]);
        return Object.fromEntries(rows.filter((r) => r.name).map((r) => [r.email, r.name]));
    } catch (err) {
        console.error('[change-control] Name lookup failed:', err.message);
        return {};
    }
}

async function withTransaction(fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}

function fail(res, err, message) {
    if (err instanceof HttpError) return res.status(err.status).json({ success: false, error: err.message });
    console.error('[change-control]', err);
    res.status(500).json({ success: false, error: message });
}

/* ---------- Access ---------- */

async function requireAccess(req, res, next) {
    const email = verifiedHubEmail(req);
    if (!email) return res.status(401).json({ success: false, error: 'Your Emami Apps session has expired or is missing. Please sign in again.' });
    try {
        await ready;
        const [grant, roles] = await Promise.all([
            pool.query('SELECT role FROM emami_apps.authorized_user_apps WHERE email = $1 AND app_id = $2', [email, HOST_APP_ID]),
            pool.query('SELECT role FROM ccb.roles WHERE email = $1', [email]),
        ]);
        if (!grant.rows.length) return res.status(403).json({ success: false, error: 'You do not have access to SAP Change & Development. Ask an admin to grant it in Manage Access.' });
        req.verifiedEmail = email;
        req.isAdmin = grant.rows[0].role === 'Admin';
        req.roles = roles.rows.map((r) => r.role);
        next();
    } catch (err) {
        console.error('[change-control]', err);
        res.status(500).json({ success: false, error: 'Could not verify your access.' });
    }
}

router.use(requireAccess);

const has = (req, ...roles) => roles.some((r) => req.roles.includes(r));
const canRunMeetings = (req) => has(req, 'CCB Secretary', 'IT Application Head');

/** Request actions available to this caller right now (the UI shows exactly these). */
function availableActions(r, req) {
    const email = req.verifiedEmail;
    const own = r.loggedBy === email;
    const head = has(req, 'IT Application Head');
    const logger = has(req, ...LOGGER_ROLES);
    const out = [];
    switch (r.status) {
        case 'draft':
            if (own || (logger && head)) out.push('edit', 'submit', 'withdraw');
            break;
        case 'feasibility_review':
            if (head && !own) {
                out.push('edit', 'return', 'reject');
                out.push(CATEGORIES[r.category]?.inScope ? 'recommend' : 'approve_out_of_scope');
                if (CATEGORIES[r.category]?.inScope) out.push('approve_emergency');
            }
            if (own) out.push('withdraw');
            break;
        case 'awaiting_ccb':
            if (head && !own) out.push('edit', 'return', 'approve_emergency');
            if (own || head) out.push('withdraw');
            break;
        case 'approved':
            if (head && r.approvalRoute === 'emergency' && !r.ccbInformedAt) out.push('mark_informed');
            if (head) out.push('terminate');
            break;
    }
    return out;
}

/* ---------- Dev Tracker hand-off ---------- */

const DEV_PRIORITY = { critical: 'P1', high: 'P1', medium: 'P2', low: 'P3' };
const DEV_IMPACT = { critical: 'High', high: 'High', medium: 'Medium', low: 'Low' };
const MODULE_TO_AREA = { SD: 'SD', FI: 'FI-AR', MM: 'MM', PP: 'PP', WM: 'WM' };

/**
 * Every approval (CCB, out-of-scope, emergency) lands in Dev Tracker as a 'Not Started' assignment,
 * written into dev_tracker.items inside the approval's own transaction — an approved request never
 * exists without its assignment. Developer is left empty: step 6 of the process is the SAP Module
 * Lead assigning one in Dev Tracker. Columns mirror devTracker.js's POST /items.
 */
async function createDevTrackerAssignment(db, r, approverEmail) {
    const names = await namesFor([r.loggedBy, approverEmail, r.moduleLeadEmail]);
    const nameOf = (e) => (e ? names[e] || e : null);
    const approver = nameOf(approverEmail);
    const route = { ccb: 'CCB approval', out_of_scope: 'IT Application Head approval (outside CCB scope)', emergency: 'Emergency approval by IT Application Head (CCB ratification pending)' }[r.approvalRoute];
    const description = [
        r.description,
        `Business justification:\n${r.justification}`,
        `Requesting function: ${r.requestingFunction} (${r.requestedBy})${r.brdReference ? `\nBRD: ${r.brdReference}` : ''}`,
        `SAP: ${r.sapSystem}${r.sapModules.length ? ` · ${r.sapModules.join(', ')}` : ''}`,
        r.crossModuleImpact && `Inter-module impact (IT Application Head):\n${r.crossModuleImpact}`,
        `${route} on ${istToday()} by ${approver}.${r.decisionNotes ? `\nConditions / modifications:\n${r.decisionNotes}` : ''}`,
        r.moduleLeadEmail && `SAP Module Lead: ${nameOf(r.moduleLeadEmail)}`,
    ].filter(Boolean).join('\n\n');

    let area = null;
    const mapped = [...new Set(r.sapModules.map((m) => MODULE_TO_AREA[m]).filter(Boolean))];
    if (mapped.length === 1 && r.sapModules.length === 1) area = mapped[0];
    else if (r.sapModules.length > 1) area = 'Cross-Functional';
    if (area) {
        const { rows } = await db.query(`SELECT 1 FROM dev_tracker.master_data WHERE category = 'area' AND value = $1`, [area]);
        if (!rows.length) area = null;
    }

    const row = {
        devList: `${r.crNo}: ${r.title}`,
        status: 'Not Started',
        issueType: 'Task',
        area,
        func: r.requestingFunction,
        priority: DEV_PRIORITY[r.priority] || null,
        impact: DEV_IMPACT[r.priority] || null,
        description,
        spocIT: nameOf(r.moduleLeadEmail || r.loggedBy),
        spocFunction: r.requestedBy,
        reporter: approver,
        startDate: istToday(),
        targetDate: r.requiredBy ? new Date(r.requiredBy).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : null,
        labels: `CCB, ${r.crNo}`,
        remarks: `Auto-created from ${r.crNo} — ${route}.`,
        rank: Date.now(),
    };
    const keys = Object.keys(row);
    const { rows } = await db.query(
        `INSERT INTO dev_tracker.items (id, ${keys.map(q).join(', ')}) VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')})
         RETURNING id, "issueNo"`,
        [crypto.randomUUID(), ...keys.map((k) => row[k])]
    );
    await db.query(
        `INSERT INTO dev_tracker.item_history ("itemId", field, "oldValue", "newValue", "changedByUsername") VALUES ($1, '__created__', NULL, $2, $3)`,
        [rows[0].id, row.devList, approver]
    );
    return rows[0];
}

/** Moves a request to 'approved' and creates its Dev Tracker assignment. */
async function approveRequest(db, r, { route, decision, notes, actorEmail, meetingId, informDays }) {
    const now = new Date();
    const patch = {
        status: 'approved', approvalRoute: route, decision, decisionNotes: notes || null,
        decidedBy: actorEmail, decidedAt: now, meetingId: meetingId ?? null, updatedAt: now,
    };
    if (route === 'emergency') {
        patch.ratificationStatus = 'pending';
        patch.informDueBy = addBusinessDays(now, informDays);
    }
    const updated = await patchRequest(db, r.id, patch);
    const item = await createDevTrackerAssignment(db, updated, actorEmail);
    return patchRequest(db, r.id, { devTrackerItemId: item.id, devTrackerIssueNo: item.issueNo });
}

async function patchRequest(db, id, patch) {
    const keys = Object.keys(patch);
    const { rows } = await db.query(
        `UPDATE ccb.requests SET ${keys.map((k, i) => `${q(k)} = $${i + 1}`).join(', ')} WHERE id = $${keys.length + 1} RETURNING *`,
        [...keys.map((k) => patch[k]), id]
    );
    return rows[0];
}

/* ---------- Me, people, roles, settings ---------- */

router.get('/me', async (req, res) => {
    const names = await namesFor([req.verifiedEmail]);
    res.json({
        success: true,
        me: {
            email: req.verifiedEmail, name: names[req.verifiedEmail] || req.verifiedEmail, roles: req.roles, isAdmin: req.isAdmin,
            can: { log: has(req, ...LOGGER_ROLES), review: has(req, 'IT Application Head'), runMeetings: canRunMeetings(req), manageRoles: req.isAdmin, assignRoles: false, reviewAgenda: has(req, ...BOARD_ROLES) },
        },
        categories: CATEGORIES,
    });
});

/** Everyone with a Dev Tracker grant, plus anyone already holding a CCB role. */
router.get('/people', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT p.email, COALESCE(u.name, p.email) AS name, bool_or(p.has_access) AS "hasAccess"
              FROM (SELECT email, true AS has_access FROM emami_apps.authorized_user_apps WHERE app_id = $1
                    UNION ALL SELECT email, false FROM ccb.roles) p
              LEFT JOIN emami_apps.users u ON u.email = p.email
             GROUP BY p.email, u.name ORDER BY 2`, [HOST_APP_ID]);
        res.json({ success: true, people: rows });
    } catch (err) {
        fail(res, err, 'Could not load people.');
    }
});

router.get('/roles', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT r.email, r.role, r."assignedAt", COALESCE(u.name, r.email) AS name,
                   EXISTS (SELECT 1 FROM emami_apps.authorized_user_apps a WHERE a.email = r.email AND a.app_id = $1) AS "hasAccess"
              FROM ccb.roles r LEFT JOIN emami_apps.users u ON u.email = r.email
             ORDER BY array_position($2::text[], r.role), 4`, [HOST_APP_ID, ROLES]);
        res.json({ success: true, roles: rows, settings: await getSettings() });
    } catch (err) {
        fail(res, err, 'Could not load CCB roles.');
    }
});

// CCB roles are assigned in the Emami Apps Admin Center (Manage Access), not in the app: see ccbRolesAdminRouter below.
const ROLES_IN_ADMIN_CENTER = 'CCB roles are assigned in the Emami Apps Admin Center (Manage Access > user > SAP Change & Development).';
// Assigning / removing in the app is closed; the Admin Center does it (same ccb.roles store).
router.post('/roles', (req, res) => res.status(403).json({ success: false, error: ROLES_IN_ADMIN_CENTER }));
router.delete('/roles', (req, res) => res.status(403).json({ success: false, error: ROLES_IN_ADMIN_CENTER }));

router.put('/settings', async (req, res) => {
    if (!req.isAdmin) return res.status(403).json({ success: false, error: 'Only a Dev Tracker admin can change CCB settings.' });
    const b = req.body || {};
    const next = {};
    if (b.quorum !== undefined) {
        const n = Math.round(Number(b.quorum));
        if (!(n >= 1 && n <= 20)) return res.status(400).json({ success: false, error: 'Quorum must be between 1 and 20.' });
        next.quorum = String(n);
    }
    if (b.informDays !== undefined) {
        const n = Math.round(Number(b.informDays));
        if (!(n >= 1 && n <= 30)) return res.status(400).json({ success: false, error: 'Inform window must be 1 to 30 business days.' });
        next.informDays = String(n);
    }
    if (b.meetingTime !== undefined) {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.meetingTime)) return res.status(400).json({ success: false, error: 'Meeting time must be HH:MM.' });
        next.meetingTime = b.meetingTime;
    }
    if (b.meetingMode !== undefined) {
        if (!['online', 'offline', 'hybrid'].includes(b.meetingMode)) return res.status(400).json({ success: false, error: 'Invalid meeting mode.' });
        next.meetingMode = b.meetingMode;
    }
    if (b.reviewSlaDays !== undefined) {
        const n = Math.round(Number(b.reviewSlaDays));
        if (!(n >= 1 && n <= 60)) return res.status(400).json({ success: false, error: 'Feasibility review target must be 1 to 60 business days.' });
        next.reviewSlaDays = String(n);
    }
    if (b.ccbSlaDays !== undefined) {
        const n = Math.round(Number(b.ccbSlaDays));
        if (!(n >= 1 && n <= 180)) return res.status(400).json({ success: false, error: 'CCB decision target must be 1 to 180 days.' });
        next.ccbSlaDays = String(n);
    }
    try {
        await withTransaction(async (db) => {
            for (const [key, value] of Object.entries(next)) {
                await db.query('INSERT INTO ccb.settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, value]);
            }
            await logHistory(db, { actorEmail: req.verifiedEmail, action: 'settings_changed', details: next });
        });
        res.json({ success: true, settings: await getSettings() });
    } catch (err) {
        fail(res, err, 'Could not save settings.');
    }
});

/* ---------- Requests ---------- */

const REQUEST_LIST_SQL = `
    SELECT r.*, i.status AS "devStatus", i.developer AS "devDeveloper", i."targetDate" AS "devTargetDate",
           m."meetingNo" AS "meetingNo"
      FROM ccb.requests r
      LEFT JOIN dev_tracker.items i ON i.id = r."devTrackerItemId"
      LEFT JOIN ccb.meetings m ON m.id = r."meetingId"`;

router.get('/requests', async (req, res) => {
    try {
        const { rows } = await pool.query(`${REQUEST_LIST_SQL} ORDER BY r.id DESC`);
        const names = await namesFor(rows.flatMap((r) => [r.loggedBy, r.decidedBy, r.moduleLeadEmail]));
        res.json({ success: true, requests: rows, names, settings: await getSettings() });
    } catch (err) {
        fail(res, err, 'Could not load change requests.');
    }
});

async function loadRequestByKey(key) {
    const byNo = /^CCB-/i.test(String(key));
    const { rows } = await pool.query(`${REQUEST_LIST_SQL} WHERE ${byNo ? 'upper(r."crNo") = upper($1)' : 'r.id = $1'}`, [byNo ? key : Number(key)]);
    return rows[0];
}

router.get('/requests/:key', async (req, res) => {
    try {
        if (!/^CCB-/i.test(req.params.key) && !Number.isInteger(Number(req.params.key))) return res.status(400).json({ success: false, error: 'Invalid request.' });
        const r = await loadRequestByKey(req.params.key);
        if (!r) return res.status(404).json({ success: false, error: 'Change request not found.' });
        const [comments, history, agenda, dev] = await Promise.all([
            pool.query('SELECT * FROM ccb.comments WHERE "requestId" = $1 ORDER BY "createdAt"', [r.id]),
            pool.query('SELECT * FROM ccb.history WHERE "requestId" = $1 ORDER BY "occurredAt" DESC, id DESC', [r.id]),
            pool.query(`SELECT mi.*, m."meetingNo", m.title AS "meetingTitle", m."scheduledAt", m.status AS "meetingStatus"
                          FROM ccb.meeting_items mi JOIN ccb.meetings m ON m.id = mi."meetingId"
                         WHERE mi."requestId" = $1 ORDER BY m."scheduledAt"`, [r.id]),
            r.devTrackerItemId
                ? pool.query(`SELECT id, "issueNo", status, developer, "targetDate", "startDate", "completedDate", "updatedAt" FROM dev_tracker.items WHERE id = $1`, [r.devTrackerItemId])
                : { rows: [] },
        ]);
        const names = await namesFor([
            r.loggedBy, r.reviewedBy, r.decidedBy, r.moduleLeadEmail,
            ...comments.rows.map((c) => c.authorEmail), ...history.rows.map((h) => h.actorEmail), ...agenda.rows.map((a) => a.decidedBy),
        ]);
        res.json({
            success: true,
            detail: { request: r, comments: comments.rows, history: history.rows, agenda: agenda.rows, devItem: dev.rows[0] || null, names, actions: availableActions(r, req) },
        });
    } catch (err) {
        fail(res, err, 'Could not load the change request.');
    }
});

/** Validates the editable request fields; `partial` allows a subset (edits). */
function readRequestFields(b, partial = false) {
    const f = {};
    const set = (k, v) => { if (!partial || b[k] !== undefined) f[k] = v; };
    set('title', str(b.title, 200));
    set('requestingFunction', str(b.requestingFunction, 120));
    set('requestedBy', str(b.requestedBy, 120));
    set('brdReference', str(b.brdReference, 500));
    set('description', str(b.description));
    set('justification', str(b.justification));
    set('sapSystem', b.sapSystem);
    set('sapModules', Array.isArray(b.sapModules) ? [...new Set(b.sapModules.map((m) => str(m, 30)).filter(Boolean))].slice(0, 20) : []);
    set('category', b.category);
    set('financialImpact', str(b.financialImpact, 500));
    set('priority', b.priority);
    set('requiredBy', b.requiredBy ? String(b.requiredBy).slice(0, 10) : null);
    set('isEmergency', !!b.isEmergency);
    set('emergencyReason', str(b.emergencyReason, 2000));
    set('moduleLeadEmail', str(b.moduleLeadEmail, 200).toLowerCase() || null);
    const problem =
        ('title' in f && f.title.length < 5 && 'Title must be at least 5 characters.') ||
        ('requestingFunction' in f && !f.requestingFunction && 'Enter the requesting function.') ||
        ('requestedBy' in f && !f.requestedBy && 'Enter who raised the requirement in the function.') ||
        ('description' in f && !f.description && 'Describe the business requirement.') ||
        ('justification' in f && !f.justification && 'Business justification is required.') ||
        ('sapSystem' in f && !SAP_SYSTEMS.includes(f.sapSystem) && 'Choose the SAP system.') ||
        ('category' in f && !CATEGORIES[f.category] && 'Choose the CCB category.') ||
        ('priority' in f && !PRIORITIES.includes(f.priority) && 'Choose a priority.') ||
        ('requiredBy' in f && f.requiredBy && !/^\d{4}-\d{2}-\d{2}$/.test(f.requiredBy) && 'Invalid required-by date.') ||
        ('isEmergency' in f && f.isEmergency && !f.emergencyReason && 'Explain the urgent business need or critical system issue.');
    if (problem) throw new HttpError(400, problem);
    return f;
}

router.post('/requests', async (req, res) => {
    if (!has(req, ...LOGGER_ROLES)) return res.status(403).json({ success: false, error: 'Only an IT SPOC, SAP Module Lead or IT Application Head can log a change request.' });
    try {
        const f = readRequestFields(req.body || {});
        const submitNow = req.body?.intent === 'submit';
        const now = new Date();
        const cols = { ...f, status: submitNow ? 'feasibility_review' : 'draft', loggedBy: req.verifiedEmail, submittedAt: submitNow ? now : null };
        const keys = Object.keys(cols);
        const created = await withTransaction(async (db) => {
            const { rows } = await db.query(
                `INSERT INTO ccb.requests ("crNo", ${keys.map(q).join(', ')})
                 VALUES ('CCB-' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY') || '-' || lpad(nextval('ccb.cr_no_seq')::text, 4, '0'),
                         ${keys.map((_, i) => `$${i + 1}`).join(', ')})
                 RETURNING *`,
                keys.map((k) => cols[k])
            );
            await logHistory(db, { requestId: rows[0].id, actorEmail: req.verifiedEmail, action: 'logged', toStatus: 'draft' });
            if (submitNow) await logHistory(db, { requestId: rows[0].id, actorEmail: req.verifiedEmail, action: 'submit', fromStatus: 'draft', toStatus: 'feasibility_review', details: { category: f.category } });
            return rows[0];
        });
        res.json({ success: true, request: created });
    } catch (err) {
        fail(res, err, 'Could not save the change request.');
    }
});

router.put('/requests/:id', async (req, res) => {
    const id = Number(req.params.id);
    try {
        const { rows } = await pool.query('SELECT * FROM ccb.requests WHERE id = $1', [id]);
        const r = rows[0];
        if (!r) return res.status(404).json({ success: false, error: 'Change request not found.' });
        if (!availableActions(r, req).includes('edit')) return res.status(403).json({ success: false, error: 'You cannot edit this request at its current stage.' });
        const f = readRequestFields(req.body || {}, true);
        const changed = Object.keys(f).filter((k) => JSON.stringify(f[k] ?? null) !== JSON.stringify(k === 'requiredBy' && r[k] ? new Date(r[k]).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : r[k] ?? null));
        if (!changed.length) return res.json({ success: true, request: r });
        const updated = await withTransaction(async (db) => {
            const patch = Object.fromEntries(changed.map((k) => [k, f[k]]));
            patch.updatedAt = new Date();
            const up = await db.query(
                `UPDATE ccb.requests SET ${Object.keys(patch).map((k, i) => `${q(k)} = $${i + 1}`).join(', ')}
                  WHERE id = $${Object.keys(patch).length + 1} AND status = $${Object.keys(patch).length + 2} RETURNING *`,
                [...Object.values(patch), id, r.status]
            );
            if (!up.rows.length) throw new HttpError(409, 'Someone else updated this request just now. Refresh and try again.');
            await logHistory(db, { requestId: id, actorEmail: req.verifiedEmail, action: 'edited', details: { fields: changed } });
            return up.rows[0];
        });
        res.json({ success: true, request: updated });
    } catch (err) {
        fail(res, err, 'Could not save the change request.');
    }
});

const NOTE_REQUIRED = { return: 'Say what the IT SPOC needs to clarify.', reject: 'Give the reason for rejecting.', withdraw: 'Give the reason for withdrawing.', terminate: 'Give the reason for terminating development.', approve_emergency: 'Record the written justification for the emergency approval.' };

router.post('/requests/:id/actions', async (req, res) => {
    const id = Number(req.params.id);
    const action = req.body?.action;
    const note = str(req.body?.note);
    try {
        const { rows } = await pool.query('SELECT * FROM ccb.requests WHERE id = $1', [id]);
        const r = rows[0];
        if (!r) return res.status(404).json({ success: false, error: 'Change request not found.' });
        if (action === 'edit' || !availableActions(r, req).includes(action)) return res.status(403).json({ success: false, error: 'You are not allowed to do this at the current stage.' });
        if (NOTE_REQUIRED[action] && !note) return res.status(400).json({ success: false, error: NOTE_REQUIRED[action] });
        const settings = await getSettings();
        const now = new Date();

        const result = await withTransaction(async (db) => {
            // Re-read under lock so two people acting at once can't both move the request.
            const locked = (await db.query('SELECT * FROM ccb.requests WHERE id = $1 FOR UPDATE', [id])).rows[0];
            if (locked.status !== r.status) throw new HttpError(409, 'Someone else updated this request just now. Refresh and try again.');
            const details = note ? { note } : {};
            let updated;
            switch (action) {
                case 'submit':
                    updated = await patchRequest(db, id, { status: 'feasibility_review', submittedAt: now, returnNote: null, updatedAt: now });
                    details.category = r.category;
                    break;
                case 'withdraw':
                    updated = await patchRequest(db, id, { status: 'withdrawn', closedAt: now, updatedAt: now });
                    break;
                case 'return':
                    updated = await patchRequest(db, id, { status: 'draft', returnNote: note, updatedAt: now });
                    break;
                case 'reject':
                    updated = await patchRequest(db, id, {
                        status: 'rejected', decision: 'rejected', decisionNotes: note, decidedBy: req.verifiedEmail, decidedAt: now,
                        reviewedBy: req.verifiedEmail, reviewedAt: now, reviewNotes: note, feasibility: req.body.feasibility && FEASIBILITY.includes(req.body.feasibility) ? req.body.feasibility : r.feasibility, closedAt: now, updatedAt: now,
                    });
                    break;
                case 'recommend':
                case 'approve_out_of_scope': {
                    const feasibility = req.body?.feasibility;
                    const crossModuleImpact = str(req.body?.crossModuleImpact);
                    if (!FEASIBILITY.includes(feasibility) || feasibility === 'not_feasible') throw new HttpError(400, 'Record the feasibility as Feasible or Feasible with conditions.');
                    if (!crossModuleImpact) throw new HttpError(400, 'Record the inter-module impact in SAP (write "None" if there is none).');
                    const review = { feasibility, crossModuleImpact, reviewNotes: note || null, reviewedBy: req.verifiedEmail, reviewedAt: now, updatedAt: now };
                    if (action === 'recommend') {
                        updated = await patchRequest(db, id, { ...review, status: 'awaiting_ccb' });
                    } else {
                        await patchRequest(db, id, review);
                        updated = await approveRequest(db, { ...r, ...review }, { route: 'out_of_scope', decision: 'approved', notes: note, actorEmail: req.verifiedEmail, informDays: settings.informDays });
                    }
                    Object.assign(details, { feasibility, crossModuleImpact });
                    break;
                }
                case 'approve_emergency': {
                    const review = r.reviewedAt ? {} : { reviewedBy: req.verifiedEmail, reviewedAt: now, feasibility: 'feasible', crossModuleImpact: str(req.body?.crossModuleImpact) || null };
                    if (Object.keys(review).length) await patchRequest(db, id, review);
                    updated = await approveRequest(db, { ...r, ...review, isEmergency: true }, { route: 'emergency', decision: 'approved', notes: note, actorEmail: req.verifiedEmail, informDays: settings.informDays });
                    updated = await patchRequest(db, id, { isEmergency: true, emergencyReason: r.emergencyReason || note });
                    details.informDueBy = updated.informDueBy;
                    break;
                }
                case 'mark_informed':
                    updated = await patchRequest(db, id, { ccbInformedAt: now, updatedAt: now });
                    break;
                case 'terminate':
                    updated = await patchRequest(db, id, { status: 'terminated', closedAt: now, updatedAt: now });
                    if (r.devTrackerItemId) {
                        await db.query(`UPDATE dev_tracker.items SET status = 'Cancelled', "cancelledDate" = $2, "updatedAt" = now() WHERE id = $1 AND status <> 'Completed'`, [r.devTrackerItemId, istToday()]);
                    }
                    break;
                default:
                    throw new HttpError(400, 'Unknown action.');
            }
            if (r.status === 'awaiting_ccb' && updated.status !== 'awaiting_ccb') {
                // No longer up for a CCB decision — drop it from any open meeting's agenda.
                await db.query(
                    `DELETE FROM ccb.meeting_items mi USING ccb.meetings m
                      WHERE m.id = mi."meetingId" AND m.status IN ${OPEN_MEETING} AND mi."requestId" = $1 AND mi.kind = 'decision' AND mi.decision IS NULL`,
                    [id]
                );
            }
            if (note) await db.query('INSERT INTO ccb.comments ("requestId", "authorEmail", body) VALUES ($1, $2, $3)', [id, req.verifiedEmail, note]);
            if (updated.devTrackerIssueNo != null && updated.devTrackerIssueNo !== r.devTrackerIssueNo) details.devTrackerIssueNo = updated.devTrackerIssueNo;
            await logHistory(db, { requestId: id, actorEmail: req.verifiedEmail, action, fromStatus: r.status, toStatus: updated.status, details });
            return updated;
        });
        res.json({ success: true, request: result });
    } catch (err) {
        fail(res, err, 'Could not update the change request.');
    }
});

router.post('/requests/:id/comments', async (req, res) => {
    const id = Number(req.params.id);
    const body = str(req.body?.body);
    if (!body) return res.status(400).json({ success: false, error: 'Write a comment first.' });
    try {
        const out = await withTransaction(async (db) => {
            const ins = await db.query(
                `INSERT INTO ccb.comments ("requestId", "authorEmail", body) SELECT id, $2, $3 FROM ccb.requests WHERE id = $1 RETURNING *`,
                [id, req.verifiedEmail, body]
            );
            if (!ins.rows.length) throw new HttpError(404, 'Change request not found.');
            await logHistory(db, { requestId: id, actorEmail: req.verifiedEmail, action: 'commented' });
            return ins.rows[0];
        });
        res.json({ success: true, comment: out });
    } catch (err) {
        fail(res, err, 'Could not add the comment.');
    }
});

/* ---------- Meetings ---------- */

/** Requests that belong on the next agenda: awaiting a CCB decision, or an emergency approval
 *  awaiting ratification — and not already on another open meeting's agenda. */
async function pendingAgenda(db, exceptMeetingId = null) {
    const { rows } = await db.query(`
        SELECT r.id, CASE WHEN r.status = 'awaiting_ccb' THEN 'decision' ELSE 'ratification' END AS kind
          FROM ccb.requests r
         WHERE (r.status = 'awaiting_ccb' OR (r.status IN ('approved', 'terminated') AND r."ratificationStatus" = 'pending'))
           AND NOT EXISTS (
                SELECT 1 FROM ccb.meeting_items mi JOIN ccb.meetings m ON m.id = mi."meetingId"
                 WHERE mi."requestId" = r.id AND mi.decision IS NULL AND m.status IN ${OPEN_MEETING}
                   AND m.id IS DISTINCT FROM $1)
         ORDER BY CASE WHEN r.status = 'awaiting_ccb' THEN 1 ELSE 0 END, r.priority = 'critical' DESC, r.priority = 'high' DESC, r.id`, [exceptMeetingId]);
    return rows;
}

async function addToAgenda(db, meetingId, items) {
    const { rows } = await db.query('SELECT COALESCE(MAX(position), 0) AS p FROM ccb.meeting_items WHERE "meetingId" = $1', [meetingId]);
    let pos = rows[0].p;
    let added = 0;
    for (const it of items) {
        const ins = await db.query(
            `INSERT INTO ccb.meeting_items ("meetingId", "requestId", kind, position) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id`,
            [meetingId, it.id, it.kind, ++pos]
        );
        added += ins.rows.length;
    }
    return added;
}

router.get('/meetings', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT m.*,
                   COUNT(mi.id)::int AS "itemCount",
                   COUNT(mi.id) FILTER (WHERE mi.decision IS NOT NULL)::int AS "decidedCount",
                   COUNT(mi.id) FILTER (WHERE mi.decision IN ('approved', 'approved_with_modifications'))::int AS "approvedCount",
                   COUNT(mi.id) FILTER (WHERE mi.decision = 'rejected')::int AS "rejectedCount",
                   COUNT(mi.id) FILTER (WHERE mi.decision = 'deferred')::int AS "deferredCount",
                   (SELECT COUNT(*)::int FROM ccb.attendance a WHERE a."meetingId" = m.id AND a.present) AS "presentCount"
              FROM ccb.meetings m LEFT JOIN ccb.meeting_items mi ON mi."meetingId" = m.id
             GROUP BY m.id ORDER BY m."scheduledAt" DESC`);
        const pending = await pendingAgenda(pool);
        res.json({ success: true, meetings: rows, pendingCount: pending.length, settings: await getSettings() });
    } catch (err) {
        fail(res, err, 'Could not load meetings.');
    }
});

router.post('/meetings', async (req, res) => {
    if (!canRunMeetings(req)) return res.status(403).json({ success: false, error: 'Only the CCB Secretary or IT Application Head can schedule a CCB meeting.' });
    const b = req.body || {};
    const scheduledAt = new Date(b.scheduledAt);
    if (isNaN(scheduledAt)) return res.status(400).json({ success: false, error: 'Choose the meeting date and time.' });
    const mode = ['online', 'offline', 'hybrid'].includes(b.mode) ? b.mode : 'online';
    const isEmergency = !!b.isEmergency;
    const monthLabel = scheduledAt.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
    const durationMin = Math.min(480, Math.max(15, Math.round(Number(b.durationMinutes) || 60)));
    const title = str(b.title, 200) || (isEmergency ? `Emergency CCB meeting — ${scheduledAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}` : `CCB meeting — ${monthLabel}`);
    try {
        const meeting = await withTransaction(async (db) => {
            const { rows } = await db.query(
                `INSERT INTO ccb.meetings ("meetingNo", title, "scheduledAt", mode, venue, "isEmergency", "createdBy", "durationMin")
                 VALUES ('MTG-' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY') || '-' || lpad(nextval('ccb.meeting_no_seq')::text, 3, '0'), $1, $2, $3, $4, $5, $6, $7)
                 RETURNING *`,
                [title, scheduledAt, mode, str(b.venue, 300), isEmergency, req.verifiedEmail, durationMin]
            );
            const added = await addToAgenda(db, rows[0].id, await pendingAgenda(db, rows[0].id));
            await logHistory(db, { meetingId: rows[0].id, actorEmail: req.verifiedEmail, action: 'meeting_scheduled', details: { scheduledAt, agendaItems: added } });
            return rows[0];
        });
        // The meeting is saved; the Teams meeting is added on top and never undoes the scheduling.
        res.json({ success: true, meeting: await syncTeams(meeting.id, 'create', req.verifiedEmail) || meeting });
    } catch (err) {
        fail(res, err, 'Could not schedule the meeting.');
    }
});

/* ---------- Microsoft Teams (ccbTeams.js) ---------- */

/** Who gets the invitation: everyone holding a CCB board role. */
async function boardEmails() {
    const { rows } = await pool.query(`SELECT DISTINCT email FROM ccb.roles WHERE role IN ('CCB Member', 'CCB Secretary', 'IT Application Head')`);
    return rows.map((r) => r.email);
}

async function agendaOf(meetingId) {
    const { rows } = await pool.query(
        `SELECT r."crNo", r.title, mi.kind FROM ccb.meeting_items mi JOIN ccb.requests r ON r.id = mi."requestId"
          WHERE mi."meetingId" = $1 ORDER BY mi.kind = 'decision', mi.position`, [meetingId]);
    return rows;
}

/**
 * Create, update or cancel the meeting's Teams meeting and store the outcome on the meeting row. Never throws:
 * a Graph failure leaves the CCB meeting as it is and records teamsStatus 'failed' + teamsError. Returns the
 * fresh meeting row (null if it could not be read).
 */
async function syncTeams(meetingId, action, actorEmail, note) {
    try {
        const m = await loadMeeting(meetingId);
        if (!m) return null;
        if (!teams.configured()) return m;
        if (action === 'cancel') {
            if (!m.teamsEventId || m.teamsStatus === 'cancelled') return m;
        } else if (action === 'update' && !m.teamsEventId) {
            return m;
        }
        let set;
        try {
            if (action === 'create') {
                const [attendees, agenda] = await Promise.all([boardEmails(), agendaOf(m.id)]);
                const r = await teams.createMeeting(m, { organizer: actorEmail, attendees, agenda });
                set = { teamsStatus: 'created', teamsEventId: r.eventId, teamsOrganizer: r.organizer, teamsJoinUrl: r.joinUrl, teamsWebLink: r.webLink, teamsError: '' };
            } else if (action === 'update') {
                const [attendees, agenda] = await Promise.all([boardEmails(), agendaOf(m.id)]);
                const r = await teams.updateMeeting(m, { attendees, agenda });
                set = { teamsStatus: 'created', teamsJoinUrl: r.joinUrl, teamsError: '' };
            } else {
                await teams.cancelMeeting(m, note);
                set = { teamsStatus: 'cancelled', teamsError: '' };
            }
        } catch (err) {
            console.error(`[change-control] Teams ${action} for ${m.meetingNo} failed:`, err.message);
            set = { teamsError: String(err.message || err).slice(0, 1000), ...(m.teamsEventId ? {} : { teamsStatus: 'failed' }) };
        }
        set.teamsSyncedAt = new Date();
        const keys = Object.keys(set);
        const { rows } = await pool.query(`UPDATE ccb.meetings SET ${keys.map((k, i) => `${q(k)} = $${i + 1}`).join(', ')} WHERE id = $${keys.length + 1} RETURNING *`, [...keys.map((k) => set[k]), m.id]);
        await logHistory(pool, { meetingId: m.id, actorEmail, action: set.teamsError ? 'teams_failed' : `teams_${action === 'create' ? 'created' : action === 'update' ? 'updated' : 'cancelled'}`, details: set.teamsError ? { error: set.teamsError } : { joinUrl: rows[0].teamsJoinUrl || undefined } });
        return rows[0];
    } catch (err) {
        console.error('[change-control] Teams sync error:', err.message);
        return null;
    }
}

/** Create the Teams meeting again (after a failure, e.g. before the Graph permission was granted) or re-send the invitation. */
router.post('/meetings/:id/teams', async (req, res) => {
    const id = Number(req.params.id);
    try {
        requireRunner(req);
        if (!teams.configured()) throw new HttpError(503, 'Microsoft Teams is not set up on this server.');
        const m = await loadMeeting(id);
        if (!m) throw new HttpError(404, 'Meeting not found.');
        if (!['scheduled', 'in_progress'].includes(m.status)) throw new HttpError(409, `This meeting is ${m.status.replace('_', ' ')}.`);
        const out = await syncTeams(id, m.teamsEventId ? 'update' : 'create', req.verifiedEmail);
        if (!out) throw new Error('Teams sync failed.');
        res.json({ success: true, meeting: out });
    } catch (err) {
        fail(res, err, 'Could not create the Teams meeting.');
    }
});

async function loadMeeting(id) {
    const { rows } = await pool.query('SELECT * FROM ccb.meetings WHERE id = $1', [id]);
    return rows[0];
}

router.get('/meetings/:id', async (req, res) => {
    const id = Number(req.params.id);
    try {
        const m = await loadMeeting(id);
        if (!m) return res.status(404).json({ success: false, error: 'Meeting not found.' });
        const settings = await getSettings();
        const [items, attendance, members, pending] = await Promise.all([
            pool.query(`
                SELECT mi.*, r."crNo", r.title, r.category, r.priority, r."requestingFunction", r."requestedBy", r."sapSystem", r."sapModules",
                       r.description, r.justification, r."financialImpact", r.feasibility, r."crossModuleImpact", r."reviewNotes", r.status AS "requestStatus",
                       r."isEmergency", r."emergencyReason", r."decidedAt" AS "requestDecidedAt", r."decidedBy" AS "requestDecidedBy", r."loggedBy",
                       r."devTrackerIssueNo", r."requiredBy"
                  FROM ccb.meeting_items mi JOIN ccb.requests r ON r.id = mi."requestId"
                 WHERE mi."meetingId" = $1 ORDER BY mi.kind = 'decision', mi.position`, [id]),
            pool.query('SELECT * FROM ccb.attendance WHERE "meetingId" = $1', [id]),
            pool.query(`SELECT r.email, array_agg(r.role ORDER BY r.role) AS roles, COALESCE(u.name, r.email) AS name
                          FROM ccb.roles r LEFT JOIN emami_apps.users u ON u.email = r.email
                         WHERE r.role IN ('CCB Member', 'CCB Secretary', 'IT Application Head') GROUP BY r.email, u.name ORDER BY 3`),
            ['scheduled', 'in_progress'].includes(m.status) ? pendingAgenda(pool, id) : [],
        ]);
        const [reviews, actions] = await Promise.all([
            pool.query(`SELECT v.* FROM ccb.reviews v JOIN ccb.meeting_items mi ON mi.id = v."meetingItemId" WHERE mi."meetingId" = $1 ORDER BY v."updatedAt"`, [id]),
            pool.query(`SELECT a.*, r."crNo" FROM ccb.action_items a LEFT JOIN ccb.requests r ON r.id = a."requestId" WHERE a."meetingId" = $1 ORDER BY a.id`, [id]),
        ]);
        const present = new Set(attendance.rows.filter((a) => a.present).map((a) => a.email));
        const presentMembers = members.rows.filter((p) => p.roles.includes('CCB Member') && present.has(p.email)).length;
        const names = await namesFor([m.createdBy, ...items.rows.flatMap((i) => [i.decidedBy, i.loggedBy, i.requestDecidedBy]), ...reviews.rows.map((v) => v.email), ...actions.rows.map((a) => a.owner)]);
        res.json({
            success: true,
            detail: {
                meeting: m, items: items.rows, attendance: attendance.rows, people: members.rows, names,
                quorum: { required: settings.quorum, present: presentMembers, met: presentMembers >= settings.quorum },
                notOnAgenda: pending.length,
                canRun: canRunMeetings(req),
                teamsConfigured: teams.configured(),
                reviews: reviews.rows,
                actions: actions.rows,
                canReview: has(req, ...BOARD_ROLES),
            },
        });
    } catch (err) {
        fail(res, err, 'Could not load the meeting.');
    }
});

function requireRunner(req) {
    if (!canRunMeetings(req)) throw new HttpError(403, 'Only the CCB Secretary or IT Application Head can run CCB meetings.');
}

async function lockMeeting(db, id, allowed) {
    const m = (await db.query('SELECT * FROM ccb.meetings WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!m) throw new HttpError(404, 'Meeting not found.');
    if (allowed && !allowed.includes(m.status)) throw new HttpError(409, `This meeting is ${m.status.replace('_', ' ')}.`);
    return m;
}

router.put('/meetings/:id', async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body || {};
    try {
        requireRunner(req);
        const out = await withTransaction(async (db) => {
            const m = await lockMeeting(db, id, ['scheduled', 'in_progress', 'completed']);
            const patch = { updatedAt: new Date() };
            if (b.minutes !== undefined) patch.minutes = str(b.minutes, 50000);
            if (m.status !== 'completed') {
                if (b.title !== undefined && str(b.title, 200)) patch.title = str(b.title, 200);
                if (b.venue !== undefined) patch.venue = str(b.venue, 300);
                if (b.mode !== undefined && ['online', 'offline', 'hybrid'].includes(b.mode)) patch.mode = b.mode;
                if (b.durationMinutes !== undefined && Number(b.durationMinutes) >= 15) patch.durationMin = Math.min(480, Math.round(Number(b.durationMinutes)));
                if (b.scheduledAt !== undefined && m.status === 'scheduled') {
                    const d = new Date(b.scheduledAt);
                    if (isNaN(d)) throw new HttpError(400, 'Invalid date.');
                    patch.scheduledAt = d;
                }
            }
            const keys = Object.keys(patch);
            const { rows } = await db.query(`UPDATE ccb.meetings SET ${keys.map((k, i) => `${q(k)} = $${i + 1}`).join(', ')} WHERE id = $${keys.length + 1} RETURNING *`, [...keys.map((k) => patch[k]), id]);
            if (keys.some((k) => k !== 'updatedAt' && k !== 'minutes')) await logHistory(db, { meetingId: id, actorEmail: req.verifiedEmail, action: 'meeting_updated', details: { fields: keys.filter((k) => k !== 'updatedAt') } });
            return { meeting: rows[0], invite: keys.some((k) => ['title', 'venue', 'mode', 'scheduledAt', 'durationMin'].includes(k)) };
        });
        // Keep the Teams invitation in step with the app (new time, title, venue or mode).
        const synced = out.invite && out.meeting.teamsEventId && out.meeting.status !== 'completed' ? await syncTeams(id, 'update', req.verifiedEmail) : null;
        res.json({ success: true, meeting: synced || out.meeting });
    } catch (err) {
        fail(res, err, 'Could not save the meeting.');
    }
});

router.post('/meetings/:id/agenda/refresh', async (req, res) => {
    const id = Number(req.params.id);
    try {
        requireRunner(req);
        const added = await withTransaction(async (db) => {
            await lockMeeting(db, id, ['scheduled', 'in_progress']);
            const n = await addToAgenda(db, id, await pendingAgenda(db, id));
            if (n) await logHistory(db, { meetingId: id, actorEmail: req.verifiedEmail, action: 'agenda_refreshed', details: { added: n } });
            return n;
        });
        res.json({ success: true, added });
    } catch (err) {
        fail(res, err, 'Could not update the agenda.');
    }
});

router.delete('/meetings/:id/items/:itemId', async (req, res) => {
    const id = Number(req.params.id);
    try {
        requireRunner(req);
        await withTransaction(async (db) => {
            await lockMeeting(db, id, ['scheduled', 'in_progress']);
            const del = await db.query('DELETE FROM ccb.meeting_items WHERE id = $1 AND "meetingId" = $2 AND decision IS NULL RETURNING "requestId"', [Number(req.params.itemId), id]);
            if (!del.rows.length) throw new HttpError(409, 'That item has already been decided.');
            await logHistory(db, { meetingId: id, requestId: del.rows[0].requestId, actorEmail: req.verifiedEmail, action: 'removed_from_agenda' });
        });
        res.json({ success: true });
    } catch (err) {
        fail(res, err, 'Could not remove the agenda item.');
    }
});

router.post('/meetings/:id/start', async (req, res) => {
    const id = Number(req.params.id);
    try {
        requireRunner(req);
        await withTransaction(async (db) => {
            await lockMeeting(db, id, ['scheduled']);
            await db.query(`UPDATE ccb.meetings SET status = 'in_progress', "startedAt" = now(), "updatedAt" = now() WHERE id = $1`, [id]);
            await logHistory(db, { meetingId: id, actorEmail: req.verifiedEmail, action: 'meeting_started' });
        });
        res.json({ success: true });
    } catch (err) {
        fail(res, err, 'Could not start the meeting.');
    }
});

router.put('/meetings/:id/attendance', async (req, res) => {
    const id = Number(req.params.id);
    const email = str(req.body?.email, 200).toLowerCase();
    const present = !!req.body?.present;
    try {
        requireRunner(req);
        await withTransaction(async (db) => {
            await lockMeeting(db, id, ['in_progress']);
            const member = await db.query('SELECT 1 FROM ccb.roles WHERE email = $1 AND role IN ($2, $3, $4)', [email, 'CCB Member', 'CCB Secretary', 'IT Application Head']);
            if (!member.rows.length) throw new HttpError(400, 'Only CCB members can be marked present.');
            await db.query(
                `INSERT INTO ccb.attendance ("meetingId", email, present, "markedBy") VALUES ($1, $2, $3, $4)
                 ON CONFLICT ("meetingId", email) DO UPDATE SET present = EXCLUDED.present, "markedBy" = EXCLUDED."markedBy", "markedAt" = now()`,
                [id, email, present, req.verifiedEmail]
            );
        });
        res.json({ success: true });
    } catch (err) {
        fail(res, err, 'Could not update attendance.');
    }
});

router.post('/meetings/:id/items/:itemId/decision', async (req, res) => {
    const id = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const decision = req.body?.decision;
    const notes = str(req.body?.notes);
    try {
        requireRunner(req);
        const settings = await getSettings();
        const out = await withTransaction(async (db) => {
            await lockMeeting(db, id, ['in_progress']);
            const it = (await db.query('SELECT * FROM ccb.meeting_items WHERE id = $1 AND "meetingId" = $2 FOR UPDATE', [itemId, id])).rows[0];
            if (!it) throw new HttpError(404, 'Agenda item not found.');
            if (it.decision) throw new HttpError(409, 'This item has already been decided.');
            if (!ITEM_DECISIONS[it.kind].includes(decision)) throw new HttpError(400, 'Choose a decision.');
            if (['approved_with_modifications', 'rejected', 'not_ratified', 'deferred'].includes(decision) && !notes) throw new HttpError(400, 'Record the board\'s reasons or the modifications agreed.');

            // Quorum: at least `quorum` CCB Members marked present.
            const q1 = await db.query(
                `SELECT COUNT(*)::int AS n FROM ccb.attendance a WHERE a."meetingId" = $1 AND a.present
                    AND EXISTS (SELECT 1 FROM ccb.roles r WHERE r.email = a.email AND r.role = 'CCB Member')`, [id]);
            if (q1.rows[0].n < settings.quorum) throw new HttpError(409, `Quorum not met: ${q1.rows[0].n} of the required ${settings.quorum} CCB members are marked present.`);

            const r = (await db.query('SELECT * FROM ccb.requests WHERE id = $1 FOR UPDATE', [it.requestId])).rows[0];
            const now = new Date();
            let updated = r;
            if (it.kind === 'decision') {
                if (r.status !== 'awaiting_ccb') throw new HttpError(409, `${r.crNo} is no longer awaiting a CCB decision.`);
                if (decision === 'approved' || decision === 'approved_with_modifications') {
                    updated = await approveRequest(db, r, { route: 'ccb', decision, notes, actorEmail: req.verifiedEmail, meetingId: id, informDays: settings.informDays });
                } else if (decision === 'rejected') {
                    updated = await patchRequest(db, r.id, { status: 'rejected', decision, decisionNotes: notes, decidedBy: req.verifiedEmail, decidedAt: now, meetingId: id, closedAt: now, updatedAt: now });
                }
            } else {
                if (r.ratificationStatus !== 'pending') throw new HttpError(409, `${r.crNo} is not awaiting ratification.`);
                updated = await patchRequest(db, r.id, { ratificationStatus: decision, ratifiedAt: now, ratificationMeetingId: id, updatedAt: now });
            }
            await db.query('UPDATE ccb.meeting_items SET decision = $1, notes = $2, "decidedBy" = $3, "decidedAt" = now() WHERE id = $4', [decision, notes, req.verifiedEmail, itemId]);
            if (notes) await db.query('INSERT INTO ccb.comments ("requestId", "authorEmail", body) VALUES ($1, $2, $3)', [r.id, req.verifiedEmail, `CCB ${decision.replace(/_/g, ' ')}: ${notes}`]);
            const details = { decision, meetingId: id, ...(notes ? { note: notes } : {}) };
            if (updated.devTrackerIssueNo != null && updated.devTrackerIssueNo !== r.devTrackerIssueNo) details.devTrackerIssueNo = updated.devTrackerIssueNo;
            await logHistory(db, { requestId: r.id, meetingId: id, actorEmail: req.verifiedEmail, action: it.kind === 'decision' ? 'ccb_decision' : 'ccb_ratification', fromStatus: r.status, toStatus: updated.status, details });
            return updated;
        });
        res.json({ success: true, request: out });
    } catch (err) {
        fail(res, err, 'Could not record the decision.');
    }
});

router.post('/meetings/:id/complete', async (req, res) => {
    const id = Number(req.params.id);
    try {
        requireRunner(req);
        await withTransaction(async (db) => {
            await lockMeeting(db, id, ['in_progress']);
            const open = await db.query('SELECT COUNT(*)::int AS n FROM ccb.meeting_items WHERE "meetingId" = $1 AND decision IS NULL', [id]);
            if (open.rows[0].n) throw new HttpError(409, `${open.rows[0].n} agenda item(s) still need a decision. Defer them if the board did not take them up.`);
            const minutes = req.body?.minutes !== undefined ? str(req.body.minutes, 50000) : null;
            await db.query(`UPDATE ccb.meetings SET status = 'completed', "completedAt" = now(), "updatedAt" = now()${minutes !== null ? ', minutes = $2' : ''} WHERE id = $1`, minutes !== null ? [id, minutes] : [id]);
            await logHistory(db, { meetingId: id, actorEmail: req.verifiedEmail, action: 'meeting_completed' });
        });
        res.json({ success: true });
    } catch (err) {
        fail(res, err, 'Could not close the meeting.');
    }
});

router.post('/meetings/:id/cancel', async (req, res) => {
    const id = Number(req.params.id);
    const note = str(req.body?.note);
    try {
        requireRunner(req);
        if (!note) throw new HttpError(400, 'Give the reason for cancelling.');
        await withTransaction(async (db) => {
            await lockMeeting(db, id, ['scheduled']);
            await db.query('DELETE FROM ccb.meeting_items WHERE "meetingId" = $1 AND decision IS NULL', [id]);
            await db.query(`UPDATE ccb.meetings SET status = 'cancelled', minutes = $2, "updatedAt" = now() WHERE id = $1`, [id, `Cancelled: ${note}`]);
            await logHistory(db, { meetingId: id, actorEmail: req.verifiedEmail, action: 'meeting_cancelled', details: { note } });
        });
        await syncTeams(id, 'cancel', req.verifiedEmail, note);
        res.json({ success: true });
    } catch (err) {
        fail(res, err, 'Could not cancel the meeting.');
    }
});

/* ---------- Board members' review of agenda items ---------- */

/** A board member's position on an undecided agenda item (advisory input for the meeting). Empty position = withdraw. */
router.put('/meetings/:id/items/:itemId/review', async (req, res) => {
    const id = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const position = String(req.body?.position || '');
    const note = str(req.body?.note, 2000);
    try {
        if (!has(req, ...BOARD_ROLES)) throw new HttpError(403, 'Only CCB members, the Secretary and the IT Application Head can record a review.');
        if (position && !REVIEW_POSITIONS.includes(position)) throw new HttpError(400, 'Choose support, concerns or oppose.');
        if (position && position !== 'support' && !note) throw new HttpError(400, 'Say briefly what the concern or objection is.');
        await withTransaction(async (db) => {
            await lockMeeting(db, id, ['scheduled', 'in_progress']);
            const item = (await db.query('SELECT * FROM ccb.meeting_items WHERE id = $1 AND "meetingId" = $2', [itemId, id])).rows[0];
            if (!item) throw new HttpError(404, 'Agenda item not found.');
            if (item.decision) throw new HttpError(409, 'This item has already been decided.');
            if (!position) {
                await db.query('DELETE FROM ccb.reviews WHERE "meetingItemId" = $1 AND email = $2', [itemId, req.verifiedEmail]);
            } else {
                await db.query(
                    `INSERT INTO ccb.reviews ("meetingItemId", email, position, note) VALUES ($1, $2, $3, $4)
                     ON CONFLICT ("meetingItemId", email) DO UPDATE SET position = EXCLUDED.position, note = EXCLUDED.note, "updatedAt" = now()`,
                    [itemId, req.verifiedEmail, position, note]);
            }
            await logHistory(db, { requestId: item.requestId, meetingId: id, actorEmail: req.verifiedEmail, action: position ? 'member_review' : 'member_review_withdrawn', details: position ? { position, note } : null });
        });
        res.json({ success: true });
    } catch (err) {
        fail(res, err, 'Could not save your review.');
    }
});

/* ---------- Action items ---------- */

const canManageActions = (req) => canRunMeetings(req);

router.get('/actions', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT a.*, r."crNo", r.title AS "requestTitle", m."meetingNo"
              FROM ccb.action_items a
              LEFT JOIN ccb.requests r ON r.id = a."requestId"
              LEFT JOIN ccb.meetings m ON m.id = a."meetingId"
             ORDER BY a.status = 'open' DESC, a."dueDate" NULLS LAST, a.id DESC`);
        const names = await namesFor(rows.flatMap((a) => [a.owner, a.createdBy, a.closedBy]));
        res.json({ success: true, actions: rows, names, canManage: canManageActions(req) });
    } catch (err) {
        fail(res, err, 'Could not load action items.');
    }
});

router.post('/actions', async (req, res) => {
    const b = req.body || {};
    const title = str(b.title, 500);
    const owner = str(b.owner, 200).toLowerCase();
    try {
        if (!canManageActions(req)) throw new HttpError(403, 'Only the CCB Secretary or IT Application Head can raise action items.');
        if (!title) throw new HttpError(400, 'Describe the action.');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner)) throw new HttpError(400, 'Choose who owns the action.');
        const due = b.dueDate ? String(b.dueDate).slice(0, 10) : null;
        if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new HttpError(400, 'Invalid due date.');
        const meetingId = b.meetingId ? Number(b.meetingId) : null;
        const requestId = b.requestId ? Number(b.requestId) : null;
        const action = await withTransaction(async (db) => {
            if (meetingId) await lockMeeting(db, meetingId, ['scheduled', 'in_progress', 'completed']);
            const { rows } = await db.query(
                `INSERT INTO ccb.action_items ("meetingId", "requestId", title, owner, "dueDate", "createdBy") VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [meetingId, requestId, title, owner, due, req.verifiedEmail]);
            await logHistory(db, { requestId, meetingId, actorEmail: req.verifiedEmail, action: 'action_raised', details: { id: rows[0].id, title, owner, dueDate: due } });
            return rows[0];
        });
        res.json({ success: true, action });
    } catch (err) {
        fail(res, err, 'Could not add the action item.');
    }
});

/** Close / reopen / reassign an action. The owner can close their own; the Secretary / IT Application Head can do anything. */
router.put('/actions/:id', async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body || {};
    try {
        const out = await withTransaction(async (db) => {
            const a = (await db.query('SELECT * FROM ccb.action_items WHERE id = $1 FOR UPDATE', [id])).rows[0];
            if (!a) throw new HttpError(404, 'Action item not found.');
            const manager = canManageActions(req);
            if (!manager && a.owner !== req.verifiedEmail) throw new HttpError(403, 'Only the owner or the CCB Secretary can update this action.');
            const patch = {};
            if (b.status !== undefined) {
                if (!ACTION_STATUSES.includes(b.status)) throw new HttpError(400, 'Invalid status.');
                if (b.status === 'dropped' && !manager) throw new HttpError(403, 'Only the CCB Secretary or IT Application Head can drop an action.');
                patch.status = b.status;
                patch.closeNote = str(b.closeNote, 2000);
                patch.closedBy = b.status === 'open' ? null : req.verifiedEmail;
                patch.closedAt = b.status === 'open' ? null : new Date();
            }
            if (manager) {
                if (b.title !== undefined && str(b.title, 500)) patch.title = str(b.title, 500);
                if (b.owner !== undefined && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(b.owner, 200))) patch.owner = str(b.owner, 200).toLowerCase();
                if (b.dueDate !== undefined) patch.dueDate = b.dueDate ? String(b.dueDate).slice(0, 10) : null;
            }
            const keys = Object.keys(patch);
            if (!keys.length) return a;
            const { rows } = await db.query(`UPDATE ccb.action_items SET ${keys.map((k, i) => `${q(k)} = $${i + 1}`).join(', ')} WHERE id = $${keys.length + 1} RETURNING *`, [...keys.map((k) => patch[k]), id]);
            await logHistory(db, { requestId: a.requestId, meetingId: a.meetingId, actorEmail: req.verifiedEmail, action: 'action_updated', details: { id, ...patch, closedAt: undefined } });
            return rows[0];
        });
        res.json({ success: true, action: out });
    } catch (err) {
        fail(res, err, 'Could not update the action item.');
    }
});

/* ---------- Insights ---------- */

/** Raw facts for the Insights page (the browser aggregates): request milestones and meeting outcomes. */
router.get('/insights', async (req, res) => {
    try {
        const [requests, meetings, actions] = await Promise.all([
            pool.query(`
                SELECT r.id, r."crNo", r.title, r.category, r."requestingFunction", r."sapModules", r."sapSystem", r.priority, r.status,
                       r."approvalRoute", r.decision, r."isEmergency", r."ratificationStatus", r."createdAt", r."submittedAt", r."reviewedAt",
                       r."decidedAt", r."closedAt", r."informDueBy", r."ccbInformedAt", i.status AS "devStatus", i."completedDate" AS "devCompletedDate"
                  FROM ccb.requests r LEFT JOIN dev_tracker.items i ON i.id = r."devTrackerItemId"`),
            pool.query(`
                SELECT m.id, m."meetingNo", m."scheduledAt", m.status, m."isEmergency",
                       COUNT(DISTINCT mi.id)::int AS items,
                       COUNT(DISTINCT mi.id) FILTER (WHERE mi.decision IS NOT NULL)::int AS decided,
                       COUNT(DISTINCT mi.id) FILTER (WHERE mi.decision IN ('approved', 'approved_with_modifications', 'ratified'))::int AS approved,
                       COUNT(DISTINCT mi.id) FILTER (WHERE mi.decision IN ('rejected', 'not_ratified'))::int AS rejected,
                       COUNT(DISTINCT mi.id) FILTER (WHERE mi.decision = 'deferred')::int AS deferred,
                       (SELECT COUNT(*)::int FROM ccb.attendance a WHERE a."meetingId" = m.id AND a.present
                           AND EXISTS (SELECT 1 FROM ccb.roles r WHERE r.email = a.email AND r.role = 'CCB Member')) AS "membersPresent"
                  FROM ccb.meetings m LEFT JOIN ccb.meeting_items mi ON mi."meetingId" = m.id
                 GROUP BY m.id ORDER BY m."scheduledAt"`),
            pool.query('SELECT status, "dueDate", "createdAt", "closedAt" FROM ccb.action_items'),
        ]);
        const members = (await pool.query(`SELECT COUNT(DISTINCT email)::int AS n FROM ccb.roles WHERE role = 'CCB Member'`)).rows[0].n;
        res.json({ success: true, insights: { requests: requests.rows, meetings: meetings.rows, actions: actions.rows, members, settings: await getSettings(), categories: CATEGORIES } });
    } catch (err) {
        fail(res, err, 'Could not load insights.');
    }
});

/* ---------- Overview ---------- */

router.get('/overview', async (req, res) => {
    try {
        const settings = await getSettings();
        const [requests, meetings, recent] = await Promise.all([
            pool.query(REQUEST_LIST_SQL),
            pool.query(`SELECT m.*, (SELECT COUNT(*)::int FROM ccb.meeting_items mi WHERE mi."meetingId" = m.id) AS "itemCount"
                          FROM ccb.meetings m WHERE m.status IN ${OPEN_MEETING} ORDER BY m."scheduledAt" LIMIT 3`),
            pool.query(`SELECT h.*, r."crNo", r.title FROM ccb.history h JOIN ccb.requests r ON r.id = h."requestId"
                         WHERE h.action IN ('ccb_decision', 'ccb_ratification', 'approve_out_of_scope', 'approve_emergency', 'reject', 'recommend', 'submit', 'terminate')
                         ORDER BY h."occurredAt" DESC LIMIT 12`),
        ]);
        const pending = await pendingAgenda(pool);
        const names = await namesFor([...requests.rows.flatMap((r) => [r.loggedBy, r.decidedBy]), ...recent.rows.map((h) => h.actorEmail)]);
        const openActions = (await pool.query(`SELECT a.id, a.title, a.owner, a."dueDate", r."crNo" FROM ccb.action_items a LEFT JOIN ccb.requests r ON r.id = a."requestId" WHERE a.status = 'open' ORDER BY a."dueDate" NULLS LAST, a.id LIMIT 50`)).rows;
        Object.assign(names, await namesFor(openActions.map((a) => a.owner)));
        res.json({ success: true, overview: { requests: requests.rows, upcoming: meetings.rows, recent: recent.rows, pendingAgenda: pending.length, settings, names, openActions } });
    } catch (err) {
        fail(res, err, 'Could not load the CCB overview.');
    }
});

/* ---------- Admin Center (hub Manage Access) ---------- */

/**
 * CCB roles, controlled from the Emami Apps Admin Center. Mounted by server.js on the hub API with its own
 * requireAccessManager (Super Admin / Admin), like appStages.js:
 *
 *   GET /access/users/:email/ccb-roles   -> { roles: [...held], available: ROLES, hasAccess }
 *   PUT /access/users/:email/ccb-roles   { roles: [...] }  sets exactly these roles
 *
 * ccb.roles stays the one store every CCB rule reads. Each change is written to ccb.history (role_assigned /
 * role_removed, via 'admin-center') and to the Admin Center's change history (APP_ROLE on dev-tracker).
 */
function ccbRolesAdminRouter(requireAccessManager) {
    const admin = express.Router();
    const emailOf = (req) => String(req.params.email || '').trim().toLowerCase();

    admin.get('/access/users/:email/ccb-roles', requireAccessManager, async (req, res) => {
        const email = emailOf(req);
        try {
            await ready;
            const [roles, access] = await Promise.all([
                pool.query('SELECT role FROM ccb.roles WHERE email = $1 ORDER BY array_position($2::text[], role)', [email, ROLES]),
                pool.query('SELECT 1 FROM emami_apps.authorized_user_apps WHERE email = $1 AND app_id = $2', [email, HOST_APP_ID]),
            ]);
            res.json({ success: true, roles: roles.rows.map((r) => r.role), available: ROLES, hasAccess: access.rows.length > 0 });
        } catch (err) {
            fail(res, err, 'Could not load CCB roles.');
        }
    });

    admin.put('/access/users/:email/ccb-roles', requireAccessManager, async (req, res) => {
        const email = emailOf(req);
        const wanted = Array.isArray(req.body?.roles) ? [...new Set(req.body.roles)] : null;
        if (!wanted || wanted.some((r) => !ROLES.includes(r))) return res.status(400).json({ success: false, error: `Roles must be from: ${ROLES.join(', ')}.` });
        try {
            await ready;
            const out = await withTransaction(async (db) => {
                if (wanted.length) {
                    const access = await db.query('SELECT 1 FROM emami_apps.authorized_user_apps WHERE email = $1 AND app_id = $2', [email, HOST_APP_ID]);
                    if (!access.rows.length) throw new HttpError(400, 'Grant SAP Change & Development access first, then assign CCB roles.');
                }
                const before = (await db.query('SELECT role FROM ccb.roles WHERE email = $1 FOR UPDATE', [email])).rows.map((r) => r.role);
                const add = wanted.filter((r) => !before.includes(r));
                const remove = before.filter((r) => !wanted.includes(r));
                for (const role of add) {
                    await db.query('INSERT INTO ccb.roles (email, role, "assignedBy") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [email, role, req.verifiedEmail]);
                    await logHistory(db, { actorEmail: req.verifiedEmail, action: 'role_assigned', details: { email, role, via: 'admin-center' } });
                }
                for (const role of remove) {
                    await db.query('DELETE FROM ccb.roles WHERE email = $1 AND role = $2', [email, role]);
                    await logHistory(db, { actorEmail: req.verifiedEmail, action: 'role_removed', details: { email, role, via: 'admin-center' } });
                }
                return { before, add, remove };
            });
            if (out.add.length || out.remove.length) {
                const label = (list) => (list.length ? `CCB: ${[...list].sort((a, b) => ROLES.indexOf(a) - ROLES.indexOf(b)).join(', ')}` : 'CCB: none');
                recordAccessChange({ targetEmail: email, changedBy: req.verifiedEmail, changeType: 'APP_ROLE', appId: HOST_APP_ID, oldValue: label(out.before), newValue: label(wanted) });
            }
            res.json({ success: true, roles: wanted.sort((a, b) => ROLES.indexOf(a) - ROLES.indexOf(b)), added: out.add, removed: out.remove });
        } catch (err) {
            fail(res, err, 'Could not save CCB roles.');
        }
    });
    return admin;
}

module.exports = router;
module.exports.CATEGORIES = CATEGORIES;
module.exports.ccbRolesAdminRouter = ccbRolesAdminRouter;
