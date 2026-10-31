import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deletePreset, loadPresets, savePreset, type SalesFiltersValue } from '@/lib/so/presets';
import { DEFAULT_SO_URL, decodeSoUrl, encodeSoUrl, parseSoSearch, soSearch } from '@/lib/so/url';
import { EMPTY_LIST } from '@/lib/so/types';

const value: SalesFiltersValue = { vkorg: ['1000'], vtweg: ['10'], segment: ['DOM'], days: 60, auart: { in: ['ZOD1'], ex: ['ZRET'] }, pstyv: EMPTY_LIST, kdgrp: EMPTY_LIST, kunnr: { in: [], ex: ['1000123'] } };
let store: Record<string, string>;
beforeEach(() => {
  store = {};
  (globalThis as unknown as { window: unknown }).window = { localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } } };
});
afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window; });

describe('presets (per user, in this browser)', () => {
  it('save, load, replace by name, delete', () => {
    expect(loadPresets('a@emamigroup.com')).toEqual([]);
    expect(savePreset('a@emamigroup.com', 'Domestic', value, ['M1', 'M2'])?.map((p) => p.name)).toEqual(['Domestic']);
    const again = savePreset('a@emamigroup.com', 'Export', { ...value, days: 30 });
    expect(again?.map((p) => p.name)).toEqual(['Export', 'Domestic']);
    const [exp, dom] = loadPresets('a@emamigroup.com');
    expect(exp.value.days).toBe(30);
    expect(dom.materials).toEqual(['M1', 'M2']);
    expect(dom.value.auart).toEqual({ in: ['ZOD1'], ex: ['ZRET'] });
    expect(savePreset('a@emamigroup.com', 'Domestic', { ...value, days: 7 })?.map((p) => p.name)).toEqual(['Domestic', 'Export']); // same name replaces
    expect(deletePreset('a@emamigroup.com', 'Export').map((p) => p.name)).toEqual(['Domestic']);
  });
  it('each user has their own list; the email is case-insensitive', () => {
    savePreset('A@emamigroup.com', 'Mine', value);
    expect(loadPresets('a@emamigroup.com')).toHaveLength(1);
    expect(loadPresets('b@emamigroup.com')).toEqual([]);
    expect(Object.keys(store)[0]).toBe('bom_sales_presets:a@emamigroup.com');
  });
  it('a nameless preset or no user saves nothing', () => {
    expect(savePreset('a@emamigroup.com', '  ', value)).toBeNull();
    expect(savePreset('', 'X', value)).toBeNull();
    expect(Object.keys(store)).toEqual([]);
  });
  it('blocked or broken storage never throws', () => {
    (globalThis as unknown as { window: unknown }).window = { localStorage: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } } };
    expect(loadPresets('a@emamigroup.com')).toEqual([]);
    expect(savePreset('a@emamigroup.com', 'X', value)).toBeNull();
    expect(deletePreset('a@emamigroup.com', 'X')).toEqual([]);
    store['bom_sales_presets:a@emamigroup.com'] = '{not json';
    (globalThis as unknown as { window: unknown }).window = { localStorage: { getItem: (k: string) => store[k] ?? null, setItem: () => {}, removeItem: () => {} } };
    expect(loadPresets('a@emamigroup.com')).toEqual([]);
  });
});

describe('URL state', () => {
  const s = { materials: ['M1', 'M2'], vkorg: ['1000'], vtweg: ['10'], segment: 'DOM', days: 60, auart: { in: ['ZOD1'], ex: ['ZRET'] }, pstyv: EMPTY_LIST, kdgrp: { in: ['01'], ex: [] }, kunnr: { in: [], ex: ['1000123'] } };
  it('round-trips materials, sales area, segment, days and the lists', () => {
    expect(decodeSoUrl(encodeSoUrl(s))).toEqual(s);
    expect(parseSoSearch(soSearch(s))).toEqual(s);
  });
  it('the default state is an empty URL, and junk falls back to the default', () => {
    expect(encodeSoUrl(DEFAULT_SO_URL)).toBe('');
    expect(soSearch(DEFAULT_SO_URL)).toBe('');
    expect(decodeSoUrl('{not json')).toEqual(DEFAULT_SO_URL);
    expect(decodeSoUrl('{"d":-5}').days).toBe(90);
  });
  it('the query string has no "+" (spaces would be %20)', () => expect(soSearch({ ...s, materials: ['A B'] })).not.toContain('+'));
});
