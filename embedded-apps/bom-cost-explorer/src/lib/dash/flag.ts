/** Costing dashboard (MIS: COGM budget vs actual by brand; DashMisSet of ZMM_BOM_COST_SRV). Off = no tile, no request.
 *  next.config.mjs maps DASH_ENABLED onto this NEXT_PUBLIC_ name. */
export const DASH_ENABLED = process.env.NEXT_PUBLIC_DASH_ENABLED === 'true';
