import { readSet, rowMessages, selectOfMap, type Read } from '../price-context/odata';
import { SO_FIELDS, SO_NULLABLE, SO_SET, type SoSetKey } from './fields';
import { COGM_MAX_MATERIALS, SO_MAX_MATERIALS, buildCogmFilter, buildSoFilter, chunkCodes, type SoFilterSet, type SoQuery } from './filter';
import type { CogmRow, SoPriceRow, SoPricingRow, SoRowsBySet } from './types';

export async function fetchSo<K extends SoFilterSet>(set: K, q: SoQuery, opts: { signal?: AbortSignal; /** narrower $select than the whole field map (optional) */ select?: string } = {}): Promise<Read<SoRowsBySet[K]>> {
  const $filter = buildSoFilter(q, set); // throws FilterError before any request
  // $select on the sets whose property names were seen live on NWP (SoFilterVHSet was not in that capture, so it is read without one).
  const select = opts.select ?? (set === 'FILTER' ? undefined : selectOfMap(SO_FIELDS[set]));
  let r: Read<SoRowsBySet[K]>;
  try {
    r = await readSet<SoRowsBySet[K]>(SO_SET[set], SO_FIELDS[set], SO_NULLABLE[set], $filter, opts.signal, select);
  } catch (e) {
    // A SAP system that does not know OnlyOrd on the sales-area list yet ("Property OnlyOrd not found in type SoAreaVH"): the list is read again without it
    // (every sales area the person may see, the same list the page showed before OnlyOrd existed).
    if (set === 'AREA' && q.onlyOrd && !opts.signal?.aborted && /OnlyOrd/i.test((e as Error).message)) {
      r = await readSet<SoRowsBySet[K]>(SO_SET[set], SO_FIELDS[set], SO_NULLABLE[set], buildSoFilter({ ...q, onlyOrd: false }, set), opts.signal, select);
    } else throw e;
  }
  // OnlyOrd answers nothing when the materials had no order in the look-back (or when there is no material at all: SAP counts orders per material). The sales area is
  // still required to run the report, so the list is read again without OnlyOrd: every sales area the person may see.
  if (set === 'AREA' && q.onlyOrd && r.rows.length === 0 && !opts.signal?.aborted) {
    const hadMaterials = (q.materials ?? []).length > 0;
    r = await readSet<SoRowsBySet[K]>(SO_SET[set], SO_FIELDS[set], SO_NULLABLE[set], buildSoFilter({ ...q, onlyOrd: false }, set), opts.signal, select);
    if (hadMaterials && r.rows.length > 0) r.messages = [...r.messages, { code: '', message: `No sales orders for these materials in the last ${q.daysBack ?? ''} days: every sales area you may see is listed instead.`, severity: 'warning' }];
  }
  if (set === 'PRICE') r.messages = rowMessages((r.rows as SoPriceRow[]).map((x) => (x.Msg && !isUsable(x) ? x.Msg : '')), r.messages);
  return r;
}

/** A price row with Sp = 0 and a message means SAP found no usable order. */
export const isUsable = (r: Pick<SoPriceRow, 'Sp' | 'Msg'>): boolean => !(Number(r.Sp || 0) === 0 && !!r.Msg);

/** SoPriceSet / SoPricingSet for any number of materials: calls of at most 50 materials, one after the other, merged. */
export async function fetchSoMerged<K extends 'PRICE' | 'PRICING'>(set: K, q: SoQuery, opts: { signal?: AbortSignal } = {}): Promise<Read<SoRowsBySet[K]>> {
  const batches = chunkCodes(Array.from(new Set((q.materials ?? []).map((m) => m.trim()).filter(Boolean))), SO_MAX_MATERIALS);
  const out: Read<SoRowsBySet[K]> = { rows: [], messages: [], ms: 0 };
  for (const b of batches) {
    if (opts.signal?.aborted) break;
    const r = await fetchSo(set, { ...q, materials: b }, opts);
    out.rows.push(...r.rows);
    out.ms += r.ms;
    for (const m of r.messages) if (!out.messages.some((x) => x.message === m.message)) out.messages.push(m);
  }
  return out;
}

/** CogmRowSet: live costing, at most 25 finished goods per call (about 10 to 15 s per batch), batches one after the other. */
export async function fetchCogm(q: SoQuery & { materials: string[]; priceDate?: string }, opts: { signal?: AbortSignal; onBatch?: (rows: CogmRow[]) => void } = {}): Promise<Read<CogmRow>> {
  const batches = chunkCodes(Array.from(new Set(q.materials.map((m) => m.trim()).filter(Boolean))), COGM_MAX_MATERIALS);
  const out: Read<CogmRow> = { rows: [], messages: [], ms: 0 };
  for (const b of batches) {
    if (opts.signal?.aborted) break;
    const r = await readSet<CogmRow>(SO_SET.COGM, SO_FIELDS.COGM, SO_NULLABLE.COGM, buildCogmFilter({ ...q, materials: b }), opts.signal);
    out.rows.push(...r.rows);
    out.ms += r.ms;
    out.messages = rowMessages(r.rows.map((x) => x.Msg), [...out.messages, ...r.messages]);
    opts.onBatch?.(out.rows);
  }
  return out;
}

export type { SoSetKey, SoPricingRow };
