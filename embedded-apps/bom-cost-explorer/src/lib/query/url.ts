import { costQuerySchema, defaultQuery, type CostQuery } from './schema';

/** Query <-> URL. Only values that differ from the defaults are written, as compact JSON in
 * base64url, so a shared link stays short and survives every chat/mail client. */
export function encodeQuery(q: CostQuery): string {
  const def = defaultQuery(q.mode) as Record<string, unknown>;
  const diff: Record<string, unknown> = { mode: q.mode };
  for (const [k, v] of Object.entries(q)) if (JSON.stringify(v) !== JSON.stringify(def[k])) diff[k] = v;
  const json = JSON.stringify(diff);
  const b64 = typeof window === 'undefined' ? Buffer.from(json, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Returns null when the string is not a valid encoded query (never throws). The result is
 * validated loosely: per-mode rules (e.g. "pick a plant") are left to the form. */
export function decodeQuery(s: string | null | undefined): CostQuery | null {
  if (!s) return null;
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof window === 'undefined' ? Buffer.from(b64, 'base64').toString('utf8') : decodeURIComponent(escape(atob(b64)));
    const raw = JSON.parse(json) as Partial<CostQuery>;
    const merged = { ...defaultQuery(raw.mode ?? 'B'), ...raw };
    const r = costQuerySchema.innerType().safeParse(merged);
    return r.success ? (r.data as CostQuery) : null;
  } catch {
    return null;
  }
}
