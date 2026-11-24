/**
 * Management names for brand, product and SKU (proposed product hierarchy workbook, rows with Action OK / Note only). DISPLAY ONLY: codes, filters,
 * SAP requests and exports never see these names. Lookup order: the code (full hierarchy key), else the SAP description (when it is unique in the workbook),
 * else nothing, and the caller keeps the SAP text. NEXT_PUBLIC_MGMT_NAMES=off switches it off.
 * Data: src/data/mgmtNames.json (brand key 6, product key 10, SKU key 13 = banner+brand+product+size), loaded on demand.
 */
export interface MgmtData { brand4?: Record<string, string>; brand4x?: Record<string, Array<[string, string]>>; brand: Record<string, string>; brandText: Record<string, string>; product: Record<string, string>; productText: Record<string, string>; sku: Record<string, string> }
export const mgmtEnabled = () => (process.env.NEXT_PUBLIC_MGMT_NAMES || '').trim().toLowerCase() !== 'off';
const norm = (s: string) => (s || '').replace(/\s+/g, ' ').trim().toUpperCase();
let p: Promise<MgmtData | null> | null = null;
export function loadMgmt(): Promise<MgmtData | null> {
  if (!mgmtEnabled()) return Promise.resolve(null);
  p ??= import('../../data/mgmtNames.json').then((m) => ((m.default ?? m) as unknown) as MgmtData).catch(() => null);
  return p;
}
const byKey = (map: Record<string, string>, code: string, lens: number[]): string | undefined => {
  const c = (code || '').trim();
  if (!c) return undefined;
  if (map[c]) return map[c];
  for (const n of lens) if (c.length > n && /^\d+$/.test(c) && map[c.slice(0, n)]) return map[c.slice(0, n)];
  return undefined;
};
/** Brand: the 6 character hierarchy key, else the 4 character brand code (the same code can belong to two banners: then the SAP text decides, or nothing), else the SAP text. */
export const mgmtBrand = (d: MgmtData | null, code: string, sapDescr = ''): string | undefined => {
  if (!d) return undefined;
  const c = (code || '').trim();
  const k = byKey(d.brand, c, [6]);
  if (k) return k;
  if (/^\d{4}$/.test(c)) {
    if (d.brand4?.[c]) return d.brand4[c];
    const cand = d.brand4x?.[c]; const t = norm(sapDescr);
    const hit = cand && t ? cand.find(([cur]) => cur === t) : undefined;
    if (hit) return hit[1];
  }
  return d.brandText[norm(sapDescr)];
};
export const mgmtProduct = (d: MgmtData | null, code: string, sapDescr = ''): string | undefined => d ? (byKey(d.product, code, [10]) ?? d.productText[norm(sapDescr)]) : undefined;
/** "Brand | Product | size" of a SKU, from its hierarchy key (SKU key, or a longer product hierarchy code). */
export const mgmtSku = (d: MgmtData | null, code: string): string | undefined => d ? byKey(d.sku, code, [13]) : undefined;
