/**
 * BOM costing for a whole plant: materials left empty + plants chosen = every finished good of those plants.
 *
 *   1. finished goods of the plants: MaterialVHSet?$filter=(Werks eq '1000' or ...) and Mtart eq 'FERT'
 *      (SAP caps a filtered MaterialVHSet at 500 rows; a capped list is reported, not silently cut)
 *   2. CostLineSet Mode B in batches of MAX_MATERIALS header materials (SAP's per-run limit), one after the other,
 *      each with the costing timeout; Cancel stops between / during batches
 *   3. one result: rows of every batch (row keys stay unique - each FG is in one batch), messages de-duplicated,
 *      plus an info message naming how many FGs were costed
 * Progress is published through subscribeCostProgress for the "SAP is costing…" bar.
 */
import { odataString } from '../sap/filter';
import { sapGetCollection, type SapGetOptions } from '../sap/client';
import { normalizeEntity } from '../sap/normalize';
import { ENTITY_SET } from '../sap/entities';
import { MATERIAL, type MaterialRow } from '../sap/fields';
import { fetchCostLines, type CostLinesResult } from '../sap/service';
import { MAX_MATERIALS, type CostQuery } from '../query/schema';
import type { SapMessage } from '../sap/messages';

export const PLANT_FG_CAP = 500;
export const FG_TYPE = 'FERT';

export const isPlantRun = (q: Pick<CostQuery, 'mode' | 'materials' | 'plants'>) => q.mode === 'B' && q.materials.length === 0 && q.plants.length > 0;

export function plantFgRequest(plants: string[]) {
  const w = [...new Set(plants.map((p) => p.trim().toUpperCase()).filter(Boolean))];
  const werks = w.length === 1 ? `Werks eq ${odataString(w[0])}` : `(${w.map((x) => `Werks eq ${odataString(x)}`).join(' or ')})`;
  return { entitySet: ENTITY_SET.MATERIALS, params: { $filter: `${werks} and Mtart eq ${odataString(FG_TYPE)}` } as Record<string, string | undefined> };
}

export async function fetchPlantFgs(plants: string[], opts: SapGetOptions = {}): Promise<{ fgs: MaterialRow[]; capped: boolean }> {
  const { entitySet, params } = plantFgRequest(plants);
  const r = await sapGetCollection(entitySet, params, opts);
  const seen = new Set<string>();
  const fgs = r.rows.map((raw) => normalizeEntity<MaterialRow>(raw, MATERIAL)).filter((m) => m.Matnr && !seen.has(m.Matnr) && seen.add(m.Matnr));
  return { fgs: fgs.sort((a, b) => a.Matnr.localeCompare(b.Matnr)), capped: r.rows.length >= PLANT_FG_CAP };
}

/* ---------- progress ---------- */
export interface CostProgress { phase: 'fgs' | 'costing'; batch: number; batches: number; done: number; total: number }
let progress: CostProgress | null = null;
const listeners = new Set<(p: CostProgress | null) => void>();
const publish = (p: CostProgress | null) => { progress = p; listeners.forEach((l) => l(p)); };
export function subscribeCostProgress(fn: (p: CostProgress | null) => void): () => void {
  listeners.add(fn);
  fn(progress);
  return () => { listeners.delete(fn); };
}

export interface PlantRunResult extends CostLinesResult { resolvedMaterials: string[]; plantRun: { plants: string[]; fgs: number; capped: boolean; batches: number } }

export async function runPlantCosting(q: CostQuery, opts: SapGetOptions = {}): Promise<PlantRunResult> {
  try {
    publish({ phase: 'fgs', batch: 0, batches: 0, done: 0, total: 0 });
    const { fgs, capped } = await fetchPlantFgs(q.plants, opts);
    if (!fgs.length) throw Object.assign(new Error(`SAP returned no finished goods (${FG_TYPE}) for plant ${q.plants.join(', ')}. Pick materials, or check the plant.`), { name: 'PlantRunEmpty' });
    const mats = fgs.map((m) => m.Matnr);
    const batches: string[][] = [];
    for (let i = 0; i < mats.length; i += MAX_MATERIALS) batches.push(mats.slice(i, i + MAX_MATERIALS));
    const rows: CostLinesResult['rows'] = [];
    const msgs = new Map<string, SapMessage>();
    let ms = 0;
    let last: CostLinesResult | null = null;
    for (let b = 0; b < batches.length; b++) {
      publish({ phase: 'costing', batch: b + 1, batches: batches.length, done: b * MAX_MATERIALS, total: mats.length });
      const r = await fetchCostLines({ ...q, materials: batches[b] }, opts);
      rows.push(...r.rows);
      r.messages.forEach((m) => msgs.set(`${m.severity}|${m.code}|${m.message}`, m));
      ms += r.ms;
      last = r;
    }
    const info: SapMessage[] = [
      { code: 'APP/PLANT', severity: 'info', message: `Plant run: ${mats.length} finished goods (${FG_TYPE}) of plant ${q.plants.join(', ')} costed in ${batches.length} SAP run${batches.length === 1 ? '' : 's'} of up to ${MAX_MATERIALS}.` },
      ...(capped ? [{ code: 'APP/PLANT_CAP', severity: 'warning' as const, message: `SAP lists at most ${PLANT_FG_CAP} materials per request: the plant may have more finished goods than were costed. Narrow by brand / product, or pick materials.` }] : []),
    ];
    return { ...(last as CostLinesResult), rows, messages: [...info, ...msgs.values()], ms, resolvedMaterials: mats, plantRun: { plants: q.plants, fgs: mats.length, capped, batches: batches.length } };
  } finally {
    publish(null);
  }
}
