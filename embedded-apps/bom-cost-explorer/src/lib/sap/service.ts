import {
  CONFIG, CONFIG_KEYS, COST_LINE, FREIGHT_ROW, MATERIAL, PLANT, RATE_OPTION, RATE_ROW, RMPM_ROW,
  type ConfigRow, type CostLine, type MaterialRow, type PlantRow,
  MATERIAL_HIERARCHY, type MaterialHierarchyRow,
} from './fields';
import { NAV_RATE_OPTIONS } from './entities';
import { sapConfig } from './config';
import { type ExpandCapability } from './capability';
import { getRatesCapability } from '../rates/capability';
import { SapError, sapGetCollection, type SapGetOptions } from './client';
import { configRequest, costRequest, materialHierarchyRequest, materialSearchRequest, pagedRequest, plantsRequest } from './requests';
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

/** A failed $expand=RateOptions: the navigation isn't implemented on the SAP side yet. */
export const EXPAND_UNSUPPORTED = /RATEOPTIONSET|not implemented|501|navigation/i;
export function isExpandUnsupported(e: unknown): boolean {
  if (!(e instanceof SapError) || e.kind === 'aborted' || e.kind === 'timeout' || e.kind === 'config' || e.kind === 'network') return false;
  return e.sapStatus === 501 || EXPAND_UNSUPPORTED.test(`${e.message} ${e.details.map((d) => d.message).join(' ')}`);
}

export interface CostLinesResult extends SapResult<CostLine> {
  /** RateOptions came back expanded on every line */
  rateOptions: boolean;
  /** expand capability of this SAP system after the run */
  capability: ExpandCapability;
  sapMessageHeader: boolean;
}

/**
* Mode B / C on CostLineSet. Does not page: the tree needs every row in one go.
 * Exactly ONE SAP run per call: never $expand, never a retry. Rate options are loaded lazily by
 * lib/rates/options.ts only when something needs them (Rate sources tab, row drawer, re-pick what-ifs).
 */
export async function fetchCostLines(q: CostQuery, opts: SapGetOptions = {}): Promise<CostLinesResult> {
  const cfg = sapConfig();
  const { entitySet, params } = costRequest(q, false);
  const r = await sapGetCollection(entitySet, params, { ...opts, costing: true });
  // The live services still warn about RATEOPTIONSET_GET_ENTITYSET in sap-message on some systems:
  // not a costing problem - the Rate sources tab says it neutrally instead.
  const messages = r.messages.filter((m) => !/RATEOPTIONSET/i.test(m.message));
  const rows = r.rows.map((raw) => normalizeEntity<CostLine>(raw, COST_LINE, { [NAV_RATE_OPTIONS]: RATE_OPTION }));
  // SAP returns depth-first order; Seqnr makes it explicit, so never trust transport order.
  rows.sort((a, b) => a.Seqnr - b.Seqnr);
  const cap = getRatesCapability(cfg.system).state;
  return { rows, messages, ms: r.ms, rateOptions: false, capability: cap === 'unknown' ? 'unknown' : cap === 'unavailable' ? 'unsupported' : 'supported', sapMessageHeader: r.sapMessageHeader };
}

const PAGE = 5000;
const MAX_ROWS = 200_000;

/** Mode R / F / M: pages through SAP with $top/$skip/$inlinecount until it has everything, so the
 * BFF can sort, search and total across the whole result (SAP doesn't promise $orderby here). */
export async function fetchPagedSet<T>(q: CostQuery, opts: SapGetOptions = {}): Promise<SapResult<T> & { truncated: boolean }> {
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
    rows.push(...r.rows.map((raw) => normalizeEntity<T>(raw, fields)));
    if (r.rows.length < PAGE || (total !== null && rows.length >= total)) break;
  }
  return { rows, messages, ms, truncated: rows.length >= MAX_ROWS };
}

export async function fetchPlants(opts: SapGetOptions = {}): Promise<PlantRow[]> {
  const { entitySet, params } = plantsRequest();
  const r = await sapGetCollection(entitySet, params, opts);
  return r.rows.map((raw) => normalizeEntity<PlantRow>(raw, PLANT)).sort((a, b) => a.Werks.localeCompare(b.Werks));
}

/** Type-ahead on MaterialVHSet (?search=<text>&$top=50, min 2 characters). */
export async function fetchMaterials(term: string, opts: SapGetOptions = {}): Promise<MaterialRow[]> {
  const req = materialSearchRequest(term);
  if (!req) return [];
  const r = await sapGetCollection(req.entitySet, req.params, opts);
  return r.rows.map((raw) => normalizeEntity<MaterialRow>(raw, MATERIAL)).slice(0, 50);
}

/** Every finished good with its Brand / Product / CRS hierarchy (one call, cascaded in the browser). */
export async function fetchMaterialHierarchy(opts: SapGetOptions = {}): Promise<MaterialHierarchyRow[]> {
  const { entitySet, params } = materialHierarchyRequest();
  const r = await sapGetCollection(entitySet, params, opts);
  return r.rows.map((raw) => normalizeEntity<MaterialHierarchyRow>(raw, MATERIAL_HIERARCHY));
}

/** ConfigItemSet -> { GROUP_CURR, DEFAULT_PRIO, MAX_HEADS } (+ any other keys SAP sends). */
export async function fetchConfig(opts: SapGetOptions = {}): Promise<Record<string, string>> {
  const { entitySet, params } = configRequest();
  const r = await sapGetCollection(entitySet, params, opts);
  const out: Record<string, string> = { [CONFIG_KEYS.GROUP_CURR]: 'INR', [CONFIG_KEYS.DEFAULT_PRIO]: '', [CONFIG_KEYS.MAX_HEADS]: '50' };
  for (const raw of r.rows) {
    const c = normalizeEntity<ConfigRow>(raw, CONFIG);
    if (c.CfgKey) out[c.CfgKey] = c.CfgVal;
  }
  return out;
}
