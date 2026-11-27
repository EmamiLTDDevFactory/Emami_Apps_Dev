/**
 * Tile (screen) scope of an app grant. A grant is (user, app, role); `authorized_user_apps.tiles` optionally narrows it
 * to a list of screens. NULL = every screen the role normally gets. A list can only NARROW: the app shows a screen
 * only if the role allows it AND the list contains it, so a scope never gives more than the role does.
 *
 * Only apps listed here can carry a scope. The ids are the ones the apps filter their navigation by
 * (bom-cost-explorer: src/lib/nav/sections.ts `tileOf`; payment-tracking: src/lib/tiles.ts); keep the three in step.
 */
const APP_TILES = {
    'bom-cost-explorer': [
        { id: 'mode-B', label: 'BOM costing', group: 'Costing' },
        { id: 'mode-C', label: 'Plant comparison', group: 'Costing' },
        { id: 'mode-R', label: 'Rates', group: 'Analysis' },
        { id: 'mode-F', label: 'Freight per PO', group: 'Analysis' },
        { id: 'mode-M', label: 'Requirement (RM / PM)', group: 'Analysis' },
        { id: 'freight', label: 'Freight comparison', group: 'Analysis' },
        { id: 'freight-analysis', label: 'Freight analysis', group: 'Analysis' },
        { id: 'wac', label: 'Actual vs rate sources', group: 'Analysis' },
        { id: 'psum', label: 'Plant production summary', group: 'Analysis' },
        { id: 'psum-report', label: 'Cost and margin report', group: 'Analysis' },
        { id: 'ck', label: 'Standard cost', group: 'Analysis' },
        { id: 'so', label: 'Sales price', group: 'Analysis' },
        { id: 'dash', label: 'Costing dashboard', group: 'Analysis' },
        { id: 'povar', label: 'Process order variance', group: 'Variance check' },
        { id: 'margin', label: 'Margin (all screens)', group: 'Margin' },
        { id: 'budget', label: 'Budget costing', group: 'Budget' },
        { id: 'budget-rates', label: 'Component rates', group: 'Budget' },
        { id: 'budget-rate-mgmt', label: 'Raw material budget rate', group: 'Budget' },
        { id: 'pkg-budget', label: 'Packing budget rate', group: 'Budget' },
        { id: 'plan', label: 'Production plans (view and upload)', group: 'Production Plan' },
        { id: 'watch', label: 'Cost watch', group: 'Monitoring' },
    ],
    'payment-tracking': [
        { id: 'dashboard', label: 'Dashboard', group: 'Admin' },
        { id: 'provision-details', label: 'Provision Details', group: 'Admin' },
        { id: 'calendar', label: 'Calendar', group: 'Admin' },
        { id: 'po-creation', label: 'Purchase Order Creation and Details', group: 'Finance' },
        { id: 'admin-upcoming', label: 'Upcoming Provision (All Vendors)', group: 'Finance' },
        { id: 'pending-approval', label: 'Pending Approval', group: 'Finance' },
        { id: 'upcoming', label: 'Upcoming Provision', group: 'User' },
        { id: 'missed-delivery', label: 'Missed Provision', group: 'User' },
        { id: 'history', label: 'Submission History', group: 'All roles' },
    ],
};

/** Screens an app can be scoped to, or null if the app has no scope. */
const tilesForApp = (appId) => APP_TILES[appId] || null;

/**
 * Validate a requested scope. Returns { ok, tiles } where tiles is null (no restriction) or a de-duplicated, catalog
 * ordered array; or { ok: false, error }. An empty list is rejected: it would lock the person out of the whole app,
 * which is what revoking the grant is for.
 */
function normalizeTiles(appId, raw) {
    if (raw === undefined || raw === null) return { ok: true, tiles: null };
    const catalog = tilesForApp(appId);
    if (!catalog) return { ok: false, error: 'This app does not support screen-level access.' };
    if (!Array.isArray(raw)) return { ok: false, error: 'tiles must be a list of screen ids.' };
    const ids = new Set(catalog.map((t) => t.id));
    const bad = raw.filter((t) => typeof t !== 'string' || !ids.has(t));
    if (bad.length) return { ok: false, error: `Unknown screen for ${appId}: ${bad.slice(0, 3).map(String).join(', ')}.` };
    const want = new Set(raw);
    if (want.size === 0) return { ok: false, error: 'Pick at least one screen, or clear the screen limit to give the role\'s default screens.' };
    // Every screen picked = no limit at all (stays correct if the app later gains a screen).
    if (want.size === ids.size) return { ok: true, tiles: null };
    return { ok: true, tiles: catalog.map((t) => t.id).filter((id) => want.has(id)) };
}

/** True when the grant's scope (null = all) allows this screen. */
const tileAllowed = (tiles, tileId) => !Array.isArray(tiles) || tiles.includes(tileId);

module.exports = { APP_TILES, tilesForApp, normalizeTiles, tileAllowed };
