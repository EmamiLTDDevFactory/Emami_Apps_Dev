/**
 * "Actual vs rate sources" (weighted average actual cost against the other rate sources). Behind
 * NEXT_PUBLIC_WAC_ENABLED (default false; next.config.mjs sets it for the deployed build). Off = no nav item,
 * no page content, no request, and no WAC code in the existing bundles (the route imports the screen
 * dynamically only when this is on).
 */
export const WAC_ENABLED = String(process.env.NEXT_PUBLIC_WAC_ENABLED ?? 'false').toLowerCase() === 'true';

/** Data-quality icon: ActRecon (landed - material - conversion) above this % of ActLanded. Default 2. */
export const WAC_RECON_WARN_PCT = (() => {
  const n = Number(process.env.NEXT_PUBLIC_WAC_RECON_WARN_PCT);
  return Number.isFinite(n) && n > 0 ? n : 2;
})();

/** The sidebar item shows only when the feature is on AND the person is an Admin of this app. */
export const wacNavVisible = (enabled: boolean, isAdmin: boolean): boolean => enabled && isAdmin;
