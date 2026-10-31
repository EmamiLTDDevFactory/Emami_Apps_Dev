/**
 * Plant production summary (Admin of this app only): finished goods produced in a plant over a period, with their actual cost
 * and the component breakup. Behind NEXT_PUBLIC_PSUM_ENABLED (default false; next.config.mjs sets it for deployed builds). Off =
 * no nav item, no page content, no request, and no code in the existing bundles (the route imports the screen dynamically).
 */
export const PSUM_ENABLED = String(process.env.NEXT_PUBLIC_PSUM_ENABLED ?? 'false').toLowerCase() === 'true';
