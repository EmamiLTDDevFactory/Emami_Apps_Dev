/**
 * Production Plan module switch (build time). Off by default: no nav section, no plan requests, and the
 * existing pages carry no plan code (the plan screens live in their own routes, loaded with dynamic import).
 * next.config.mjs maps PLAN_MODULE_ENABLED onto this NEXT_PUBLIC_ name. Referenced literally so Next.js
 * inlines it and the minifier drops the plan nav when it is off.
 */
export const PLAN_MODULE_ENABLED = process.env.NEXT_PUBLIC_PLAN_MODULE_ENABLED === 'true';
