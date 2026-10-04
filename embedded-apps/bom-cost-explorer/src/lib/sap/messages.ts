export type Severity = 'error' | 'warning' | 'info' | 'success';
export interface SapMessage {
  code: string;
  message: string;
  severity: Severity;
  target?: string;
}

function sev(v: unknown): Severity {
  const s = String(v ?? '').toLowerCase();
  if (s.startsWith('e') || s === 'abort') return 'error';
  if (s.startsWith('w')) return 'warning';
  if (s.startsWith('s')) return 'success';
  return 'info';
}

function one(m: Record<string, unknown>): SapMessage | null {
  const message = String(m.message ?? m.Message ?? '').trim();
  if (!message) return null;
  return { code: String(m.code ?? ''), message, severity: sev(m.severity), target: m.target ? String(m.target) : undefined };
}

/** The `sap-message` header (Gateway's message container): a JSON object with the leading
 * message and the rest under `details`. Some systems send several headers joined by ", " or
 * escape it; parse whatever is parseable and never throw. */
export function parseSapMessageHeader(header: string | null | undefined): SapMessage[] {
  if (!header) return [];
  const tryParse = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };
  let parsed = tryParse(header);
  if (parsed === undefined) parsed = tryParse(`[${header}]`); // multiple headers joined by ","
  if (parsed === undefined) return [{ code: '', message: header.slice(0, 500), severity: 'warning' }];

  const out: SapMessage[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    const rec = node as Record<string, unknown>;
    const m = one(rec);
    if (m) out.push(m);
    if (Array.isArray(rec.details)) rec.details.forEach(visit);
  };
  visit(parsed);
  // Drop exact duplicates (Gateway repeats the leading message inside details).
  const seen = new Set<string>();
  return out.filter((m) => {
    const k = `${m.severity}|${m.code}|${m.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** OData V2 error body -> the human message (`error.message.value`) plus inner details. */
export function parseODataError(body: unknown, fallback: string): { message: string; details: SapMessage[] } {
  const err = (body as { error?: Record<string, unknown> })?.error;
  if (!err) return { message: fallback, details: [] };
  const msg = err.message as { value?: string } | string | undefined;
  const message = (typeof msg === 'string' ? msg : msg?.value) || fallback;
  const inner = (err.innererror as { errordetails?: unknown[] } | undefined)?.errordetails;
  const details = Array.isArray(inner)
    ? (inner.map((d) => one(d as Record<string, unknown>)).filter(Boolean) as SapMessage[]).filter((d) => d.message !== message)
    : [];
  return { message, details };
}
