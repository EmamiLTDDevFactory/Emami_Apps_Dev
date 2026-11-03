// Unit and currency of quantity (QUAN) and amount (CURR) fields. The data dictionary names, for every such field, the field that
// holds its unit or currency (FieldMeta.refTable / refField, e.g. MARA-GEWEI for the gross weight, T001-WAERS for an amount).
// This only LOOKS UP that reference in the request data to show it beside the input; it decides nothing about the value.
import type { FieldMeta } from './form';
import type { RequestData, Row } from './types';

type FieldDefs = Record<string, Pick<FieldMeta, 'entity' | 'name' | 'label'>>;

/** Dictionary table of a reference field to the entity of the request that carries it. Tables without an entity (T001, RV61A) are found by field name. */
export const TABLE_ENTITY: Record<string, string> = { MARA: 'Material', MARC: 'Plant', MARM: 'UnitOfMeasure', MBEW: 'Valuation', MVKE: 'SalesOrg', MARD: 'StorageLocation', MLGN: 'WarehouseData' };

export interface UnitRef {
  /** 'unit' (QUAN), 'currency' (CURR) or none (any other field) */
  kind: 'none' | 'unit' | 'currency';
  /** the unit or currency to show beside the value ('' while it is empty) */
  value: string;
  /** the request has the reference field somewhere; false = nothing to look up, so the field is never locked */
  known: boolean;
  /** quantity or amount cannot be entered until the reference is filled */
  locked: boolean;
  /** why it is locked, short */
  hint: string;
}

const none: UnitRef = { kind: 'none', value: '', known: false, locked: false, hint: '' };
const filled = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

export function resolveUnit(meta: Pick<FieldMeta, 'type' | 'entity' | 'refTable' | 'refField'>, row: Row, data: RequestData, fields: FieldDefs): UnitRef {
  if ((meta.type !== 'QUAN' && meta.type !== 'CURR') || !meta.refField) return none;
  const kind = meta.type === 'QUAN' ? 'unit' : 'currency';
  const ref = meta.refField;
  const first = [meta.entity, TABLE_ENTITY[meta.refTable], 'Material'].filter((e): e is string => !!e);
  const others = Object.values(fields).filter((f) => f.name === ref).map((f) => f.entity);
  const order = [...new Set([...first, ...others])].filter((e) => fields[`${e}.${ref}`]);
  if (!order.length) return { ...none, kind };
  for (const e of order) {
    const v = filled((e === meta.entity ? row : data.single[e])?.[ref]);
    if (v) return { kind, value: v, known: true, locked: false, hint: '' };
  }
  const label = fields[`${order[0]}.${ref}`].label;
  return { kind, value: '', known: true, locked: true, hint: `Fill "${label}" first` };
}
