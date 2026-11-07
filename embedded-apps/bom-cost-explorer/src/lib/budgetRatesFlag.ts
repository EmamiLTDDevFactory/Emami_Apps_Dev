/** Budget component rates (BudCompSet / BudCompNSet / BudUploadSet: analysis + Excel upload). Separate from BUDGET_ENABLED (FG budget costing).
 *  Off = no tile, no request. next.config.mjs maps BUDGET_RATES_ENABLED onto this NEXT_PUBLIC_ name. */
export const BUDGET_RATES_ENABLED = process.env.NEXT_PUBLIC_BUDGET_RATES_ENABLED === 'true';
