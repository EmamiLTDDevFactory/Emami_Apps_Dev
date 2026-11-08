/** Packing material budget rate (scenarios, rate / ZBUD / BOM % edits, finalise; PkgScenSet / PkgItemSet / PkgOvrSet / PkgActionSet).
 *  Off = no tile, no request. next.config.mjs maps PKG_BUDGET_ENABLED onto this NEXT_PUBLIC_ name. */
export const PKG_BUDGET_ENABLED = process.env.NEXT_PUBLIC_PKG_BUDGET_ENABLED === 'true';
