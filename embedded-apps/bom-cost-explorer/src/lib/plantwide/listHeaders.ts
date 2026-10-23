/**
 * Every header material of one plant for plant-wide costing.
 *
 *   a) MaterialVHSet?$filter=Werks eq 'P' and Mtart eq 'FERT' [and Zbrandcode/Prodha/Zskugrcodecrs]: fewer than VH_CAP
 *      rows = the complete list.
 *   b) VH_CAP rows (a possibly cut list): slice by brand (HierVHSet Level B of the plant), then product (Level P), then
 *      CRS (Level C); a CRS slice still at VH_CAP is listed in incomplete[] with its names.
 *   c) merge, de-duplicate by Matnr, sort. Slice calls run 3 at a time. URLs via the existing builders (no "+").
 *
 * The live services (NGQ, NWP checked 2026-10-23) have no Werks property on MaterialVH and answer a) with
 * "Property Werks not found in type MaterialVH". Then the plant comes from the hierarchy instead: the brands (products,
 * CRS) HierVHSet lists for the plant, and each brand's materials without the plant filter. Such a list can hold
 * finished goods of the brand that have no BOM in this plant; SAP skips those headers with a message when costing.
 */
import { odataString } from '../sap/filter';
import { sapGetCollection, SapError, type SapGetOptions } from '../sap/client';
import { hierMaterialsRequest, hierRequest, type HierLevel } from '../client/hier';
import { ENTITY_SET } from '../sap/entities';

export interface HeaderRow { Matnr: string; Maktx: string; Mtart: string; Meins: string; Zbrandcode: string; Prodha: string; Zskugrcodecrs: string }
export interface ListHeadersInput { plant: string; mtart: string[]; brand?: string; product?: string; crs?: string }
export interface ListHeadersResult {
  rows: HeaderRow[];
  complete: boolean;
  /** slices still at VH_CAP after slicing down to CRS, by name */
  incomplete: string[];
  /** false when SAP has no plant filter on MaterialVH and the list came through the plant's hierarchy */
  plantFiltered: boolean;
  /** hierarchy route only: SAP's own count of the plant's materials (HierVHSet Cnt, all material types) */
  plantCount?: number;
}
type Get = (set: string, params: Record<string, string | undefined>, opts?: SapGetOptions) => Promise<{ rows: Record<string, unknown>[] }>;
export interface ListHeadersOptions { signal?: AbortSignal; vhCap?: number; get?: Get; concurrency?: number }

export class PlantListError extends Error { name = 'PlantListError'; }

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const toHeader = (r: Record<string, unknown>): HeaderRow => ({ Matnr: s(r.Matnr), Maktx: s(r.Maktx), Mtart: s(r.Mtart), Meins: s(r.Meins), Zbrandcode: s(r.Zbrandcode), Prodha: s(r.Prodha), Zskugrcodecrs: s(r.Zskugrcodecrs) });

/** SAP's answer when an entity type has no Werks property. */
export function isNoWerksProperty(e: unknown): boolean {
  if (!(e instanceof SapError) || e.kind !== 'http') return false;
  return [e.message, ...e.details.map((d) => d.message)].some((m) => /property\s+'?werks'?\s+not\s+found/i.test(m));
}

/** Runs fn over items, at most n at a time, keeping the input order of the results. */
export async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>, signal?: AbortSignal): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

export async function listHeaders(input: ListHeadersInput, opts: ListHeadersOptions = {}): Promise<ListHeadersResult> {
  const get: Get = opts.get ?? sapGetCollection;
  const cap = opts.vhCap ?? 500;
  const conc = opts.concurrency ?? 3;
  const plant = input.plant.trim().toUpperCase();
  const mtarts = input.mtart.length ? input.mtart : ['FERT'];
  // No client-side timeout on any plant-wide request: only the caller's signal ends one.
  const sapOpts: SapGetOptions = { signal: opts.signal, noTimeout: true };
  let plantFilter = true;

  /** MaterialVHSet for the criteria, one call per material type; capped when any call returned VH_CAP rows. */
  const materials = async (c: { brand?: string; product?: string; crs?: string }): Promise<{ rows: HeaderRow[]; capped: boolean }> => {
    const parts = await Promise.all(mtarts.map(async (mtart) => {
      const crit = { brand: c.brand ? [c.brand] : [], product: c.product ? [c.product] : [], crs: c.crs ? [c.crs] : [], mtart, werks: plantFilter ? [plant] : [] };
      const req = hierMaterialsRequest(crit) ?? { entitySet: ENTITY_SET.MATERIALS, params: { $filter: `Werks eq ${odataString(plant)} and Mtart eq ${odataString(mtart)}` } };
      const r = await get(req.entitySet, req.params, sapOpts);
      return { rows: r.rows.map(toHeader).filter((m) => m.Matnr), capped: r.rows.length >= cap };
    }));
    return { rows: parts.flatMap((p) => p.rows), capped: parts.some((p) => p.capped) };
  };

  /** Codes (and names) of one hierarchy level for the plant. */
  const level = async (lv: HierLevel, brand?: string, product?: string): Promise<{ code: string; name: string; cnt: number }[]> => {
    const { entitySet, params } = hierRequest(lv, { brand: brand ? [brand] : [], product: product ? [product] : [], werks: [plant] });
    try {
      const r = await get(entitySet, params, sapOpts);
      return r.rows.map((x) => ({ code: s(x.Code), name: s(x.Descr) || s(x.Code), cnt: Number(x.Cnt) || 0 })).filter((x) => x.code);
    } catch (e) {
      if (isNoWerksProperty(e)) throw new PlantListError(`SAP cannot list the materials of plant ${plant} on this system (neither MaterialVHSet nor HierVHSet filter by plant). Pick materials instead.`);
      throw e;
    }
  };

  const found: HeaderRow[] = [];
  let plantCount: number | undefined;
  const incomplete: string[] = [];

  const top = { brand: input.brand, product: input.product, crs: input.crs };
  let first: { rows: HeaderRow[]; capped: boolean } | null = null;
  try {
    first = await materials(top);
  } catch (e) {
    if (!isNoWerksProperty(e)) throw e;
    plantFilter = false;
  }
  if (first && !first.capped) found.push(...first.rows);
  else {
    // Slice: brand -> product -> CRS, each narrowed by what the cascade picker already chose.
    const brands = input.brand ? [{ code: input.brand, name: input.brand, cnt: 0 }] : await level('B');
    if (!plantFilter && !input.brand) plantCount = brands.reduce((a, b) => a + b.cnt, 0);
    await pool(brands, conc, async (b) => {
      const mb = await materials({ brand: b.code, product: input.product, crs: input.crs });
      if (!mb.capped) { found.push(...mb.rows); return; }
      const products = input.product ? [{ code: input.product, name: input.product, cnt: 0 }] : await level('P', b.code);
      await pool(products, conc, async (p) => {
        const mp = await materials({ brand: b.code, product: p.code, crs: input.crs });
        if (!mp.capped) { found.push(...mp.rows); return; }
        const crsList = input.crs ? [{ code: input.crs, name: input.crs, cnt: 0 }] : await level('C', b.code, p.code);
        await pool(crsList, conc, async (c) => {
          const mc = await materials({ brand: b.code, product: p.code, crs: c.code });
          found.push(...mc.rows);
          if (mc.capped) incomplete.push(`brand ${b.name} › product ${p.name} › CRS ${c.name}`);
        }, opts.signal);
      }, opts.signal);
    }, opts.signal);
  }

  const seen = new Set<string>();
  const rows = found.filter((m) => !seen.has(m.Matnr) && !!seen.add(m.Matnr)).sort((a, b) => a.Matnr.localeCompare(b.Matnr));
  return { rows, complete: incomplete.length === 0, incomplete, plantFiltered: plantFilter, ...(plantCount !== undefined ? { plantCount } : {}) };
}
