const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const { JWT_SECRET } = require('./sessionAuth');

/*
   IT CHANGE CONTROL BOARD (embedded-apps/change-control) — raise, assess, CAB-approve, implement
   and close IT changes. Own change_control schema, own routes under /change-control, self-contained
   here like devTracker.js.

   Who may do what comes from the caller's role on the 'change-control' grant in the hub's Manage
   Access screen (emami_apps.authorized_user_apps.role — see server.js's VALID_ROLES_BY_APP):
     User            Requester: raise, submit, cancel and implement their own changes
     Change Manager  assess risk, forward to CAB, return/reject, close after post-implementation review
     CAB Member      vote while a change is in CAB review
     CAB Chair       vote, final CAB approve/reject, emergency (ECAB) approval, close
     Admin           everything a CAB Chair can, plus any implementation step
   Segregation of duties: nobody reviews, votes on, approves or closes a change they raised.
   Every action is written to change_control.history, which the app only ever inserts into.
*/

const APP_ID = 'change-control';
const router = express.Router();

// Same verification as devTracker.js: identity is the email inside the hub session JWT, never a
// header the request claims.
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

const CHANGE_TYPES = ['standard', 'normal', 'emergency'];
const CATEGORIES = ['infrastructure', 'application', 'sap', 'network', 'security', 'database', 'end_user'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['draft', 'submitted', 'cab_review', 'approved', 'rejected', 'implementing', 'implemented', 'closed', 'cancelled'];
const OUTCOMES = ['successful', 'partial', 'failed', 'rolled_back'];
const VOTES = ['approve', 'reject', 'abstain'];
const sqlList = (arr) => arr.map((v) => `'${v}'`).join(', ');

/** Risk = impact x likelihood on a 3x3 matrix (each 1-3). */
function riskFromScore(impact, likelihood) {
    const score = impact * likelihood;
    if (score <= 2) return 'low';
    if (score <= 4) return 'medium';
    return 'high';
}

async function initSchema() {
    await pool.query('CREATE SCHEMA IF NOT EXISTS change_control');
    // Human-readable change numbers (CR-2026-0001) — assigned by the database on insert, never
    // client-writable, same idea as dev_tracker.issue_no_seq.
    await pool.query('CREATE SEQUENCE IF NOT EXISTS change_control.cr_no_seq START 1');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS change_control.changes (
            id serial PRIMARY KEY,
            "crNo" text NOT NULL UNIQUE,
            title text NOT NULL,
            description text NOT NULL,
            justification text NOT NULL,
            "changeType" text NOT NULL CHECK ("changeType" IN (${sqlList(CHANGE_TYPES)})),
            category text NOT NULL CHECK (category IN (${sqlList(CATEGORIES)})),
            priority text NOT NULL CHECK (priority IN (${sqlList(PRIORITIES)})),
            impact int NOT NULL CHECK (impact BETWEEN 1 AND 3),
            likelihood int NOT NULL CHECK (likelihood BETWEEN 1 AND 3),
            "riskLevel" text NOT NULL CHECK ("riskLevel" IN ('low', 'medium', 'high')),
            "affectedSystems" text NOT NULL,
            "affectedLocations" text NOT NULL DEFAULT '',
            "implementationPlan" text NOT NULL,
            "rollbackPlan" text NOT NULL,
            "testPlan" text NOT NULL DEFAULT '',
            "downtimeMinutes" int NOT NULL DEFAULT 0,
            "plannedStart" timestamptz NOT NULL,
            "plannedEnd" timestamptz NOT NULL,
            "actualStart" timestamptz,
            "actualEnd" timestamptz,
            status text NOT NULL DEFAULT 'draft' CHECK (status IN (${sqlList(STATUSES)})),
            outcome text CHECK (outcome IN (${sqlList(OUTCOMES)})),
            "reviewNotes" text,
            "closureNotes" text,
            "requesterEmail" text NOT NULL,
            "implementerEmail" text,
            "submittedAt" timestamptz,
            "decidedAt" timestamptz,
            "closedAt" timestamptz,
            "createdAt" timestamptz NOT NULL DEFAULT now(),
            "updatedAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS changes_status_idx ON change_control.changes (status)');
    await pool.query('CREATE INDEX IF NOT EXISTS changes_requester_idx ON change_control.changes ("requesterEmail")');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS change_control.votes (
            id serial PRIMARY KEY,
            "changeId" int NOT NULL REFERENCES change_control.changes(id) ON DELETE CASCADE,
            "voterEmail" text NOT NULL,
            decision text NOT NULL CHECK (decision IN (${sqlList(VOTES)})),
            comment text NOT NULL DEFAULT '',
            "votedAt" timestamptz NOT NULL DEFAULT now(),
            UNIQUE ("changeId", "voterEmail")
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS change_control.comments (
            id serial PRIMARY KEY,
            "changeId" int NOT NULL REFERENCES change_control.changes(id) ON DELETE CASCADE,
            "authorEmail" text NOT NULL,
            body text NOT NULL,
            "createdAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    // Append-only audit trail: no route updates or deletes rows here.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS change_control.history (
            id serial PRIMARY KEY,
            "changeId" int REFERENCES change_control.changes(id) ON DELETE SET NULL,
            "actorEmail" text NOT NULL,
            "actorRole" text,
            action text NOT NULL,
            "fromStatus" text,
            "toStatus" text,
            details jsonb,
            "occurredAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS history_change_idx ON change_control.history ("changeId")');
    // Link to the Development Tracker assignment auto-created when CAB approves the change.
    await pool.query('ALTER TABLE change_control.changes ADD COLUMN IF NOT EXISTS "devTrackerItemId" text');
    await pool.query('ALTER TABLE change_control.changes ADD COLUMN IF NOT EXISTS "devTrackerIssueNo" int');
}

// Awaited inside every handler (appStages.js's pattern) so the first request after a cold start
// never races table creation.
const ready = initSchema().catch((err) => {
    console.error('[change-control] Schema init failed:', err);
    throw err;
});
ready.catch(() => {});

/* ---------- Access ---------- */

async function requireAccess(req, res, next) {
    const email = verifiedHubEmail(req);
    if (!email) return res.status(401).json({ success: false, error: 'Your Emami Apps session has expired or is missing. Please sign in again.' });
    try {
        await ready;
        const { rows } = await pool.query(
            `SELECT role FROM emami_apps.authorized_user_apps WHERE email = $1 AND app_id = $2`,
            [email, APP_ID]
        );
        if (rows.length === 0) return res.status(403).json({ success: false, error: 'You do not have access to the Change Control Board. Ask an admin to grant it in Manage Access.' });
        req.verifiedEmail = email;
        req.ccbRole = rows[0].role || 'User';
        next();
    } catch (err) {
        console.error('[change-control]', err);
        res.status(500).json({ success: false, error: 'Could not verify your access.' });
    }
}

router.use(requireAccess);

const isOwner = (c, email) => c.requesterEmail === email;
const isImplementer = (c, email) => (c.implementerEmail || c.requesterEmail) === email;
const hasRole = (role, ...roles) => role === 'Admin' || roles.includes(role);

/** The workflow actions this caller may take on this change right now. */
function availableActions(c, email, role) {
    const out = [];
    const notOwner = !isOwner(c, email);
    switch (c.status) {
        case 'draft':
            if (isOwner(c, email)) out.push('submit', 'cancel');
            break;
        case 'submitted':
            if (notOwner && hasRole(role, 'Change Manager', 'CAB Chair')) out.push('forward_to_cab', 'return_to_draft', 'reject');
            if (notOwner && c.changeType === 'emergency' && hasRole(role, 'CAB Chair')) out.push('emergency_approve');
            if (isOwner(c, email)) out.push('cancel');
            break;
        case 'cab_review':
            if (notOwner && hasRole(role, 'CAB Chair')) out.push('approve', 'reject');
            break;
        case 'approved':
            if (isImplementer(c, email) || role === 'Admin') out.push('start_implementation', 'cancel');
            break;
        case 'implementing':
            if (isImplementer(c, email) || role === 'Admin') out.push('complete');
            break;
        case 'implemented':
            if (notOwner && hasRole(role, 'Change Manager', 'CAB Chair')) out.push('close');
            break;
    }
    return out;
}

const canVote = (c, email, role) => c.status === 'cab_review' && !isOwner(c, email) && ['CAB Member', 'CAB Chair', 'Admin'].includes(role);

function nextStatus(action, c) {
    return {
        submit: c.changeType === 'standard' ? 'approved' : 'submitted', // Standard changes are pre-approved.
        cancel: 'cancelled',
        return_to_draft: 'draft',
        forward_to_cab: 'cab_review',
        reject: 'rejected',
        emergency_approve: 'approved',
        approve: 'approved',
        start_implementation: 'implementing',
        complete: 'implemented',
        close: 'closed',
    }[action];
}

const NOTE_REQUIRED = ['reject', 'return_to_draft', 'cancel', 'emergency_approve', 'close'];

async function logHistory(db, entry) {
    await db.query(
        `INSERT INTO change_control.history ("changeId", "actorEmail", "actorRole", action, "fromStatus", "toStatus", details)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [entry.changeId ?? null, entry.actorEmail, entry.actorRole ?? null, entry.action, entry.fromStatus ?? null, entry.toStatus ?? null, entry.details ? JSON.stringify(entry.details) : null]
    );
}

/** Display names for a set of emails, from the hub's own emami_apps.users (best effort). */
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

/* ---------- Development Tracker hand-off ---------- */

const DEV_PRIORITY = { critical: 'P1', high: 'P1', medium: 'P2', low: 'P3' };
const DEV_LEVEL = { 1: 'Low', 2: 'Medium', 3: 'High' };
const istDate = (d) => (d ? new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : null);

/**
 * Once a change is approved (by CAB, ECAB, or pre-approved as Standard), the work lands in the Development Tracker as a
 * 'Not Started' assignment, written straight into dev_tracker.items inside the approval's own
 * transaction — so an approved change never exists without its assignment, and vice versa.
 * Columns mirror devTracker.js's POST /items (developer/spoc fields are display names there).
 */
async function createDevTrackerAssignment(db, c, approverEmail) {
    const names = await namesFor([c.requesterEmail, c.implementerEmail, approverEmail]);
    const nameOf = (e) => (e ? names[e] || e : null);
    const implementer = nameOf(c.implementerEmail || c.requesterEmail);
    const approver = nameOf(approverEmail);
    const description = [
        c.description,
        `Business justification:\n${c.justification}`,
        `Affected systems: ${c.affectedSystems}${c.affectedLocations ? ` (${c.affectedLocations})` : ''}`,
        `Implementation plan:\n${c.implementationPlan}`,
        `Rollback plan:\n${c.rollbackPlan}`,
        c.testPlan && `Test plan:\n${c.testPlan}`,
    ].filter(Boolean).join('\n\n');
    const row = {
        devList: `${c.crNo}: ${c.title}`,
        status: 'Not Started',
        issueType: 'Task',
        priority: DEV_PRIORITY[c.priority] || null,
        impact: DEV_LEVEL[c.impact] || null,
        description,
        developer: implementer,
        spocIT: implementer,
        spocFunction: nameOf(c.requesterEmail),
        reporter: approver,
        startDate: istDate(c.plannedStart),
        targetDate: istDate(c.plannedEnd),
        labels: `CAB, ${c.crNo}`,
        remarks: c.changeType === 'standard'
            ? `Auto-created from ${c.crNo} (pre-approved Standard change, raised by ${approver}).`
            : `Auto-created from ${c.crNo} on CAB approval by ${approver}.`,
        rank: Date.now(),
    };
    const keys = Object.keys(row);
    const { rows } = await db.query(
        `INSERT INTO dev_tracker.items (id, ${keys.map(q).join(', ')}) VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')})
         RETURNING id, "issueNo"`,
        [crypto.randomUUID(), ...keys.map((k) => row[k])]
    );
    // Same "__created__" sentinel devTracker.js writes, so the tracker's activity feed shows it.
    await db.query(
        `INSERT INTO dev_tracker.item_history ("itemId", field, "oldValue", "newValue", "changedByUsername") VALUES ($1, '__created__', NULL, $2, $3)`,
        [rows[0].id, row.devList, approver]
    );
    return rows[0];
}

/** Creates the change's assignment if it has none yet; returns the updated change row. */
async function linkDevTrackerAssignment(db, change, actorEmail) {
    if (change.status !== 'approved' || change.devTrackerItemId) return change;
    const item = await createDevTrackerAssignment(db, change, actorEmail);
    const { rows } = await db.query(
        'UPDATE change_control.changes SET "devTrackerItemId" = $1, "devTrackerIssueNo" = $2 WHERE id = $3 RETURNING *',
        [item.id, item.issueNo, change.id]
    );
    return rows[0];
}

function fail(res, err, message) {
    console.error('[change-control]', err);
    res.status(500).json({ success: false, error: message });
}

/* ---------- Routes ---------- */

router.get('/me', async (req, res) => {
    const names = await namesFor([req.verifiedEmail]);
    res.json({ success: true, me: { email: req.verifiedEmail, name: names[req.verifiedEmail] || null, role: req.ccbRole } });
});

// Everyone granted this app — the implementer picker on the raise form.
router.get('/people', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT a.email, a.role, u.name
               FROM emami_apps.authorized_user_apps a
               JOIN emami_apps.authorized_users au ON au.email = a.email AND au.is_active
               LEFT JOIN emami_apps.users u ON u.email = a.email
              WHERE a.app_id = $1
              ORDER BY coalesce(u.name, a.email)`,
            [APP_ID]
        );
        res.json({ success: true, people: rows });
    } catch (err) {
        fail(res, err, 'Could not load people.');
    }
});

router.get('/dashboard', async (req, res) => {
    const email = req.verifiedEmail;
    const role = req.ccbRole;
    try {
        const [counts, stats, mine, upcoming] = await Promise.all([
            pool.query('SELECT status, count(*)::int AS n FROM change_control.changes GROUP BY status'),
            pool.query(`
                SELECT round(avg(extract(epoch FROM ("decidedAt" - "submittedAt")) / 3600) FILTER (WHERE "changeType" <> 'standard' AND "decidedAt" IS NOT NULL)::numeric, 1)::float AS "avgDecisionHours",
                       round(100.0 * count(*) FILTER (WHERE outcome = 'successful') / nullif(count(outcome), 0))::int AS "successRate"
                  FROM change_control.changes`),
            pool.query(
                `SELECT * FROM change_control.changes
                  WHERE "requesterEmail" = $1 AND status IN ('draft', 'submitted', 'cab_review', 'approved', 'implementing')
                  ORDER BY "updatedAt" DESC LIMIT 8`,
                [email]
            ),
            pool.query(`
                SELECT * FROM change_control.changes
                 WHERE status IN ('cab_review', 'approved', 'implementing') AND "plannedEnd" >= now()
                 ORDER BY "plannedStart" LIMIT 8`),
        ]);

        // Work waiting on this caller, by role (owner's own changes excluded — segregation of duties).
        const queueStatuses = {
            'Change Manager': ['submitted', 'implemented'],
            'CAB Member': ['cab_review'],
            'CAB Chair': ['submitted', 'cab_review', 'implemented'],
            Admin: ['submitted', 'cab_review', 'implemented'],
        }[role];
        let queue = [];
        if (queueStatuses) {
            const { rows } = await pool.query(
                `SELECT * FROM change_control.changes
                  WHERE status = ANY($1) AND "requesterEmail" <> $2
                  ORDER BY array_position(ARRAY['critical','high','medium','low'], priority), "plannedStart" LIMIT 10`,
                [queueStatuses, email]
            );
            // A CAB Member's queue is only what they haven't voted on yet.
            if (role === 'CAB Member' && rows.length) {
                const voted = await pool.query('SELECT "changeId" FROM change_control.votes WHERE "voterEmail" = $1 AND "changeId" = ANY($2)', [email, rows.map((r) => r.id)]);
                const done = new Set(voted.rows.map((v) => v.changeId));
                queue = rows.filter((r) => !done.has(r.id));
            } else {
                queue = rows;
            }
        }

        res.json({
            success: true,
            dashboard: {
                counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.n])),
                avgDecisionHours: stats.rows[0].avgDecisionHours,
                successRate: stats.rows[0].successRate,
                queue: queueStatuses ? queue : null,
                mine: mine.rows,
                upcoming: upcoming.rows,
            },
        });
    } catch (err) {
        fail(res, err, 'Could not load the dashboard.');
    }
});

router.get('/changes', async (req, res) => {
    const where = [];
    const params = [];
    const add = (sql, val) => {
        params.push(val);
        where.push(sql.replace('?', `$${params.length}`));
    };
    const { status, type, category, q: search, mine } = req.query;
    if (STATUSES.includes(status)) add('status = ?', status);
    if (CHANGE_TYPES.includes(type)) add('"changeType" = ?', type);
    if (CATEGORIES.includes(category)) add('category = ?', category);
    if (mine === '1') add('"requesterEmail" = ?', req.verifiedEmail);
    if (search && String(search).trim()) {
        params.push(`%${String(search).trim()}%`);
        const p = `$${params.length}`;
        where.push(`(title ILIKE ${p} OR "crNo" ILIKE ${p} OR "affectedSystems" ILIKE ${p})`);
    }
    try {
        const { rows } = await pool.query(
            `SELECT * FROM change_control.changes ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY "createdAt" DESC LIMIT 500`,
            params
        );
        const names = await namesFor(rows.map((r) => r.requesterEmail));
        res.json({ success: true, changes: rows, names });
    } catch (err) {
        fail(res, err, 'Could not load change requests.');
    }
});

router.get('/changes/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, error: 'Invalid change id.' });
    try {
        const { rows } = await pool.query('SELECT * FROM change_control.changes WHERE id = $1', [id]);
        const change = rows[0];
        if (!change) return res.status(404).json({ success: false, error: 'Change request not found.' });
        const [votes, comments, history] = await Promise.all([
            pool.query('SELECT * FROM change_control.votes WHERE "changeId" = $1 ORDER BY "votedAt"', [id]),
            pool.query('SELECT * FROM change_control.comments WHERE "changeId" = $1 ORDER BY "createdAt"', [id]),
            pool.query('SELECT * FROM change_control.history WHERE "changeId" = $1 ORDER BY "occurredAt" DESC, id DESC', [id]),
        ]);
        const names = await namesFor([
            change.requesterEmail, change.implementerEmail,
            ...votes.rows.map((v) => v.voterEmail), ...comments.rows.map((c) => c.authorEmail), ...history.rows.map((h) => h.actorEmail),
        ]);
        res.json({
            success: true,
            detail: {
                change,
                votes: votes.rows,
                comments: comments.rows,
                history: history.rows,
                names,
                actions: availableActions(change, req.verifiedEmail, req.ccbRole),
                canVote: canVote(change, req.verifiedEmail, req.ccbRole),
            },
        });
    } catch (err) {
        fail(res, err, 'Could not load the change request.');
    }
});

const str = (v) => (typeof v === 'string' ? v.trim() : '');

router.post('/changes', async (req, res) => {
    const b = req.body || {};
    const c = {
        title: str(b.title),
        description: str(b.description),
        justification: str(b.justification),
        changeType: b.changeType,
        category: b.category,
        priority: b.priority,
        impact: Number(b.impact),
        likelihood: Number(b.likelihood),
        affectedSystems: str(b.affectedSystems),
        affectedLocations: str(b.affectedLocations),
        implementationPlan: str(b.implementationPlan),
        rollbackPlan: str(b.rollbackPlan),
        testPlan: str(b.testPlan),
        downtimeMinutes: Math.max(0, Math.round(Number(b.downtimeMinutes) || 0)),
        plannedStart: new Date(b.plannedStart),
        plannedEnd: new Date(b.plannedEnd),
        implementerEmail: str(b.implementerEmail).toLowerCase() || null,
    };
    const problem =
        (c.title.length < 5 && 'Title must be at least 5 characters.') ||
        (!c.description && 'Describe the change.') ||
        (!c.justification && 'Business justification is required.') ||
        (!CHANGE_TYPES.includes(c.changeType) && 'Choose a change type.') ||
        (!CATEGORIES.includes(c.category) && 'Choose a category.') ||
        (!PRIORITIES.includes(c.priority) && 'Choose a priority.') ||
        (![1, 2, 3].includes(c.impact) || ![1, 2, 3].includes(c.likelihood) ? 'Choose impact and likelihood.' : '') ||
        (!c.affectedSystems && 'List the affected systems.') ||
        (!c.implementationPlan && 'Implementation plan is required.') ||
        (!c.rollbackPlan && 'Rollback plan is required.') ||
        (isNaN(c.plannedStart) || isNaN(c.plannedEnd) ? 'Planned start and end are required.' : '') ||
        (c.plannedEnd <= c.plannedStart && 'Planned end must be after planned start.');
    if (problem) return res.status(400).json({ success: false, error: problem });

    const riskLevel = riskFromScore(c.impact, c.likelihood);
    const submitNow = b.intent === 'submit';
    if (submitNow && c.changeType === 'standard' && riskLevel === 'high') {
        return res.status(400).json({ success: false, error: 'A high-risk change cannot be raised as Standard. Use Normal or Emergency.' });
    }
    const status = submitNow ? (c.changeType === 'standard' ? 'approved' : 'submitted') : 'draft';
    const now = new Date();
    const cols = { ...c, riskLevel, status, requesterEmail: req.verifiedEmail, submittedAt: submitNow ? now : null, decidedAt: status === 'approved' ? now : null };
    const keys = Object.keys(cols);

    try {
        const created = await withTransaction(async (db) => {
            const { rows } = await db.query(
                `INSERT INTO change_control.changes ("crNo", ${keys.map(q).join(', ')})
                 VALUES ('CR-' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY') || '-' || lpad(nextval('change_control.cr_no_seq')::text, 4, '0'),
                         ${keys.map((_, i) => `$${i + 1}`).join(', ')})
                 RETURNING *`,
                keys.map((k) => cols[k])
            );
            const change = await linkDevTrackerAssignment(db, rows[0], req.verifiedEmail);
            await logHistory(db, { changeId: change.id, actorEmail: req.verifiedEmail, actorRole: req.ccbRole, action: 'created', toStatus: status, details: change.devTrackerIssueNo != null ? { devTrackerIssueNo: change.devTrackerIssueNo } : null });
            return change;
        });
        res.json({ success: true, change: created });
    } catch (err) {
        fail(res, err, 'Could not save the change request.');
    }
});

router.post('/changes/:id/transition', async (req, res) => {
    const id = Number(req.params.id);
    const { action } = req.body || {};
    const note = str(req.body?.note);
    try {
        const { rows } = await pool.query('SELECT * FROM change_control.changes WHERE id = $1', [id]);
        const c = rows[0];
        if (!c) return res.status(404).json({ success: false, error: 'Change request not found.' });
        if (!availableActions(c, req.verifiedEmail, req.ccbRole).includes(action)) {
            return res.status(403).json({ success: false, error: 'You are not allowed to perform this action at this stage.' });
        }
        if (NOTE_REQUIRED.includes(action) && !note) return res.status(400).json({ success: false, error: 'Please add a comment for this action.' });

        const to = nextStatus(action, c);
        const now = new Date();
        const patch = { status: to, updatedAt: now };
        const details = {};
        if (action === 'submit') {
            patch.submittedAt = now;
            if (to === 'approved') patch.decidedAt = now;
        } else if (action === 'forward_to_cab') {
            const impact = Number(req.body.impact ?? c.impact);
            const likelihood = Number(req.body.likelihood ?? c.likelihood);
            if (![1, 2, 3].includes(impact) || ![1, 2, 3].includes(likelihood)) return res.status(400).json({ success: false, error: 'Invalid risk assessment.' });
            Object.assign(patch, { impact, likelihood, riskLevel: riskFromScore(impact, likelihood), reviewNotes: note || null });
            details.risk = patch.riskLevel;
        } else if (['approve', 'emergency_approve', 'reject'].includes(action)) {
            patch.decidedAt = now;
        } else if (action === 'start_implementation') {
            patch.actualStart = now;
        } else if (action === 'complete') {
            if (!OUTCOMES.includes(req.body.outcome)) return res.status(400).json({ success: false, error: 'Select an outcome.' });
            patch.outcome = req.body.outcome;
            patch.actualEnd = now;
            details.outcome = patch.outcome;
        } else if (action === 'close') {
            patch.closedAt = now;
            patch.closureNotes = note;
        }
        if (note) details.note = note;

        const keys = Object.keys(patch);
        const result = await withTransaction(async (db) => {
            // Only moves if nobody changed the status since this caller loaded it.
            const upd = await db.query(
                `UPDATE change_control.changes SET ${keys.map((k, i) => `${q(k)} = $${i + 1}`).join(', ')}
                  WHERE id = $${keys.length + 1} AND status = $${keys.length + 2} RETURNING *`,
                [...keys.map((k) => patch[k]), id, c.status]
            );
            if (!upd.rows.length) return null;
            if (to === 'approved') {
                upd.rows[0] = await linkDevTrackerAssignment(db, upd.rows[0], req.verifiedEmail);
                if (upd.rows[0].devTrackerIssueNo != null) details.devTrackerIssueNo = upd.rows[0].devTrackerIssueNo;
            }
            if (note) await db.query('INSERT INTO change_control.comments ("changeId", "authorEmail", body) VALUES ($1, $2, $3)', [id, req.verifiedEmail, note]);
            await logHistory(db, { changeId: id, actorEmail: req.verifiedEmail, actorRole: req.ccbRole, action, fromStatus: c.status, toStatus: to, details });
            return upd.rows[0];
        });
        if (!result) return res.status(409).json({ success: false, error: 'Someone else updated this change just now. Refresh and try again.' });
        res.json({ success: true, change: result });
    } catch (err) {
        fail(res, err, 'Could not update the change request.');
    }
});

router.post('/changes/:id/votes', async (req, res) => {
    const id = Number(req.params.id);
    const decision = req.body?.decision;
    const comment = str(req.body?.comment);
    if (!VOTES.includes(decision)) return res.status(400).json({ success: false, error: 'Choose approve, reject or abstain.' });
    if (decision === 'reject' && !comment) return res.status(400).json({ success: false, error: 'Please explain a reject vote.' });
    try {
        const { rows } = await pool.query('SELECT * FROM change_control.changes WHERE id = $1', [id]);
        if (!rows[0] || !canVote(rows[0], req.verifiedEmail, req.ccbRole)) {
            return res.status(403).json({ success: false, error: 'Voting is not open to you for this change.' });
        }
        await withTransaction(async (db) => {
            await db.query(
                `INSERT INTO change_control.votes ("changeId", "voterEmail", decision, comment) VALUES ($1, $2, $3, $4)
                 ON CONFLICT ("changeId", "voterEmail") DO UPDATE SET decision = EXCLUDED.decision, comment = EXCLUDED.comment, "votedAt" = now()`,
                [id, req.verifiedEmail, decision, comment]
            );
            await logHistory(db, { changeId: id, actorEmail: req.verifiedEmail, actorRole: req.ccbRole, action: 'vote', details: { decision, comment: comment || undefined } });
        });
        res.json({ success: true });
    } catch (err) {
        fail(res, err, 'Could not record your vote.');
    }
});

router.post('/changes/:id/comments', async (req, res) => {
    const id = Number(req.params.id);
    const body = str(req.body?.body);
    if (!body) return res.status(400).json({ success: false, error: 'Comment cannot be empty.' });
    try {
        await withTransaction(async (db) => {
            const ins = await db.query(
                `INSERT INTO change_control.comments ("changeId", "authorEmail", body)
                 SELECT id, $2, $3 FROM change_control.changes WHERE id = $1 RETURNING id`,
                [id, req.verifiedEmail, body]
            );
            if (!ins.rows.length) throw Object.assign(new Error('not found'), { status: 404 });
            await logHistory(db, { changeId: id, actorEmail: req.verifiedEmail, actorRole: req.ccbRole, action: 'comment' });
        });
        res.json({ success: true });
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ success: false, error: 'Change request not found.' });
        fail(res, err, 'Could not post the comment.');
    }
});

// Board-wide audit trail — governance roles only.
router.get('/history', async (req, res) => {
    if (!hasRole(req.ccbRole, 'Change Manager', 'CAB Chair')) return res.status(403).json({ success: false, error: 'Only Change Managers, CAB Chairs and Admins can see the full audit trail.' });
    try {
        const { rows } = await pool.query(
            `SELECT h.*, c."crNo", c.title FROM change_control.history h
               LEFT JOIN change_control.changes c ON c.id = h."changeId"
              ORDER BY h."occurredAt" DESC, h.id DESC LIMIT 500`
        );
        const names = await namesFor(rows.map((r) => r.actorEmail));
        res.json({ success: true, history: rows, names });
    } catch (err) {
        fail(res, err, 'Could not load the audit trail.');
    }
});

module.exports = router;
