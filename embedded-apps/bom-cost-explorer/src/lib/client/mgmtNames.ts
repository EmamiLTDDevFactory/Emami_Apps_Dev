/**
 * Management names for brand, product and SKU (proposed product hierarchy workbook, rows with Action OK / Note only). DISPLAY ONLY: codes, filters,
 * SAP requests and exports never see these names. Lookup order: the code (full hierarchy key), else the SAP description (when it is unique in the workbook),
 * else nothing, and the caller keeps the SAP text. NEXT_PUBLIC_MGMT_NAMES=off switches it off.
 * Data: src/data/mgmtNames.json (brand key 6, product key 10, SKU key 13 = banner+brand+product+size), loaded on demand.
 */
export interface MgmtData { brand: Record<string, string>; brandText: Record<string, string>; product: Record<string, string>; productText: Record<string, string>; sku: Record<string, string> }
export const mgmtEnabled = () => (process.env.NEXT_PUBLIC_MGMT_NAMES || '').trim().toLowerCase() !== 'off';
const norm = (s: string) => (s || '').replace(/\s+/g, ' ').trim().toUpperCase();
let p: Promise<MgmtData | null> | null = null;
export function loadMgmt(): Promise<MgmtData | null> {
  if (!mgmtEnabled()) return Promise.resolve(null);
  p ??= import('../../data/mgmtNames.json').then((m) => (m.default ?? m) as MgmtData).catch(() => null);
  return p;
}
const byKey = (map: Record<string, string>, code: string, lens: number[]): string | undefined => {
  const c = (code || '').trim();
  if (!c) return undefined;
  if (map[c]) return map[c];
  for (const n of lens) if (c.length > n && /^\d+$/.test(c) && map[c.slice(0, n)]) return map[c.slice(0, n)];
  return undefined;
};
export const mgmtBrand = (d: MgmtData | null, code: string, sapDescr = ''): string | undefined => d ? (byKey(d.brand, code, [6]) ?? d.brandText[norm(sapDescr)]) : undefined;
export const mgmtProduct = (d: MgmtData | null, code: string, sapDescr = ''): string | undefined => d ? (byKey(d.product, code, [10]) ?? d.productText[norm(sapDescr)]) : undefined;
/** "Brand | Product | size" of a SKU, from its hierarchy key (SKU key, or a longer product hierarchy code). */
export const mgmtSku = (d: MgmtData | null, code: string): string | undefined => d ? byKey(d.sku, code, [13]) : undefined;
