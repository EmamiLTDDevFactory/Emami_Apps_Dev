import { describe, expect, it } from 'vitest';
import { FilterError } from '@/lib/sap/filter';
import { buildUrl } from '@/lib/sap/client';
import type { SapConfig } from '@/lib/sap/config';
import { COGM_MAX_MATERIALS, SO_MAX_MATERIALS, buildCogmFilter, buildSoFilter, chunkCodes, listActive, nextToggle, setToggle, toggleState } from '@/lib/so/filter';
import { EMPTY_LIST } from '@/lib/so/types';

const cfg = { baseUrl: 'https://gw.example/api/NWP/ZMM_BOM_COST_SRV', client: '' } as unknown as SapConfig;

describe('toggle states', () => {
  it('neutral -> include -> exclude -> neutral', () => {
    expect(nextToggle('neutral')).toBe('in');
    expect(nextToggle('in')).toBe('ex');
    expect(nextToggle('ex')).toBe('neutral');
  });
  it('a value is in exactly one of the two lists', () => {
    let l = setToggle(EMPTY_LIST, 'ZOD1', 'in');
    expect(l).toEqual({ in: ['ZOD1'], ex: [] });
    l = setToggle(l, 'ZOD1', 'ex');
    expect(l).toEqual({ in: [], ex: ['ZOD1'] });
    expect(toggleState(l, 'ZOD1')).toBe('ex');
    l = setToggle(l, 'ZOD1', 'neutral');
    expect(l).toEqual(EMPTY_LIST);
    expect(toggleState(l, 'ZOD1')).toBe('neutral');
    expect(listActive(l)).toBe(false);
    expect(listActive(setToggle(l, 'X', 'in'))).toBe(true);
  });
  it('setToggle does not mutate its input', () => {
    const l = { in: ['A'], ex: ['B'] };
    setToggle(l, 'C', 'in');
    expect(l).toEqual({ in: ['A'], ex: ['B'] });
  });
});

describe('buildSoFilter', () => {
  const base = { materials: ['200001300'], vkorg: ['1000'] };
  it('include and exclude are separate properties (AuartIn / AuartEx), never mixed', () => {
    const f = buildSoFilter({ ...base, auart: { in: ['ZOD1'], ex: ['ZRET'] }, pstyv: { in: [], ex: ['TANN'] }, kdgrp: { in: ['01'], ex: [] }, kunnr: { in: [], ex: ['1000123'] } }, 'PRICE');
    expect(f).toContain("AuartIn eq 'ZOD1'");
    expect(f).toContain("AuartEx eq 'ZRET'");
    expect(f).toContain("PstyvEx eq 'TANN'");
    expect(f).not.toContain('PstyvIn');
    expect(f).toContain("KdgrpIn eq '01'");
    expect(f).not.toContain('KdgrpEx');
    expect(f).toContain("KunnrEx eq '1000123'");
  });
  it('several values of one property use brackets and "or"', () => {
    const f = buildSoFilter({ ...base, materials: ['A', 'B'], vkorg: ['1000', '2000'], auart: { in: ['ZOD1', 'ZONL'], ex: [] } }, 'PRICE');
    expect(f).toContain("(MatnrIn eq 'A' or MatnrIn eq 'B')");
    expect(f).toContain("(VkorgIn eq '1000' or VkorgIn eq '2000')");
    expect(f).toContain("(AuartIn eq 'ZOD1' or AuartIn eq 'ZONL')");
  });
  it('days are an integer, DateTo is a datetime literal without a time-zone shift', () => {
    const f = buildSoFilter({ ...base, daysBack: 90, dateTo: '2026-10-31' }, 'PRICE');
    expect(f).toContain('DaysBack eq 90');
    expect(f).toContain("DateTo eq datetime'2026-10-31T00:00:00'");
    expect(() => buildSoFilter({ ...base, daysBack: 0 }, 'PRICE')).toThrow(FilterError);
    expect(() => buildSoFilter({ ...base, daysBack: 1.5 }, 'PRICE')).toThrow(FilterError);
  });
  it('nothing is added for empty selections and quotes are doubled', () => {
    expect(buildSoFilter({ materials: ["A'B"] }, 'PRICE')).toBe("MatnrIn eq 'A''B'");
    expect(buildSoFilter(base, 'PRICE')).not.toContain('Segment');
    expect(buildSoFilter({ ...base, segment: ['DOM'] }, 'PRICE')).toContain("SegmentIn eq 'DOM'");
  });
  it('KindIn only on the filter-list set; the procedure set takes KalsmIn; the rules set takes no filter', () => {
    expect(buildSoFilter({ ...base, kind: ['AUART', 'PSTYV'] }, 'FILTER')).toContain("(KindIn eq 'AUART' or KindIn eq 'PSTYV')");
    expect(buildSoFilter({ ...base, kind: ['AUART'] }, 'PRICE')).not.toContain('KindIn');
    expect(buildSoFilter({ kalsm: ['ZSDP01'] }, 'PROC')).toBe("KalsmIn eq 'ZSDP01'");
    expect(() => buildSoFilter({}, 'PROC')).toThrow(/procedure/);
    expect(buildSoFilter({}, 'COND')).toBe('');
  });
  it('materials are required for prices and limited to 50 per call', () => {
    expect(() => buildSoFilter({ vkorg: ['1000'] }, 'PRICE')).toThrow(/material/);
    expect(() => buildSoFilter({ materials: Array.from({ length: SO_MAX_MATERIALS + 1 }, (_, i) => `M${i}`) }, 'PRICE')).toThrow(/At most 50/);
    expect(buildSoFilter({ materials: Array.from({ length: SO_MAX_MATERIALS }, (_, i) => `M${i}`) }, 'PRICE')).toContain('MatnrIn');
    expect(buildSoFilter({ vkorg: ['1000'] }, 'AREA')).toBe("VkorgIn eq '1000'"); // the area list needs no material
  });
  it('no "+" in the URL: spaces are %20', () => {
    const url = buildUrl('SoPriceSet', { $filter: buildSoFilter({ ...base, auart: { in: ['A B'], ex: [] }, daysBack: 90 }, 'PRICE') }, cfg);
    expect(url).not.toContain('+');
    expect(url).toContain('%20and%20');
  });
});

describe('chunking and the cost comparison filter', () => {
  it('splits into calls of 50', () => {
    const list = Array.from({ length: 120 }, (_, i) => `M${i}`);
    expect(chunkCodes(list, SO_MAX_MATERIALS).map((c) => c.length)).toEqual([50, 50, 20]);
    expect(chunkCodes([], 50)).toEqual([]);
  });
  it('CogmRowSet: latest sales orders (O), live (L), at most 25 finished goods, same lists', () => {
    const f = buildCogmFilter({ materials: ['A', 'B'], plants: ['un13'], vkorg: ['1000'], auart: { in: [], ex: ['ZRET'] }, daysBack: 90, priceDate: '2026-10-31' });
    expect(f).toContain("(Matnr eq 'A' or Matnr eq 'B')");
    expect(f).toContain("Werks eq 'UN13'");
    expect(f).toContain("PriceSrcIn eq 'O'");
    expect(f).toContain("Source eq 'L'");
    expect(f).toContain("VkorgIn eq '1000'");
    expect(f).toContain("AuartEx eq 'ZRET'");
    expect(f).toContain('SoDaysIn eq 90');
    expect(f).toContain("PriceDate eq datetime'2026-10-31T00:00:00'");
    expect(() => buildCogmFilter({ materials: [] })).toThrow(FilterError);
    expect(() => buildCogmFilter({ materials: Array.from({ length: COGM_MAX_MATERIALS + 1 }, (_, i) => `M${i}`) })).toThrow(/25/);
  });
});
