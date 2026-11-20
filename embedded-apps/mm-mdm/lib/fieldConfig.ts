import { FieldKey, MaterialData } from './types';
import { KEY_FIELD_BY_KEY, helpOf } from './keyFields';
import { hierarchyText } from './valueHelps';
import { vhText } from './mmValueHelp';
import { VIEWS, ViewDef } from './materialViews';

export type { FieldDef, ViewDef, GroupDef, ColumnDef, ViewCategory, Opt } from './materialViews';
export { VIEWS, VIEW_CATEGORIES } from './materialViews';
export { KEY_FIELDS, KEY_FIELD_BY_KEY, KEY_LABELS, DESCRIPTION_MAX, LONG_TEXT_MAX } from './keyFields';
export type { KeyFieldDef, HelpSpec } from './keyFields';

/**
 * Form definition. Key data (start screen) is in lib/keyFields.ts; the views (tabs) with all their blocks and fields live in
 * lib/materialViews.ts. What a user sees and may change comes from SAP (GET /fieldcontrol, allowed actions), never from here.
 */

export const VIEW_BY_ID = Object.fromEntries(VIEWS.map((v) => [v.id, v])) as Record<string, ViewDef>;
export const ALL_VIEW_IDS: string[] = VIEWS.map((v) => v.id);

/** Field definition by key, pointing at the view that maintains it (ref fields excluded) */
export const FIELD_BY_KEY = Object.fromEntries(
  VIEWS.flatMap((v) => v.groups.flatMap((g) => g.fields.filter((f) => f.type !== 'ref').map((f) => [f.key, { ...f, view: v.id }]))),
) as Partial<Record<FieldKey, import('./materialViews').FieldDef & { view: string }>>;

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

/** "code – text" for display. Texts come from the SAP value helps already loaded; without a text the plain code is shown. */
export function displayValue(key: FieldKey, value: string, data?: Partial<MaterialData>): string {
  if (!value) return '';
  const keyDef = KEY_FIELD_BY_KEY[key];
  if (keyDef?.help) {
    const h = helpOf(keyDef.help, data ?? {});
    const label = h ? vhText(keyDef.help.name, h, value) : '';
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
  if (def?.type === 'date') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  if (def?.type === 'select') {
    const label = vhText(def.help ?? def.tech, {}, value);
    return label ? `${value} – ${label}` : value;
  }
  return value + (def?.unit ? ` ${def.unit}` : '');
}
