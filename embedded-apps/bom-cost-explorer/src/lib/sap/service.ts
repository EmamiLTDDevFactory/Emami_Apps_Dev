import {
  CONFIG, COST_LINE, ENTITY_SETS, FREIGHT_ROW, MATERIAL, NAV_RATE_OPTIONS, PLANT, RATE_OPTION, RATE_ROW, RMPM_ROW,
  type ConfigRow, type CostLine, type MaterialRow, type PlantRow,
} from './fields';
import { sapGetCollection, type SapGetOptions } from './client';
import { buildSelectionFilter, odataString } from './filter';
import { normalizeEntity } from './normalize';
import type { SapMessage } from './messages';
import type { CostQuery, Mode } from '../query/schema';

/** Entity set + field map for each mode. */
export const MODE_SET = {
  B: { set: ENTITY_SETS.CostLines, fields: COST_LINE },
  C: { set: ENTITY_SETS.CostLines, fields: COST_LINE },
  R: { set: ENTITY_SETS.Rates, fields: RATE_ROW },
  F: { set: ENTITY_SETS.Freight, fields: FREIGHT_ROW },
  M: { set: ENTITY_SETS.RmPm, fields: RMPM_ROW },
} as const satisfies Record<Mode, unknown>;

export interface SapResult<T> {
  rows: T[];
  messages: SapMessage[];
  ms: number;
}

/** Mode B / C. CostLines does not page: the tree needs every row in one go. */
export async function fetchCostLines(q: CostQuery, opts: SapGetOptions): Promise<SapResult<CostLine>> {
  const r = await sapGetCollection(ENTITY_SETS.CostLines, { $filter: buildSelectionFilter(q), $expand: q.mode === 'B' || q.mode === 'C' ? NAV_RATE_OPTIONS : undefined }, opts);
  const rows = r.results.map((raw) => normalizeEntity<CostLine>(raw, COST_LINE, { [NAV_RATE_OPTIONS]: RATE_OPTION }));
  // SAP returns depth-first order; Seqnr makes it explicit, so never trust transport order.
  rows.sort((a, b) => a.Seqnr - b.Seqnr);
  return { rows, messages: r.messages, ms: r.ms };
}

const PAGE = 5000;
const MAX_ROWS = 200_000;

/** Mode R / F / M: pages through SAP with $top/$skip/$inlinecount until it has everything, so the
 * BFF can sort, search and total across the whole result (SAP doesn't promise $orderby here). */
export async function fetchPagedSet<T>(q: CostQuery, opts: SapGetOptions): Promise<SapResult<T> & { truncated: boolean }> {
  const { set, fields } = MODE_SET[q.mode];
  const $filter = buildSelectionFilter(q);
  const rows: T[] = [];
  const messages: SapMessage[] = [];
  let ms = 0;
  let total: number | null = null;
  for (let skip = 0; skip < MAX_ROWS; skip += PAGE) {
    const r = await sapGetCollection(set, { $filter, $top: String(PAGE), $skip: String(skip), $inlinecount: 'allpages' }, opts);
    ms += r.ms;
    if (skip === 0) messages.push(...r.messages);
    total = r.count ?? total;
    rows.push(...r.results.map((raw) => normalizeEntity<T>(raw, fields)));
    if (r.results.length < PAGE || (total !== null && rows.length >= total)) break;
  }
  return { rows, messages, ms, truncated: rows.length >= MAX_ROWS };
}

export async function fetchPlants(opts: SapGetOptions = {}): Promise<PlantRow[]> {
  const r = await sapGetCollection(ENTITY_SETS.Plants, {}, opts);
  return r.results.map((raw) => normalizeEntity<PlantRow>(raw, PLANT)).sort((a, b) => a.Werks.localeCompare(b.Werks));
}

/** Type-ahead. Gateway V2 takes the free-text search as the `search` custom option; a code-like
 * term is also matched exactly so pasting a material number always finds it. */
export async function fetchMaterials(term: string, opts: SapGetOptions = {}): Promise<MaterialRow[]> {
  const t = term.trim();
  if (!t) return [];
  const r = await sapGetCollection(ENTITY_SETS.Materials, { search: t, $top: '100' }, opts);
  return r.results.map((raw) => normalizeEntity<MaterialRow>(raw, MATERIAL));
}

export async function fetchMaterialsByNumber(numbers: string[], opts: SapGetOptions = {}): Promise<MaterialRow[]> {
  if (!numbers.length) return [];
  const $filter = numbers.slice(0, 50).map((n) => `${MATERIAL.Matnr[0]} eq ${odataString(n)}`).join(' or ');
  const r = await sapGetCollection(ENTITY_SETS.Materials, { $filter, $top: '100' }, opts);
  return r.results.map((raw) => normalizeEntity<MaterialRow>(raw, MATERIAL));
}

export async function fetchConfig(opts: SapGetOptions = {}): Promise<Record<string, string>> {
  const r = await sapGetCollection(ENTITY_SETS.Config, {}, opts);
  const out: Record<string, string> = {};
  for (const raw of r.results) {
    const c = normalizeEntity<ConfigRow>(raw, CONFIG);
    out[c.CfgKey] = c.CfgVal;
  }
  return out;
}
