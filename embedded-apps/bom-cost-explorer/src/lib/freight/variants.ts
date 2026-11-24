/**
 * Screen variants of the Freight analysis (like an SAP variant): a named selection (materials, plants, material types, dates, freight look-back, purchase
 * organisations, include freight, latest only) and the alert rule, saved in this browser. Dates can be saved as "relative to today" (e.g. the last 90 days),
 * so a variant opened next month still means the last 90 days. One variant can be the default and is applied when the screen opens.
 */
import { ls } from '../client/storage';
import type { Rule } from './analysis';

export interface FreightVariant {
  name: string;
  materials: string[];
  plants: string[];
  types: string[];
  /** absolute dates (yyyy-mm-dd) when not relative */
  from: string; to: string;
  /** days back from today for from / to when relative */
  relative: boolean; fromDaysAgo: number; toDaysAgo: number;
  freightDays: string;
  inclFrt: boolean; latestOnly: boolean; purchOrgs: string;
  rule: Rule;
  savedAt: string;
}
export interface VariantStore { variants: FreightVariant[]; defaultName: string }

const KEY = 'bce:freight-variants';
export const EMPTY_STORE: VariantStore = { variants: [], defaultName: '' };

export const loadStore = (): VariantStore => {
  const v = ls.get<VariantStore>(KEY, EMPTY_STORE);
  return v && Array.isArray(v.variants) ? { variants: v.variants, defaultName: v.defaultName ?? '' } : EMPTY_STORE;
};
export const saveStore = (s: VariantStore) => ls.set(KEY, s);

/** Adds or replaces (same name, case-insensitive) a variant; the name is trimmed and must not be empty. */
export function upsertVariant(store: VariantStore, v: FreightVariant): VariantStore {
  const name = v.name.trim();
  if (!name) return store;
  const keep = store.variants.filter((x) => x.name.toLowerCase() !== name.toLowerCase());
  return { ...store, variants: [...keep, { ...v, name }].sort((a, b) => a.name.localeCompare(b.name)) };
}
export function removeVariant(store: VariantStore, name: string): VariantStore {
  return { variants: store.variants.filter((x) => x.name !== name), defaultName: store.defaultName === name ? '' : store.defaultName };
}
export const setDefaultVariant = (store: VariantStore, name: string): VariantStore => ({ ...store, defaultName: store.variants.some((x) => x.name === name) ? name : '' });

const pad = (n: number) => String(n).padStart(2, '0');
export const dayString = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n: number, today: Date) => { const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - n); return dayString(d); };
const between = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/** The dates a variant means today. */
export function variantDates(v: FreightVariant, today = new Date()): { from: string; to: string } {
  return v.relative ? { from: daysAgo(v.fromDaysAgo, today), to: daysAgo(v.toDaysAgo, today) } : { from: v.from, to: v.to };
}
/** Days back of the dates the screen holds (for a relative variant). */
export function relativeOffsets(from: string, to: string, today = new Date()): { fromDaysAgo: number; toDaysAgo: number } {
  const t = dayString(today);
  return { fromDaysAgo: Math.max(0, between(from || t, t)), toDaysAgo: Math.max(0, between(to || t, t)) };
}
