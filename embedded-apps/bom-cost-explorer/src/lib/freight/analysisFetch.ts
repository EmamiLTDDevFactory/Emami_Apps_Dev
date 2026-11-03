/**
 * Data of the Freight analysis. SAP's RmPmRowSet (mode M) and FreightRowSet (mode F) are read with the filters of this screen
 * only - a plant, or materials, or both (the SAP side no longer needs a finished good). Nothing else is asked of SAP:
 *
 *   Werks (one plant per request), Matnr (one clause per material, joined with or), BudatFrom / BudatTo (Edm.DateTime, two
 *   separate properties), InclFrt, and on the freight set FreightDays (1 to 92).
 *
 * Why not the shared selection builder (lib/sap/filter.ts buildSelectionFilter): it refuses a query without BOTH a material and a
 * plant, which was the old SAP rule. The literals still come from the same helpers (eqClause), so every value is typed and
 * escaped exactly as on the other screens; the flags are the one exception (see analysisFilter).
 *
 * RmPmRowSet answers with the components (material, description, material type, plant); only the chosen types (ROH, PKGN,
 * VERP) are kept. FreightRowSet answers with every PO freight line; the date range is also applied in the browser on the PO
 * date (analysis.ts), so a rule or range change never calls SAP again.
 */
import { sapGetCollection, type SapGetOptions } from '../sap/client';
import { eqClause } from '../sap/filter';
import { normalizeEntity } from '../sap/normalize';
import { ENTITY_SET } from '../sap/entities';
import { FIELDS_BY_SET, type FreightRow, type RmPmRow } from '../sap/fields';
import type { SapMessage } from '../sap/messages';
import { componentsOf, type Component, type DateRange } from './analysis';

export const MAX_FREIGHT_DAYS = 92;
export const DEFAULT_FREIGHT_DAYS = 92;

export interface MaterialInfo { text: string; mtart: string }
export interface AnalysisInput {
  /** materials the person picked (empty = every component of the plants) */
  materials: string[];
  /** description and material type of the picked materials, from the search results (informational) */
  info: Record<string, MaterialInfo>;
  /** plants the person chose; empty when materials are picked (SAP is then asked without a plant) */
  plants: string[];
  types: string[];
  range: DateRange;
  /** Include freight (InclFrt) */
  inclFrt: boolean;
  /** FreightDays, clamped to 1..92 before it is sent */
  freightDays: number;
}
export interface AnalysisData {
  components: Component[];
  freight: FreightRow[];
  messages: SapMessage[];
  ms: number;
  calls: number;
  basis: 'materials' | 'plant';
  /** picked materials SAP returned no component of the chosen types for (left out) */
  skipped: string[];
}

const PAGE = 5000;
const MAX_ROWS = 100_000;
const PARALLEL = 3;

/** FreightDays as SAP takes it: a whole number from 1 to 92. */
export function clampFreightDays(v: number | string): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return DEFAULT_FREIGHT_DAYS;
  return Math.min(MAX_FREIGHT_DAYS, Math.max(1, n));
}

/** Include freight defaults to checked when both dates are filled, unchecked otherwise. */
export const defaultInclFrt = (range: DateRange): boolean => !!(range.from && range.to);

/** Same message the screen shows when nothing is picked. */
export const NEED_PLANT_OR_MATERIAL = 'Enter a plant or at least one material';

/** The selection problem in words, or '' when the analysis can run. A plant OR a material is enough. */
export function selectionProblem(i: { materials: string[]; plants: string[]; types: string[]; range: DateRange; freightDays?: number | string }): string {
  if (!i.materials.length && !i.plants.length) return NEED_PLANT_OR_MATERIAL;
  if (!i.types.length) return 'Pick at least one material type';
  if (i.range.from && i.range.to && i.range.from > i.range.to) return 'The From date must not be after the To date';
  if (i.freightDays !== undefined && (!Number.isInteger(Number(i.freightDays)) || Number(i.freightDays) < 1)) return 'Freight look-back must be a whole number from 1 to 92 days';
  return '';
}

interface FilterParts { mode: 'M' | 'F'; materials: string[]; plant: string; range: DateRange; inclFrt: boolean; freightDays: number }

/**
 * The $filter of one request: only the properties that have a value. Matnr and Werks are both optional, one of them is needed.
 * Flags follow the SAP side as of 4 Nov 2026: InclFrt is an Edm.Boolean (`InclFrt eq true`); InclFrt, StdFrt and LatestOnly are
 * left out when false (an `eq false` on these sets was once refused with "Invalid parametertype") (the analysis wants every PO line and the actual rate, which is what omitting them gives).
 */
export function analysisFilter(p: FilterParts): string {
  const set = p.mode === 'F' ? 'FREIGHT' : 'RMPM';
  const parts = [
    eqClause('Mode', p.mode, set),
    eqClause('Matnr', p.materials, set),
    eqClause('Werks', p.plant, set),
    eqClause('BudatFrom', p.range.from, set),
    eqClause('BudatTo', p.range.to, set),
    p.inclFrt ? 'InclFrt eq true' : null,
    p.mode === 'F' ? eqClause('FreightDays', p.freightDays, set) : eqClause('ExplQty', '1', set),
  ];
  return parts.filter(Boolean).join(' and ');
}

async function readSet<T>(mode: 'M' | 'F', filter: string, opts: SapGetOptions): Promise<{ rows: T[]; ms: number; messages: SapMessage[] }> {
  const entitySet = mode === 'F' ? ENTITY_SET.FREIGHT : ENTITY_SET.RMPM;
  const fields = mode === 'F' ? FIELDS_BY_SET.FREIGHT : FIELDS_BY_SET.RMPM;
  const rows: T[] = [];
  const messages: SapMessage[] = [];
  let ms = 0;
  let total: number | null = null;
  for (let skip = 0; skip < MAX_ROWS; skip += PAGE) {
    const r = await sapGetCollection(entitySet, { $filter: filter, $top: String(PAGE), $skip: String(skip), $inlinecount: 'allpages' }, opts);
    ms += r.ms;
    if (skip === 0) messages.push(...r.messages);
    total = r.count ?? total;
    rows.push(...r.rows.map((raw) => normalizeEntity<T>(raw, fields as never)));
    if (r.rows.length < PAGE || (total !== null && rows.length >= total)) break;
  }
  return { rows, ms, messages };
}

export async function fetchFreightAnalysis(input: AnalysisInput, signal: AbortSignal, onStep?: (text: string) => void): Promise<AnalysisData> {
  const opts: SapGetOptions = { signal };
  const days = clampFreightDays(input.freightDays);
  // One request per plant (SAP takes one plant); no plant chosen = one request without a plant, for the picked materials.
  const plants = input.plants.length ? [...new Set(input.plants.map((p) => p.trim()).filter(Boolean))] : [''];
  const materials = [...new Set(input.materials.map((m) => m.trim()).filter(Boolean))];
  const messages: SapMessage[] = [];
  const rm: RmPmRow[] = [];
  const freight: FreightRow[] = [];
  let ms = 0;
  let calls = 0;
  let done = 0;
  const total = plants.length * 2;
  const jobs = plants.flatMap((plant) => (['M', 'F'] as const).map((mode) => ({ plant, mode })));
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const filter = analysisFilter({ mode: job.mode, materials, plant: job.plant, range: input.range, inclFrt: input.inclFrt, freightDays: days });
      try {
        const r = await readSet<RmPmRow & FreightRow>(job.mode, filter, opts);
        ms += r.ms; calls++; messages.push(...r.messages);
        (job.mode === 'M' ? rm : freight).push(...(r.rows as never[]));
      } catch (e) {
        if (signal.aborted) throw e;
        // With several plants one SAP answer can fail (a plant without data): say which, keep the rest.
        if (plants.length === 1) throw e;
        messages.push({ code: 'FA/003', severity: 'warning', message: `${job.plant || 'All plants'} (${job.mode === 'M' ? 'components' : 'freight'}): ${(e as Error).message}` });
      }
      onStep?.(`Reading from SAP… ${++done} of ${total} request(s)`);
    }
  };
  onStep?.(`Reading from SAP… 0 of ${total} request(s)`);
  await Promise.all(Array.from({ length: Math.min(PARALLEL, jobs.length) }, worker));

  const components = componentsOf(rm, input.types);
  const found = new Set(components.map((c) => c.material));
  const skipped = materials.filter((m) => !found.has(m));
  return { components, freight, messages, ms, calls, basis: materials.length ? 'materials' : 'plant', skipped };
}
