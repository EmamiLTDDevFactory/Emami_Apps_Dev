import { FieldKey, MaterialData } from './types';
import { HelpId, Opt, hierarchyText, helpText } from './valueHelps';
import { WORKFLOW_DEFS } from './workflowConfig';
import { FieldDef, VIEWS, ViewDef, viewDefaults } from './materialViews';

export type { Opt } from './valueHelps';
export type { FieldDef, ViewDef, GroupDef, ColumnDef, ViewCategory } from './materialViews';
export { VIEWS, VIEW_CATEGORIES, TAX_ROWS } from './materialViews';

/**
 * Form definition. Key data (initial screen) is defined here; the views (tabs) with all
 * their blocks and fields live in lib/materialViews.ts. In live mode, field behavior
 * (shown, display-only, required) comes from GetFieldControl (MDM_MCN / MM_FELD).
 */

/* ------------------------------------------------------------------ */
/* Key data (initial screen, V_INIT)                                    */
/* ------------------------------------------------------------------ */

export interface KeyFieldDef {
  key: FieldKey;
  label: string;
  tech: string;
  required: boolean;
  /** Value help that supplies (and checks) the allowed values */
  help?: HelpId;
  section: 'key' | 'org';
}

/**
 * Fields of "Material Creation: Key data" and "Organizational Data".
 * `required` follows the asterisks of the SAP initial screen; flip a flag to change it.
 */
export const KEY_FIELDS: KeyFieldDef[] = [
  { key: 'materialType', label: 'Material type', tech: 'MTART', required: true, help: 'materialType', section: 'key' },
  { key: 'industrySector', label: 'Industry sector', tech: 'MBRSH', required: true, help: 'industrySector', section: 'key' },
  { key: 'materialGroup', label: 'Material group', tech: 'MATKL', required: true, help: 'materialGroup', section: 'key' },
  { key: 'businessVertical', label: 'Business vertical', tech: 'ZZBUSVERT', required: false, help: 'businessVertical', section: 'key' },
  { key: 'scheme', label: 'Scheme', tech: 'ZZSCHEME', required: false, help: 'scheme', section: 'key' },
  { key: 'prodHierarchy', label: 'Prod. hierarchy', tech: 'PRDHA', required: false, section: 'key' },
  { key: 'division', label: 'Division', tech: 'SPART', required: true, help: 'division', section: 'key' },
  { key: 'description', label: 'Material description', tech: 'MAKTX', required: true, section: 'key' },
  { key: 'longText', label: 'Long text', tech: 'TDLINE', required: false, section: 'key' },
  { key: 'plant', label: 'Plant', tech: 'WERKS', required: true, help: 'plant', section: 'org' },
  { key: 'storageLocation', label: 'Stor. location', tech: 'LGORT', required: true, help: 'storageLocation', section: 'org' },
  { key: 'salesOrg', label: 'Sales org', tech: 'VKORG', required: true, help: 'salesOrg', section: 'org' },
  { key: 'distChannel', label: 'Distr. channel', tech: 'VTWEG', required: true, help: 'distChannel', section: 'org' },
  { key: 'warehouseNo', label: 'Warehouse no', tech: 'LGNUM', required: false, help: 'warehouseNo', section: 'org' },
  { key: 'storageType', label: 'Storage type', tech: 'LGTYP', required: false, help: 'storageType', section: 'org' },
];

export const KEY_FIELD_BY_KEY = Object.fromEntries(KEY_FIELDS.map((f) => [f.key, f])) as Partial<Record<FieldKey, KeyFieldDef>>;

export const KEY_LABELS: Partial<Record<FieldKey, string>> = Object.fromEntries(KEY_FIELDS.map((f) => [f.key, f.label]));

/* ------------------------------------------------------------------ */
/* Views                                                                */
/* ------------------------------------------------------------------ */

export const VIEW_BY_ID = Object.fromEntries(VIEWS.map((v) => [v.id, v])) as Record<string, ViewDef>;
export const ALL_VIEW_IDS: string[] = VIEWS.map((v) => v.id);

/** Field definition by key, pointing at the view that maintains it (ref fields excluded) */
export const FIELD_BY_KEY = Object.fromEntries(
  VIEWS.flatMap((v) => v.groups.flatMap((g) => g.fields.filter((f) => f.type !== 'ref').map((f) => [f.key, { ...f, view: v.id }]))),
) as Partial<Record<FieldKey, FieldDef & { view: string }>>;

/** Every stored view field key (for empty records) */
export const ALL_FIELD_KEYS: string[] = Object.keys(FIELD_BY_KEY);

export function optionLabel(options: Opt[] | undefined, value: string): string {
  return options?.find((x) => x.value === value)?.label ?? '';
}

/** Parses a table field (JSON array); never throws */
export function tableRows(value: string | undefined): Record<string, string>[] {
  if (!value) return [];
  try {
    const rows = JSON.parse(value);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/** "code – text" for display. Pass `data` for key fields whose list depends on another field. */
export function displayValue(key: FieldKey, value: string, data?: Partial<MaterialData>): string {
  if (!value) return '';
  const keyDef = KEY_FIELD_BY_KEY[key];
  if (keyDef?.help) {
    const label = helpText(keyDef.help, value, data ?? {});
    return label ? `${value} – ${label}` : value;
  }
  if (key === 'prodHierarchy') {
    const text = hierarchyText(value);
    return text ? `${value} – ${text}` : value;
  }
  const def = FIELD_BY_KEY[key];
  if (def?.type === 'checkbox') return value === 'X' ? 'Yes' : 'No';
  if (def?.type === 'table' || def?.type === 'attachments') {
    const n = tableRows(value).length;
    return `${n} row${n === 1 ? '' : 's'}`;
  }
  if (def?.type === 'date') return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  if (def?.options) {
    const label = optionLabel(def.options, value);
    return label ? `${value} – ${label}` : value;
  }
  return value + (def?.unit ? ` ${def.unit}` : '');
}

/** Context-free defaults by material type (stand-in for the rule engine RULE_H / RULE_I) */
export function defaultsForType(type: string): Record<string, string> {
  if (!WORKFLOW_DEFS[type]) return {};
  return viewDefaults(type);
}
