/**
 * One read path for the Ck / So / Cogm sets: the existing sapGetCollection (read-only GET, encodeURIComponent, no "+"),
 * with NO time limit (the request ends when SAP answers, on the caller's AbortSignal, or when the page is left), then the
 * shared normaliser. SAP computes every figure; nothing is recomputed here. '' (nothing from SAP) stays '' for the
 * nullable decimals so the screens can show n/a instead of a misleading 0.
 */
import { sapGetCollection } from '../sap/client';
import { normalizeEntity } from '../sap/normalize';
import type { FieldKind } from '../sap/fields';
import type { SapMessage } from '../sap/messages';
import { nullableDecimal } from '../wac/service';

export type FieldMap = Record<string, readonly [sapName: string, kind: FieldKind]>;
export interface Read<T> { rows: T[]; messages: SapMessage[]; ms: number }

/** Properties kept as the string SAP sent (kind 's') but cleaned as decimals; '' stays ''. */
export function normalizeRow<T>(raw: Record<string, unknown>, map: FieldMap, nullable: ReadonlySet<string>): T {
  const o = normalizeEntity<Record<string, unknown>>(raw, map);
  for (const k of Object.keys(map)) {
    if (nullable.has(k)) o[k] = nullableDecimal(o[k]);
    else if (typeof o[k] === 'string') o[k] = (o[k] as string).trim();
  }
  return o as T;
}

export async function readSet<T>(setName: string, map: FieldMap, nullable: ReadonlySet<string>, $filter: string, signal?: AbortSignal): Promise<Read<T>> {
  const r = await sapGetCollection(setName, $filter ? { $filter } : {}, { signal, noTimeout: true, costing: true });
  return { rows: r.rows.map((raw) => normalizeRow<T>(raw, map, nullable)), messages: [...r.messages], ms: r.ms };
}

/** Unique, non-empty row-level messages as SAP warnings (never as a failure). */
export function rowMessages(msgs: (string | undefined)[], seen: SapMessage[] = []): SapMessage[] {
  const out = [...seen];
  for (const m of msgs) if (m && m.trim() && !out.some((x) => x.message === m.trim())) out.push({ code: '', message: m.trim(), severity: 'warning' });
  return out;
}

const uniq = (v: readonly string[] | undefined) => Array.from(new Set((v ?? []).map((x) => String(x).trim()).filter(Boolean)));
export { uniq as uniqueCodes };
