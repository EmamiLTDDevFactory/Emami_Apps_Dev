import Decimal from 'decimal.js';
import type { FieldKind } from './fields';

type FieldMap = Record<string, readonly [string, FieldKind]>;

/** "/Date(1727654400000)/" or "/Date(1727654400000+0530)/" -> "2024-09-30". ISO and YYYYMMDD
 * inputs are accepted too. SAP's "no date" (0, 00000000, 9999-12-31 kept as is) -> null for 0. */
export function normDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v);
  const m = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(s);
  if (m) {
    const ms = Number(m[1]);
    if (ms === 0) return null;
    const d = new Date(ms);
    // SAP sends DATS as UTC midnight; take the UTC calendar day.
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (/^\d{8}$/.test(s)) return s === '00000000' ? null : `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

/** Edm.Decimal arrives as a string ("12.3400", "-0.5", " 7"); keep it a canonical string so
 * money is never parsed into a float on the way through. Empty/invalid -> "0". */
export function normDecimal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '0';
  try {
    // SAP may append the sign ("12.50-") in some character fields.
    let s = String(v).trim();
    if (/^[\d.]+-$/.test(s)) s = `-${s.slice(0, -1)}`;
    const d = new Decimal(s);
    return d.isFinite() ? d.toFixed() : '0';
  } catch {
    return '0';
  }
}

export function normInt(v: unknown): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

export function normBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === 'x' || s === '1';
}

export function normValue(kind: FieldKind, v: unknown): unknown {
  switch (kind) {
    case 'd': return normDecimal(v);
    case 'i': return normInt(v);
    case 'b': return normBool(v);
    case 't': return normDate(v);
    default: return v === null || v === undefined ? '' : String(v);
  }
}

/** One OData V2 entity -> a plain row keyed by our internal keys. __metadata, __deferred
 * navigation stubs and properties we don't know are dropped. Missing properties get the kind's
 * empty value so the UI never sees undefined. */
export function normalizeEntity<T>(raw: Record<string, unknown>, map: FieldMap, nav?: Record<string, FieldMap>): T {
  const out: Record<string, unknown> = {};
  for (const [key, [sapName, kind]] of Object.entries(map)) out[key] = normValue(kind, raw?.[sapName]);
  if (nav) {
    for (const [navName, navMap] of Object.entries(nav)) {
      out[navName] = unwrapResults(raw?.[navName]).map((r) => normalizeEntity(r, navMap));
    }
  }
  return out as T;
}

/** Collections in V2 JSON are `{ results: [...] }`; deferred navs are `{ __deferred: {...} }`. */
export function unwrapResults(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v as Record<string, unknown>[];
  if (v && typeof v === 'object') {
    const r = (v as { results?: unknown }).results;
    if (Array.isArray(r)) return r as Record<string, unknown>[];
  }
  return [];
}

/** `{ d: { results, __count } }` or `{ d: [...] }` -> rows + inline count. */
export function unwrapCollection(body: unknown): { results: Record<string, unknown>[]; count: number | null } {
  const d = (body as { d?: unknown })?.d ?? body;
  const results = unwrapResults(d);
  const c = (d as { __count?: unknown })?.__count;
  return { results, count: c === undefined ? null : normInt(c) };
}
