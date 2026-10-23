/**
 * AI layer switches and the user's Claude API key.
 *   NEXT_PUBLIC_AI_ENABLED (default false): off = no AI button, no request, no AI code in the existing bundles.
 *   NEXT_PUBLIC_AI_MASK_VENDORS (default true): vendor names become V1, V2 ... in everything sent to the model.
 * The app is a static site: Claude is called from the browser with the key the person types in on the AI settings
 * screen (kept for this tab, or on this device if they tick "remember"). Never logged, never sent anywhere but Anthropic.
 */
export const AI_ENABLED = String(process.env.NEXT_PUBLIC_AI_ENABLED ?? 'false').toLowerCase() === 'true';
export const AI_MASK_VENDORS = String(process.env.NEXT_PUBLIC_AI_MASK_VENDORS ?? 'true').toLowerCase() !== 'false';
export const SNAPSHOTS_ENABLED = String(process.env.NEXT_PUBLIC_SNAPSHOTS_ENABLED ?? process.env.NEXT_PUBLIC_AI_ENABLED ?? 'false').toLowerCase() === 'true';

export const AI_MODEL_MAIN_DEFAULT = 'claude-sonnet-5-5';
export const AI_MODEL_FAST_DEFAULT = 'claude-haiku-5-5';
export const AI_MAX_TOOL_CALLS = 8;
export const AI_TIMEOUT_MS = 90_000;
export const AI_RATE_LIMIT_PER_MIN = 20;

const KEY = 'bce:ai:key';
const MODELS = 'bce:ai:models';
const safe = <T>(f: () => T, d: T): T => { try { return f(); } catch { return d; } };

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
