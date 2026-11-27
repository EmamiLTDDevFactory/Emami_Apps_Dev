/** Variance check (PoVarSet of ZMM_BOM_COST_SRV: ZMM_PCOST order summary + ZMM_COST component breakup). Off = no tab, no request.
 *  next.config.mjs maps POVAR_ENABLED onto this NEXT_PUBLIC_ name. */
export const POVAR_ENABLED = process.env.NEXT_PUBLIC_POVAR_ENABLED === 'true';
/** The user's own rule: an order is looked at when its cost per piece is more than 4 % away from the standard. Editable on screen. */
export const DEFAULT_VAR_PCT = 4;
