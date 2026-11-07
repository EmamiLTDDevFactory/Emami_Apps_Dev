/** Budget rate management (history and A/B/C classes, rates and edit, review and approve; BudHistSet / BudRateSet / BudRateSrcSet / BudRateActionSet).
 *  Off = no tile, no request. next.config.mjs maps BUDGET_RATE_MGMT_ENABLED onto this NEXT_PUBLIC_ name. */
export const BUDGET_RATE_MGMT_ENABLED = process.env.NEXT_PUBLIC_BUDGET_RATE_MGMT_ENABLED === 'true';
