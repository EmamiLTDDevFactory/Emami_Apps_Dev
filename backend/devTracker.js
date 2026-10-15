const express = require('express');
const crypto = require('crypto');
const { pool } = require('./db');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./sessionAuth');

// Who is calling: the email inside the caller's Emami Apps session token (the JWT the hub stores
// at sign-in, sent as "Authorization: Bearer <token>"), verified against HUB_AUTH_JWT_SECRET.
// This replaces trusting the X-User-Email header, which anyone could set to anyone's email to
// read, edit or delete every item. Returns '' when there's no valid token.
function verifiedHubEmail(req) {
    const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    if (!match || !JWT_SECRET) return '';
    try {
        return String(jwt.verify(match[1].trim(), JWT_SECRET)?.email || '').trim().toLowerCase();
    } catch {
        return '';
    }
}

const router = express.Router();

const FIELDS = [
    'devList', 'status', 'area', 'func', 'impact', 'complexity', 'priority',
    'spocFunction', 'spocIT', 'devFactory', 'startDate', 'reqDiscussion', 'fsPrep',
    'development', 'itTesting', 'userTesting', 'hypercare',
    'hypercareDate', 'onHoldDate', 'completedDate', 'cancelledDate',
    'targetDate', 'devTime', 'rework', 'reasonCategory', 'reasonDelay', 'remarks', 'developer'
];

// Jira-style project-management fields, added after the original 28. Kept in their own list so
// the Import Center keeps validating/inserting exactly the original columns, while item create/
// update accept both. issueNo is not here: it is assigned by the database (DEFAULT nextval) and
// is never client-writable, so a key like DEV-42 can't be forged or collide.
const PM_FIELDS = ['issueType', 'description', 'storyPoints', 'epicId', 'sprintId', 'parentId', 'labels', 'reporter', 'rank'];
const ALL_FIELDS = [...FIELDS, ...PM_FIELDS];
const ISSUE_TYPES = ['Epic', 'Story', 'Task', 'Bug', 'Sub-task'];
const DONE_STATUSES = ['Completed', 'Cancelled'];

// Column names are camelCase to match the JSON the frontend already sends —
// Postgres folds unquoted identifiers to lowercase, so every reference to
// these columns must be double-quoted to preserve the exact case.
const q = (col) => `"${col}"`;

function normalize(body, fields = FIELDS) {
    const row = {};
    fields.forEach((f) => {
        const val = body[f];
        row[f] = (val === undefined || val === null || val === '') ? null : val;
    });
    return row;
}

// Numeric PM columns arrive as strings from form inputs; a non-number becomes null rather than
// failing the whole save with a Postgres type error.
function coercePmNumbers(row) {
    for (const f of ['storyPoints', 'rank']) {
        if (row[f] == null) continue;
        const n = Number(row[f]);
        row[f] = Number.isFinite(n) ? n : null;
    }
    if (row.issueType && !ISSUE_TYPES.includes(row.issueType)) row.issueType = 'Task';
    return row;
}

// Resolves the hub identity sent on the "X-User-Email" header (same header/posture as
// requireDevTrackerAdmin below) to a real display name, straight from emami_apps.users — the same
// table backend/userProfile.js's own profile lookups read. Used to attribute item_history rows
// (see the recent-activity feed) to a real person instead of leaving them anonymous. Falls back to
// the raw email, then to null, so a lookup failure never blocks the actual create/update.
async function resolveDisplayName(req) {
    const email = (req.verifiedEmail || '');
    if (!email) return null;
    try {
        const { rows } = await pool.query('SELECT name FROM emami_apps.users WHERE email = $1', [email]);
        return rows[0]?.name || email;
    } catch (err) {
        console.error('[dev-tracker] Failed to resolve display name for', email, ':', err.message);
        return email;
    }
}

/**
 * Own schema (dev_tracker), matching the emami_apps/audit_capa convention already used on this
 * DB — same table shape as the standalone Development Tracker app's server/db.js, just
 * schema-qualified instead of landing in `public`. Also does a one-time, idempotent migration of
 * public.items/item_history (left behind by an earlier standalone run against this same DB) into
 * the new schema — the originals are left in place, not dropped.
 */
async function initSchema() {
    await pool.query('CREATE SCHEMA IF NOT EXISTS dev_tracker');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS dev_tracker.items (
            id text PRIMARY KEY,
            "devList" text NOT NULL,
            status text DEFAULT 'Not Started',
            area text,
            func text,
            impact text,
            complexity text,
            priority text,
            "spocFunction" text,
            "spocIT" text,
            "devFactory" text,
            "startDate" text,
            "reqDiscussion" text,
            "fsPrep" text,
            development text,
            "itTesting" text,
            "userTesting" text,
            hypercare integer,
            "hypercareDate" text,
            "onHoldDate" text,
            "completedDate" text,
            "cancelledDate" text,
            "targetDate" text,
            "devTime" integer,
            rework integer,
            "reasonCategory" text,
            "reasonDelay" text,
            remarks text,
            developer text,
            "createdAt" timestamptz DEFAULT now(),
            "updatedAt" timestamptz DEFAULT now()
        )
    `);
    // Added after dev_tracker.items already existed in some deployments — ADD COLUMN IF NOT
    // EXISTS makes this idempotent instead of failing on a table that predates these columns.
    // Each backs a status's own "reached this stage on" date (Hypercare/On Hold/Completed/
    // Cancelled), same idea as the pre-existing reqDiscussion/fsPrep/itTesting/userTesting
    // columns but for the four statuses STAGE_PIPELINE doesn't cover — see MANUAL_STATUS_DATES.
    await pool.query(`ALTER TABLE dev_tracker.items ADD COLUMN IF NOT EXISTS "hypercareDate" text`);
    await pool.query(`ALTER TABLE dev_tracker.items ADD COLUMN IF NOT EXISTS "onHoldDate" text`);
    await pool.query(`ALTER TABLE dev_tracker.items ADD COLUMN IF NOT EXISTS "completedDate" text`);
    await pool.query(`ALTER TABLE dev_tracker.items ADD COLUMN IF NOT EXISTS "cancelledDate" text`);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS dev_tracker.item_history (
            id serial PRIMARY KEY,
            "itemId" text NOT NULL REFERENCES dev_tracker.items(id) ON DELETE CASCADE,
            field text NOT NULL,
            "oldValue" text,
            "newValue" text,
            "changedByUsername" text,
            "changedAt" timestamptz DEFAULT now()
        )
    `);
    // Added after item_history already existed in some deployments — ADD COLUMN IF NOT EXISTS
    // makes this idempotent instead of failing on a table that predates this column.
    await pool.query(`ALTER TABLE dev_tracker.item_history ADD COLUMN IF NOT EXISTS "changedByUsername" text`);

    // A named, reusable Dashboard filter/sort/grouping combination. The config is stored as
    // jsonb rather than a column per filter because the Dashboard's filter set has grown twice
    // already (impact/complexity/devFactory/reasonCategory, then lifecycle) and each addition
    // would otherwise be a migration. Nothing server-side reads inside it — it is handed back
    // to the page exactly as it was saved — so an older client simply ignores keys it predates.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS dev_tracker.saved_views (
            id text PRIMARY KEY,
            name text NOT NULL,
            "ownerEmail" text NOT NULL,
            "ownerName" text,
            shared boolean NOT NULL DEFAULT false,
            config jsonb NOT NULL,
            "createdAt" timestamptz DEFAULT now(),
            "updatedAt" timestamptz DEFAULT now()
        )
    `);
    // Every read filters on one of these two, and the list is re-fetched on each Dashboard load.
    await pool.query(`CREATE INDEX IF NOT EXISTS saved_views_owner_idx ON dev_tracker.saved_views ("ownerEmail")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS saved_views_shared_idx ON dev_tracker.saved_views (shared) WHERE shared`);

    // Dropdown option values (Status, Area, Priority, Impact, Complexity, Dev Factory, Reason
    // category), editable from the "Manage master data" tile instead of being hardcoded in
    // app.js. "active" is a soft-delete flag — a retired option must keep rendering correctly on
    // existing items that already used it, so rows are never hard-deleted, only deactivated.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS dev_tracker.master_data (
            id text PRIMARY KEY,
            category text NOT NULL CHECK (category IN
                ('status','area','priority','impact','complexity','devFactory','reasonCategory','holiday','requestingFunction')),
            value text NOT NULL,
            color text,
            "softColor" text,
            "sortOrder" integer NOT NULL DEFAULT 0,
            active boolean NOT NULL DEFAULT true,
            "createdAt" timestamptz DEFAULT now(),
            "updatedAt" timestamptz DEFAULT now(),
            UNIQUE(category, value)
        )
    `);
    // 'holiday' (Resource Utilization's working-day calendar) added after this table already
    // existed in some deployments — widen the CHECK constraint the same idempotent way
    // "changedByUsername" was added to item_history above, instead of a one-off migration script.
    await pool.query(`ALTER TABLE dev_tracker.master_data DROP CONSTRAINT IF EXISTS master_data_category_check`);
    await pool.query(`
        ALTER TABLE dev_tracker.master_data ADD CONSTRAINT master_data_category_check CHECK (category IN
            ('status','area','priority','impact','complexity','devFactory','reasonCategory','holiday','requestingFunction'))
    `);

    try {
        const { rows: existsCheck } = await pool.query('SELECT to_regclass($1) AS reg', ['public.items']);
        if (existsCheck[0]?.reg) {
            const { rows: countRows } = await pool.query('SELECT count(*)::int AS c FROM dev_tracker.items');
            if (countRows[0].c === 0) {
                await pool.query('INSERT INTO dev_tracker.items SELECT * FROM public.items ON CONFLICT (id) DO NOTHING');
                const { rows: historyExists } = await pool.query('SELECT to_regclass($1) AS reg', ['public.item_history']);
                if (historyExists[0]?.reg) {
                    await pool.query(
                        `INSERT INTO dev_tracker.item_history ("itemId", field, "oldValue", "newValue", "changedAt")
                         SELECT "itemId", field, "oldValue", "newValue", "changedAt" FROM public.item_history`
                    );
                }
                console.log('[dev-tracker] Migrated pre-existing public.items/item_history rows into dev_tracker schema.');
            }
        }
    } catch (err) {
        console.error('[dev-tracker] Migration of legacy public.items failed:', err.message);
    }

    // One row per Import Center run (see POST /import-center/imports) — a summary of the
    // upload, not the imported data itself (that lands in dev_tracker.items like any other
    // create). `errors` holds a per-row reason for every row that wasn't imported, so the
    // page's "view" action can show why without re-parsing the original file.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS dev_tracker.import_logs (
            id text PRIMARY KEY,
            "fileName" text NOT NULL,
            "uploadedByEmail" text,
            "uploadedByName" text,
            "totalRows" integer NOT NULL DEFAULT 0,
            successful integer NOT NULL DEFAULT 0,
            failed integer NOT NULL DEFAULT 0,
            status text NOT NULL DEFAULT 'Completed',
            errors jsonb NOT NULL DEFAULT '[]',
            "createdAt" timestamptz DEFAULT now()
        )
    `);

    await initProjectManagementSchema();

    await seedMasterDataIfEmpty();

    console.log('[dev-tracker] Schema up to date (dev_tracker.items, dev_tracker.item_history, dev_tracker.master_data, dev_tracker.import_logs).');
}

// Jira-style additions: issue keys, issue types, epics/sub-tasks (self-references on items),
// sprints, comments. Everything is ADD ... IF NOT EXISTS so it is safe to run on every cold start
// and never touches existing data. Existing items get Task as their type and a key number in
// creation order, so the oldest item becomes DEV-1.
async function initProjectManagementSchema() {
    await pool.query('CREATE SEQUENCE IF NOT EXISTS dev_tracker.issue_no_seq');
    await pool.query(`ALTER TABLE dev_tracker.items ADD COLUMN IF NOT EXISTS "issueNo" integer`);
    await pool.query(`ALTER TABLE dev_tracker.items ADD COLUMN IF NOT EXISTS "issueType" text DEFAULT 'Task'`);
    await pool.query(`ALTER TABLE dev_tracker.items ADD COLUMN IF NOT EXISTS description text`);
    await pool.query(`ALTER TABLE dev_tracker.items ADD COLUMN IF NOT EXISTS "storyPoints" real`);
    await pool.query(`ALTER TABLE dev_tracker.items ADD COLUMN IF NOT EXISTS "epicId" text`);
    await pool.query(`ALTER TABLE dev_tracker.items ADD COLUMN IF NOT EXISTS "sprintId" text`);
    await pool.query(`ALTER TABLE dev_tracker.items ADD COLUMN IF NOT EXISTS "parentId" text`);
    await pool.query(`ALTER TABLE dev_tracker.items ADD COLUMN IF NOT EXISTS labels text`);
    await pool.query(`ALTER TABLE dev_tracker.items ADD COLUMN IF NOT EXISTS reporter text`);
    await pool.query(`ALTER TABLE dev_tracker.items ADD COLUMN IF NOT EXISTS rank double precision`);
    await pool.query(`UPDATE dev_tracker.items SET "issueType" = 'Task' WHERE "issueType" IS NULL`);

    // Backfill key numbers for rows that predate the column (or were imported without one),
    // continuing after the highest number already handed out, then move the sequence past it.
    await pool.query(`
        WITH base AS (SELECT COALESCE(MAX("issueNo"), 0) AS m FROM dev_tracker.items),
             numbered AS (
                SELECT id, (SELECT m FROM base) + row_number() OVER (ORDER BY "createdAt", id) AS n
                FROM dev_tracker.items WHERE "issueNo" IS NULL
             )
        UPDATE dev_tracker.items i SET "issueNo" = numbered.n FROM numbered WHERE i.id = numbered.id
    `);
    await pool.query(`SELECT setval('dev_tracker.issue_no_seq', GREATEST((SELECT COALESCE(MAX("issueNo"), 0) FROM dev_tracker.items), 1))`);
    await pool.query(`ALTER TABLE dev_tracker.items ALTER COLUMN "issueNo" SET DEFAULT nextval('dev_tracker.issue_no_seq')`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS items_issue_no_idx ON dev_tracker.items ("issueNo")`);
    await pool.query(`UPDATE dev_tracker.items SET rank = EXTRACT(EPOCH FROM "createdAt") * 1000 WHERE rank IS NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS items_sprint_idx ON dev_tracker.items ("sprintId")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS items_epic_idx ON dev_tracker.items ("epicId")`);

    // Snapshot columns (committed*/completed*) are written once, at start and at completion, so
    // the velocity report reflects what the team actually committed to rather than whatever the
    // sprint's membership looks like after items were later moved around.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS dev_tracker.sprints (
            id text PRIMARY KEY,
            name text NOT NULL,
            goal text,
            "startDate" text,
            "endDate" text,
            state text NOT NULL DEFAULT 'future' CHECK (state IN ('future','active','closed')),
            "committedPoints" real,
            "committedCount" integer,
            "completedPoints" real,
            "completedCount" integer,
            "startedAt" timestamptz,
            "completedAt" timestamptz,
            "createdBy" text,
            "createdAt" timestamptz DEFAULT now(),
            "updatedAt" timestamptz DEFAULT now()
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS dev_tracker.comments (
            id text PRIMARY KEY,
            "itemId" text NOT NULL REFERENCES dev_tracker.items(id) ON DELETE CASCADE,
            body text NOT NULL,
            "authorEmail" text NOT NULL,
            "authorName" text,
            "createdAt" timestamptz DEFAULT now(),
            "updatedAt" timestamptz DEFAULT now()
        )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS comments_item_idx ON dev_tracker.comments ("itemId")`);
}

// Seeded once, only if the table is empty — these match exactly what used to be hardcoded in
// app.js, so an existing deployment behaves identically until someone edits a value from the
// admin tile. Only "area" carries colors, since that's the only category the module-theming
// system (MODULE_THEME) uses.
const DEFAULT_MASTER_DATA = [
    ...['Not Started', 'Requirement Discussion', 'FS Preparation', 'In Progress', 'IT Testing', 'User Testing', 'Hypercare', 'Completed', 'On Hold', 'Cancelled']
        .map((value, i) => ({ category: 'status', value, color: null, softColor: null, sortOrder: i })),
    { category: 'area', value: 'SD', color: '#6366f1', softColor: '#eef0fd', sortOrder: 0 },
    { category: 'area', value: 'FI-AR', color: '#0d9488', softColor: '#e6f5f3', sortOrder: 1 },
    { category: 'area', value: 'MM', color: '#d97706', softColor: '#fdf1e0', sortOrder: 2 },
    { category: 'area', value: 'PP', color: '#e11d48', softColor: '#fce8ec', sortOrder: 3 },
    { category: 'area', value: 'WM', color: '#0ea5e9', softColor: '#e5f4fc', sortOrder: 4 },
    { category: 'area', value: 'Cross-Functional', color: '#8b5cf6', softColor: '#f1ecfd', sortOrder: 5 },
    ...['P1', 'P2', 'P3'].map((value, i) => ({ category: 'priority', value, color: null, softColor: null, sortOrder: i })),
    ...['High', 'Medium', 'Low'].map((value, i) => ({ category: 'impact', value, color: null, softColor: null, sortOrder: i })),
    ...['High', 'Medium', 'Low'].map((value, i) => ({ category: 'complexity', value, color: null, softColor: null, sortOrder: i })),
    ...['Onsite Team', 'Offshore Team', 'Vendor'].map((value, i) => ({ category: 'devFactory', value, color: null, softColor: null, sortOrder: i })),
    ...['Config pending', 'Vendor dependency', 'Resourcing', 'Scope change', 'Testing failure', 'Other']
        .map((value, i) => ({ category: 'reasonCategory', value, color: null, softColor: null, sortOrder: i }))
];

async function seedMasterDataIfEmpty() {
    const { rows } = await pool.query('SELECT count(*)::int AS c FROM dev_tracker.master_data');
    if (rows[0].c > 0) return;
    for (const item of DEFAULT_MASTER_DATA) {
        await pool.query(
            `INSERT INTO dev_tracker.master_data (id, category, value, color, "softColor", "sortOrder")
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [crypto.randomUUID(), item.category, item.value, item.color, item.softColor, item.sortOrder]
        );
    }
    console.log('[dev-tracker] Seeded default master data values.');
}

// 'requestingFunction' (the Change Control Board's "Requesting function" dropdown) arrived after the
// table was first seeded, so it gets its own one-time seed: only while that category is still empty.
const DEFAULT_REQUESTING_FUNCTIONS = ['Finance', 'Commercial', 'Sales', 'Marketing', 'Supply Chain', 'Manufacturing', 'Quality', 'Procurement', 'HR', 'Audit & Control', 'IT'];
async function seedRequestingFunctionsIfEmpty() {
    const { rows } = await pool.query(`SELECT count(*)::int AS c FROM dev_tracker.master_data WHERE category = 'requestingFunction'`);
    if (rows[0].c > 0) return;
    for (const [i, value] of DEFAULT_REQUESTING_FUNCTIONS.entries()) {
        await pool.query(
            `INSERT INTO dev_tracker.master_data (id, category, value, color, "softColor", "sortOrder") VALUES ($1, 'requestingFunction', $2, NULL, NULL, $3)
             ON CONFLICT (category, value) DO NOTHING`,
            [crypto.randomUUID(), value, i]
        );
    }
    console.log('[dev-tracker] Seeded default requesting functions.');
}

initSchema().then(seedRequestingFunctionsIfEmpty).catch((err) => console.error('[dev-tracker] Schema init failed:', err.message));

// Gates every Dev Tracker data route (item CRUD, master-data reads, activity, AI command) to
// users granted access to the 'dev-tracker' app (any role — User or Admin) in the hub's own
// Manage Access screen (src/screens/UserAccessScreen.tsx, emami_apps.authorized_user_apps) — the
// same table useUnlockedAppIds() reads to decide whether the Dev Tracker tile even shows for a
// user, so a real user always already has a row here. Before this, these routes had no identity
// check of any kind: pasting the API URL directly, without ever signing into the hub, was enough
// to read, create, edit, and delete every item. The caller is identified by their verified Emami
// Apps session token (verifiedHubEmail above), not by an email the request claims.
async function requireDevTrackerAccess(req, res, next) {
    const email = verifiedHubEmail(req);
    if (!email) return res.status(401).json({ error: 'Your Emami Apps session has expired or is missing. Please sign in again.' });
    req.verifiedEmail = email;
    try {
        const { rows } = await pool.query(
            `SELECT 1 FROM emami_apps.authorized_user_apps WHERE email = $1 AND app_id = 'dev-tracker'`,
            [email]
        );
        if (rows.length === 0) return res.status(403).json({ error: 'Not authorized to access Dev Tracker' });
        next();
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to verify access' });
    }
}

// GET all items
router.get('/items', requireDevTrackerAccess, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM dev_tracker.items ORDER BY "createdAt" ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to load items' });
    }
});

// GET single item's change history (lightweight audit trail)
router.get('/items/:id/history', requireDevTrackerAccess, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, field, "oldValue", "newValue", "changedAt", "changedByUsername" FROM dev_tracker.item_history
             WHERE "itemId" = $1 ORDER BY "changedAt" DESC LIMIT 200`,
            [req.params.id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to load history' });
    }
});

// CREATE item
router.post('/items', requireDevTrackerAccess, async (req, res) => {
    const id = crypto.randomUUID();
    const row = coercePmNumbers(normalize(req.body, ALL_FIELDS));
    if (!row.devList || !String(row.devList).trim()) {
        return res.status(400).json({ error: 'devList is required' });
    }
    try {
        const changedBy = await resolveDisplayName(req);
        if (!row.status) row.status = 'Not Started';
        if (!row.issueType) row.issueType = 'Task';
        if (!row.reporter) row.reporter = changedBy;
        if (row.rank == null) row.rank = Date.now();
        const cols = ALL_FIELDS.map(q).join(', ');
        const placeholders = ALL_FIELDS.map((_, i) => `$${i + 2}`).join(', ');
        const values = ALL_FIELDS.map((f) => row[f]);
        const result = await pool.query(
            `INSERT INTO dev_tracker.items (id, ${cols}) VALUES ($1, ${placeholders}) RETURNING *`,
            [id, ...values]
        );
        // Logged as a history entry too, using the sentinel field name "__created__" — this is
        // what lets the recent-activity feed show "X created Y" alongside ordinary field-level
        // changes, using the same one table rather than a second, parallel log just for creation.
        await pool.query(
            `INSERT INTO dev_tracker.item_history ("itemId", field, "oldValue", "newValue", "changedByUsername") VALUES ($1, $2, $3, $4, $5)`,
            [id, '__created__', null, row.devList, changedBy]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to create item' });
    }
});

// UPDATE item (also writes a diff-based history entry per changed field)
router.put('/items/:id', requireDevTrackerAccess, async (req, res) => {
    try {
        const existingResult = await pool.query('SELECT * FROM dev_tracker.items WHERE id = $1', [req.params.id]);
        const existing = existingResult.rows[0];
        if (!existing) return res.status(404).json({ error: 'Item not found' });

        // A field the body leaves out entirely keeps its stored value, so callers that predate
        // the PM fields (Import Center exports, older cached pages) can't wipe them, and the
        // board/backlog can send just what changed. An explicit '' or null still clears a field.
        const body = req.body || {};
        const row = coercePmNumbers(normalize(body, ALL_FIELDS));
        ALL_FIELDS.forEach((f) => {
            if (!(f in body)) row[f] = existing[f] ?? null;
        });
        if (!row.devList || !String(row.devList).trim()) {
            return res.status(400).json({ error: 'devList is required' });
        }
        if (row.epicId && row.epicId === req.params.id) row.epicId = null;
        if (row.parentId && row.parentId === req.params.id) row.parentId = null;
        const changedBy = await resolveDisplayName(req);

        const historyInserts = [];
        ALL_FIELDS.forEach((f) => {
            if (f === 'rank') return; // reordering the backlog isn't a change worth logging
            const oldVal = existing[f] ?? '';
            const newVal = row[f] ?? '';
            if (String(oldVal) !== String(newVal)) {
                historyInserts.push(
                    pool.query(
                        `INSERT INTO dev_tracker.item_history ("itemId", field, "oldValue", "newValue", "changedByUsername") VALUES ($1, $2, $3, $4, $5)`,
                        [req.params.id, f, String(oldVal), String(newVal), changedBy]
                    )
                );
            }
        });
        await Promise.all(historyInserts);

        const setClause = ALL_FIELDS.map((f, i) => `${q(f)} = $${i + 2}`).join(', ');
        const values = ALL_FIELDS.map((f) => row[f]);
        const result = await pool.query(
            `UPDATE dev_tracker.items SET ${setClause}, "updatedAt" = now() WHERE id = $1 RETURNING *`,
            [req.params.id, ...values]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to update item' });
    }
});

// DELETE item
router.delete('/items/:id', requireDevTrackerAccess, async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM dev_tracker.items WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'Item not found' });
        // Deleting an epic or parent leaves its children in place, just unlinked.
        await pool.query('UPDATE dev_tracker.items SET "epicId" = NULL WHERE "epicId" = $1', [req.params.id]);
        await pool.query('UPDATE dev_tracker.items SET "parentId" = NULL WHERE "parentId" = $1', [req.params.id]);
        res.status(204).end();
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to delete item' });
    }
});

// ============================================================
// Comments — the discussion thread on an issue. Anyone with app access can comment; only the
// author can edit, and the author or a Dev Tracker admin can delete.
// ============================================================
function callerEmail(req) {
    return (req.verifiedEmail || '');
}

async function isAdminEmail(email) {
    const { rows } = await pool.query(
        `SELECT 1 FROM emami_apps.authorized_user_apps WHERE email = $1 AND app_id = 'dev-tracker' AND role = 'Admin'`,
        [email]
    );
    return rows.length > 0;
}

router.get('/items/:id/comments', requireDevTrackerAccess, async (req, res) => {
    try {
        const email = callerEmail(req);
        const result = await pool.query(
            'SELECT * FROM dev_tracker.comments WHERE "itemId" = $1 ORDER BY "createdAt" ASC',
            [req.params.id]
        );
        res.json(result.rows.map((r) => ({ ...r, mine: r.authorEmail === email })));
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to load comments' });
    }
});

router.post('/items/:id/comments', requireDevTrackerAccess, async (req, res) => {
    const text = String(req.body?.body || '').trim();
    if (!text) return res.status(400).json({ error: 'Comment is empty' });
    try {
        const { rows: [item] } = await pool.query('SELECT id FROM dev_tracker.items WHERE id = $1', [req.params.id]);
        if (!item) return res.status(404).json({ error: 'Item not found' });
        const authorName = await resolveDisplayName(req);
        const result = await pool.query(
            `INSERT INTO dev_tracker.comments (id, "itemId", body, "authorEmail", "authorName")
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [crypto.randomUUID(), req.params.id, text.slice(0, 20000), callerEmail(req), authorName]
        );
        // Commenting counts as activity on the item, so it stops reading as "stalled".
        await pool.query('UPDATE dev_tracker.items SET "updatedAt" = now() WHERE id = $1', [req.params.id]);
        res.status(201).json({ ...result.rows[0], mine: true });
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to add comment' });
    }
});

router.put('/comments/:id', requireDevTrackerAccess, async (req, res) => {
    const text = String(req.body?.body || '').trim();
    if (!text) return res.status(400).json({ error: 'Comment is empty' });
    try {
        const result = await pool.query(
            `UPDATE dev_tracker.comments SET body = $3, "updatedAt" = now()
             WHERE id = $1 AND "authorEmail" = $2 RETURNING *`,
            [req.params.id, callerEmail(req), text.slice(0, 20000)]
        );
        if (!result.rowCount) return res.status(403).json({ error: 'Only the author can edit this comment' });
        res.json({ ...result.rows[0], mine: true });
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to update comment' });
    }
});

router.delete('/comments/:id', requireDevTrackerAccess, async (req, res) => {
    try {
        const email = callerEmail(req);
        const { rows: [c] } = await pool.query('SELECT "authorEmail" FROM dev_tracker.comments WHERE id = $1', [req.params.id]);
        if (!c) return res.status(404).json({ error: 'Comment not found' });
        if (c.authorEmail !== email && !(await isAdminEmail(email))) {
            return res.status(403).json({ error: 'Only the author or an admin can delete this comment' });
        }
        await pool.query('DELETE FROM dev_tracker.comments WHERE id = $1', [req.params.id]);
        res.status(204).end();
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to delete comment' });
    }
});

// ============================================================
// Sprints — time-boxed iterations, Scrum style. Lifecycle is future -> active -> closed, with
// at most one active sprint at a time (the board shows "the" active sprint). Items join a
// sprint through their own sprintId; a sprint row never lists its items.
// ============================================================
async function sprintTotals(sprintId) {
    const { rows: [t] } = await pool.query(
        `SELECT COUNT(*)::int AS count,
                COALESCE(SUM("storyPoints"), 0)::real AS points,
                COUNT(*) FILTER (WHERE status = ANY($2))::int AS "doneCount",
                COALESCE(SUM("storyPoints") FILTER (WHERE status = ANY($2)), 0)::real AS "donePoints"
         FROM dev_tracker.items WHERE "sprintId" = $1 AND COALESCE("issueType", 'Task') <> 'Epic'`,
        [sprintId, DONE_STATUSES]
    );
    return t;
}

router.get('/sprints', requireDevTrackerAccess, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM dev_tracker.sprints
             ORDER BY CASE state WHEN 'active' THEN 0 WHEN 'future' THEN 1 ELSE 2 END,
                      CASE WHEN state = 'closed' THEN NULL ELSE "startDate" END ASC NULLS LAST,
                      "completedAt" DESC NULLS LAST, "createdAt" ASC`
        );
        res.json(result.rows);
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to load sprints' });
    }
});

router.post('/sprints', requireDevTrackerAccess, async (req, res) => {
    const { name, goal, startDate, endDate } = req.body || {};
    try {
        let sprintName = String(name || '').trim();
        if (!sprintName) {
            const { rows: [{ c }] } = await pool.query('SELECT COUNT(*)::int AS c FROM dev_tracker.sprints');
            sprintName = `Sprint ${c + 1}`;
        }
        const createdBy = await resolveDisplayName(req);
        const result = await pool.query(
            `INSERT INTO dev_tracker.sprints (id, name, goal, "startDate", "endDate", "createdBy")
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [crypto.randomUUID(), sprintName.slice(0, 80), goal || null, startDate || null, endDate || null, createdBy]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to create sprint' });
    }
});

router.put('/sprints/:id', requireDevTrackerAccess, async (req, res) => {
    const { name, goal, startDate, endDate } = req.body || {};
    try {
        const { rows: [s] } = await pool.query('SELECT * FROM dev_tracker.sprints WHERE id = $1', [req.params.id]);
        if (!s) return res.status(404).json({ error: 'Sprint not found' });
        const result = await pool.query(
            `UPDATE dev_tracker.sprints SET name = $2, goal = $3, "startDate" = $4, "endDate" = $5, "updatedAt" = now()
             WHERE id = $1 RETURNING *`,
            [
                req.params.id,
                name != null && String(name).trim() ? String(name).trim().slice(0, 80) : s.name,
                goal !== undefined ? (goal || null) : s.goal,
                startDate !== undefined ? (startDate || null) : s.startDate,
                endDate !== undefined ? (endDate || null) : s.endDate,
            ]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to update sprint' });
    }
});

router.post('/sprints/:id/start', requireDevTrackerAccess, async (req, res) => {
    const { startDate, endDate, name, goal } = req.body || {};
    try {
        const { rows: [s] } = await pool.query('SELECT * FROM dev_tracker.sprints WHERE id = $1', [req.params.id]);
        if (!s) return res.status(404).json({ error: 'Sprint not found' });
        if (s.state !== 'future') return res.status(400).json({ error: 'Only a future sprint can be started' });
        const { rows: active } = await pool.query(`SELECT name FROM dev_tracker.sprints WHERE state = 'active'`);
        if (active.length) return res.status(409).json({ error: `Complete "${active[0].name}" before starting another sprint` });
        const start = startDate || s.startDate || new Date().toISOString().slice(0, 10);
        const end = endDate || s.endDate;
        if (!end) return res.status(400).json({ error: 'An end date is required to start a sprint' });
        if (end < start) return res.status(400).json({ error: 'End date must be after the start date' });
        const totals = await sprintTotals(req.params.id);
        const result = await pool.query(
            `UPDATE dev_tracker.sprints SET state = 'active', "startDate" = $2, "endDate" = $3,
                name = COALESCE(NULLIF($4, ''), name), goal = COALESCE($5, goal),
                "committedPoints" = $6, "committedCount" = $7, "startedAt" = now(), "updatedAt" = now()
             WHERE id = $1 RETURNING *`,
            [req.params.id, start, end, name ? String(name).trim().slice(0, 80) : '', goal ?? null, totals.points, totals.count]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to start sprint' });
    }
});

// Completing a sprint moves every unfinished item to `moveTo` (another open sprint's id) or, with
// moveTo null, back to the backlog — and logs that sprintId change in item_history like any edit.
router.post('/sprints/:id/complete', requireDevTrackerAccess, async (req, res) => {
    const moveTo = req.body?.moveTo || null;
    try {
        const { rows: [s] } = await pool.query('SELECT * FROM dev_tracker.sprints WHERE id = $1', [req.params.id]);
        if (!s) return res.status(404).json({ error: 'Sprint not found' });
        if (s.state !== 'active') return res.status(400).json({ error: 'Only the active sprint can be completed' });
        if (moveTo) {
            const { rows: [target] } = await pool.query('SELECT state FROM dev_tracker.sprints WHERE id = $1', [moveTo]);
            if (!target || target.state === 'closed' || moveTo === req.params.id) {
                return res.status(400).json({ error: 'Pick an open sprint (or the backlog) for unfinished items' });
            }
        }
        const totals = await sprintTotals(req.params.id);
        const changedBy = await resolveDisplayName(req);
        const { rows: open } = await pool.query(
            `SELECT id FROM dev_tracker.items WHERE "sprintId" = $1 AND NOT (status = ANY($2))`,
            [req.params.id, DONE_STATUSES]
        );
        for (const it of open) {
            await pool.query('UPDATE dev_tracker.items SET "sprintId" = $2, "updatedAt" = now() WHERE id = $1', [it.id, moveTo]);
            await pool.query(
                `INSERT INTO dev_tracker.item_history ("itemId", field, "oldValue", "newValue", "changedByUsername") VALUES ($1, 'sprintId', $2, $3, $4)`,
                [it.id, req.params.id, moveTo || '', changedBy]
            );
        }
        const result = await pool.query(
            `UPDATE dev_tracker.sprints SET state = 'closed', "completedAt" = now(),
                "completedPoints" = $2, "completedCount" = $3, "updatedAt" = now()
             WHERE id = $1 RETURNING *`,
            [req.params.id, totals.donePoints, totals.doneCount]
        );
        res.json({ ...result.rows[0], movedCount: open.length });
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to complete sprint' });
    }
});

router.delete('/sprints/:id', requireDevTrackerAccess, async (req, res) => {
    try {
        const { rows: [s] } = await pool.query('SELECT state FROM dev_tracker.sprints WHERE id = $1', [req.params.id]);
        if (!s) return res.status(404).json({ error: 'Sprint not found' });
        if (s.state === 'closed') return res.status(400).json({ error: 'A completed sprint is kept for reporting' });
        await pool.query('UPDATE dev_tracker.items SET "sprintId" = NULL WHERE "sprintId" = $1', [req.params.id]);
        await pool.query('DELETE FROM dev_tracker.sprints WHERE id = $1', [req.params.id]);
        res.status(204).end();
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to delete sprint' });
    }
});

const MASTER_DATA_CATEGORIES = ['status', 'area', 'priority', 'impact', 'complexity', 'devFactory', 'reasonCategory', 'holiday', 'requestingFunction'];

// Gates the master-data WRITE routes to users granted the "Admin" role for the 'dev-tracker' app
// in the hub's own Manage Access screen (src/screens/UserAccessScreen.tsx). Reuses the exact
// table backend/server.js's /access/* routes already read/write — emami_apps.authorized_user_apps
// — via the same `pool` this file already imports, so no new DB connection or schema is needed.
// Same verified-token identity as requireDevTrackerAccess, plus the Dev Tracker Admin role.
async function requireDevTrackerAdmin(req, res, next) {
    const email = verifiedHubEmail(req);
    if (!email) return res.status(401).json({ error: 'Your Emami Apps session has expired or is missing. Please sign in again.' });
    req.verifiedEmail = email;
    try {
        const { rows } = await pool.query(
            `SELECT 1 FROM emami_apps.authorized_user_apps
             WHERE email = $1 AND app_id = 'dev-tracker' AND role = 'Admin'`,
            [email]
        );
        if (rows.length === 0) return res.status(403).json({ error: 'Not authorized to manage master data' });
        next();
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to verify access' });
    }
}

// GET all master data (active + inactive) — the admin screen needs both; app.js filters
// down to active=true itself when building each field's dropdown options.
router.get('/master-data', requireDevTrackerAccess, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM dev_tracker.master_data ORDER BY category, "sortOrder", value');
        res.json(result.rows);
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to load master data' });
    }
});

// CREATE a new dropdown value
router.post('/master-data', requireDevTrackerAdmin, async (req, res) => {
    const { category, value, color, softColor } = req.body || {};
    if (!MASTER_DATA_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: 'Invalid category' });
    }
    if (!value || !String(value).trim()) {
        return res.status(400).json({ error: 'Value is required' });
    }
    try {
        const maxResult = await pool.query(
            'SELECT COALESCE(MAX("sortOrder"), -1) + 1 AS next FROM dev_tracker.master_data WHERE category = $1',
            [category]
        );
        const id = crypto.randomUUID();
        const result = await pool.query(
            `INSERT INTO dev_tracker.master_data (id, category, value, color, "softColor", "sortOrder")
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [id, category, String(value).trim(), color || null, softColor || null, maxResult.rows[0].next]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') { // unique_violation
            return res.status(409).json({ error: 'That value already exists in this category' });
        }
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to create master data entry' });
    }
});

// UPDATE a dropdown value — rename, recolor, or toggle active (soft-delete)
router.put('/master-data/:id', requireDevTrackerAdmin, async (req, res) => {
    const { value, color, softColor, active, sortOrder } = req.body || {};
    try {
        const existing = await pool.query('SELECT * FROM dev_tracker.master_data WHERE id = $1', [req.params.id]);
        if (!existing.rows[0]) return res.status(404).json({ error: 'Not found' });
        const current = existing.rows[0];

        const result = await pool.query(
            `UPDATE dev_tracker.master_data SET
                value = $2, color = $3, "softColor" = $4, active = $5, "sortOrder" = $6, "updatedAt" = now()
             WHERE id = $1 RETURNING *`,
            [
                req.params.id,
                value !== undefined ? String(value).trim() : current.value,
                color !== undefined ? color : current.color,
                softColor !== undefined ? softColor : current.softColor,
                active !== undefined ? active : current.active,
                sortOrder !== undefined ? sortOrder : current.sortOrder
            ]
        );
        res.json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'That value already exists in this category' });
        }
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to update master data entry' });
    }
});

// ============================================================
// Saved views — a named Dashboard filter/sort/grouping combination. Available to every user
// with app access (not admin-gated): the whole point is that someone who looks at "my overdue
// MM items" daily stops rebuilding it by hand. A view is private to its owner unless they mark
// it shared, and only the owner can rename or delete one, so a shared view can't be edited out
// from under the people using it.
// ============================================================
const MAX_SAVED_VIEWS_PER_USER = 50;

router.get('/saved-views', requireDevTrackerAccess, async (req, res) => {
    try {
        const email = (req.verifiedEmail || '');
        const result = await pool.query(
            `SELECT * FROM dev_tracker.saved_views
             WHERE "ownerEmail" = $1 OR shared = true
             ORDER BY shared ASC, name ASC`,
            [email]
        );
        // `mine` saves the client re-deriving ownership to decide whether to show delete/rename.
        res.json(result.rows.map((r) => ({ ...r, mine: r.ownerEmail === email })));
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to load saved views' });
    }
});

router.post('/saved-views', requireDevTrackerAccess, async (req, res) => {
    const { name, config, shared } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        return res.status(400).json({ error: 'config must be an object' });
    }
    try {
        const email = (req.verifiedEmail || '');
        const { rows: [{ count }] } = await pool.query(
            'SELECT COUNT(*)::int AS count FROM dev_tracker.saved_views WHERE "ownerEmail" = $1', [email]
        );
        if (count >= MAX_SAVED_VIEWS_PER_USER) {
            return res.status(400).json({ error: `You already have ${MAX_SAVED_VIEWS_PER_USER} saved views — delete one first.` });
        }
        const ownerName = await resolveDisplayName(req);
        const result = await pool.query(
            `INSERT INTO dev_tracker.saved_views (id, name, "ownerEmail", "ownerName", shared, config)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [crypto.randomUUID(), String(name).trim().slice(0, 80), email, ownerName, shared === true, JSON.stringify(config)]
        );
        res.status(201).json({ ...result.rows[0], mine: true });
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to save view' });
    }
});

router.put('/saved-views/:id', requireDevTrackerAccess, async (req, res) => {
    const { name, config, shared } = req.body || {};
    try {
        const email = (req.verifiedEmail || '');
        const { rows: [existing] } = await pool.query('SELECT * FROM dev_tracker.saved_views WHERE id = $1', [req.params.id]);
        if (!existing) return res.status(404).json({ error: 'View not found' });
        if (existing.ownerEmail !== email) return res.status(403).json({ error: 'Only the owner can change this view' });
        const result = await pool.query(
            `UPDATE dev_tracker.saved_views
                SET name = $2, shared = $3, config = $4, "updatedAt" = now()
              WHERE id = $1 RETURNING *`,
            [
                req.params.id,
                name != null ? String(name).trim().slice(0, 80) : existing.name,
                shared != null ? shared === true : existing.shared,
                JSON.stringify(config && typeof config === 'object' && !Array.isArray(config) ? config : existing.config),
            ]
        );
        res.json({ ...result.rows[0], mine: true });
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to update view' });
    }
});

router.delete('/saved-views/:id', requireDevTrackerAccess, async (req, res) => {
    try {
        const email = (req.verifiedEmail || '');
        const { rowCount } = await pool.query(
            'DELETE FROM dev_tracker.saved_views WHERE id = $1 AND "ownerEmail" = $2', [req.params.id, email]
        );
        if (!rowCount) return res.status(403).json({ error: 'Only the owner can delete this view' });
        res.json({ ok: true });
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to delete view' });
    }
});

// ============================================================
// Import Center — bulk-load items from a spreadsheet. The browser parses the .xlsx itself
// (SheetJS, client-side) and posts plain row objects keyed by the same FIELDS the New Item
// form uses; this endpoint validates and inserts each one exactly like POST /items would,
// then writes one summary row to import_logs so the page can show its own run history.
// ============================================================
const IMPORT_CHECKED_CATEGORIES = ['status', 'area', 'priority', 'impact', 'complexity', 'devFactory', 'reasonCategory'];
const IMPORT_CATEGORY_LABELS = {
    status: 'Status', area: 'Module', priority: 'Priority', impact: 'Business Impact',
    complexity: 'Technical Complexity', devFactory: 'Dev Factory', reasonCategory: 'Reason for Delay',
};

router.get('/import-center/imports', requireDevTrackerAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM dev_tracker.import_logs ORDER BY "createdAt" DESC LIMIT 100');
        res.json(result.rows);
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to load import history' });
    }
});

router.post('/import-center/imports', requireDevTrackerAdmin, async (req, res) => {
    const { fileName, rows } = req.body || {};
    if (!fileName || !String(fileName).trim()) {
        return res.status(400).json({ error: 'fileName is required' });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'No rows to import' });
    }

    try {
        const changedBy = await resolveDisplayName(req);
        const mdResult = await pool.query('SELECT category, value FROM dev_tracker.master_data WHERE active = true');
        const validValues = {};
        for (const r of mdResult.rows) {
            if (!validValues[r.category]) validValues[r.category] = new Set();
            validValues[r.category].add(r.value);
        }

        let successful = 0;
        const errors = [];
        for (let i = 0; i < rows.length; i++) {
            const rawRow = rows[i] || {};
            // The client sends each row's real Excel line (it skips blank rows, so i + 2 drifts
            // after the first one); i + 2 — header row + 1-based — is the fallback for older clients.
            const rowNum = Number.isInteger(rawRow.sheetRow) ? rawRow.sheetRow : i + 2;
            const title = String(rawRow.devList || '').trim();
            if (!title) {
                errors.push({ row: rowNum, reason: 'Development / Item Title is required' });
                continue;
            }
            const badField = IMPORT_CHECKED_CATEGORIES.find((cat) => {
                const v = rawRow[cat];
                return v && validValues[cat] && !validValues[cat].has(String(v).trim());
            });
            if (badField) {
                errors.push({ row: rowNum, reason: `Unknown ${IMPORT_CATEGORY_LABELS[badField]}: "${rawRow[badField]}"` });
                continue;
            }
            try {
                const row = normalize(rawRow);
                const id = crypto.randomUUID();
                const cols = FIELDS.map(q).join(', ');
                const placeholders = FIELDS.map((_, idx) => `$${idx + 2}`).join(', ');
                const values = FIELDS.map((f) => row[f]);
                await pool.query(`INSERT INTO dev_tracker.items (id, ${cols}) VALUES ($1, ${placeholders})`, [id, ...values]);
                await pool.query(
                    `INSERT INTO dev_tracker.item_history ("itemId", field, "oldValue", "newValue", "changedByUsername") VALUES ($1, $2, $3, $4, $5)`,
                    [id, '__created__', null, row.devList, changedBy]
                );
                successful++;
            } catch (err) {
                console.error('[dev-tracker] import row failed:', err.message);
                errors.push({ row: rowNum, reason: 'Could not save row (server error)' });
            }
        }

        const logResult = await pool.query(
            `INSERT INTO dev_tracker.import_logs
                (id, "fileName", "uploadedByEmail", "uploadedByName", "totalRows", successful, failed, status, errors)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [
                crypto.randomUUID(),
                String(fileName).trim(),
                (req.verifiedEmail || ''),
                changedBy,
                rows.length,
                successful,
                rows.length - successful,
                'Completed',
                JSON.stringify(errors),
            ]
        );
        res.status(201).json(logResult.rows[0]);
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Import failed' });
    }
});

router.delete('/import-center/imports/:id', requireDevTrackerAdmin, async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM dev_tracker.import_logs WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'Import not found' });
        res.status(204).end();
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to delete import log' });
    }
});

// ============================================================
// Recent activity feed — the last few real changes made across all
// items, with who made them, shown on the home page's "Recent
// activity" card.
// ============================================================
router.get('/activity', requireDevTrackerAccess, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT h.field, h."oldValue", h."newValue", h."changedAt", h."changedByUsername", i."devList"
            FROM dev_tracker.item_history h
            JOIN dev_tracker.items i ON i.id = h."itemId"
            ORDER BY h."changedAt" DESC
            LIMIT 10
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to load recent activity' });
    }
});

// ============================================================
// Change Log — every item_history row across every item (not just the
// last 5 the Home widget above shows), with the item's own area/status
// along for the ride so the Change Log page can filter by them without
// a second round trip. Every field-level change and every "__created__"
// row is included; the page itself applies user/field/area/status/date
// filters client-side, same as Dashboard already does with items.
// ============================================================
router.get('/activity/log', requireDevTrackerAccess, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT h.id, h."itemId", h.field, h."oldValue", h."newValue", h."changedAt", h."changedByUsername",
                   i."devList", i.area, i.status
            FROM dev_tracker.item_history h
            JOIN dev_tracker.items i ON i.id = h."itemId"
            ORDER BY h."changedAt" DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to load change log' });
    }
});

// ============================================================
// AI command bar — natural language in, either a filter, a pre-filled
// draft item, or a data-grounded answer, out.
// ============================================================

// Deterministic, zero-cost interpretation of the command bar's text — no external API call, no
// billing, works the moment the app starts. Covers the actual vocabulary this app needs (known
// area/status/priority values, "overdue," "how many," "create/add/new") rather than trying to
// understand truly open-ended language — which is the right tradeoff here, since this app's valid
// inputs are a small, known set, not open English.
function parseCommandRuleBased(message, optionsByCat) {
    const msg = message.toLowerCase();
    const isCreate = /^\s*(create|add|new|log)\b/i.test(message);
    const isQuestion = /how many|count|total|what('?s| is)|summary|summarize/.test(msg) || message.trim().endsWith('?');

    const findMatch = (list) => (list || []).find((v) => msg.includes(v.toLowerCase()));
    const matchedArea = findMatch(optionsByCat.area);
    const matchedStatus = findMatch(optionsByCat.status);
    const matchedPriority = (optionsByCat.priority || []).find((p) => msg.includes(p.toLowerCase()));
    const overdueOnly = /overdue|late|past due|behind/.test(msg);

    if (isCreate) {
        let devList = message.replace(/^\s*(create|add|new|log)\b/i, '').trim();
        const forMatch = message.match(/(?:for|called|named)\s+(.+?)(?:\s+due\b|\s+priority\b|$)/i);
        if (forMatch) devList = forMatch[1].trim();

        let targetDate;
        const today = new Date();
        if (/next month/i.test(message)) {
            const d = new Date(today); d.setMonth(d.getMonth() + 1);
            targetDate = d.toISOString().slice(0, 10);
        } else if (/next week/i.test(message)) {
            const d = new Date(today); d.setDate(d.getDate() + 7);
            targetDate = d.toISOString().slice(0, 10);
        }

        return {
            intent: 'create_draft',
            draft: { devList: devList || message, area: matchedArea, priority: matchedPriority, targetDate }
        };
    }

    if (isQuestion) {
        return { intent: 'answer', _filters: { area: matchedArea, status: matchedStatus, priority: matchedPriority, overdueOnly } };
    }

    return {
        intent: 'filter',
        filters: { area: matchedArea, status: matchedStatus, priority: matchedPriority, overdueOnly: overdueOnly || undefined }
    };
}

// Deterministic, computed straight from the database — used by both the free rule-based "answer"
// path and (via computeStatsContext below) the optional AI path. Never invented by a model either way.
function revisedTargetOf(item) {
    const rework = Number(item.rework) || 0;
    if (!item.targetDate) return null;
    if (rework <= 0) return item.targetDate;
    const d = new Date(item.targetDate + 'T00:00:00');
    d.setDate(d.getDate() + rework);
    return d.toISOString().slice(0, 10);
}

function computeStatsStructured(items, filters) {
    const today = new Date().toISOString().slice(0, 10);
    let scoped = items;
    if (filters) {
        if (filters.area) scoped = scoped.filter((i) => i.area === filters.area);
        if (filters.status) scoped = scoped.filter((i) => i.status === filters.status);
        if (filters.priority) scoped = scoped.filter((i) => i.priority === filters.priority);
    }
    const total = scoped.length;
    const completed = scoped.filter((i) => i.status === 'Completed').length;
    const active = scoped.filter((i) => !['Completed', 'Cancelled'].includes(i.status)).length;
    const overdueItems = scoped.filter((i) => {
        if (['Completed', 'Cancelled'].includes(i.status)) return false;
        const rt = revisedTargetOf(i);
        return rt && rt < today;
    });
    return { total, completed, active, overdueItems };
}

// Builds the natural-language sentence for the free path — templated, not generated by a model, so
// it can never state a number it didn't compute itself just above.
function answerRuleBased(message, items, filters) {
    const msg = message.toLowerCase();
    const stats = computeStatsStructured(items, filters);
    const scopePhrase = [filters.area, filters.priority].filter(Boolean).join(' ');
    const scopeSuffix = scopePhrase ? ` in ${scopePhrase}` : '';

    if (/overdue|late|past due|behind/.test(msg)) {
        const n = stats.overdueItems.length;
        return `There ${n === 1 ? 'is' : 'are'} ${n} overdue item${n === 1 ? '' : 's'}${scopeSuffix}.`;
    }
    if (/completed|done|finished/.test(msg)) {
        return `${stats.completed} item${stats.completed === 1 ? '' : 's'}${scopeSuffix} ${stats.completed === 1 ? 'is' : 'are'} marked Completed.`;
    }
    if (/active|in progress|ongoing|open/.test(msg)) {
        return `${stats.active} item${stats.active === 1 ? '' : 's'}${scopeSuffix} ${stats.active === 1 ? 'is' : 'are'} currently active.`;
    }
    return `Total: ${stats.total}${scopeSuffix}. Active: ${stats.active}. Completed: ${stats.completed}. Overdue: ${stats.overdueItems.length}.`;
}

// The FREE, rule-based parser above runs by default and needs no setup. If ANTHROPIC_API_KEY is
// present, the smarter model-based path below is used instead — a purely optional upgrade, never
// required for this feature to work.
const ANTHROPIC_MODEL = 'claude-sonnet-5';

async function callClaude(systemPrompt, userMessage) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error('AI_NOT_CONFIGURED');
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: 500,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }]
        })
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error('Claude API error: ' + errText);
    }
    const data = await res.json();
    const textBlock = (data.content || []).find((c) => c.type === 'text');
    return textBlock ? textBlock.text : '';
}

function parseCommandJson(raw) {
    const cleaned = raw.trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/, '')
        .replace(/```\s*$/, '');
    return JSON.parse(cleaned);
}

async function computeStatsContext() {
    const result = await pool.query('SELECT * FROM dev_tracker.items');
    const items = result.rows;
    const today = new Date().toISOString().slice(0, 10);
    const total = items.length;
    const completed = items.filter((i) => i.status === 'Completed').length;
    const active = items.filter((i) => !['Completed', 'Cancelled'].includes(i.status)).length;
    const overdue = items.filter((i) => {
        if (['Completed', 'Cancelled'].includes(i.status)) return false;
        const rt = revisedTargetOf(i);
        return rt && rt < today;
    });
    const byArea = {};
    items.forEach((i) => { if (i.area) byArea[i.area] = (byArea[i.area] || 0) + 1; });
    const byStatus = {};
    items.forEach((i) => { byStatus[i.status || 'Not Started'] = (byStatus[i.status || 'Not Started'] || 0) + 1; });

    return `Total items: ${total}. Active: ${active}. Completed: ${completed}. ` +
        `Overdue: ${overdue.length} (${overdue.map((i) => i.devList).slice(0, 10).join('; ')}). ` +
        `By area: ${JSON.stringify(byArea)}. By status: ${JSON.stringify(byStatus)}.`;
}

router.post('/ai/command', requireDevTrackerAccess, async (req, res) => {
    const { message } = req.body || {};
    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Message is required' });
    }
    try {
        const mdResult = await pool.query('SELECT category, value FROM dev_tracker.master_data WHERE active = true');
        const optionsByCat = {};
        mdResult.rows.forEach((r) => { (optionsByCat[r.category] = optionsByCat[r.category] || []).push(r.value); });

        const aiConfigured = !!process.env.ANTHROPIC_API_KEY;

        if (!aiConfigured) {
            // Free path — default, no setup, no cost.
            const parsed = parseCommandRuleBased(message, optionsByCat);
            if (parsed.intent === 'answer') {
                const itemsResult = await pool.query('SELECT * FROM dev_tracker.items');
                const text = answerRuleBased(message, itemsResult.rows, parsed._filters || {});
                return res.json({ intent: 'answer', text, mode: 'basic' });
            }
            return res.json(Object.assign({}, parsed, { mode: 'basic' }));
        }

        // Optional upgrade path — only reached when a real key is configured.
        const systemPrompt = `You are the command interpreter for a SAP development tracker web app.
Valid areas: ${(optionsByCat.area || []).join(', ')}
Valid statuses: ${(optionsByCat.status || []).join(', ')}
Valid priorities: ${(optionsByCat.priority || []).join(', ')}
Given the user's request, respond with ONLY raw JSON (no markdown fences, no prose) in exactly one of these three shapes:
{"intent":"filter","filters":{"area":"<value or omit>","status":"<value or omit>","priority":"<value or omit>","overdueOnly":true or omit,"search":"<free text or omit>"}}
{"intent":"create_draft","draft":{"devList":"<string>","area":"<value or omit>","priority":"<value or omit>","targetDate":"<YYYY-MM-DD or omit>","developer":"<string or omit>","remarks":"<string or omit>"}}
{"intent":"answer","question":"<restate the user's question concisely>"}
Use "answer" whenever the user is asking a question about the data (counts, comparisons, summaries) rather than asking to filter the view or create a new item. Only use values from the valid lists above for area/status/priority — never invent a value not in those lists.`;

        const raw = await callClaude(systemPrompt, message);
        let parsed;
        try {
            parsed = parseCommandJson(raw);
        } catch (e) {
            return res.status(502).json({ error: 'Could not understand the AI response', raw });
        }

        if (parsed.intent === 'answer') {
            const statsContext = await computeStatsContext();
            const answerPrompt = `You answer questions about a SAP development tracker using ONLY the real data given to you below. Never invent a number that isn't present in this data. Be concise — one to three sentences.`;
            const answerText = await callClaude(answerPrompt, `Data: ${statsContext}\n\nQuestion: ${parsed.question || message}`);
            return res.json({ intent: 'answer', text: answerText.trim(), mode: 'ai' });
        }

        return res.json(Object.assign({}, parsed, { mode: 'ai' }));
    } catch (err) {
        if (err.message === 'AI_NOT_CONFIGURED') {
            return res.status(503).json({ error: 'AI features need an ANTHROPIC_API_KEY configured on the server.' });
        }
        console.error('[dev-tracker]', err);
        return res.status(500).json({ error: 'AI command failed' });
    }
});

module.exports = router;
