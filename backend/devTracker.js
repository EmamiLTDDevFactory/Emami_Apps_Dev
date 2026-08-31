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
            "changedAt" timestamptz DEFAULT now()
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

    console.log('[dev-tracker] Schema up to date (dev_tracker.items, dev_tracker.item_history).');
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

        const historyInserts = [];
        FIELDS.forEach((f) => {
            const oldVal = existing[f] ?? '';
            const newVal = row[f] ?? '';
            if (String(oldVal) !== String(newVal)) {
                historyInserts.push(
                    pool.query(
                        `INSERT INTO dev_tracker.item_history ("itemId", field, "oldValue", "newValue") VALUES ($1, $2, $3, $4)`,
                        [req.params.id, f, String(oldVal), String(newVal)]
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

module.exports = router;
