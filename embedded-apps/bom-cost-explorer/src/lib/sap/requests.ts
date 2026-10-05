/**
 * Pure request builders: which entity set and which query options each call sends. No network,
 * so the exact URLs are unit-tested (tests/unit/filter.test.ts).
 */
import { ENTITY_SET, MODE_TO_ENTITY, NAV_RATE_OPTIONS } from './entities';
import { buildSelectionFilter } from './filter';
import type { CostQuery } from '../query/schema';

export interface SapRequest {
  entitySet: string;
  params: Record<string, string | undefined>;
}

/** Mode -> entity set + $filter. $expand=RateOptions only for mode B and only when `expand` is
 * true (the capability check decides); the plant comparison never expands. RateOptionSet is
 * never requested as a set of its own. */
export function costRequest(q: CostQuery, expand = true): SapRequest {
  return {
    entitySet: MODE_TO_ENTITY[q.mode],
    params: { $filter: buildSelectionFilter(q), $expand: q.mode === 'B' && expand ? NAV_RATE_OPTIONS : undefined },
  };
}

/** One page of RateRowSet / FreightRowSet / RmPmRowSet. */
export function pagedRequest(q: CostQuery, top: number, skip: number): SapRequest {
  return {
    entitySet: MODE_TO_ENTITY[q.mode],
    params: { $filter: buildSelectionFilter(q), $top: String(top), $skip: String(skip), $inlinecount: 'allpages' },
  };
}

export const MATERIAL_SEARCH_MIN = 2;
export const MATERIAL_SEARCH_MAX_ROWS = 50;

/** Type-ahead on MaterialVHSet: the term goes as the `search` custom query option (never $filter).
 * null when the term is shorter than 2 characters (no SAP call). */
export function materialSearchRequest(term: string): SapRequest | null {
  const t = term.trim();
  if (t.length < MATERIAL_SEARCH_MIN) return null;
  return { entitySet: ENTITY_SET.MATERIALS, params: { search: t, $top: String(MATERIAL_SEARCH_MAX_ROWS) } };
}

export const plantsRequest = (): SapRequest => ({ entitySet: ENTITY_SET.PLANTS, params: {} });
export const configRequest = (): SapRequest => ({ entitySet: ENTITY_SET.CONFIG, params: {} });
