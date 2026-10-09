/**
 * Pure request builders: which entity set and which query options each call sends. No network,
 * so the exact URLs are unit-tested (tests/unit/filter.test.ts).
 */
import { ENTITY_SET, MODE_TO_ENTITY, NAV_RATE_OPTIONS } from './entities';
import { COST_LINE, MATERIAL_HIERARCHY, OPTIONAL_PROPS } from './fields';
import { buildSelectionFilter } from './filter';
import type { CostQuery } from '../query/schema';

export interface SapRequest {
  entitySet: string;
  params: Record<string, string | undefined>;
}

/**
 * $select for CostLineSet: every result field the UI reads (fields.ts COST_LINE), so SAP stops
 * echoing the selection properties (Mode, Matnr, Cplnt, Lookback, ... BudatTo) on every line.
 * Properties absent from the live service (OPTIONAL_PROPS) are left out - SAP rejects a $select
 * of an unknown property. With $expand the navigation must be selected too, or OData V2 drops it.
 */
export function costLineSelect(expand: boolean): string {
  const props = Object.values(COST_LINE).map(([name]) => name).filter((n) => !OPTIONAL_PROPS.has(n));
  return [...props, ...(expand ? [NAV_RATE_OPTIONS] : [])].join(',');
}

/** Mode -> entity set + $filter + $select. $expand=RateOptions for mode B (unless SAP was found
 * not to support it in the last 15 minutes - capability.ts); the plant comparison never expands.
 * RateOptionSet is never requested as a set of its own. */
export function costRequest(q: CostQuery, expand = true): SapRequest {
  const ex = q.mode === 'B' && expand;
  return {
    entitySet: MODE_TO_ENTITY[q.mode],
    params: { $filter: buildSelectionFilter(q), $select: costLineSelect(ex), $expand: ex ? NAV_RATE_OPTIONS : undefined },
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

/** Every finished good with its Brand / Product / CRS hierarchy, for the cascading pickers. Needs
 * MaterialVHSet to answer a $filter without ?search= (it returns nothing for that on NGD today). */
export const MATERIAL_HIERARCHY_TYPE = 'FERT';
export const materialHierarchyRequest = (): SapRequest => ({
  entitySet: ENTITY_SET.MATERIALS,
  params: { $filter: `Mtart eq '${MATERIAL_HIERARCHY_TYPE}'`, $select: Object.values(MATERIAL_HIERARCHY).map(([n]) => n).join(',') },
});

export const plantsRequest = (): SapRequest => ({ entitySet: ENTITY_SET.PLANTS, params: {} });
export const configRequest = (): SapRequest => ({ entitySet: ENTITY_SET.CONFIG, params: {} });
