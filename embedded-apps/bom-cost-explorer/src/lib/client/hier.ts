/**
 * Brand -> Product (product hierarchy, PRODHA) -> SKU -> Material picker data. The levels come from SAP's
 * grouped set HierVHSet; materials from MaterialVHSet filtered by the chosen levels. Brands are never derived
 * from MaterialVHSet rows (SAP answers an unfiltered MaterialVHSet with an empty list by design, and caps
 * filtered lists at 500 rows).
 *
 * The app is a static export (no /api routes): these builders are the "routes" -
 *   hierRequest({ level, brand, product, werks })              = GET /api/hier?level=&brand=&product=&werks=
 *   hierMaterialsRequest({ brand, product, sku, mtart, q, werks }) = GET /api/materials?brand=&product=&sku=&mtart=&q=&werks=
 *
 * SAP levels (new): B = brand ZBRAND, P = product hierarchy (Prodha), C = SKU ZSKU; descriptions from T179T. MaterialVHSet
 * filters Zbrand / Prodha / Zsku. CASCADE_FIELDS=legacy sends the old Zbrandcode / Zskugrcodecrs instead (rollback). In
 * "new" mode a system that answers "Property Zbrand / Zsku not found" is remembered and gets the legacy names, so the
 * picker keeps working until SAP has the new fields (none of NGD / NGQ / NWP has them on 23.10.2026).
 * Several values per parameter become "(X eq 'a' or X eq 'b')"; literals are quote-escaped; the client encodes
 * with encodeURIComponent (spaces %20, never "+").
 */
import { odataString } from '../sap/filter';
import { SapError, sapGetCollection, type SapGetOptions } from '../sap/client';
import { normalizeEntity } from '../sap/normalize';
import { ENTITY_SET } from '../sap/entities';
import { MATERIAL, type MaterialRow } from '../sap/fields';
import { sapConfig } from '../sap/config';
import { loadMgmt, mgmtBrand, mgmtProduct, mgmtSku } from './mgmtNames';

export const HIER_SET = 'HierVHSet';
export const HIER_MATERIALS_MAX = 500;
export type HierLevel = 'B' | 'P' | 'C';

/** HierVHSet row: Level, Code, Descr, Cnt. */
export interface HierOption { level: HierLevel; code: string; descr: string; cnt: number; /** the SAP text when `descr` was replaced by the management name (display only; search still finds it) */ sapDescr?: string }

export interface HierCriteria { brand?: string[]; product?: string[]; sku?: string[]; werks?: string[] }

// ---- material filter property names: new (Zbrand, Zsku) or legacy (Zbrandcode, Zskugrcodecrs) ----------------------
export type CascadeFields = 'new' | 'legacy';
export const CASCADE_PROPS: Record<CascadeFields, { brand: string; product: string; sku: string }> = {
  new: { brand: 'Zbrand', product: 'Prodha', sku: 'Zsku' },
  legacy: { brand: 'Zbrandcode', product: 'Prodha', sku: 'Zskugrcodecrs' },
};
/** The switch: env CASCADE_FIELDS / NEXT_PUBLIC_CASCADE_FIELDS, "new" unless set to "legacy". */
export const cascadeFieldsSetting = (): CascadeFields => ((process.env.NEXT_PUBLIC_CASCADE_FIELDS || process.env.CASCADE_FIELDS || 'new').trim().toLowerCase() === 'legacy' ? 'legacy' : 'new');
const legacySystems = new Set<string>();
const currentSystem = () => { try { return sapConfig().system; } catch { return ''; } };
/** Names to send to this system: the setting, or legacy where SAP has rejected the new names. */
export const cascadeFields = (system = currentSystem()): CascadeFields => (cascadeFieldsSetting() === 'legacy' || legacySystems.has(system) ? 'legacy' : 'new');
export const markCascadeLegacy = (system = currentSystem()) => { legacySystems.add(system); };
export const resetCascadeFields = () => legacySystems.clear();
/** SAP's answer when MaterialVH has no Zbrand / Zsku yet. */
export function isNewCascadePropertyMissing(e: unknown): boolean {
  if (!(e instanceof SapError) || e.kind !== 'http') return false;
  return [e.message, ...e.details.map((d) => d.message)].some((m) => /property\s+'?(zbrand|zsku)'?\s+(not\s+found|is\s+invalid)/i.test(m));
}

const list = (v: string[] | undefined) => (v ?? []).map((x) => x.trim()).filter(Boolean);
function anyOf(prop: string, values: string[] | undefined): string | null {
  const v = [...new Set(list(values))];
  if (!v.length) return null;
  return v.length === 1 ? `${prop} eq ${odataString(v[0])}` : `(${v.map((x) => `${prop} eq ${odataString(x)}`).join(' or ')})`;
}
const and = (...p: (string | null)[]) => p.filter(Boolean).join(' and ');

/** HierVHSet request for one level, narrowed by the levels above it (any may be empty) and plants. */
export function hierRequest(level: HierLevel, c: HierCriteria = {}) {
  const filter = and(
    `Level eq ${odataString(level)}`,
    level !== 'B' ? anyOf('Brand', c.brand) : null,
    level === 'C' ? anyOf('Product', c.product) : null,
    anyOf('Werks', c.werks?.map((w) => w.toUpperCase())),
  );
  return { entitySet: HIER_SET, params: { $filter: filter } as Record<string, string | undefined> };
}

/** "<Descr> (<Code>) - <Cnt>"; the code alone when SAP has no description. */
export const optionLabel = (o: HierOption) => `${o.descr ? `${o.descr} (${o.code})` : o.code} - ${o.cnt}`;

export interface MaterialCriteria extends HierCriteria { mtart?: string; q?: string }

/** True when MaterialVHSet may be called: a level is chosen or the search text has 2+ characters. */
export const hasMaterialCriteria = (c: MaterialCriteria) => list(c.brand).length > 0 || list(c.product).length > 0 || list(c.sku).length > 0 || (c.q ?? '').trim().length >= 2;

/** MaterialVHSet filtered by the chosen levels; null = no criteria, do NOT call SAP (it answers empty by design). */
export function hierMaterialsRequest(c: MaterialCriteria, fields: CascadeFields = cascadeFields()) {
  if (!hasMaterialCriteria(c)) return null;
  const f = CASCADE_PROPS[fields];
  const filter = and(anyOf(f.brand, c.brand), anyOf(f.product, c.product), anyOf(f.sku, c.sku), c.mtart ? `Mtart eq ${odataString(c.mtart)}` : null, anyOf('Werks', c.werks?.map((w) => w.toUpperCase())));
  const q = (c.q ?? '').trim();
  const params: Record<string, string | undefined> = {};
  if (filter) params.$filter = filter;
  if (q.length >= 2) params.search = q;
  return { entitySet: ENTITY_SET.MATERIALS, params };
}

// ---- problems, in words for the person and the SAP team ------------------------------------------
export type HierProblem =
  | { kind: 'missing'; system: string }
  | { kind: 'property'; system: string; property: string; entity: string; message: string }
  | { kind: 'empty'; system: string }
  | { kind: 'error'; system: string; message: string };

const MISSING = /Resource not found for (the )?segment|No service found/i;
const PROPERTY = /Property '?([\w/]+)'? (?:not found|is invalid)(?: in type '?([\w./]+)'?)?/i;

export function classifyHierError(e: unknown, system: string): HierProblem {
  const msg = e instanceof Error ? `${e.message} ${(e as SapError).details?.map((d) => d.message).join(' ') ?? ''}` : String(e);
  const status = e instanceof SapError ? e.sapStatus : undefined;
  const p = PROPERTY.exec(msg);
  if (p) return { kind: 'property', system, property: p[1], entity: p[2] || HIER_SET, message: msg.trim() };
  if (status === 404 || MISSING.test(msg)) return { kind: 'missing', system };
  return { kind: 'error', system, message: msg.trim() };
}

export function problemText(p: HierProblem): string {
  switch (p.kind) {
    case 'missing': return `This SAP system (${p.system}) does not have the cascade service yet (HierVHSet). Use the search box.`;
    case 'property': return `SAP ${p.system}: property "${p.property}" is not in entity "${p.entity}". The SAP team needs to add it in SEGW (${HIER_SET} / MaterialVHSet). Use the search box meanwhile.`;
    case 'empty': return `SAP returned no brands. Check that the brand field is maintained for the selected material types. (SAP system ${p.system})`;
    default: return `Could not load the brand list from SAP ${p.system}: ${p.message}`;
  }
}

// ---- feature detection: once per SAP system, cached 10 minutes ------------------------------------
export const HIER_CAP_TTL_MS = 10 * 60_000;
const cap = new Map<string, { at: number; brands: HierOption[] | null; problem: HierProblem | null }>();
export const resetHierCapability = (system?: string) => (system ? cap.delete(system) : cap.clear());

function toOption(raw: Record<string, unknown>): HierOption {
  const r = normalizeEntity<{ Level: string; Code: string; Descr: string; Cnt: number }>(raw, { Level: ['Level', 's'], Code: ['Code', 's'], Descr: ['Descr', 's'], Cnt: ['Cnt', 'i'] });
  return { level: r.Level as HierLevel, code: r.Code, descr: r.Descr, cnt: r.Cnt };
}
/** Display only: the management name replaces the description where the workbook has one for that code (or, for brand / product, for that SAP text). */
async function withMgmt(o: HierOption[]): Promise<HierOption[]> {
  const d = await loadMgmt();
  if (!d) return o;
  return o.map((x) => {
    const m = x.level === 'B' ? mgmtBrand(d, x.code, x.descr) : x.level === 'P' ? mgmtProduct(d, x.code, x.descr) : mgmtSku(d, x.code);
    return m && m !== x.descr ? { ...x, descr: m, sapDescr: x.descr } : x;
  });
}
const sortOpts = (o: HierOption[]) => o.sort((a, b) => (a.descr || a.code).localeCompare(b.descr || b.code) || a.code.localeCompare(b.code));

/** Brands (the detection call). Returns the brands or the problem; remembered per system for 10 minutes. */
export async function loadBrands(c: HierCriteria = {}, opts: SapGetOptions & { force?: boolean } = {}): Promise<{ brands: HierOption[]; problem: HierProblem | null; system: string }> {
  const system = sapConfig().system;
  const key = `${system}|${list(c.werks).join(',')}`;
  const hit = cap.get(key);
  if (!opts.force && hit && Date.now() - hit.at < HIER_CAP_TTL_MS) return { brands: hit.brands ?? [], problem: hit.problem, system };
  try {
    const req = hierRequest('B', c);
    const r = await sapGetCollection(req.entitySet, req.params, opts);
    const brands = sortOpts(await withMgmt(r.rows.map(toOption)));
    const problem: HierProblem | null = brands.length ? null : { kind: 'empty', system };
    cap.set(key, { at: Date.now(), brands, problem });
    return { brands, problem, system };
  } catch (e) {
    if (e instanceof SapError && (e.kind === 'aborted')) throw e;
    const problem = classifyHierError(e, system);
    if (problem.kind !== 'error') cap.set(key, { at: Date.now(), brands: null, problem }); // temporary errors are not remembered
    return { brands: [], problem, system };
  }
}

export async function loadLevel(level: 'P' | 'C', c: HierCriteria, opts: SapGetOptions = {}): Promise<HierOption[]> {
  const req = hierRequest(level, c);
  const r = await sapGetCollection(req.entitySet, req.params, opts);
  return sortOpts(await withMgmt(r.rows.map(toOption)));
}

export interface HierMaterials { rows: MaterialRow[]; capped: boolean }
export async function loadHierMaterials(c: MaterialCriteria, opts: SapGetOptions = {}): Promise<HierMaterials | null> {
  const req = hierMaterialsRequest(c);
  if (!req) return null;
  let r;
  try {
    r = await sapGetCollection(req.entitySet, req.params, opts);
  } catch (e) {
    // New names not on this system yet: remember it and ask again with the legacy names.
    if (!isNewCascadePropertyMissing(e) || cascadeFields() === 'legacy') throw e;
    markCascadeLegacy();
    const again = hierMaterialsRequest(c, 'legacy')!;
    r = await sapGetCollection(again.entitySet, again.params, opts);
  }
  const rows = r.rows.map((raw) => normalizeEntity<MaterialRow>(raw, MATERIAL));
  return { rows, capped: rows.length >= HIER_MATERIALS_MAX };
}

/** Picking a level sets it; lower levels stay until their reloaded list no longer has them (keepValid). */
export interface HierPick { brand: string; product: string; sku: string }
export function pickLevel(pick: HierPick, level: keyof HierPick, value: string): HierPick {
  return { ...pick, [level]: value };
}

/** Clears a product / SKU selection that is not in its freshly loaded list (null = list not loaded yet: keep). */
export function keepValid(pick: HierPick, products: HierOption[] | null, skus: HierOption[] | null): HierPick {
  const product = pick.product && products && !products.some((o) => o.code === pick.product) ? '' : pick.product;
  const sku = pick.sku && skus && !skus.some((o) => o.code === pick.sku) ? '' : pick.sku;
  return product === pick.product && sku === pick.sku ? pick : { ...pick, product, sku };
}
