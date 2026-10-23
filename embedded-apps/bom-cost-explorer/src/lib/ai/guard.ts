/**
 * Small guards around every model call: per-minute rate limit, vendor masking, and a local audit trail.
 * Audit (localStorage ring of 200): user, time, feature, question, tools + parameters, tokens, validator result, template
 * used, ms. Never full SAP results, never the API key.
 */
import { AI_MASK_VENDORS, AI_RATE_LIMIT_PER_MIN } from './config';

const calls: number[] = [];
export class RateLimitError extends Error {}
export function checkRateLimit(now = Date.now(), limit = AI_RATE_LIMIT_PER_MIN) {
  while (calls.length && now - calls[0] > 60_000) calls.shift();
  if (calls.length >= limit) throw new RateLimitError(`Limit of ${limit} AI requests a minute reached. Wait a moment.`);
  calls.push(now);
}
export const resetRateLimit = () => { calls.length = 0; };

/** Replaces vendor names by V1, V2 ... (stable per masker). unmask() is for display only. */
export class VendorMask {
  private map = new Map<string, string>();
  constructor(private on = AI_MASK_VENDORS) {}
  mask(name: string | null | undefined): string {
    const n = String(name ?? '').trim();
    if (!this.on || !n) return n;
    let v = this.map.get(n);
    if (!v) { v = `V${this.map.size + 1}`; this.map.set(n, v); }
    return v;
  }
  unmask(text: string): string {
    let t = text;
    for (const [name, v] of this.map) t = t.replace(new RegExp(`\\b${v}\\b`, 'g'), name);
    return t;
  }
}

export interface AuditEntry { ts: string; user: string; feature: string; question: string; tools: { name: string; input: unknown; ms: number }[]; inputTokens: number; outputTokens: number; validatorOk: boolean | null; templateUsed: boolean; ms: number; model: string; system: string }
const AUDIT = 'bce:ai:audit';
export function audit(e: AuditEntry) {
  try {
    const list = JSON.parse(localStorage.getItem(AUDIT) || '[]') as AuditEntry[];
    list.push({ ...e, question: e.question.slice(0, 500) });
    localStorage.setItem(AUDIT, JSON.stringify(list.slice(-200)));
  } catch { /* storage blocked: audit is best effort */ }
}
export function readAudit(): AuditEntry[] { try { return JSON.parse(localStorage.getItem(AUDIT) || '[]'); } catch { return []; } }
