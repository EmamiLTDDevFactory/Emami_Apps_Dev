/**
 * Product hierarchy helpers of the material screens. The values come only from SAP (lib/phApi.ts, product hierarchy service); there is
 * no demo tree. The flat value helps (material type, plant, ...) are live too: lib/mmValueHelp.ts.
 */
import { PH_LIVE_SEGMENTS, phCached } from './phApi';

export interface Opt {
  value: string;
  label: string;
}

/**
 * Used ONLY by the demo fallback of the set-up screens (components/setup/HierarchyCrs.tsx, unreachable now that phLive() is always true;
 * the live CRS screen loads the verticals from SAP). Not used by any material screen.
 */
export const BUSINESS_VERTICALS: Opt[] = [
  { value: '01', label: 'DOM-CCD' },
  { value: '02', label: 'DOM-HPC' },
  { value: '03', label: 'INTERNATIONAL' },
  { value: '04', label: 'INSTITUTIONAL' },
  { value: '05', label: 'E-COMMERCE' },
];
export function helpText(_id: 'businessVertical', value: string): string {
  return BUSINESS_VERTICALS.find((x) => x.value === value)?.label ?? '';
}

/* ------------------------------------------------------------------ */
/* Product hierarchy (Banner > Brand > Product > SKU > Variant > Scheme) */
/* Each level adds its code: 2 + 4 + 4 + 3 + 3 + 2 = 18 characters       */
/* ------------------------------------------------------------------ */

export const PH_LEVELS = ['Banner', 'Brand', 'Product', 'SKU', 'Variant', 'Scheme'] as const;
/** Code length per level in SAP (2/4/4/3/3/2, see phApi.ts); they add up to 18. */
export const PH_LENGTH = 18;
export const phSegLen = (level: number): number => (PH_LIVE_SEGMENTS[level]);

/**
 * Options for hierarchy level `level` (0 = Banner ... 5 = Scheme), given the codes chosen
 * for the levels above it.
 */
export function getHierarchyOptions(level: number, path: string[]): Opt[] {
  // SAP's own list (loaded by phLoad in lib/phApi.ts); empty until it is loaded or when SAP could not be read (phError)
  return [...(phCached(level, path) ?? [])].sort((a, b) => a.value.localeCompare(b.value));
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
    // The texts come from SAP once loaded; a code is valid by its shape (SAP checks existence on submit)
    parts.push({ level, code: c, text });
  });
  return { valid, parts };
}

export function hierarchyText(code: string): string {
  if (!code) return '';
  const d = decodeHierarchy(code);
  return d.valid && d.parts.every((p) => p.text) ? d.parts.map((p) => p.text).join(' › ') : '';
}
