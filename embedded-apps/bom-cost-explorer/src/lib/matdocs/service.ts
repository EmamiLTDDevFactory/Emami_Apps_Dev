/** Reads of MatDocSet. The latest documents of many materials are batched (one call per 40 materials) and cached for the page session. Read-only. */
import { readSet } from '../price-context/odata';
import { MATDOC_FIELDS, MATDOC_SET, type MatDocRow, type MatDocType } from './fields';
import { buildMatDocFilter, isPdf, joinChunks, parseLatest, parseVersions, strip0, type MatDoc, type MatDocs } from './model';

const NONE: ReadonlySet<string> = new Set();
const read = (f: string, signal?: AbortSignal) => readSet<MatDocRow>(MATDOC_SET, MATDOC_FIELDS, NONE, f, signal);
const BATCH = 40;

// ---- latest documents, batched: every caller in the same tick shares one request per 40 materials
const cache = new Map<string, Promise<MatDocs>>();
let queue: { m: string; res: (d: MatDocs) => void }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
function flush() {
  timer = null;
  const q = queue; queue = [];
  for (let i = 0; i < q.length; i += BATCH) {
    const part = q.slice(i, i + BATCH);
    read(buildMatDocFilter({ matnr: part.map((x) => x.m) }))
      .then((r) => { const map = parseLatest(r.rows); for (const x of part) x.res(map.get(x.m) ?? {}); })
      .catch(() => { for (const x of part) { cache.delete(x.m); x.res({}); } }); // no documents shown on any error
  }
}
/** The latest specification / artwork of a material ({} when none or on any error). Never throws. */
export function latestDocs(matnr: string): Promise<MatDocs> {
  const m = strip0(matnr);
  if (!m || !/^[A-Z0-9]{1,18}$/.test(m)) return Promise.resolve({});
  let p = cache.get(m);
  if (!p) {
    p = new Promise<MatDocs>((res) => { queue.push({ m, res }); if (!timer) timer = setTimeout(flush, 30); });
    cache.set(m, p);
  }
  return p;
}
export const clearMatDocCache = () => cache.clear();

/** Every version of one document type of a material, newest first. */
export async function docVersions(matnr: string, type: MatDocType, signal?: AbortSignal): Promise<MatDoc[]> {
  return parseVersions((await read(buildMatDocFilter({ matnr: [matnr], mode: 'V', type }), signal)).rows, type);
}

/** The PDF of a document, read chunk by chunk (SAP checks the document belongs to the material). */
export async function docPdf(matnr: string, docId: string, signal?: AbortSignal, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const get = async (chunk: number) => {
    const r = (await read(buildMatDocFilter({ matnr: [matnr], mode: 'C', docId, chunk }), signal)).rows[0];
    if (!r) throw new Error('SAP returned no content for this document.');
    if (r.Msg && !r.Content) throw new Error(r.Msg);
    return r;
  };
  const first = await get(0);
  const total = Math.max(1, first.Chunks);
  const parts = [first.Content];
  onProgress?.(1, total);
  for (let i = 1; i < total; i++) { parts.push((await get(i)).Content); onProgress?.(i + 1, total); }
  const bytes = joinChunks(parts);
  if (!bytes.length) throw new Error('The document is empty in SAP.');
  if (!isPdf(bytes)) throw new Error('The attachment is not a readable PDF.');
  return new Blob([bytes], { type: 'application/pdf' });
}
