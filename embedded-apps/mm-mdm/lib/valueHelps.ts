/**
 * Value helps (F4 / search helps) for the material key data screen.
 *
 * MOCK DATA. Every list below stands in for an SAP value help. To go live, replace the
 * bodies of getValueHelp / getHierarchyOptions with calls to the SAP backend (OData
 * value-help entity sets); the screens only call these functions and never read the
 * constants directly.
 */
import { MaterialData } from './types';
import { extraHierarchyOptions } from './setupData';
import { PH_LIVE_SEGMENTS, phCached, phLive } from './phApi';

export interface Opt {
  value: string;
  label: string;
}

const o = (pairs: [string, string][]): Opt[] => pairs.map(([value, label]) => ({ value, label }));

/* ------------------------------------------------------------------ */
/* Flat lists                                                           */
/* ------------------------------------------------------------------ */

/** T134 – material types. FRT2 and WIP texts are placeholders: confirm against T134T. */
export const MATERIAL_TYPES = o([
  ['DIEN', 'Service'],
  ['EPA', 'Equipment Package'],
  ['EPCG', 'EPCG-Material'],
  ['ERSA', 'Spare Parts'],
  ['FERT', 'Finished Product'],
  ['FGTR', 'Beverages'],
  ['FHMI', 'Production Resource/Tool'],
  ['FOOD', 'Foods (excl. perishables)'],
  ['FRT2', 'Finished Product (Type 2)'],
  ['HALB', 'Semifinished Product'],
  ['HAWA', 'Trading Goods'],
  ['NLAG', 'Non-Stock Material'],
  ['ROH', 'Raw Material'],
  ['UNBW', 'Non-Valuated Material'],
  ['VERP', 'Packaging'],
  ['WIP', 'Work in Process'],
]);

/** T137 – industry sectors */
export const INDUSTRY_SECTORS = o([
  ['1', 'Retail'],
  ['A', 'Plant engin./construction'],
  ['C', 'Chemical industry'],
  ['F', 'FMCG Industries'],
  ['M', 'Mechanical engineering'],
  ['P', 'Pharmaceuticals'],
]);

/** T023 – material groups. 413 and 414 are placeholders (not visible in the SAP screenshot). */
export const MATERIAL_GROUPS = o([
  ['401', 'COSMETICS'],
  ['402', 'TOILETRIES'],
  ['403', 'SHAMPOOS'],
  ['404', 'AYURVEDIC'],
  ['405', 'OTHER EXPORT GOODS'],
  ['406', 'SOAPS'],
  ['407', 'Foods & Beverages'],
  ['408', 'Organic Products'],
  ['409', 'Generic Ayurvedic'],
  ['410', 'FG Samples'],
  ['411', 'Competitors Samples'],
  ['412', 'DAMAGED'],
  ['413', 'HAIR OILS'],
  ['414', 'OTC HEALTHCARE'],
]);

export const BUSINESS_VERTICALS = o([
  ['01', 'DOM-CCD'],
  ['02', 'DOM-HPC'],
  ['03', 'INTERNATIONAL'],
  ['04', 'INSTITUTIONAL'],
  ['05', 'E-COMMERCE'],
]);

export const SCHEMES = o([
  ['0', 'No scheme'],
  ['C', 'Consumer offer'],
  ['F', 'Free goods'],
  ['T', 'Trade scheme'],
]);

/** TSPA – divisions */
export const DIVISIONS = o([
  ['01', 'Cosmetics'],
  ['02', 'Toiletries'],
  ['03', 'Ayurvedic'],
  ['04', 'Foods'],
  ['05', 'OTC Healthcare'],
  ['99', 'Common'],
]);

/** T001W – plants */
export const PLANTS = o([
  ['1000', 'Kolkata Plant'],
  ['1100', 'Guwahati Plant'],
  ['1200', 'Pantnagar Plant'],
  ['1300', 'Baddi Plant'],
]);

/** T001L – storage locations per plant */
const STORAGE_LOCATIONS: Record<string, Opt[]> = {
  '1000': o([['0001', 'Raw Material Store'], ['0002', 'Packing Material Store'], ['0003', 'Finished Goods Store'], ['0004', 'Quarantine']]),
  '1100': o([['0001', 'Raw Material Store'], ['0002', 'Packing Material Store'], ['0003', 'Finished Goods Store']]),
  '1200': o([['0001', 'Raw Material Store'], ['0002', 'Packing Material Store'], ['0003', 'Finished Goods Store'], ['0004', 'Quarantine']]),
  '1300': o([['0001', 'Raw Material Store'], ['0003', 'Finished Goods Store']]),
};

/** TVKO – sales organizations */
export const SALES_ORGS = o([
  ['1000', 'Domestic Sales'],
  ['2000', 'Export Sales'],
  ['3000', 'Institutional Sales'],
]);

/** TVKOV – distribution channels allowed per sales organization */
const DIST_CHANNELS: Record<string, Opt[]> = {
  '1000': o([['10', 'General Trade'], ['20', 'Modern Trade'], ['30', 'E-Commerce']]),
  '2000': o([['40', 'Export']]),
  '3000': o([['10', 'General Trade'], ['50', 'Institutional / CSD']]),
};

/** T320 – warehouse numbers assigned to each plant */
const WAREHOUSES: Record<string, Opt[]> = {
  '1000': o([['K01', 'Kolkata Central Warehouse'], ['K02', 'Kolkata Depot']]),
  '1100': o([['G01', 'Guwahati Warehouse']]),
  '1200': o([['P01', 'Pantnagar Warehouse']]),
  '1300': [],
};

/** T301 – storage types per warehouse */
const STD_STORAGE_TYPES = o([['001', 'High Rack Storage'], ['002', 'Bulk Storage'], ['003', 'Fixed Bin Picking'], ['902', 'GR Area']]);
const STORAGE_TYPES: Record<string, Opt[]> = {
  K01: STD_STORAGE_TYPES,
  K02: o([['002', 'Bulk Storage'], ['902', 'GR Area']]),
  G01: STD_STORAGE_TYPES,
  P01: o([['001', 'High Rack Storage'], ['902', 'GR Area']]),
};

/* ------------------------------------------------------------------ */
/* Value help access (the only entry points the screens use)            */
/* ------------------------------------------------------------------ */

export type HelpId =
  | 'materialType' | 'industrySector' | 'materialGroup' | 'businessVertical' | 'scheme' | 'division'
  | 'plant' | 'storageLocation' | 'salesOrg' | 'distChannel' | 'warehouseNo' | 'storageType';

/** Which help a field depends on: its list changes when the parent changes */
export const HELP_PARENT: Partial<Record<HelpId, HelpId>> = {
  storageLocation: 'plant',
  warehouseNo: 'plant',
  distChannel: 'salesOrg',
  storageType: 'warehouseNo',
};

/** Returns the allowed values for a field, given the data entered so far */
export function getValueHelp(id: HelpId, ctx: Partial<MaterialData> = {}): Opt[] {
  switch (id) {
    case 'materialType': return MATERIAL_TYPES;
    case 'industrySector': return INDUSTRY_SECTORS;
    case 'materialGroup': return MATERIAL_GROUPS;
    case 'businessVertical': return BUSINESS_VERTICALS;
    case 'scheme': return SCHEMES;
    case 'division': return DIVISIONS;
    case 'plant': return PLANTS;
    case 'storageLocation': return STORAGE_LOCATIONS[ctx.plant ?? ''] ?? [];
    case 'salesOrg': return SALES_ORGS;
    case 'distChannel': return DIST_CHANNELS[ctx.salesOrg ?? ''] ?? [];
    case 'warehouseNo': return WAREHOUSES[ctx.plant ?? ''] ?? [];
    case 'storageType': return STORAGE_TYPES[ctx.warehouseNo ?? ''] ?? [];
  }
}

export function helpText(id: HelpId, value: string, ctx: Partial<MaterialData> = {}): string {
  return getValueHelp(id, ctx).find((x) => x.value === value)?.label ?? '';
}

export function isValidValue(id: HelpId, value: string, ctx: Partial<MaterialData> = {}): boolean {
  return getValueHelp(id, ctx).some((x) => x.value === value);
}

/* ------------------------------------------------------------------ */
/* Product hierarchy (Banner > Brand > Product > SKU > Variant > Scheme) */
/* Each level adds a 3-digit code: 001 + 002 + 003 ... = 18 characters  */
/* ------------------------------------------------------------------ */

export const PH_LEVELS = ['Banner', 'Brand', 'Product', 'SKU', 'Variant', 'Scheme'] as const;
/** Code length per level: 3 x 6 in the demo, 2/4/4/3/3/2 in SAP (live, see phApi.ts). Both add up to 18. */
export const PH_LENGTH = 18;
export const phSegLen = (level: number): number => (phLive() ? PH_LIVE_SEGMENTS[level] : 3);

interface PhNode {
  code: string;
  text: string;
  subs?: PhNode[];
}

const n = (code: string, text: string, subs?: PhNode[]): PhNode => ({ code, text, subs });
const skus = (...sizes: string[]) => sizes.map((s, i) => n(String(i + 1).padStart(3, '0'), s));

/** Banner > Brand > Product > SKU */
const PH_TREE: PhNode[] = [
  n('001', 'PERSONAL CARE', [
    n('001', 'GLOWRA', [
      n('001', 'FAIRNESS CREAM', skus('25 G', '50 G', '80 G')),
      n('002', 'COLD CREAM', skus('50 ML', '100 ML')),
    ]),
    n('002', 'COOLBREEZE', [
      n('001', 'COOL TALC', skus('100 G', '200 G', '400 G')),
      n('002', 'COOL OIL', skus('90 ML', '180 ML')),
    ]),
  ]),
  n('002', 'HEALTHCARE', [
    n('001', 'VEDARA', [
      n('001', 'PAIN BALM', skus('8 ML', '25 ML')),
      n('002', 'CHYAWANPRASH', skus('500 G', '1 KG')),
    ]),
    n('002', 'HERBOCARE', [
      n('001', 'ANTISEPTIC CREAM', skus('20 ML', '40 ML')),
    ]),
  ]),
  n('003', 'FOODS', [
    n('001', 'PUREHARVEST', [
      n('001', 'MUSTARD OIL', skus('500 ML', '1 L', '5 L')),
      n('002', 'HONEY', skus('250 G', '500 G')),
    ]),
  ]),
];

/** Variants and schemes are the same for every SKU in the mock */
const PH_VARIANTS = [n('001', 'REGULAR'), n('002', 'HERBAL'), n('003', 'EXPORT PACK')];
const PH_SCHEMES = [n('001', 'NO SCHEME'), n('002', 'CONSUMER OFFER'), n('003', 'TRADE PROMOTION'), n('004', 'FREE SAMPLE')];

/**
 * Options for hierarchy level `level` (0 = Banner ... 5 = Scheme), given the codes chosen
 * for the levels above it.
 */
export function getHierarchyOptions(level: number, path: string[]): Opt[] {
  if (phLive()) {
    // SAP's own list (loaded by phLoad); codes created in the portal this session are added by setupData
    const live = phCached(level, path) ?? [];
    const extra = extraHierarchyOptions(level, path).filter((x) => !live.some((s) => s.value === x.value));
    return [...live, ...extra].sort((a, b) => a.value.localeCompare(b.value));
  }
  // Every level above must hold an existing code (standard or created in Product Hierarchy Creation)
  for (let i = 0; i < level; i++) {
    if (!getHierarchyOptions(i, path).some((x) => x.value === path[i])) return [];
  }
  let nodes: PhNode[] = [];
  if (level <= 3) {
    // Walk Banner > Brand > Product > SKU; a parent created in the portal has no standard children
    let cur: PhNode[] | undefined = PH_TREE;
    for (let i = 0; i < level && cur; i++) cur = cur.find((x) => x.code === path[i])?.subs;
    nodes = cur ?? [];
  } else if (level === 4) nodes = PH_VARIANTS;
  else if (level === 5) nodes = PH_SCHEMES;
  const std = nodes.map((x) => ({ value: x.code, label: x.text }));
  const extra = extraHierarchyOptions(level, path).filter((x) => !std.some((s) => s.value === x.value));
  return [...std, ...extra].sort((a, b) => a.value.localeCompare(b.value));
}

export function splitHierarchy(code: string): string[] {
  const parts: string[] = [];
  let at = 0;
  for (let i = 0; i < PH_LEVELS.length && at < code.length; i++) {
    parts.push(code.slice(at, at + phSegLen(i)));
    at += phSegLen(i);
  }
  return parts;
}

/** Decodes an 18-character product hierarchy into its six levels; valid only if every level exists */
export function decodeHierarchy(code: string): { valid: boolean; parts: { level: string; code: string; text: string }[] } {
  const codes = splitHierarchy(code);
  const parts: { level: string; code: string; text: string }[] = [];
  let valid = code.length === PH_LENGTH && /^\d+$/.test(code);
  PH_LEVELS.forEach((level, i) => {
    const c = codes[i] ?? '';
    const text = c ? getHierarchyOptions(i, codes).find((x) => x.value === c)?.label ?? '' : '';
    // Live: the texts come from SAP once loaded; a code is valid by its shape (SAP checks existence on submit)
    if (!text && !phLive()) valid = false;
    parts.push({ level, code: c, text });
  });
  return { valid, parts };
}

export function hierarchyText(code: string): string {
  if (!code) return '';
  const d = decodeHierarchy(code);
  return d.valid && d.parts.every((p) => p.text) ? d.parts.map((p) => p.text).join(' › ') : '';
}
