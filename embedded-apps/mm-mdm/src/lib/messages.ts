// Messages of a failed action: where they point (the field, and the grid row) and which tab they belong to.
// Shape: { code, message, severity E/W/I/S, target } with target 'Entity/FIELD' or 'Entity[2]/FIELD'.
// The index in a target is 1-based (SAP counts rows from 1); the screen counts rows from 0, so it is converted here, once.
import type { Message } from './types';

export interface ParsedTarget {
  entity: string;
  /** ABAP field name (NTGEW, MEINH). The Gateway sends camel case (Ntgew, SerialNo): converted. */
  field: string;
  /** 0-based grid row; undefined for single-row entities */
  row?: number;
}

/** Camel case property name of the OData model to the ABAP name: SerialNo -> SERIAL_NO, Dismm -> DISMM. ABAP names pass through. */
export function abapField(f: string): string {
  return /[a-z]/.test(f) ? f.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase() : f;
}

export function parseTarget(target?: string): ParsedTarget | undefined {
  const m = /^([A-Za-z][A-Za-z0-9]*)(?:\[(\d+)\])?\/([A-Za-z][A-Za-z0-9_]*)$/.exec((target ?? '').trim());
  if (!m) return undefined;
  return { entity: m[1], field: abapField(m[3]), ...(m[2] !== undefined ? { row: Math.max(0, Number(m[2]) - 1) } : {}) };
}

/** Key of a field in the form definition and in the screen's message map: 'Material.NTGEW'. */
export const fieldKey = (p: Pick<ParsedTarget, 'entity' | 'field'>): string => `${p.entity}.${p.field}`;
/** Key of one grid cell: 'UnitOfMeasure.MEINH#1' for row 2 of the target (the grid and the editor use this one function). */
export const cellKey = (p: ParsedTarget): string => (p.row === undefined ? fieldKey(p) : `${fieldKey(p)}#${p.row}`);
/** Key under which a message is shown at its field (undefined for general messages). */
export function messageKey(m: Message): string | undefined {
  const p = parseTarget(m.target);
  return p ? cellKey(p) : undefined;
}

/** First message per field/cell (the one shown under the input). */
export function indexByField(messages: Message[]): Record<string, Message> {
  const out: Record<string, Message> = {};
  for (const m of messages) { const k = messageKey(m); if (k && !out[k]) out[k] = m; }
  return out;
}

export interface TabLike { id: string; title: string; entity: string; fields: string[] }

/** The tab of a message: the first selected tab that lists the field, else the first tab of that entity. */
export function tabOfTarget(p: ParsedTarget | undefined, tabs: TabLike[]): TabLike | undefined {
  if (!p) return undefined;
  return tabs.find((t) => t.entity === p.entity && t.fields.includes(fieldKey(p))) ?? tabs.find((t) => t.entity === p.entity);
}

export interface TabGroup { tab: TabLike; messages: Message[]; errors: number; warnings: number }

export const countOf = (messages: Message[]) => ({ errors: messages.filter((m) => m.severity === 'E').length, warnings: messages.filter((m) => m.severity === 'W').length });

/** All messages grouped by tab, in tab order; messages that point to no selected tab (or to nothing) are 'general'. */
export function groupByTab(messages: Message[], tabs: TabLike[]): { groups: TabGroup[]; general: Message[] } {
  const by = new Map<string, Message[]>();
  const general: Message[] = [];
  for (const m of messages) {
    const t = tabOfTarget(parseTarget(m.target), tabs);
    if (!t) { general.push(m); continue; }
    const l = by.get(t.id) ?? [];
    l.push(m);
    by.set(t.id, l);
  }
  const groups = tabs.filter((t) => by.has(t.id)).map((t) => ({ tab: t, messages: by.get(t.id)!, ...countOf(by.get(t.id)!) }));
  return { groups, general };
}
