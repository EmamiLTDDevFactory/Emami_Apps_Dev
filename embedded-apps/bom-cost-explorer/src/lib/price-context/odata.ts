/**
 * One read path for the Ck / So / Cogm sets: the existing sapGetCollection (read-only GET, encodeURIComponent, no "+"),
 * with NO time limit (the request ends when SAP answers, on the caller's AbortSignal, or when the page is left), then the
 * shared normaliser. SAP computes every figure; nothing is recomputed here. '' (nothing from SAP) stays '' for the
 * nullable decimals so the screens can show n/a instead of a misleading 0.
 */
import { SapError, sapGetCollection } from '../sap/client';
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

export const NOT_AVAILABLE = 'This function is not available in this SAP system yet.';
/** 404 of a set ("Resource not found for the segment ...": not published in this system yet) -> one friendly text; any other error is kept. */
export function friendlyError(e: unknown): Error {
  if (e instanceof SapError && e.kind !== 'aborted' && (e.sapStatus === 404 || e.status === 404 || /Resource not found for the segment/i.test(`${e.message} ${e.details.map((d) => d.message).join(' ')}`))) {
    return new SapError(NOT_AVAILABLE, 'http', 404, e.details, 404);
  }
  return e as Error;
}
/** $select of the property names of a field map (SAP rejects an unknown one, so only for sets whose names were seen live). */
export const selectOfMap = (map: FieldMap): string => Array.from(new Set(Object.values(map).map(([n]) => n))).join(',');

export async function readSet<T>(setName: string, map: FieldMap, nullable: ReadonlySet<string>, $filter: string, signal?: AbortSignal, $select?: string): Promise<Read<T>> {
  try {
    const params: Record<string, string> = {};
    if ($filter) params.$filter = $filter;
    if ($select) params.$select = $select;
    const r = await sapGetCollection(setName, params, { signal, noTimeout: true, costing: true });
    return { rows: r.rows.map((raw) => normalizeRow<T>(raw, map, nullable)), messages: [...r.messages], ms: r.ms };
  } catch (e) {
    throw friendlyError(e);
  }
}

/** Unique, non-empty row-level messages as SAP warnings (never as a failure). */
export function rowMessages(msgs: (string | undefined)[], seen: SapMessage[] = []): SapMessage[] {
  const out = [...seen];
  for (const m of msgs) if (m && m.trim() && !out.some((x) => x.message === m.trim())) out.push({ code: '', message: m.trim(), severity: 'warning' });
  return out;
}

const uniq = (v: readonly string[] | undefined) => Array.from(new Set((v ?? []).map((x) => String(x).trim()).filter(Boolean)));
export { uniq as uniqueCodes };
