/**
 * AI layer switches and the Groq API key.
 *   NEXT_PUBLIC_AI_ENABLED (default false): off = no AI button, no request, no AI code in the existing bundles.
 *   NEXT_PUBLIC_AI_MASK_VENDORS (default true): vendor names become V1, V2 ... in everything sent to the model.
 * The app is a static site: Groq is called from the browser with the key the person types in on the AI settings screen (kept for this tab, or
 * on this device if they tick "remember"), or through the hub backend proxy (NEXT_PUBLIC_AI_BASE_URL) that holds ONE key on the server
 * (then NEXT_PUBLIC_AI_SERVER_KEY=true and nobody types a key). Never logged, never sent anywhere but Groq.
 *   NEXT_PUBLIC_AI_BASE_URL (default https://api.groq.com/openai/v1)   NEXT_PUBLIC_AI_MODEL_MAIN / _FAST (defaults below, editable on the settings screen)
 */
export const AI_ENABLED = String(process.env.NEXT_PUBLIC_AI_ENABLED ?? 'false').toLowerCase() === 'true';
export const AI_MASK_VENDORS = String(process.env.NEXT_PUBLIC_AI_MASK_VENDORS ?? 'true').toLowerCase() !== 'false';
export const SNAPSHOTS_ENABLED = String(process.env.NEXT_PUBLIC_SNAPSHOTS_ENABLED ?? process.env.NEXT_PUBLIC_AI_ENABLED ?? 'false').toLowerCase() === 'true';

export const AI_BASE_URL = process.env.NEXT_PUBLIC_AI_BASE_URL || 'https://api.groq.com/openai/v1';
/** true = the proxy at AI_BASE_URL holds the key: no key is asked for in the browser. */
export const AI_SERVER_KEY = String(process.env.NEXT_PUBLIC_AI_SERVER_KEY ?? 'false').toLowerCase() === 'true';
export const AI_MODEL_MAIN_DEFAULT = process.env.NEXT_PUBLIC_AI_MODEL_MAIN || 'llama-3.3-70b-versatile';
export const AI_MODEL_FAST_DEFAULT = process.env.NEXT_PUBLIC_AI_MODEL_FAST || 'llama-3.1-8b-instant';
export const AI_MAX_TOOL_CALLS = 8;
export const AI_TIMEOUT_MS = 90_000;
export const AI_RATE_LIMIT_PER_MIN = 20;

const KEY = 'bce:ai:key';
const MODELS = 'bce:ai:models';
const safe = <T>(f: () => T, d: T): T => { try { return f(); } catch { return d; } };

/** A key is available: the one typed in, or the proxy's own (no key needed in the browser). */
export const hasAiAccess = (): boolean => AI_SERVER_KEY || !!getApiKey();
export function getApiKey(): string {
  return safe(() => sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || '', '');
}
export function setApiKey(key: string, remember: boolean) {
  safe(() => {
    sessionStorage.removeItem(KEY); localStorage.removeItem(KEY);
    if (key) (remember ? localStorage : sessionStorage).setItem(KEY, key.trim());
  }, undefined);
}
export const isRemembered = () => safe(() => !!localStorage.getItem(KEY), false);

export interface AiModels { main: string; fast: string }
export function getModels(): AiModels {
  const m = safe(() => JSON.parse(localStorage.getItem(MODELS) || '{}'), {}) as Partial<AiModels>;
  return { main: m.main || AI_MODEL_MAIN_DEFAULT, fast: m.fast || AI_MODEL_FAST_DEFAULT };
}
export function setModels(m: AiModels) { safe(() => localStorage.setItem(MODELS, JSON.stringify(m)), undefined); }
