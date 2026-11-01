/**
 * Margin module (cost simulator): Board, What-if, Alerts, Portfolio, History, Upload. Behind NEXT_PUBLIC_COGM_ENABLED (default false; next.config.mjs
 * sets it for deployed builds). Off = no sidebar group, no page content, no request, and no code in the existing bundles (every route imports its
 * screen dynamically behind a literal check of this variable).
 */
export const COGM_ENABLED = String(process.env.NEXT_PUBLIC_COGM_ENABLED ?? 'false').toLowerCase() === 'true';
/** $select on the Margin sets: off until `npm run check:margin-metadata` has confirmed every property name (SAP rejects a $select of an unknown one). */
export const MARGIN_SELECT = String(process.env.NEXT_PUBLIC_MARGIN_SELECT ?? 'false').toLowerCase() === 'true';
