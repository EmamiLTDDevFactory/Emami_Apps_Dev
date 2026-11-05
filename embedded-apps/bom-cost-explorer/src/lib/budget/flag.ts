/** Budget costing (FG budget cost, initiate / approve). Off by default; next.config.mjs sets it for the deployed build.
 *  Off = no nav item, no request, and no budget code in any existing bundle (the routes import the screens dynamically only when this is on). */
export const BUDGET_ENABLED = String(process.env.NEXT_PUBLIC_BUDGET_ENABLED ?? 'false').toLowerCase() === 'true';
