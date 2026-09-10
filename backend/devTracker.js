const express = require('express');
const crypto = require('crypto');
const { pool } = require('./db');

const router = express.Router();

const FIELDS = [
    'devList', 'status', 'area', 'func', 'impact', 'complexity', 'priority',
    'spocFunction', 'spocIT', 'devFactory', 'startDate', 'reqDiscussion', 'fsPrep',
    'development', 'itTesting', 'userTesting', 'hypercare', 'targetDate', 'devTime',
    'rework', 'reasonCategory', 'reasonDelay', 'remarks', 'developer'
];

// Column names are camelCase to match the JSON the frontend already sends —
// Postgres folds unquoted identifiers to lowercase, so every reference to
// these columns must be double-quoted to preserve the exact case.
const q = (col) => `"${col}"`;

function normalize(body) {
    const row = {};
    FIELDS.forEach((f) => {
        const val = body[f];
        row[f] = (val === undefined || val === null || val === '') ? null : val;
    });
    return row;
}

// Resolves the hub identity sent on the "X-User-Email" header (same header/posture as
// requireDevTrackerAdmin below) to a real display name, straight from emami_apps.users — the same
// table backend/userProfile.js's own profile lookups read. Used to attribute item_history rows
// (see the recent-activity feed) to a real person instead of leaving them anonymous. Falls back to
// the raw email, then to null, so a lookup failure never blocks the actual create/update.
async function resolveDisplayName(req) {
    const email = String(req.get('x-user-email') || '').trim().toLowerCase();
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

    // Dropdown option values (Status, Area, Priority, Impact, Complexity, Dev Factory, Reason
    // category), editable from the "Manage master data" tile instead of being hardcoded in
    // app.js. "active" is a soft-delete flag — a retired option must keep rendering correctly on
    // existing items that already used it, so rows are never hard-deleted, only deactivated.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS dev_tracker.master_data (
            id text PRIMARY KEY,
            category text NOT NULL CHECK (category IN
                ('status','area','priority','impact','complexity','devFactory','reasonCategory')),
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

    await seedMasterDataIfEmpty();

    console.log('[dev-tracker] Schema up to date (dev_tracker.items, dev_tracker.item_history, dev_tracker.master_data).');
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

initSchema().catch((err) => console.error('[dev-tracker] Schema init failed:', err.message));

// GET all items
router.get('/items', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM dev_tracker.items ORDER BY "createdAt" ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to load items' });
    }
});

// GET single item's change history (lightweight audit trail)
router.get('/items/:id/history', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT field, "oldValue", "newValue", "changedAt" FROM dev_tracker.item_history
             WHERE "itemId" = $1 ORDER BY "changedAt" DESC LIMIT 50`,
            [req.params.id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to load history' });
    }
});

// CREATE item
router.post('/items', async (req, res) => {
    const id = crypto.randomUUID();
    const row = normalize(req.body);
    if (!row.devList || !String(row.devList).trim()) {
        return res.status(400).json({ error: 'devList is required' });
    }
    try {
        const cols = FIELDS.map(q).join(', ');
        const placeholders = FIELDS.map((_, i) => `$${i + 2}`).join(', ');
        const values = FIELDS.map((f) => row[f]);
        const result = await pool.query(
            `INSERT INTO dev_tracker.items (id, ${cols}) VALUES ($1, ${placeholders}) RETURNING *`,
            [id, ...values]
        );
        // Logged as a history entry too, using the sentinel field name "__created__" — this is
        // what lets the recent-activity feed show "X created Y" alongside ordinary field-level
        // changes, using the same one table rather than a second, parallel log just for creation.
        const changedBy = await resolveDisplayName(req);
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
router.put('/items/:id', async (req, res) => {
    try {
        const existingResult = await pool.query('SELECT * FROM dev_tracker.items WHERE id = $1', [req.params.id]);
        const existing = existingResult.rows[0];
        if (!existing) return res.status(404).json({ error: 'Item not found' });

        const row = normalize(req.body);
        const changedBy = await resolveDisplayName(req);

        const historyInserts = [];
        FIELDS.forEach((f) => {
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

        const setClause = FIELDS.map((f, i) => `${q(f)} = $${i + 2}`).join(', ');
        const values = FIELDS.map((f) => row[f]);
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
router.delete('/items/:id', async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM dev_tracker.items WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'Item not found' });
        res.status(204).end();
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to delete item' });
    }
});

const MASTER_DATA_CATEGORIES = ['status', 'area', 'priority', 'impact', 'complexity', 'devFactory', 'reasonCategory'];

// Gates the master-data WRITE routes to users granted the "Admin" role for the 'dev-tracker' app
// in the hub's own Manage Access screen (src/screens/UserAccessScreen.tsx). Reuses the exact
// table backend/server.js's /access/* routes already read/write — emami_apps.authorized_user_apps
// — via the same `pool` this file already imports, so no new DB connection or schema is needed.
// Same "email as identity, no bearer token" posture as the rest of this hub (see /me, /access/me):
// the caller sends their own email, which is enough for a UI-hiding-plus-server-check level of
// protection, though it means anyone who can read the email out of localStorage could still spoof
// it — acceptable here since these are internal SAP-process dropdown values, not sensitive data,
// and matches the trust level every other endpoint in this hub already operates at.
async function requireDevTrackerAdmin(req, res, next) {
    const email = String(req.get('x-user-email') || req.query.email || '').trim().toLowerCase();
    if (!email) return res.status(401).json({ error: 'Sign-in required' });
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
router.get('/master-data', async (req, res) => {
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
// Recent activity feed — the last few real changes made across all
// items, with who made them, shown on the home page's "Recent
// activity" card.
// ============================================================
router.get('/activity', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT h.field, h."oldValue", h."newValue", h."changedAt", h."changedByUsername", i."devList"
            FROM dev_tracker.item_history h
            JOIN dev_tracker.items i ON i.id = h."itemId"
            ORDER BY h."changedAt" DESC
            LIMIT 5
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('[dev-tracker]', err);
        res.status(500).json({ error: 'Failed to load recent activity' });
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

router.post('/ai/command', async (req, res) => {
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
