/**
 * Data of the Freight analysis, from two existing SAP sets - nothing new is asked of SAP:
 *   1. RmPmRowSet (mode M) for the chosen finished goods and plants: the BOM components with their material type and plant.
 *   2. FreightRowSet (mode F) for those components, per plant, in batches of MAX_MATERIALS: every PO freight line of the
 *      window (LatestOnly off, FreightDays back to the start of the date range). The date range itself is applied in the
 *      browser on the PO date (FreightRowSet has no from / to date property).
 * Same request builders and normaliser as the other screens (pagedRequest / fetchPagedSet).
 */
import { defaultQuery, MAX_MATERIALS, type CostQuery } from '../query/schema';
import { fetchPagedSet } from '../sap/service';
import type { FreightRow, RmPmRow } from '../sap/fields';
import type { SapMessage } from '../sap/messages';
import { componentsOf, freightDaysFor, type Component, type DateRange } from './analysis';

export interface AnalysisInput { fgs: string[]; plants: string[]; types: string[]; range: DateRange }
export interface AnalysisData { components: Component[]; freight: FreightRow[]; messages: SapMessage[]; ms: number; fgs: number; calls: number }

const PARALLEL = 3;
const chunk = <T,>(list: T[], size: number): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

export const componentQuery = (fgs: string[], plants: string[]): CostQuery => ({ ...defaultQuery('M'), materials: fgs, plants, explQty: '1', stdFrt: false });
export const freightQuery = (materials: string[], plant: string, freightDays: number): CostQuery => ({ ...defaultQuery('F'), materials, plants: [plant], freightDays, stdFrt: false, latestOnly: false });

export async function fetchFreightAnalysis(input: AnalysisInput, signal: AbortSignal, onStep?: (text: string) => void): Promise<AnalysisData> {
  const messages: SapMessage[] = [];
  let ms = 0;
  let calls = 0;
  onStep?.('Reading the BOM components…');
  const rm = await fetchPagedSet<RmPmRow>(componentQuery(input.fgs, input.plants), { signal });
  ms += rm.ms; calls++; messages.push(...rm.messages);
  const components = componentsOf(rm.rows, input.types);

  const days = freightDaysFor(input.range.from);
  const jobs: { plant: string; mats: string[] }[] = [];
  for (const plant of [...new Set(components.map((c) => c.plant))]) {
    for (const mats of chunk(components.filter((c) => c.plant === plant).map((c) => c.material), MAX_MATERIALS)) jobs.push({ plant, mats });
  }
  const freight: FreightRow[] = [];
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const r = await fetchPagedSet<FreightRow>(freightQuery(job.mats, job.plant, days), { signal });
      ms += r.ms; calls++; messages.push(...r.messages);
      freight.push(...r.rows);
      onStep?.(`Reading PO freight… ${++done} of ${jobs.length} request(s)`);
    }
  };
  onStep?.(jobs.length ? `Reading PO freight… 0 of ${jobs.length} request(s)` : 'No components of the chosen types.');
  await Promise.all(Array.from({ length: Math.min(PARALLEL, jobs.length) }, worker));
  return { components, freight, messages, ms, fgs: input.fgs.length, calls };
}
