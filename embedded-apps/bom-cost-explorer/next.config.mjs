/**
 * Static export, merged into the hub's dist/ at /apps/bom-cost-explorer by the repo's
 * scripts/build-embedded-apps.js like every sibling embedded app. There is no server: the browser
 * calls the Azure SAP gateway directly (see src/lib/sap/config.ts).
 *
 * @type {import('next').NextConfig}
 */
const basePath = '/apps/bom-cost-explorer';

// SAP system of the DEPLOYED app (Amplify runs `next build`). This repo (DEV, dev.emamiapps.in) uses
// NGQ / qa; the PRD copy in Emami_Apps_New sets NWP / production (the config guard only allows NWP with
// APP_ENV=production, and the header badge turns red). `next dev` and the tests are not affected (they
// stay on NGD / the mock). An explicit NEXT_PUBLIC_SAP_SYSTEM / NEXT_PUBLIC_APP_ENV still wins.
const isBuild = process.env.NODE_ENV === 'production';
const DEPLOYED_SAP_SYSTEM = 'NGQ';
const DEPLOYED_APP_ENV = 'qa';
// Production Plan module: ON for the deployed DEV build (user's request, 2026-10-13). The PRD copy keeps it
// off. `next dev` and the tests stay off unless PLAN_MODULE_ENABLED is set.
const DEPLOYED_PLAN_MODULE = 'true';
// AI layer (explain change, costing assistant): on for the deployed DEV build so it can be tried; off elsewhere unless
// AI_ENABLED / NEXT_PUBLIC_AI_ENABLED is set. Each user types their own Claude API key on the AI settings screen.
const DEPLOYED_AI_ENABLED = 'true';
// Daily cost watch pages (backend: hub backend /api/me/cost-watch). WATCH_ENABLED / NEXT_PUBLIC_WATCH_ENABLED win.
const DEPLOYED_WATCH_ENABLED = 'true';
// Plant-wide costing (one plant + Materials empty = all its header materials, batched, no time limit). Code default off.
const DEPLOYED_PLANT_WIDE_ENABLED = 'true';
// Actual vs rate sources (weighted average actual cost vs the other rate sources; ZMM_BOM_COST_SRV Wac* sets, live on NWP only).
// On for deployed builds. The Wac sets answer on NGD, NGQ and NWP. WAC_ENABLED / NEXT_PUBLIC_WAC_ENABLED win.
const DEPLOYED_WAC_ENABLED = 'true';
// Standard cost (CK13N), Sales price + Compare with cost, Price context: on for deployed builds; the Ck / So / Cogm sets may not be published on
// every SAP system yet (the screens then show SAP's not-found message). CK_ENABLED / COGM_SO_ENABLED / PRICE_CONTEXT_ENABLED (or the NEXT_PUBLIC_ names) win.
const DEPLOYED_CK_ENABLED = 'true';
const DEPLOYED_COGM_SO_ENABLED = 'true';
const DEPLOYED_PRICE_CONTEXT_ENABLED = 'true';
// Plant production summary (FGs produced by plant and period, actual cost split, component breakup, monthly trend; built on the Wac sets).
// PSUM_ENABLED / NEXT_PUBLIC_PSUM_ENABLED win.
const DEPLOYED_PSUM_ENABLED = 'true';
// All costs on BOM costing (actual rate, BOM source and the extra cost columns). ALL_COSTS_ENABLED / NEXT_PUBLIC_ALL_COSTS_ENABLED win.
const DEPLOYED_ALL_COSTS_ENABLED = 'true';
// Margin module (cost simulator: Board, What-if, Alerts, Portfolio, History, Upload; ZMM_BOM_COST_SRV Cogm* sets). COGM_ENABLED / NEXT_PUBLIC_COGM_ENABLED win.
const DEPLOYED_COGM_ENABLED = 'true';
const pick = (k, d = '') => process.env[`NEXT_PUBLIC_${k}`] ?? process.env[k] ?? d;
const sapEnv = isBuild
  ? {
      NEXT_PUBLIC_SAP_SYSTEM: process.env.NEXT_PUBLIC_SAP_SYSTEM || DEPLOYED_SAP_SYSTEM,
      NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV || DEPLOYED_APP_ENV,
    }
  : {};

const nextConfig = {
  // The built-in mock SAP only exists in local mock builds (npm run dev:mock / tests).
  webpack(config, { webpack }) {
    if (process.env.NEXT_PUBLIC_MOCK_SAP !== 'true') {
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(/[\\/]mock[\\/]sap$/, (r) => { r.request = r.request.replace(/sap$/, 'stub'); }));
    }
    return config;
  },
  output: 'export',
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  // Production Plan module: PLAN_MODULE_ENABLED / NEXT_PUBLIC_PLAN_MODULE_ENABLED win; else on for deployed DEV builds.
  env: { NEXT_PUBLIC_BASE_PATH: basePath, ...sapEnv,
    // RateOptionSet CHAR1 flags: 'string' (default, 'X' / '') or 'boolean' (lib/rates/optionFilter.ts).
    NEXT_PUBLIC_RATEOPTION_BOOL_STYLE: process.env.RATEOPTION_BOOL_STYLE || process.env.NEXT_PUBLIC_RATEOPTION_BOOL_STYLE || 'string', NEXT_PUBLIC_PLAN_MODULE_ENABLED: process.env.NEXT_PUBLIC_PLAN_MODULE_ENABLED || process.env.PLAN_MODULE_ENABLED || (isBuild ? DEPLOYED_PLAN_MODULE : 'false'),
    NEXT_PUBLIC_AI_ENABLED: process.env.NEXT_PUBLIC_AI_ENABLED || process.env.AI_ENABLED || (isBuild ? DEPLOYED_AI_ENABLED : 'false'),
    NEXT_PUBLIC_WATCH_ENABLED: process.env.NEXT_PUBLIC_WATCH_ENABLED || process.env.WATCH_ENABLED || (isBuild ? DEPLOYED_WATCH_ENABLED : 'false'),
    NEXT_PUBLIC_WAC_ENABLED: pick('WAC_ENABLED') || (isBuild ? DEPLOYED_WAC_ENABLED : 'false'), NEXT_PUBLIC_WAC_RECON_WARN_PCT: pick('WAC_RECON_WARN_PCT', '2'),
    NEXT_PUBLIC_CK_ENABLED: pick('CK_ENABLED') || (isBuild ? DEPLOYED_CK_ENABLED : 'false'), NEXT_PUBLIC_COGM_SO_ENABLED: pick('COGM_SO_ENABLED') || (isBuild ? DEPLOYED_COGM_SO_ENABLED : 'false'),
    NEXT_PUBLIC_PRICE_CONTEXT_ENABLED: pick('PRICE_CONTEXT_ENABLED') || (isBuild ? DEPLOYED_PRICE_CONTEXT_ENABLED : 'false'), NEXT_PUBLIC_SO_STALE_DAYS: pick('SO_STALE_DAYS', '60'),
    NEXT_PUBLIC_ALL_COSTS_ENABLED: pick('ALL_COSTS_ENABLED') || (isBuild ? DEPLOYED_ALL_COSTS_ENABLED : 'false'),
    NEXT_PUBLIC_COGM_ENABLED: pick('COGM_ENABLED') || (isBuild ? DEPLOYED_COGM_ENABLED : 'false'), NEXT_PUBLIC_MARGIN_SELECT: pick('MARGIN_SELECT') || 'false',
    NEXT_PUBLIC_PSUM_ENABLED: pick('PSUM_ENABLED') || (isBuild ? DEPLOYED_PSUM_ENABLED : 'false'),
    NEXT_PUBLIC_PLANT_WIDE_ENABLED: pick('PLANT_WIDE_ENABLED') || (isBuild ? DEPLOYED_PLANT_WIDE_ENABLED : 'false'),
    NEXT_PUBLIC_VH_CAP: pick('VH_CAP', '500'), NEXT_PUBLIC_PLANT_WIDE_BATCH: pick('PLANT_WIDE_BATCH', '25'), NEXT_PUBLIC_PLANT_WIDE_MTART: pick('PLANT_WIDE_MTART', 'FERT'),
    NEXT_PUBLIC_PLANT_WIDE_MAX_CONCURRENCY: pick('PLANT_WIDE_MAX_CONCURRENCY', '1'), NEXT_PUBLIC_PLANT_WIDE_CONFIRM_ABOVE: pick('PLANT_WIDE_CONFIRM_ABOVE', '0'),
    // Cascade picker material filters: new (Zbrand / Zsku, default) or legacy (Zbrandcode / Zskugrcodecrs) - rollback switch.
    NEXT_PUBLIC_CASCADE_FIELDS: pick('CASCADE_FIELDS', 'new') },
};

export default nextConfig;
