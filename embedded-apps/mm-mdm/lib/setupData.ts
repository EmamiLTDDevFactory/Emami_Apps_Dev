/**
 * Product hierarchy creation and CRS product grouping (set-up done before material creation).
 *
 * MOCK. New hierarchy nodes and CRS groupings are kept in the browser (localStorage) so the
 * demo survives a reload. To go live, replace the bodies of the exported functions with calls
 * to the SAP backend (T179 / T179T for the hierarchy, the CRS Z-table for groupings).
 */
import type { Opt } from './valueHelps';

const STORAGE_KEY = 'sap-mdm-setup-v1';

/* ------------------------------------------------------------------ */
/* Stored state                                                         */
/* ------------------------------------------------------------------ */

export interface HierarchyRecord {
  code: string; // 18 characters
  texts: string[]; // one per level
  newLevels: number[]; // which levels were created by this request
  by: string;
  at: string;
}

export interface CrsFile {
  name: string;
  size: number;
}

export interface CrsRecord {
  grouping: string;
  crsProduct: string;
  crsProductText: string;
  productGroup: string;
  productGroupText: string;
  skuGroup: string;
  skuGroupText: string;
  skuSize: number;
  unit: string;
  businessVertical: string;
  files: CrsFile[];
  comments: string;
  by: string;
  at: string;
}

interface SetupState {
  /** Extra hierarchy nodes, keyed by "<level>:<parent path>" */
  phExtra: Record<string, Opt[]>;
  hierarchies: HierarchyRecord[];
  crsExtra: { products: Opt[]; productGroups: Opt[]; skuGroups: Opt[] };
  crs: CrsRecord[];
}

const empty = (): SetupState => ({ phExtra: {}, hierarchies: [], crsExtra: { products: [], productGroups: [], skuGroups: [] }, crs: [] });

let state: SetupState | null = null;

function load(): SetupState {
  if (state) return state;
  state = empty();
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) state = { ...empty(), ...JSON.parse(raw) };
    } catch {
      /* ignore */
    }
  }
  return state!;
}

function save(next: SetupState) {
  state = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function resetSetupData() {
  save(empty());
}

/* ------------------------------------------------------------------ */
/* Product hierarchy extras (read by valueHelps.getHierarchyOptions)    */
/* ------------------------------------------------------------------ */

const phKey = (level: number, path: string[]) => `${level}:${path.slice(0, level).join('')}`;

export function extraHierarchyOptions(level: number, path: string[]): Opt[] {
  return load().phExtra[phKey(level, path)] ?? [];
}

export function listHierarchies(): HierarchyRecord[] {
  return load().hierarchies;
}

/** Stores the new nodes of a hierarchy. `levels` holds code + text per level; `isNew` marks the ones to create. */
export function createHierarchy(levels: { code: string; text: string; isNew: boolean }[], by: string): HierarchyRecord {
  const s = load();
  const phExtra = { ...s.phExtra };
  const path = levels.map((l) => l.code);
  levels.forEach((l, i) => {
    if (!l.isNew) return;
    const key = phKey(i, path);
    phExtra[key] = [...(phExtra[key] ?? []), { value: l.code, label: l.text.toUpperCase() }];
  });
  const rec: HierarchyRecord = {
    code: path.join(''),
    texts: levels.map((l) => l.text.toUpperCase()),
    newLevels: levels.map((l, i) => (l.isNew ? i : -1)).filter((i) => i >= 0),
    by,
    at: new Date().toISOString(),
  };
  save({ ...s, phExtra, hierarchies: [rec, ...s.hierarchies] });
  return rec;
}

/* ------------------------------------------------------------------ */
/* CRS value helps                                                      */
/* ------------------------------------------------------------------ */

const o = (pairs: [string, string][]): Opt[] => pairs.map(([value, label]) => ({ value, label }));

const CRS_PRODUCTS = o([
  ['CP0001', 'GLOWRA FAIRNESS CREAM'],
  ['CP0002', 'COOLBREEZE COOL TALC'],
  ['CP0003', 'COOLBREEZE COOL OIL'],
  ['CP0004', 'VEDARA PAIN BALM'],
  ['CP0005', 'VEDARA CHYAWANPRASH'],
  ['CP0006', 'PUREHARVEST MUSTARD OIL'],
]);

const CRS_PRODUCT_GROUPS = o([
  ['PG1', 'SKIN CARE'],
  ['PG2', 'TALCUM'],
  ['PG3', 'HAIR & BODY OIL'],
  ['PG4', 'PAIN MANAGEMENT'],
  ['PG5', 'HEALTH SUPPLEMENTS'],
  ['PG6', 'EDIBLE OILS'],
]);

const CRS_SKU_GROUPS = o([
  ['SG1', 'SACHET / MINI'],
  ['SG2', 'SMALL'],
  ['SG3', 'MEDIUM'],
  ['SG4', 'LARGE'],
  ['SG5', 'FAMILY / BULK'],
]);

export const CRS_UNITS = o([
  ['G', 'Gram'],
  ['KG', 'Kilogram'],
  ['ML', 'Millilitre'],
  ['L', 'Litre'],
  ['EA', 'Each'],
]);

export type CrsHelp = 'products' | 'productGroups' | 'skuGroups';

export function crsOptions(id: CrsHelp): Opt[] {
  const base = id === 'products' ? CRS_PRODUCTS : id === 'productGroups' ? CRS_PRODUCT_GROUPS : CRS_SKU_GROUPS;
  return [...base, ...load().crsExtra[id]];
}

export const CRS_CODE_LEN: Record<CrsHelp, number> = { products: 6, productGroups: 3, skuGroups: 3 };

export function listCrs(): CrsRecord[] {
  return load().crs;
}

/** CRS grouping key: product + product group + SKU group + size and unit (e.g. CP0001PG1SG2-50G) */
export function crsGroupingKey(product: string, group: string, sku: string, size: number, unit: string): string {
  if (!product || !group || !sku || !(size > 0) || !unit) return '';
  const sz = Number.isInteger(size) ? String(size) : size.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${product}${group}${sku}-${sz}${unit}`;
}

export function createCrs(rec: Omit<CrsRecord, 'at' | 'grouping'>, newCodes: Partial<Record<CrsHelp, Opt>>): CrsRecord | string {
  const s = load();
  const grouping = crsGroupingKey(rec.crsProduct, rec.productGroup, rec.skuGroup, rec.skuSize, rec.unit);
  if (s.crs.some((x) => x.grouping === grouping)) return `CRS grouping ${grouping} already exists`;
  const crsExtra = { ...s.crsExtra };
  (Object.keys(newCodes) as CrsHelp[]).forEach((k) => {
    const v = newCodes[k];
    if (v) crsExtra[k] = [...crsExtra[k], { value: v.value, label: v.label.toUpperCase() }];
  });
  const full: CrsRecord = { ...rec, grouping, at: new Date().toISOString() };
  save({ ...s, crsExtra, crs: [full, ...s.crs] });
  return full;
}
