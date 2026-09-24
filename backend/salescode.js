/**
 * Salescode (SD category = the SAP SD module) — master and transactional data for Emami products
 * sold through Salescode, from SAP ECC. This route serves the invoice/pricing rows, via the
 * ZSALESCODE_ODATA_SRV_SRV OData service (entity set Pricing_dataSet, backed by Z table
 * ZSD_SC_PRIC_API). Self-contained, mounted under /salescode in server.js — purely additive,
 * doesn't touch any other route.
 *
 * Not called today: the embedded-apps/salescode page reads Pricing_dataSet straight from the
 * browser through the NGD proxy (the Non-CTC Expense pattern) and gates on the Salescode grant
 * client-side. This route is kept, date-range ready, for a later move to server-side enforcement.
 *
 * SAP_GATEWAY_URL is the service root. It defaults to the NGD proxy (the same one audit-capa's
 * sapNgdService.js uses for ZQM_CAPA_AUDIT_SRV), which is reachable from the AWS-hosted backend
 * and signs in to SAP itself, so no credentials are needed. It can be pointed at the on-prem
 * Gateway instead for a local run on the Emami network, e.g.
 *   http://emamidev.emami.local:8080/sap/opu/odata/sap/ZSALESCODE_ODATA_SRV_SRV
 * in which case SAP_SERVICE_USER / SAP_SERVICE_PASS must be set and are sent as Basic auth.
 *
 * Deliberately uses the built-in fetch (as stockQuote.js does) rather than axios: axios isn't a
 * dependency of this backend, and a failed require here would take down every route on the
 * Lambda, not just this one. Likewise nothing below throws at module load when the env vars are
 * missing — the route just answers 503 until they're set.
 */
const express = require('express');
const { pool } = require('./db');

const router = express.Router();

const SAP_BASE_URL = (
    process.env.SAP_GATEWAY_URL ||
    'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NGD/ZSALESCODE_ODATA_SRV_SRV'
).replace(/\/+$/, '');
const SAP_USER = process.env.SAP_SERVICE_USER || '';
const SAP_PASS = process.env.SAP_SERVICE_PASS || '';
// Same fail-fast posture as sapNgdService.js — a hung gateway must never hold a request open.
const REQUEST_TIMEOUT_MS = Number(process.env.SAP_GATEWAY_TIMEOUT_MS || 30000);

// SAP distributor (customer) numbers are at most 10 alphanumeric chars. Validating the shape up
// front is what keeps the value safe to interpolate into the $filter string literal below — a
// quote or space can't get through, so it can't break out of the filter expression.
const DISTRIBUTOR_RE = /^[A-Za-z0-9]{1,10}$/;
// Created-on date range (from/to, YYYY-MM-DD) — the service filters on CreationDate. Same reasoning: only this exact shape reaches the
// datetime'...' literals. Pricing_dataSet can't page, so the span is capped to keep one call's
// payload (and SAP's work) bounded.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = Number(process.env.SALESCODE_MAX_RANGE_DAYS || 93);

function parseIsoDate(s) {
    if (!ISO_DATE_RE.test(s)) return null;
    const d = new Date(`${s}T00:00:00Z`);
    // Rejects impossible dates like 2026-02-30, which Date would silently roll over.
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : d;
}

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

// GET /invoices?from=YYYY-MM-DD&to=YYYY-MM-DD[&distributor=...] — Pricing Master rows for a
// created-on date range (both ends inclusive), optionally narrowed to one distributor. A lone
// distributor (no dates) is still accepted, as before.
router.get('/invoices', requireSalescodeAccess, async (req, res) => {
    const distributor = String(req.query.distributor || '').trim();
    const fromRaw = String(req.query.from || '').trim();
    const toRaw = String(req.query.to || '').trim();
    if (distributor && !DISTRIBUTOR_RE.test(distributor)) {
        return res.status(400).json({ error: 'distributor must be 1-10 letters or digits' });
    }
    if (Boolean(fromRaw) !== Boolean(toRaw)) {
        return res.status(400).json({ error: 'from and to must be given together' });
    }
    const from = fromRaw ? parseIsoDate(fromRaw) : null;
    const to = toRaw ? parseIsoDate(toRaw) : null;
    if (fromRaw && (!from || !to)) {
        return res.status(400).json({ error: 'from and to must be valid dates (YYYY-MM-DD)' });
    }
    if (from && from > to) {
        return res.status(400).json({ error: 'from must be on or before to' });
    }
    if (from && (to - from) / 86400000 + 1 > MAX_RANGE_DAYS) {
        return res.status(400).json({ error: `Date range can be at most ${MAX_RANGE_DAYS} days` });
    }
    if (!distributor && !from) {
        return res.status(400).json({ error: 'Give a date range (from and to) or a distributor' });
    }
    // The NGD proxy signs in to SAP itself; only a direct Gateway URL needs Basic auth. Half a
    // credential pair is a misconfiguration either way.
    if (Boolean(SAP_USER) !== Boolean(SAP_PASS)) {
        console.error('[salescode] Only one of SAP_SERVICE_USER / SAP_SERVICE_PASS is set');
        return res.status(503).json({ error: 'Salescode is not configured on this server yet' });
    }

    // $top/$skip deliberately not sent: Pricing_dataSet is sap:pageable="false" in SEGW, so they'd
    // be silently ignored anyway. Add them back once paging is enabled on the SAP side.
    // encodeURIComponent (spaces as %20), not URLSearchParams (spaces as "+") — %20 is the form
    // the service was actually verified with, and not every Gateway/proxy decodes "+" in $filter.
    // CreationDate is Edm.DateTime, so OData v2 wants datetime'YYYY-MM-DDT00:00:00' literals.
    const conditions = [];
    if (from) {
        conditions.push(`CreationDate ge datetime'${fromRaw}T00:00:00'`, `CreationDate le datetime'${toRaw}T00:00:00'`);
    }
    if (distributor) conditions.push(`DistributorCode eq '${distributor}'`);
    const query = `$filter=${encodeURIComponent(conditions.join(' and '))}&$format=json`;

    try {
        const response = await fetch(`${SAP_BASE_URL}/Pricing_dataSet?${query}`, {
            headers: {
                Accept: 'application/json',
                ...(SAP_USER && {
                    Authorization: 'Basic ' + Buffer.from(`${SAP_USER}:${SAP_PASS}`).toString('base64'),
                }),
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
