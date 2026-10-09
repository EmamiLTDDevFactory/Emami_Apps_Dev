/**
 * Release status of each Emami Apps tile (WIP, IAT, UAT, Controlled Live, Partial Live, Live, UIP), set by an admin in
 * the Admin Center's App status tab and shown as the badge on every tile in the hub. Only apps an admin has set get a
 * row in emami_apps.app_stages; every other app keeps the default stage from hub-next's src/data/mockData.ts.
 *
 *   GET /access/app-stages            -> { stages: { [appId]: { stage, updatedBy, updatedAt } } }   (no sign-in needed:
 *                                        the login-free tile badges read it, and a stage label is not sensitive)
 *   PUT /admin/apps/:appId/stage      { stage }   (Super Admin / Admin, see server.js requireAccessManager)
 *
 * Both paths sit under prefixes the audit-capa-api nginx already forwards to this backend (/api/access/, /api/admin/).
 * The router is created in server.js with its own requireAccessManager so this file stays free of the auth code.
 */
const express = require('express');
const { pool } = require('./db');

/** Same codes, in the same order, as hub-next's src/data/appStages.ts. */
const APP_STAGES = ['WIP', 'IAT', 'UAT', 'Controlled Live', 'Partial Live', 'Live', 'UIP'];
const APP_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

async function ensureAppStagesTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS emami_apps.app_stages (
                app_id text PRIMARY KEY,
                stage text NOT NULL,
                updated_by text,
                updated_at timestamptz NOT NULL DEFAULT now()
            )
        `);
        console.log('[postgres] App stage schema up to date (emami_apps.app_stages).');
    } catch (err) {
        console.error('[postgres] App stage migration failed:', err.message);
    }
}

function appStagesRouter(requireAccessManager) {
    const router = express.Router();
    const ready = ensureAppStagesTable();

    router.get('/access/app-stages', async (req, res) => {
        try {
            await ready;
            const { rows } = await pool.query('SELECT app_id, stage, updated_by, updated_at FROM emami_apps.app_stages');
            const stages = {};
            rows.forEach((r) => {
                stages[r.app_id] = { stage: r.stage, updatedBy: r.updated_by, updatedAt: r.updated_at };
            });
            res.json({ success: true, stages });
        } catch (err) {
            console.error('[app-stages] Failed to load app stages:', err.message);
            res.status(500).json({ success: false, error: 'Could not load app status.' });
        }
    });

    router.put('/admin/apps/:appId/stage', requireAccessManager, async (req, res) => {
        const appId = String(req.params.appId || '').trim();
        const stage = String(req.body?.stage || '').trim();
        if (!APP_ID_RE.test(appId)) {
            return res.status(400).json({ success: false, error: 'Invalid app id.' });
        }
        if (!APP_STAGES.includes(stage)) {
            return res.status(400).json({ success: false, error: `Status must be one of: ${APP_STAGES.join(', ')}.` });
        }
        try {
            await ready;
            const { rows } = await pool.query(
                `INSERT INTO emami_apps.app_stages (app_id, stage, updated_by, updated_at)
                 VALUES ($1, $2, $3, now())
                 ON CONFLICT (app_id) DO UPDATE SET stage = EXCLUDED.stage, updated_by = EXCLUDED.updated_by, updated_at = now()
                 RETURNING app_id, stage, updated_by, updated_at`,
                [appId, stage, req.verifiedEmail]
            );
            const r = rows[0];
            res.json({ success: true, appId: r.app_id, stage: r.stage, updatedBy: r.updated_by, updatedAt: r.updated_at });
        } catch (err) {
            console.error('[app-stages] Failed to set the status of', appId, ':', err.message);
            res.status(500).json({ success: false, error: 'Could not change the app status.' });
        }
    });

    return router;
}

module.exports = { appStagesRouter, APP_STAGES };
