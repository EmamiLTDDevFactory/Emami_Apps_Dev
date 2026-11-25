/**
 * Brand and product DESCRIPTIONS for the dropdowns and tables that only carry codes (dashboard, Cost report, Margin selection ...).
 * Source: SAP's HierVHSet (Level B = brand, Level P = product), the same lists the "Pick by Brand -> Product -> SKU" picker uses. One read per system,
 * remembered for 10 minutes; if SAP cannot answer, the maps stay empty and every screen simply shows the code, as before.
 */
import { loadBrands, loadLevel, type HierOption } from './hier';
import { sapConfig } from '../sap/config';
import { loadMgmt, mgmtBrand, mgmtProduct, type MgmtData } from './mgmtNames';

export interface HierNames { brand: Map<string, string>; product: Map<string, string> }
export const EMPTY_NAMES: HierNames = { brand: new Map(), product: new Map() };
const TTL = 10 * 60 * 1000;
const cache = new Map<string, { at: number; p: Promise<HierNames> }>();

/** code -> name: the management name when the workbook has one for it, else the SAP description (only when it says more than the code). */
const toMap = (o: HierOption[], mgmt: MgmtData | null, pick: typeof mgmtBrand) => new Map(o.flatMap((x) => {
  const code = (x.code ?? '').trim(); if (!code) return [];
  const m = pick(mgmt, code, x.descr ?? '');
  const d = (x.descr ?? '').trim();
  return m ? [[code, m] as const] : d && d !== code ? [[code, d] as const] : [];
}));

export function loadHierNames(): Promise<HierNames> {
  let system = '';
  try { system = sapConfig().system; } catch { return Promise.resolve(EMPTY_NAMES); }
  const hit = cache.get(system);
  if (hit && Date.now() - hit.at < TTL) return hit.p;
  const p = (async () => {
    const mgmt = await loadMgmt();
    const [b, pr] = await Promise.all([
      loadBrands({}).then((r) => toMap(r.brands, mgmt, mgmtBrand)).catch(() => new Map<string, string>()),
      loadLevel('P', {}).then((o) => toMap(o, mgmt, mgmtProduct)).catch(() => new Map<string, string>()),
    ]);
    return { brand: b, product: pr };
  })();
  cache.set(system, { at: Date.now(), p });
  return p;
}

/** "<Description> (<code>)", or just the code when there is no description. */
export const withName = (code: string, names: Map<string, string>): string => {
  const c = (code ?? '').trim();
  if (!c) return '';
  const d = names.get(c);
  return d ? `${d} (${c})` : c;
};
