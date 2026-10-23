'use client';
/**
 * Data layer of the UI. The browser calls the Azure SAP gateway directly (lib/sap/*) - there is no
 * server in between. Value helps and config are cached 10 min in memory; the R / F / M result
 * sets are fetched from SAP once per selection (paged with $top/$skip/$inlinecount) and then
 * searched, sorted, totalled and paged here, so paging never calls SAP again.
 */
import type { CostLine, MaterialRow, PlantRow } from '../sap/fields';
import type { SapMessage } from '../sap/messages';
import { costQuerySchema, pageSchema, type CostQuery, type PageRequest } from '../query/schema';
import { fetchConfig, fetchCostLines, fetchMaterials, fetchPagedSet, fetchPlants } from '../sap/service';
import { isPlantRun, runPlantCosting } from './plantRun';
import { SapError } from '../sap/client';
import { FilterError } from '../sap/filter';
import type { ExpandCapability } from '../sap/capability';
import { queryTable, type TableTotals } from '../cost/table';
import { VIEW_COLUMNS } from '../views';

export class ApiError extends Error {
  constructor(message: string, public status: number, public details: SapMessage[] = [], public issues: { path: string; message: string }[] = []) {
    super(message);
  }
}

export interface CostResult {
  rows: CostLine[];
  messages: SapMessage[];
  ms: number;
  total: number;
  /** false when SAP could not / did not $expand RateOptions (mode C never expands) */
  rateOptions?: boolean;
  capability?: ExpandCapability;
  /** plant run (materials left empty): the finished goods that were costed */
  resolvedMaterials?: string[];
  plantRun?: { plants: string[]; fgs: number; capped: boolean; batches: number };
  /** plant-wide costing (lib/plantwide, flag PLANT_WIDE_ENABLED): headers listed, costed, skipped and failed */
  plantWide?: import('../plantwide/usePlantWide').PlantWideInfo;
}
export interface PagedResult<T = Record<string, unknown>> {
  rows: T[];
  total: number;
  totals: TableTotals;
  messages: SapMessage[];
  ms: number;
  cached: boolean;
}

const TEN_MIN = 10 * 60_000;
const cache = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.v as T;
  const v = await load();
  cache.set(key, { at: Date.now(), v });
  if (cache.size > 60) cache.delete(cache.keys().next().value as string);
  return v;
}

/** SapError / validation -> ApiError the screens already know how to show. */
function wrap(e: unknown): never {
  if (e instanceof ApiError) throw e;
  if (e instanceof SapError) {
    if (e.kind === 'aborted') throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    throw new ApiError(e.message, e.status, e.details);
  }
  if (e instanceof FilterError) throw new ApiError(e.message, 400);
  if ((e as Error)?.name === 'AbortError') throw e;
  throw new ApiError((e as Error)?.message || 'Unexpected error', 0);
}

function validQuery(query: CostQuery): CostQuery {
  const r = costQuerySchema.safeParse(query);
  if (!r.success) {
    const issues = r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new ApiError(issues[0]?.message ?? 'Invalid selection.', 400, [], issues);
  }
  return r.data;
}

export const api = {
  async cost(query: CostQuery, signal?: AbortSignal): Promise<CostResult> {
    try {
      const q = validQuery(query);
      if (isPlantRun(q)) {
        const p = await runPlantCosting(q, { signal });
        return { rows: p.rows, messages: p.messages, ms: p.ms, total: p.rows.length, rateOptions: p.rateOptions, capability: p.capability, resolvedMaterials: p.resolvedMaterials, plantRun: p.plantRun };
      }
      const r = await fetchCostLines(q, { signal });
      return { rows: r.rows, messages: r.messages, ms: r.ms, total: r.rows.length, rateOptions: r.rateOptions, capability: r.capability };
    } catch (e) {
      return wrap(e);
    }
  },

  async paged(query: CostQuery, page: Partial<PageRequest>, signal?: AbortSignal): Promise<PagedResult> {
    try {
      const q = validQuery(query);
      const key = `paged:${JSON.stringify(q)}`;
      const was = cache.has(key) && Date.now() - cache.get(key)!.at < TEN_MIN;
      const full = await cached(key, TEN_MIN, () => fetchPagedSet<Record<string, unknown>>(q, { signal }));
      const t = queryTable(full.rows, VIEW_COLUMNS[q.mode as 'R' | 'F' | 'M'], pageSchema.parse(page));
      const messages = full.truncated ? [...full.messages, { code: 'BFF/002', severity: 'warning' as const, message: 'Result truncated at 200,000 rows - narrow the selection.' }] : full.messages;
      return { ...t, messages, ms: full.ms, cached: was };
    } catch (e) {
      return wrap(e);
    }
  },

  async plants(): Promise<{ plants: PlantRow[] }> {
    try {
      return { plants: await cached('plants', TEN_MIN, () => fetchPlants({ timeoutMs: 230_000 })) };
    } catch (e) {
      cache.delete('plants');
      return wrap(e);
    }
  },

  async materials(q: string, signal?: AbortSignal): Promise<{ materials: MaterialRow[] }> {
    try {
      const t = q.trim();
      if (t.length < 2) return { materials: [] };
      return { materials: await cached(`mat:${t.toLowerCase()}`, TEN_MIN, () => fetchMaterials(t, { signal, timeoutMs: 230_000 })) };
    } catch (e) {
      return wrap(e);
    }
  },

  /** Finished goods with Brand / Product / CRS for the cascading pickers (cached 10 min). */


  async config(): Promise<Record<string, string>> {
    try {
      return await cached('config', TEN_MIN, () => fetchConfig({ timeoutMs: 230_000 }));
    } catch (e) {
      return wrap(e);
    }
  },
};
