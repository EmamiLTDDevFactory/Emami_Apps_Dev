import { describe, expect, it, vi } from 'vitest';
import { cacheKey, cascadeParams, createHelpCache, filterItems, itemLabel } from '@/lib/valuehelp';
import type { ValueHelpItem } from '@/lib/types';

const items: ValueHelpItem[] = [{ key: 'KG', text: 'Kilogram' }, { key: 'G', text: 'Gram' }, { key: 'EA', text: 'Each' }, { key: 'LG', text: 'Long' }];

describe('value help keys and cascade', () => {
  it('cache key: same list, same key', () => {
    expect(cacheKey('mgrp', { mtart: 'FERT', x: '' })).toBe('MGRP?mtart=FERT');
    expect(cacheKey('SGRP', { mgrp: '1', mtart: 'FERT' })).toBe(cacheKey('sgrp', { mtart: 'FERT', mgrp: '1' }));
    expect(cacheKey('WERKS')).toBe('WERKS?');
  });
  it('description cascade: each level needs the choices above it', () => {
    expect(cascadeParams('MGRP', {})).toBeNull();
    expect(cascadeParams('MGRP', { mtart: 'FERT' })).toEqual({ mtart: 'FERT' });
    expect(cascadeParams('SGRP', { mtart: 'FERT' })).toBeNull();
    expect(cascadeParams('SGRP', { mtart: 'FERT', mgrp: '0001' })).toEqual({ mtart: 'FERT', mgrp: '0001' });
    expect(cascadeParams('SSGR', { mtart: 'FERT', mgrp: '0001', sgrp: '01' })).toEqual({ mtart: 'FERT', mgrp: '0001', sgrp: '01' });
    expect(cascadeParams('WERKS', {})).toEqual({});
  });
});

describe('search', () => {
  it('starts-with first, then contains, on key or text', () => {
    expect(filterItems(items, 'g').shown.map((i) => i.key)).toEqual(['G', 'KG', 'LG']);
    expect(filterItems(items, 'kilo').shown.map((i) => i.key)).toEqual(['KG']);
    expect(filterItems(items, '').total).toBe(4);
    expect(filterItems(items, 'zzz')).toEqual({ shown: [], total: 0 });
  });
  it('the limit cuts the shown list, the total stays', () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ key: String(i), text: `T${i}` }));
    const r = filterItems(many, '', 100);
    expect(r.shown).toHaveLength(100);
    expect(r.total).toBe(250);
  });
  it('label shows key and text', () => {
    expect(itemLabel({ key: 'KG', text: 'Kilogram' })).toBe('KG Kilogram');
    expect(itemLabel({ key: 'P001', text: 'P001' })).toBe('P001');
  });
});

describe('session cache', () => {
  it('asks SAP once for the same list, also when asked twice at the same time', async () => {
    const fetcher = vi.fn().mockResolvedValue(items);
    const c = createHelpCache(fetcher);
    const [a, b] = await Promise.all([c.load('MEINS'), c.load('meins', {})]);
    expect(a).toBe(b);
    await c.load('MEINS');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(c.peek('MEINS')).toBe(a);
    await c.load('SGRP', { mtart: 'FERT', mgrp: '1' });
    await c.load('SGRP', { mtart: 'FERT', mgrp: '2' });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('a failed request is not remembered', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue(items);
    const c = createHelpCache(fetcher);
    await expect(c.load('MEINS')).rejects.toThrow('down');
    expect(await c.load('MEINS')).toBe(items);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('small lists are mirrored to the session store and read back', async () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    await createHelpCache(vi.fn().mockResolvedValue(items), store).load('MEINS');
    const f2 = vi.fn();
    expect(await createHelpCache(f2, store).load('MEINS')).toEqual(items);
    expect(f2).not.toHaveBeenCalled();
  });
});
