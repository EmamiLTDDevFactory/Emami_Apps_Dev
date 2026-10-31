import { readSet, rowMessages, type Read } from '../price-context/odata';
import { CK_FIELDS, CK_NULLABLE, CK_SET, type CkSetKey } from './fields';
import { buildCkFilter, type CkQuery } from './filter';
import type { CkHeaderRow, CkRowsBySet } from './types';

/** Reads one CK13N set, read-only, no time limit. The header's own Msg (e.g. the reconciliation note) becomes a SAP warning. */
export async function fetchCk<K extends CkSetKey>(set: K, q: CkQuery, opts: { signal?: AbortSignal } = {}): Promise<Read<CkRowsBySet[K]>> {
  const $filter = buildCkFilter(q, set); // throws FilterError before any request
  const r = await readSet<CkRowsBySet[K]>(CK_SET[set], CK_FIELDS[set], CK_NULLABLE[set], $filter, opts.signal);
  if (set === 'HEADER') r.messages = rowMessages((r.rows as CkHeaderRow[]).map((h) => h.Msg), r.messages);
  return r;
}
