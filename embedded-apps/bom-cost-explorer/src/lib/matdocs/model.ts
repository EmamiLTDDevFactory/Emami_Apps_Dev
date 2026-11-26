/** Pure helpers of the material documents (no SAP call): filters, the latest-per-type map, the attachment time and the PDF reassembly. */
import { odataString } from '../sap/filter';
import type { MatDocRow, MatDocType } from './fields';

export const strip0 = (m: string) => m.trim().toUpperCase().replace(/^0+/, '');
export interface MatDoc { matnr: string; type: MatDocType; docId: string; title: string; size: number; versions: number; created: string; createdBy: string; maktx: string }
export interface MatDocs { spec?: MatDoc; art?: MatDoc }

/** $filter of a MatDocSet read. Materials go without leading zeros (SAP pads them); up to 18 letters or digits each. */
export function buildMatDocFilter(q: { matnr: string[]; mode?: 'L' | 'V' | 'C'; type?: MatDocType; docId?: string; chunk?: number }): string {
  const m = [...new Set(q.matnr.map(strip0).filter(Boolean))];
  if (!m.length) throw new Error('A material number is needed.');
  if (m.some((x) => !/^[A-Z0-9]{1,18}$/.test(x))) throw new Error('A material number is up to 18 characters.');
  const parts = [m.length === 1 ? `Matnr eq ${odataString(m[0])}` : `(${m.map((x) => `Matnr eq ${odataString(x)}`).join(' or ')})`];
  if (q.mode && q.mode !== 'L') parts.push(`Mode eq ${odataString(q.mode)}`);
  if (q.type) parts.push(`DocType eq ${odataString(q.type)}`);
  if (q.docId !== undefined) {
    if (!/^[A-Z0-9]{1,46}$/i.test(q.docId)) throw new Error('Unknown document.');
    parts.push(`DocId eq ${odataString(q.docId)}`);
  }
  if (q.chunk !== undefined) parts.push(`Chunk eq ${Math.max(0, Math.floor(q.chunk))}`);
  return parts.join(' and ');
}

/** "20261125100622" (UTC, as GOS stores it) -> "2026-11-25 15:36" in India time; '' when unknown. */
export function attachedAt(ts: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec((ts || '').trim());
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) + 330 * 60000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function toDoc(r: MatDocRow): MatDoc | null {
  const type = r.DocType === 'SPEC' || r.DocType === 'ART' ? r.DocType : null;
  if (!type || !r.DocId) return null;
  return { matnr: strip0(r.Matnr), type, docId: r.DocId, title: r.Title, size: r.DocSize, versions: r.Versions || 1, created: attachedAt(r.AttTs) || (r.Crdat ?? ''), createdBy: r.CreatedBy, maktx: r.Maktx };
}

/** Latest rows (Mode L) -> material -> { spec, art }. If SAP sends more than one per type, the newest attachment wins. */
export function parseLatest(rows: MatDocRow[]): Map<string, MatDocs> {
  const out = new Map<string, MatDocs>(); const ts = new Map<string, string>();
  for (const r of rows) {
    const d = toDoc(r); if (!d) continue;
    const k = `${d.matnr}|${d.type}`;
    if (ts.has(k) && (ts.get(k) ?? '') >= (r.AttTs || '')) continue;
    ts.set(k, r.AttTs || '');
    const e = out.get(d.matnr) ?? {};
    if (d.type === 'SPEC') e.spec = d; else e.art = d;
    out.set(d.matnr, e);
  }
  return out;
}

/** Every version (Mode V) of one type, newest first. */
export function parseVersions(rows: MatDocRow[], type: MatDocType): MatDoc[] {
  return rows.filter((r) => r.DocType === type).sort((a, b) => (b.AttTs || '').localeCompare(a.AttTs || '') || b.DocId.localeCompare(a.DocId)).map(toDoc).filter((d): d is MatDoc => !!d);
}

/** base64 chunks (in order) -> the file's bytes. */
export function joinChunks(parts: string[]): Uint8Array<ArrayBuffer> {
  const bins = parts.map((b64) => { const s = atob(b64.replace(/\s+/g, '')); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; });
  const out = new Uint8Array(new ArrayBuffer(bins.reduce((n, b) => n + b.length, 0)));
  let o = 0; for (const b of bins) { out.set(b, o); o += b.length; }
  return out;
}
export const isPdf = (b: Uint8Array) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF
export const sizeText = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n > 0 ? `${Math.max(1, Math.round(n / 1024))} KB` : '');
