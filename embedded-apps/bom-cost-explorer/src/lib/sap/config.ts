/**
 * SAP connection config, validated with zod (fail fast, readable message).
 *
 * The browser calls the Azure SAP gateway directly (same as PO Deviation / Market Rate - no
 * server in between):  SAP_BASE_URL = `${SAP_GATEWAY_HOST}/api/${SAP_SYSTEM}/${SAP_SERVICE}`.
 *
 * Values come from build-time NEXT_PUBLIC_* variables (browser) or the plain SAP_* names (node
 * scripts such as check:metadata). When SAP_SYSTEM / APP_ENV are not set they follow the hostname,
 * like every sibling app: dev.* -> NGD/development, *qa* -> NGQ/qa, www/apex -> NWP/production,
 * localhost -> NGD/development.
 *
 * Safety guards: NWP only with APP_ENV=production and production only with NWP; read-only (GET).
 */
import { z } from 'zod';

export const SYSTEMS = ['NGD', 'NGQ', 'NWP'] as const;
export type SapSystem = (typeof SYSTEMS)[number];
export const APP_ENVS = ['development', 'qa', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

const DEFAULT_GATEWAY = 'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net';

// NEXT_PUBLIC_* are referenced LITERALLY so Next inlines them into the browser bundle (there is
// no `process` object in the browser). The plain SAP_* names are read only in node (scripts, tests);
// credentials exist only there, never as NEXT_PUBLIC_.
const nodeEnv = (k: string): string | undefined => (typeof window === 'undefined' && typeof process !== 'undefined' ? process.env[k] : undefined);

function rawEnv() {
  return {
    gatewayHost: process.env.NEXT_PUBLIC_SAP_GATEWAY_HOST || nodeEnv('SAP_GATEWAY_HOST'),
    system: process.env.NEXT_PUBLIC_SAP_SYSTEM || nodeEnv('SAP_SYSTEM'),
    service: process.env.NEXT_PUBLIC_SAP_SERVICE || nodeEnv('SAP_SERVICE'),
    appEnv: process.env.NEXT_PUBLIC_APP_ENV || nodeEnv('APP_ENV'),
    authMode: process.env.NEXT_PUBLIC_SAP_AUTH_MODE || nodeEnv('SAP_AUTH_MODE'),
    client: process.env.NEXT_PUBLIC_SAP_CLIENT || nodeEnv('SAP_CLIENT'),
    timeoutMs: process.env.NEXT_PUBLIC_SAP_TIMEOUT_MS || nodeEnv('SAP_TIMEOUT_MS'),
    expand: process.env.NEXT_PUBLIC_SAP_EXPAND_RATE_OPTIONS || nodeEnv('SAP_EXPAND_RATE_OPTIONS'),
    mock: process.env.NEXT_PUBLIC_MOCK_SAP || nodeEnv('MOCK_SAP'),
    authUser: nodeEnv('SAP_AUTH_USER'),
    authPassword: nodeEnv('SAP_AUTH_PASSWORD'),
    authToken: nodeEnv('SAP_AUTH_TOKEN'),
    authHeaderName: nodeEnv('SAP_AUTH_HEADER_NAME'),
    authHeaderValue: nodeEnv('SAP_AUTH_HEADER_VALUE'),
  };
}

/** System + app environment from the hostname when not configured explicitly. */
export function defaultsForHost(host: string): { system: SapSystem; appEnv: AppEnv } {
  const h = host.toLowerCase();
  if (!h || h === 'localhost' || h === '127.0.0.1' || h.startsWith('dev.') || h.includes('dev')) return { system: 'NGD', appEnv: 'development' };
  if (h.includes('qa')) return { system: 'NGQ', appEnv: 'qa' };
  return { system: 'NWP', appEnv: 'production' };
}

const schema = z
  .object({
    gatewayHost: z.string().url('SAP_GATEWAY_HOST must be a URL like https://<host>').transform((s) => s.replace(/\/+$/, '')),
    system: z.enum(SYSTEMS, { errorMap: () => ({ message: 'SAP_SYSTEM must be NGD, NGQ or NWP' }) }),
    service: z.string().regex(/^[A-Z0-9_/]+$/i, 'SAP_SERVICE must be an OData service name, e.g. ZMM_BOM_COST_SRV'),
    appEnv: z.enum(APP_ENVS, { errorMap: () => ({ message: 'APP_ENV must be development, qa or production' }) }),
    authMode: z.enum(['none', 'basic', 'bearer', 'apikey'], { errorMap: () => ({ message: 'SAP_AUTH_MODE must be none, basic, bearer or apikey' }) }),
    client: z.string().regex(/^\d{3}$/, 'SAP_CLIENT must be 3 digits').optional(),
    timeoutMs: z.coerce.number().int().min(5_000).max(300_000),
    expand: z.enum(['auto', 'on', 'off'], { errorMap: () => ({ message: 'SAP_EXPAND_RATE_OPTIONS must be auto, on or off' }) }),
    mock: z.boolean(),
    authUser: z.string().optional(),
    authPassword: z.string().optional(),
    authToken: z.string().optional(),
    authHeaderName: z.string().optional(),
    authHeaderValue: z.string().optional(),
  })
  .superRefine((c, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (c.system === 'NWP' && c.appEnv !== 'production') fail(`Refusing SAP_SYSTEM=NWP (production SAP) with APP_ENV=${c.appEnv}. Use APP_ENV=production, or NGD / NGQ.`);
    if (c.appEnv === 'production' && c.system !== 'NWP') fail(`Refusing APP_ENV=production with SAP_SYSTEM=${c.system}. Production must use NWP.`);
    if (typeof window !== 'undefined' && c.authMode !== 'none')
      fail(`SAP_AUTH_MODE=${c.authMode} is not allowed in the browser: credentials would be shipped to every user. The Azure gateway is called without credentials (SAP_AUTH_MODE=none).`);
    if (c.authMode === 'basic' && !c.authUser) fail('SAP_AUTH_MODE=basic needs SAP_AUTH_USER / SAP_AUTH_PASSWORD');
    if (c.authMode === 'bearer' && !c.authToken) fail('SAP_AUTH_MODE=bearer needs SAP_AUTH_TOKEN');
    if (c.authMode === 'apikey' && !(c.authHeaderName && c.authHeaderValue)) fail('SAP_AUTH_MODE=apikey needs SAP_AUTH_HEADER_NAME / SAP_AUTH_HEADER_VALUE');
  });

export type SapConfig = z.infer<typeof schema> & { baseUrl: string };

export type ConfigResult = { ok: true; config: SapConfig } | { ok: false; error: string };

let cached: ConfigResult | null = null;

export function loadSapConfig(host = typeof window !== 'undefined' ? window.location.hostname : ''): ConfigResult {
  if (cached) return cached;
  const r = rawEnv();
  const def = defaultsForHost(host);
  const parsed = schema.safeParse({
    gatewayHost: r.gatewayHost || DEFAULT_GATEWAY,
    system: (r.system || def.system).toUpperCase(),
    service: r.service || 'ZMM_BOM_COST_SRV',
    appEnv: (r.appEnv || def.appEnv).toLowerCase(),
    authMode: (r.authMode || 'none').toLowerCase(),
    client: r.client || undefined,
    timeoutMs: r.timeoutMs || 230_000, // the Azure gateway's limit (client.ts SAP_MAX_TIMEOUT_MS)
    expand: (r.expand || 'auto').toLowerCase(),
    mock: String(r.mock).toLowerCase() === 'true',
    authUser: r.authUser,
    authPassword: r.authPassword,
    authToken: r.authToken,
    authHeaderName: r.authHeaderName,
    authHeaderValue: r.authHeaderValue,
  });
  if (!parsed.success) {
    cached = { ok: false, error: `SAP connection is misconfigured: ${parsed.error.issues.map((i) => i.message).join(' · ')}` };
    console.error(`[sap] ${cached.error}`);
    return cached;
  }
  const c = parsed.data;
  const config: SapConfig = { ...c, baseUrl: c.mock ? `http://mock-sap.local/api/${c.system}/${c.service}` : `${c.gatewayHost}/api/${c.system}/${c.service}` };
  console.info(`[sap] system=${config.system} appEnv=${config.appEnv} service=${config.service} auth=${config.authMode} expand=${config.expand}${config.mock ? ' MOCK' : ''}`);
  cached = { ok: true, config };
  return cached;
}

/** Throws with the readable message when the config is invalid. */
export function sapConfig(): SapConfig {
  const r = loadSapConfig();
  if (!r.ok) throw new Error(r.error);
  return r.config;
}

/** For tests: forget the cached config (env changed). */
export function resetSapConfig() {
  cached = null;
}
