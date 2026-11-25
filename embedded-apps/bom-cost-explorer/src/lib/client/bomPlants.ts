/**
 * Plants that have a BOM of the chosen materials (SAP: BomPlantSet = MAST + STKO of the materials, not deleted, limited to the plants the person may see), so
 * the person can pick the right costing plant. Display help only: nothing here changes a costing.
 */
import { odataString } from '../sap/filter';
import { sapGetCollection, type SapGetOptions } from '../sap/client';
import { normalizeEntity } from '../sap/normalize';

export const BOMPLANT_SET = 'BomPlantSet';
export interface BomPlantRow { Matnr: string; Werks: string; Stlal: string; Name1: string; Stlan: string; Stlnr: string; Stlst: string }
const MAP = { Matnr: ['Matnr', 's'], Werks: ['Werks', 's'], Stlal: ['Stlal', 's'], Name1: ['Name1', 's'], Stlan: ['Stlan', 's'], Stlnr: ['Stlnr', 's'], Stlst: ['Stlst', 's'] } as const;

export interface BomPlant { werks: string; name: string; /** materials (without leading zeros) that have a BOM in the plant */ materials: string[]; alternatives: number }
const strip = (m: string) => m.replace(/^0+/, '');

export function bomPlantsRequest(materials: string[]) {
  const m = [...new Set(materials.map((x) => strip(x.trim().toUpperCase())).filter(Boolean))];
  const f = m.length === 1 ? `Matnr eq ${odataString(m[0])}` : `(${m.map((x) => `Matnr eq ${odataString(x)}`).join(' or ')})`;
  return { entitySet: BOMPLANT_SET, params: { $filter: f } as Record<string, string | undefined> };
}

/** One row per plant: which of the materials have a BOM there, sorted by the number of materials (most first), then plant. */
export function groupBomPlants(rows: BomPlantRow[]): BomPlant[] {
  const by = new Map<string, { name: string; mats: Set<string>; alts: number }>();
  for (const r of rows) {
    const x = by.get(r.Werks) ?? { name: r.Name1, mats: new Set<string>(), alts: 0 };
    x.mats.add(strip(r.Matnr)); x.alts += 1;
    by.set(r.Werks, x);
  }
  return Array.from(by.entries()).map(([werks, x]) => ({ werks, name: x.name, materials: Array.from(x.mats).sort(), alternatives: x.alts }))
    .sort((a, b) => b.materials.length - a.materials.length || a.werks.localeCompare(b.werks));
}

export async function loadBomPlants(materials: string[], opts: SapGetOptions = {}): Promise<BomPlant[]> {
  const list = [...new Set(materials.map((x) => strip(x.trim().toUpperCase())).filter(Boolean))];
  const rows: BomPlantRow[] = [];
  for (let i = 0; i < list.length; i += 25) {
    const req = bomPlantsRequest(list.slice(i, i + 25));
    const r = await sapGetCollection(req.entitySet, req.params, opts);
    rows.push(...r.rows.map((x) => normalizeEntity<BomPlantRow>(x, MAP)));
  }
  return groupBomPlants(rows);
}
