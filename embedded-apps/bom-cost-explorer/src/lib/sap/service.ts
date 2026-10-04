import {
  CONFIG, CONFIG_KEYS, COST_LINE, FREIGHT_ROW, MATERIAL, PLANT, RATE_OPTION, RATE_ROW, RMPM_ROW,
  type ConfigRow, type CostLine, type MaterialRow, type PlantRow,
} from './fields';
import { NAV_RATE_OPTIONS } from './entities';
import { SapError, sapGetCollection, type SapGetOptions } from './client';
import { configRequest, costRequest, materialSearchRequest, pagedRequest, plantsRequest } from './requests';
import { normalizeEntity } from './normalize';
import type { SapMessage } from './messages';
import type { CostQuery, Mode } from '../query/schema';

/** Result field map for each mode's entity set (MODE_TO_ENTITY in entities.ts). */
export const MODE_FIELDS = { B: COST_LINE, C: COST_LINE, R: RATE_ROW, F: FREIGHT_ROW, M: RMPM_ROW } as const satisfies Record<Mode, unknown>;

export interface SapResult<T> {
  rows: T[];
  messages: SapMessage[];
  ms: number;
}

/** Mode B / C on CostLineSet. Does not page: the tree needs every row in one go. */
export async function fetchCostLines(q: CostQuery, opts: SapGetOptions): Promise<SapResult<CostLine>> {
  const { entitySet, params } = costRequest(q);
  let r: Awaited<ReturnType<typeof sapGetCollection>>;
  try {
    r = await sapGetCollection(entitySet, params, opts);
  } catch (e) {
    // The live service (NGD, 2026-10-04) answers $expand=RateOptions with 501 "RATEOPTIONSET_GET_ENTITYSET
    // not implemented" until the ABAP side implements the navigation. Cost the lines without
    // rate options rather than failing the whole run, and say so in the warnings panel.
    if (!(e instanceof SapError && e.sapStatus === 501 && params.$expand)) throw e;
    r = await sapGetCollection(entitySet, { ...params, $expand: undefined }, opts);
    r.messages.push({ code: 'BFF/003', severity: 'warning', message: `SAP has not implemented ${NAV_RATE_OPTIONS} yet (${e.message}). Lines are costed, but the rate-option comparison, re-pick what-ifs and savings vs best option are unavailable.` });
  }
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
  const fields = MODE_FIELDS[q.mode];
  const rows: T[] = [];
  const messages: SapMessage[] = [];
  let ms = 0;
  let total: number | null = null;
  for (let skip = 0; skip < MAX_ROWS; skip += PAGE) {
    const { entitySet, params } = pagedRequest(q, PAGE, skip);
    const r = await sapGetCollection(entitySet, params, opts);
    ms += r.ms;
    if (skip === 0) messages.push(...r.messages);
    total = r.count ?? total;
    rows.push(...r.results.map((raw) => normalizeEntity<T>(raw, fields)));
    if (r.results.length < PAGE || (total !== null && rows.length >= total)) break;
  }
  return { rows, messages, ms, truncated: rows.length >= MAX_ROWS };
}

export async function fetchPlants(opts: SapGetOptions = {}): Promise<PlantRow[]> {
  const { entitySet, params } = plantsRequest();
  const r = await sapGetCollection(entitySet, params, opts);
  return r.results.map((raw) => normalizeEntity<PlantRow>(raw, PLANT)).sort((a, b) => a.Werks.localeCompare(b.Werks));
}

/** Type-ahead on MaterialVHSet (?search=, min 2 characters, max 100 rows). */
export async function fetchMaterials(term: string, opts: SapGetOptions = {}): Promise<MaterialRow[]> {
  const req = materialSearchRequest(term);
  if (!req) return [];
  const r = await sapGetCollection(req.entitySet, req.params, opts);
  return r.results.map((raw) => normalizeEntity<MaterialRow>(raw, MATERIAL)).slice(0, 100);
}

/** ConfigItemSet -> { GROUP_CURR, DEFAULT_PRIO, MAX_HEADS } (+ any other keys SAP sends). */
export async function fetchConfig(opts: SapGetOptions = {}): Promise<Record<string, string>> {
  const { entitySet, params } = configRequest();
  const r = await sapGetCollection(entitySet, params, opts);
  const out: Record<string, string> = { [CONFIG_KEYS.GROUP_CURR]: 'INR', [CONFIG_KEYS.DEFAULT_PRIO]: '', [CONFIG_KEYS.MAX_HEADS]: '50' };
  for (const raw of r.results) {
    const c = normalizeEntity<ConfigRow>(raw, CONFIG);
    if (c.CfgKey) out[c.CfgKey] = c.CfgVal;
  }
  return out;
}
