/**
 * Salescode (SD category = the SAP SD module) — master and transactional data for Emami products
 * sold through Salescode, from SAP ECC. This route serves the invoice/pricing rows, via the
 * ZSALESCODE_ODATA_SRV_SRV OData service (entity set Pricing_dataSet, backed by Z table
 * ZSD_SC_PRIC_API). Backs the
 * embedded-apps/salescode page. Self-contained, mounted under /salescode in server.js — purely
 * additive, doesn't touch any other route.
 *
 * SAP_GATEWAY_URL is the service root, e.g.
 *   http://emamidev.emami.local:8080/sap/opu/odata/sap/ZSALESCODE_ODATA_SRV_SRV
 * That host is on-prem only — a deployment with no route to it (the AWS-hosted backend, unlike a
 * local run on the Emami network) needs this pointed at something reachable instead, e.g. the
 * NGD proxy audit-capa's sapNgdService.js already uses for ZQM_CAPA_AUDIT_SRV.
 *
 * Deliberately uses the built-in fetch (as stockQuote.js does) rather than axios: axios isn't a
 * dependency of this backend, and a failed require here would take down every route on the
 * Lambda, not just this one. Likewise nothing below throws at module load when the env vars are
 * missing — the route just answers 503 until they're set.
 */
const express = require('express');
const { pool } = require('./db');

const router = express.Router();

const SAP_BASE_URL = (process.env.SAP_GATEWAY_URL || '').replace(/\/+$/, '');
const SAP_USER = process.env.SAP_SERVICE_USER || '';
const SAP_PASS = process.env.SAP_SERVICE_PASS || '';
// Same fail-fast posture as sapNgdService.js — a hung gateway must never hold a request open.
const REQUEST_TIMEOUT_MS = Number(process.env.SAP_GATEWAY_TIMEOUT_MS || 30000);

// SAP distributor (customer) numbers are at most 10 alphanumeric chars. Validating the shape up
// front is what keeps the value safe to interpolate into the $filter string literal below — a
// quote or space can't get through, so it can't break out of the filter expression.
const DISTRIBUTOR_RE = /^[A-Za-z0-9]{1,10}$/;

// Only the selected SD/IT users granted the Salescode tile in Manage Access (the same
// emami_apps.authorized_user_apps row that decides whether the tile shows for them). A granted
// user can look up any distributor — there's no per-distributor restriction. The account also has
// to still be active, so deactivating someone in Manage Access cuts this off too. Same "email as
// identity" posture as devTracker.js's requireDevTrackerAccess.
async function requireSalescodeAccess(req, res, next) {
    const email = String(req.get('x-user-email') || '').trim().toLowerCase();
    if (!email) return res.status(401).json({ error: 'Sign-in required' });
    try {
        const { rows } = await pool.query(
            `SELECT 1 FROM emami_apps.authorized_user_apps a
             JOIN emami_apps.authorized_users u ON u.email = a.email
             WHERE a.email = $1 AND a.app_id = 'salescode' AND u.is_active = true`,
            [email]
        );
        if (rows.length === 0) return res.status(403).json({ error: 'Not authorized to access Salescode' });
        next();
    } catch (err) {
        console.error('[salescode] Access check failed:', err.message);
        res.status(500).json({ error: 'Failed to verify access' });
    }
}

router.get('/invoices', requireSalescodeAccess, async (req, res) => {
    const distributor = String(req.query.distributor || '').trim();
    if (!distributor) {
        return res.status(400).json({ error: 'distributor query parameter is required' });
    }
    if (!DISTRIBUTOR_RE.test(distributor)) {
        return res.status(400).json({ error: 'distributor must be 1-10 letters or digits' });
    }
    if (!SAP_BASE_URL || !SAP_USER || !SAP_PASS) {
        console.error('[salescode] SAP_GATEWAY_URL / SAP_SERVICE_USER / SAP_SERVICE_PASS not set');
        return res.status(503).json({ error: 'Salescode is not configured on this server yet' });
    }

    // $top/$skip deliberately not sent: Pricing_dataSet is sap:pageable="false" in SEGW, so they'd
    // be silently ignored anyway. Add them back once paging is enabled on the SAP side.
    // encodeURIComponent (spaces as %20), not URLSearchParams (spaces as "+") — %20 is the form
    // the service was actually verified with, and not every Gateway/proxy decodes "+" in $filter.
    const query = `$filter=${encodeURIComponent(`DistributorCode eq '${distributor}'`)}&$format=json`;

    try {
        const response = await fetch(`${SAP_BASE_URL}/Pricing_dataSet?${query}`, {
            headers: {
                Accept: 'application/json',
                Authorization: 'Basic ' + Buffer.from(`${SAP_USER}:${SAP_PASS}`).toString('base64'),
            },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(`SAP responded ${response.status}: ${body.slice(0, 500)}`);
        }
        const json = await response.json();
        const rows = (json?.d?.results ?? []).map(({ __metadata, ...fields }) => fields);
        res.json({ count: rows.length, data: rows });
    } catch (err) {
        console.error('[salescode] SAP OData call failed:', err.message);
        res.status(502).json({ error: 'Failed to fetch invoice data from SAP' });
    }
});

module.exports = router;
