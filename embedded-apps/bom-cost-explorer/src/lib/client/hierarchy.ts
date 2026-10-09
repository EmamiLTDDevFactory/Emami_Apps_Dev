/**
 * Brand -> Product (SKU group) -> CRS SKU group -> Material, built from MaterialVHSet's finished goods
 * (MATERIAL_HIERARCHY in fields.ts). Each level lists only what is under the levels picked above it;
 * an empty pick ('') means "all".
 */
import type { MaterialHierarchyRow } from '../sap/fields';

export interface HierarchyPick {
  brand: string;
  product: string;
  crs: string;
}

export interface LevelOption {
  code: string;
  text: string;
  count: number;
}

export const NO_VALUE = '(none)';

const code = (v: string) => v.trim() || NO_VALUE;

function options(rows: MaterialHierarchyRow[], codeOf: (r: MaterialHierarchyRow) => string, textOf: (r: MaterialHierarchyRow) => string): LevelOption[] {
  const by = new Map<string, LevelOption>();
  for (const r of rows) {
    const c = code(codeOf(r));
    const o = by.get(c) ?? { code: c, text: '', count: 0 };
    o.count += 1;
    if (!o.text && textOf(r).trim()) o.text = textOf(r).trim();
    by.set(c, o);
  }
  // Named entries A-Z by text, then "(none)" last.
  return [...by.values()].sort((a, b) => (a.code === NO_VALUE ? 1 : b.code === NO_VALUE ? -1 : (a.text || a.code).localeCompare(b.text || b.code)));
}

const brandOf = (r: MaterialHierarchyRow) => r.Zbrandcode;
const productOf = (r: MaterialHierarchyRow) => r.Zskugrcode;
const crsOf = (r: MaterialHierarchyRow) => r.Zskugrcodecrs;
const matches = (pick: string, value: string) => !pick || code(value) === pick;

export function cascade(rows: MaterialHierarchyRow[], pick: HierarchyPick) {
  const inBrand = rows.filter((r) => matches(pick.brand, brandOf(r)));
  const inProduct = inBrand.filter((r) => matches(pick.product, productOf(r)));
  const inCrs = inProduct.filter((r) => matches(pick.crs, crsOf(r)));
  return {
    brands: options(rows, brandOf, (r) => r.Zsalesbrand),
    products: options(inBrand, productOf, (r) => r.Zskugroup),
    crs: options(inProduct, crsOf, (r) => r.Zskugroupcrs),
    materials: [...inCrs].sort((a, b) => a.Maktx.localeCompare(b.Maktx) || a.Matnr.localeCompare(b.Matnr)),
  };
}

/** Changing a level clears the levels below it. */
export function pickLevel(pick: HierarchyPick, level: keyof HierarchyPick, value: string): HierarchyPick {
  if (level === 'brand') return { brand: value, product: '', crs: '' };
  if (level === 'product') return { ...pick, product: value, crs: '' };
  return { ...pick, crs: value };
}
