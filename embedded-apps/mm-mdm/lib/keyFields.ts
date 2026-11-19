import type { FieldKey } from './types';

/** How a key field gets its list from SAP: GET /valuehelp/<name>?<param>=<value of another key field> */
export interface HelpSpec {
  name: string;
  /** query parameter -> key field whose value it carries (the list depends on it) */
  params?: Record<string, FieldKey>;
  /** Business verticals come from the CRS route of the product hierarchy service */
  source?: 'verticals';
  /** Not confirmed against SAP: when SAP has no such list the field falls back to free entry */
  soft?: boolean;
}

export interface KeyFieldDef {
  key: FieldKey;
  label: string;
  tech: string;
  required: boolean;
  help?: HelpSpec;
  section: 'key' | 'org';
}

/**
 * Fields of "Material Creation: Key data" and "Organizational Data" (the start screen).
 * `required` follows the asterisks of the SAP initial screen; SAP's own check (validate / submit) has the last word.
 */
export const KEY_FIELDS: KeyFieldDef[] = [
  { key: 'materialType', label: 'Material type', tech: 'MTART', required: true, help: { name: 'MTART' }, section: 'key' },
  { key: 'industrySector', label: 'Industry sector', tech: 'MBRSH', required: true, help: { name: 'MBRSH' }, section: 'key' },
  { key: 'materialGroup', label: 'Material group', tech: 'MATKL', required: true, help: { name: 'MATKL' }, section: 'key' },
  { key: 'businessVertical', label: 'Business vertical', tech: 'ZBUSINESS', required: false, help: { name: 'ZBUS_GRP', source: 'verticals' }, section: 'key' },
  { key: 'scheme', label: 'Scheme', tech: 'ZZSCHEME', required: false, help: { name: 'ZZSCHEME', soft: true }, section: 'key' },
  { key: 'prodHierarchy', label: 'Prod. hierarchy', tech: 'PRDHA', required: false, section: 'key' },
  { key: 'division', label: 'Division', tech: 'SPART', required: true, help: { name: 'SPART' }, section: 'key' },
  { key: 'description', label: 'Material description', tech: 'MAKTX', required: true, section: 'key' },
  { key: 'longText', label: 'Long text', tech: 'TDLINE', required: false, section: 'key' },
  { key: 'plant', label: 'Plant', tech: 'WERKS', required: true, help: { name: 'WERKS' }, section: 'org' },
  { key: 'storageLocation', label: 'Stor. location', tech: 'LGORT', required: true, help: { name: 'LGORT', params: { werks: 'plant' } }, section: 'org' },
  { key: 'salesOrg', label: 'Sales org', tech: 'VKORG', required: true, help: { name: 'VKORG' }, section: 'org' },
  { key: 'distChannel', label: 'Distr. channel', tech: 'VTWEG', required: true, help: { name: 'VTWEG', params: { vkorg: 'salesOrg' } }, section: 'org' },
  { key: 'warehouseNo', label: 'Warehouse no', tech: 'LGNUM', required: false, help: { name: 'LGNUM', params: { werks: 'plant' }, soft: true }, section: 'org' },
  { key: 'storageType', label: 'Storage type', tech: 'LGTYP', required: false, help: { name: 'LGTYP', params: { lgnum: 'warehouseNo' }, soft: true }, section: 'org' },
];

export const KEY_FIELD_BY_KEY = Object.fromEntries(KEY_FIELDS.map((f) => [f.key, f])) as Partial<Record<FieldKey, KeyFieldDef>>;
export const KEY_LABELS: Partial<Record<FieldKey, string>> = Object.fromEntries(KEY_FIELDS.map((f) => [f.key, f.label]));

/** Material description (MAKTX) length and long text length SAP takes */
export const DESCRIPTION_MAX = 40;
export const LONG_TEXT_MAX = 1000;

/** Parameters of a key field's list from the current key data; null while a field it depends on is empty (pure: lib/mmValueHelp.ts re-exports it) */
export function helpOf(spec: HelpSpec, data: Partial<Record<FieldKey, string>>): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const [param, parent] of Object.entries(spec.params ?? {})) {
    const v = data[parent];
    if (!v) return null;
    out[param] = v;
  }
  return out;
}
