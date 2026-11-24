/**
 * Attachments (CPE/Budget documents, IC photos, amount-revision documents).
 * The Azure proxy drops raw bodies, the Slug header and $value, so files travel as base64 text in an ordinary JSON entity:
 *   upload   POST DocXferSet {Doctype, Docid, Category, Filename, DocTitle, Note, Mimetype, Content(base64)}
 *   download GET  DocXferSet?$filter=Doctype eq .. and Docid eq .. and Docseq eq ..  -> Content (base64)
 *   list     GET  DocumentSet?$filter=Doctype eq .. and Docid eq ..                  (metadata only, no bytes)
 * SAP applies the same rules as the Fiori upload (status, one file per fixed slot, size/type limits, plant visibility).
 */
import { create, list, q, ApiError } from './api';

export interface CapexDocument {
  Doctype: string; Docid: string; Docseq: string; Filename: string; Category: string; CategoryText: string;
  DocTitle: string; Note: string; Mimetype: string; Filesize: string; SizeText: string; UploadedBy: string; UploadedByName: string; UploadedOn: string;
}
interface DocXfer { Doctype: string; Docid: string; Docseq: string; Category: string; Filename: string; DocTitle: string; Note: string; Mimetype: string; Content: string }

export const documentsEnabled = (): boolean => true;
/** Kept for screens that still show it; documents are on. */
export const DOCUMENTS_OFF_NOTE = '';
export const DOC_CATEGORIES = ['RFQ1', 'RFQ2', 'RFQ3', 'QUOTE1', 'QUOTE2', 'QUOTE3', 'TCC', 'NEGOTIATION', 'JUSTIFICATION', 'GEN', 'AMT_REV'] as const;
export type DocCategory = (typeof DOC_CATEGORIES)[number];

/** Client-side limits (SAP enforces its own: DOC_MAX_MB / DOC_EXTENSIONS; these mirror the Rev3 defaults so the user is told early). */
export const DOC_MAX_MB = 10;
export const DOC_EXTENSIONS = ['pdf', 'xls', 'xlsx', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'msg', 'zip'];
export const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png'];

/** null = fine, else the message to show. */
export function validateFile(file: File, opts?: { extensions?: string[]; maxMb?: number }): string | null {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const allowed = opts?.extensions ?? DOC_EXTENSIONS;
  if (!allowed.includes(ext)) return `File type .${ext || '?'} is not allowed. Allowed: ${allowed.join(', ')}.`;
  const max = (opts?.maxMb ?? DOC_MAX_MB) * 1024 * 1024;
  if (file.size > max) return `${file.name} is larger than ${opts?.maxMb ?? DOC_MAX_MB} MB.`;
  if (file.size === 0) return `${file.name} is empty.`;
  return null;
}

/** Documents of a record: listDocuments('CPE', 'CPE-2026-0050'). Doctype: BUD, CPE, IC, QUOTA ... */
export async function listDocuments(doctype: string, docid: string): Promise<CapexDocument[]> {
  const { rows } = await list<CapexDocument>('DocumentSet', { $filter: `Doctype eq ${q(doctype)} and Docid eq ${q(docid)}`, $orderby: 'Docseq' });
  return rows;
}

const toBase64 = (file: Blob): Promise<string> => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onerror = () => reject(new ApiError('The file could not be read.', 0));
  r.onload = () => { const s = String(r.result || ''); resolve(s.slice(s.indexOf(',') + 1)); };
  r.readAsDataURL(file);
});

export interface UploadInput { doctype: string; docid: string; category: string; file: File; title?: string; note?: string }
/** Upload one file. A fixed slot (RFQ1, QUOTE1, ...) replaces the previous file of that slot; GEN and AMT_REV accumulate. Throws with SAP's message. */
export async function uploadDocument(i: UploadInput): Promise<CapexDocument> {
  const bad = validateFile(i.file);
  if (bad) throw new ApiError(bad, 400);
  const body = {
    Doctype: i.doctype, Docid: i.docid, Category: i.category, Filename: i.file.name,
    DocTitle: (i.title || i.file.name).slice(0, 120), Note: (i.note || '').slice(0, 255),
    Mimetype: i.file.type || 'application/octet-stream', Content: await toBase64(i.file),
  };
  const r = await create<DocXfer>('DocXferSet', body);
  return { ...r, Docseq: r.Docseq, Doctype: r.Doctype, Docid: i.docid, Filename: i.file.name, Category: i.category, DocTitle: body.DocTitle, Note: body.Note, Mimetype: body.Mimetype } as unknown as CapexDocument;
}

/** The file's bytes as a Blob (for preview or save). */
export async function downloadDocument(d: Pick<CapexDocument, 'Doctype' | 'Docid' | 'Docseq' | 'Mimetype'>): Promise<Blob> {
  const { rows } = await list<DocXfer>('DocXferSet', { $filter: `Doctype eq ${q(d.Doctype)} and Docid eq ${q(d.Docid)} and Docseq eq ${q(d.Docseq)}` });
  const content = rows[0]?.Content;
  if (!content) throw new ApiError('The document could not be found, or you may not open it.', 404);
  const bin = atob(content);
  const bytes = new Uint8Array(bin.length);
  for (let n = 0; n < bin.length; n++) bytes[n] = bin.charCodeAt(n);
  return new Blob([bytes], { type: rows[0].Mimetype || d.Mimetype || 'application/octet-stream' });
}

/** Open in a new tab (PDF / images preview in the browser). */
export async function openDocument(d: CapexDocument): Promise<void> {
  const url = URL.createObjectURL(await downloadDocument(d));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
/** Save to disk. */
export async function saveDocument(d: CapexDocument): Promise<void> {
  const url = URL.createObjectURL(await downloadDocument(d));
  const a = document.createElement('a');
  a.href = url; a.download = d.Filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
