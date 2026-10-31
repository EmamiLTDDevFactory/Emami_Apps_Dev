import { describe, expect, it } from 'vitest';
import { buildCkFilter } from '@/lib/ck/filter';
import { buildCogmFilter, buildSoFilter, chunkCodes, nextToggle, setToggle, toggleState, listActive } from '@/lib/so/filter';
import { buildUrl } from '@/lib/sap/client';
import { FilterError } from '@/lib/sap/filter';
import type { SapConfig } from '@/lib/sap/config';
import { EMPTY_LIST } from '@/lib/so/types';

const cfg = { baseUrl: 'https://gw.example/api/NWP/ZMM_BOM_COST_SRV', client: '' } as unknown as SapConfig;

describe('CK13N filter', () => {
  it('list: material + one plant, optional variant / version / status / dates / current only', () => {
    expect(buildCkFilter({ matnr: '200001300', werks: 'un13' }, 'LIST')).toBe("Matnr eq '200001300' and Werks eq 'UN13'");
    const f = buildCkFilter({ matnr: 'M', werks: 'UN13', klvar: 'PPC1', tvers: '01', status: 'FR', dateFrom: '2026-01-01', dateTo: '2026-10-31', curOnly: true }, 'LIST');
    expect(f).toContain("Klvar eq 'PPC1'");
    expect(f).toContain("Tvers eq '01'");
    expect(f).toContain("Status eq 'FR'");
    expect(f).toContain("DateFrom eq datetime'2026-01-01T00:00:00'");
    expect(f).toContain("DateTo eq datetime'2026-10-31T00:00:00'");
    expect(f).toContain("CurOnly eq 'X'");
    expect(buildCkFilter({ matnr: 'M', werks: 'UN13', curOnly: false }, 'LIST')).not.toContain('CurOnly');
  });
  it('header / components / items: Matnr + Werks, OR the estimate key; Klvar and Status only on list and header', () => {
    const key = { kalnr: '000123456789', kadky: '2026-04-01', tvers: '01', bwvar: '001', kkzma: '' };
    const byKey = buildCkFilter({ key, klvar: 'PPC1', status: 'FR' }, 'HEADER');
    expect(byKey).toBe("Kalnr eq '000123456789' and Kadky eq datetime'2026-04-01T00:00:00' and Tvers eq '01' and Bwvar eq '001' and Klvar eq 'PPC1' and Status eq 'FR'");
    expect(buildCkFilter({ key: { ...key, kkzma: 'X' }, klvar: 'PPC1', status: 'FR' }, 'COMP')).toBe("Kalnr eq '000123456789' and Kadky eq datetime'2026-04-01T00:00:00' and Tvers eq '01' and Bwvar eq '001' and Kkzma eq 'X'");
    expect(buildCkFilter({ matnr: 'M', werks: 'UN13', klvar: 'PPC1' }, 'ITEM')).toBe("Matnr eq 'M' and Werks eq 'UN13'");
    expect(buildCkFilter({ matnr: 'M', werks: 'UN13', klvar: 'PPC1' }, 'HEADER')).toContain("Klvar eq 'PPC1'");
  });
  it('missing material / plant / key part throws before any request', () => {
    expect(() => buildCkFilter({ werks: 'UN13' }, 'LIST')).toThrow(FilterError);
    expect(() => buildCkFilter({ matnr: 'M' }, 'HEADER')).toThrow(/plant/);
    expect(() => buildCkFilter({ key: { kalnr: '1', kadky: '', tvers: '01', bwvar: '1' } }, 'ITEM')).toThrow(/key/);
  });
});

describe('sales price filter', () => {
  it('multi values in brackets with "or"; In and Ex are separate properties', () => {
    const f = buildSoFilter({ materials: ['A', 'B'], vkorg: ['1000', '2000'], auart: { in: ['ZOD1'], ex: ['ZONL', 'ZZEC'] }, kdgrp: { in: [], ex: ['10'] } }, 'PRICE');
    expect(f).toContain("(MatnrIn eq 'A' or MatnrIn eq 'B')");
    expect(f).toContain("(VkorgIn eq '1000' or VkorgIn eq '2000')");
    expect(f).toContain("AuartIn eq 'ZOD1'");
    expect(f).toContain("(AuartEx eq 'ZONL' or AuartEx eq 'ZZEC')");
    expect(f).toContain("KdgrpEx eq '10'");
    expect(f).not.toContain('KdgrpIn');
  });
  it('days as a whole number, DateTo as a datetime literal, segment, channel, plants', () => {
    const f = buildSoFilter({ materials: ['A'], vkorg: ['1000'], vtweg: ['10'], segment: ['DOM'], plants: ['un13'], daysBack: 90, dateTo: '2026-10-31' }, 'PRICE');
    expect(f).toContain('DaysBack eq 90');
    expect(f).toContain("DateTo eq datetime'2026-10-31T00:00:00'");
    expect(f).toContain("SegmentIn eq 'DOM'");
    expect(f).toContain("VtwegIn eq '10'");
    expect(f).toContain("WerksIn eq 'UN13'");
    expect(() => buildSoFilter({ materials: ['A'], daysBack: 0 }, 'PRICE')).toThrow(/Days/);
  });
  it('rules: at least one material for prices and pricing; none needed for areas; the filter lists take KindIn; procedure needs Kalsm; rules have no filter', () => {
    expect(() => buildSoFilter({ vkorg: ['1000'] }, 'PRICE')).toThrow(/material/);
    expect(() => buildSoFilter({}, 'PRICING')).toThrow(FilterError);
    expect(buildSoFilter({ materials: ['A'] }, 'AREA')).toBe("MatnrIn eq 'A'");
    expect(buildSoFilter({ materials: ['A'], kind: ['AUART', 'PSTYV'] }, 'FILTER')).toContain("(KindIn eq 'AUART' or KindIn eq 'PSTYV')");
    expect(buildSoFilter({ kalsm: ['ZSDP01'] }, 'PROC')).toBe("KalsmIn eq 'ZSDP01'");
    expect(() => buildSoFilter({}, 'PROC')).toThrow(/procedure/);
    expect(buildSoFilter({}, 'COND')).toBe('');
  });
  it('at most 50 materials per call; chunkCodes splits larger lists', () => {
    const many = Array.from({ length: 120 }, (_, i) => `M${i}`);
    expect(() => buildSoFilter({ materials: many }, 'PRICE')).toThrow(/50/);
    const parts = chunkCodes(many, 50);
    expect(parts.map((p) => p.length)).toEqual([50, 50, 20]);
    expect(parts.flat()).toEqual(many);
  });
  it('quotes are doubled and the URL has no "+"', () => {
    const f = buildSoFilter({ materials: ["A'B C"], vkorg: ['1000'], daysBack: 60 }, 'PRICE');
    expect(f).toContain("MatnrIn eq 'A''B C'");
    const url = buildUrl('SoPriceSet', { $filter: f }, cfg);
    expect(url).not.toContain('+');
    expect(url).toContain('%20and%20');
  });
  it('three-state toggles map to include / exclude lists and back', () => {
    let l = EMPTY_LIST;
    expect(toggleState(l, 'ZOD1')).toBe('neutral');
    l = setToggle(l, 'ZOD1', 'in');
    l = setToggle(l, 'ZONL', 'ex');
    expect(l).toEqual({ in: ['ZOD1'], ex: ['ZONL'] });
    expect(toggleState(l, 'ZOD1')).toBe('in');
    expect(toggleState(l, 'ZONL')).toBe('ex');
    l = setToggle(l, 'ZOD1', 'ex'); // moving a value between the lists never leaves it in both
    expect(l).toEqual({ in: [], ex: ['ZONL', 'ZOD1'] });
    l = setToggle(l, 'ZONL', 'neutral');
    expect(l).toEqual({ in: [], ex: ['ZOD1'] });
    expect([nextToggle('neutral'), nextToggle('in'), nextToggle('ex')]).toEqual(['in', 'ex', 'neutral']);
    expect(listActive(EMPTY_LIST)).toBe(false);
    expect(listActive(l)).toBe(true);
    expect(EMPTY_LIST).toEqual({ in: [], ex: [] }); // setToggle never mutates the shared empty list
  });
});

describe('live cost comparison filter (CogmRowSet)', () => {
  it('latest sales orders (PriceSrcIn O), live (Source L), the same selection, at most 25 finished goods', () => {
    const f = buildCogmFilter({ materials: ['A', 'B'], plants: ['un13'], vkorg: ['1000'], segment: ['DOM'], auart: { in: [], ex: ['ZONL'] }, daysBack: 90, priceDate: '2026-10-31' });
    expect(f).toContain("(Matnr eq 'A' or Matnr eq 'B')");
    expect(f).toContain("Werks eq 'UN13'");
    expect(f).toContain("PriceSrcIn eq 'O'");
    expect(f).toContain("Source eq 'L'");
    expect(f).toContain("VkorgIn eq '1000'");
    expect(f).toContain("AuartEx eq 'ZONL'");
    expect(f).toContain('SoDaysIn eq 90');
    expect(f).toContain("PriceDate eq datetime'2026-10-31T00:00:00'");
    expect(() => buildCogmFilter({ materials: Array.from({ length: 26 }, (_, i) => `M${i}`) })).toThrow(/25/);
    expect(() => buildCogmFilter({ materials: [] })).toThrow(FilterError);
  });
});
