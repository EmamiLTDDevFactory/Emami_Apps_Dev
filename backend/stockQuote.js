/**
 * Live NSE quote for Emami Limited — backs the "About Emami Limited" card on the Home page
 * (src/components/CompanyPulseCard.tsx). Uses Yahoo Finance's public chart endpoint, proxied
 * through this backend rather than called from the browser (Yahoo blocks/CORS-rejects direct
 * browser calls to this endpoint; a server-side fetch has no such restriction).
 *
 * Originally tried IndianAPI (https://indianapi.in), but its stock-data endpoint turned out to be
 * paid-plan-only past a trial. This endpoint needs no API key or account at all — but it's also
 * undocumented and unsupported by Yahoo, not a published/versioned API, so it could change shape
 * or disappear without notice. If the card starts showing "unavailable" consistently, check here
 * first before assuming it's a code bug.
 *
 * Cached briefly in memory (per process) so this hub's own 60s auto-refresh, or a burst of page
 * loads, doesn't hammer Yahoo's endpoint.
 */
const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/EMAMILTD.NS';
const CACHE_TTL_MS = 60 * 1000;
// Yahoo's endpoint 403s a fair number of non-browser User-Agents — a plain desktop Chrome UA
// avoids that without needing anything fancier (no cookies/session required for this endpoint).
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

let cache = null; // { data, fetchedAt } — module-level, shared across requests on this process.

function toNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

async function fetchEmamiQuote() {
    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.data;

    const res = await fetch(`${YAHOO_CHART_URL}?interval=1d&range=1d`, {
        headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) throw new Error(`Yahoo Finance request failed with status ${res.status}`);
    const raw = await res.json();

    const result = raw?.chart?.result?.[0];
    if (!result) throw new Error(raw?.chart?.error?.description || 'No quote data in response.');

    const meta = result.meta || {};
    const price = toNumber(meta.regularMarketPrice);
    const prevClose = toNumber(meta.chartPreviousClose ?? meta.previousClose);
    const changePercent = price != null && prevClose ? ((price - prevClose) / prevClose) * 100 : null;

    const data = {
        companyName: meta.longName || 'Emami Limited',
        exchange: meta.fullExchangeName || meta.exchangeName || 'NSE',
        price,
        changePercent,
        yearHigh: toNumber(meta.fiftyTwoWeekHigh),
        yearLow: toNumber(meta.fiftyTwoWeekLow),
        asOf: new Date().toISOString(),
    };
    cache = { data, fetchedAt: Date.now() };
    return data;
}

const express = require('express');
const router = express.Router();

router.get('/stock/emami', async (req, res) => {
    try {
        const data = await fetchEmamiQuote();
        res.json({ success: true, ...data });
    } catch (err) {
        console.error('[stockQuote] Failed to fetch Emami quote:', err.message);
        res.status(502).json({ success: false, error: 'Could not fetch the live share price right now.' });
    }
});

module.exports = router;
