/**
 * Named selections of the Sales price page and the price-context popover, saved per user in this browser (localStorage keyed by the
 * hub email), NOT in SAP. Storage can be blocked or full: every access is wrapped, and a failure just means nothing is saved.
 */
import type { ListFilter } from './types';

export interface SalesFiltersValue {
  vkorg: string[]; vtweg: string[]; segment: string[]; days: number;
  auart: ListFilter; pstyv: ListFilter; kdgrp: ListFilter; kunnr: ListFilter;
}
export interface SalesPreset { name: string; savedAt: string; materials?: string[]; value: SalesFiltersValue }

const key = (email: string) => `bom_sales_presets:${email.trim().toLowerCase()}`;
const MAX_PRESETS = 30;

export function loadPresets(email: string): SalesPreset[] {
  if (!email) return [];
  try {
    const raw = window.localStorage.getItem(key(email));
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? (list as SalesPreset[]).filter((p) => p && typeof p.name === 'string' && p.value) : [];
  } catch {
    return [];
  }
}
function write(email: string, list: SalesPreset[]): boolean {
  try { window.localStorage.setItem(key(email), JSON.stringify(list.slice(0, MAX_PRESETS))); return true; } catch { return false; }
}
/** Saves (or replaces, by name) one preset; returns the list as stored, or null when storage refused it. */
export function savePreset(email: string, name: string, value: SalesFiltersValue, materials?: string[]): SalesPreset[] | null {
  const n = name.trim();
  if (!email || !n) return null;
  const list = [{ name: n, savedAt: new Date().toISOString(), materials, value }, ...loadPresets(email).filter((p) => p.name !== n)];
  return write(email, list) ? list : null;
}
export function deletePreset(email: string, name: string): SalesPreset[] {
  const list = loadPresets(email).filter((p) => p.name !== name);
  write(email, list);
  return list;
}
