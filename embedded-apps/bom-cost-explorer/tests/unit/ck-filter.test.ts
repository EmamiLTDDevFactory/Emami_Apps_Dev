import { describe, expect, it } from 'vitest';
import { buildCkFilter, estimateId } from '@/lib/ck/filter';
import { buildUrl } from '@/lib/sap/client';
import { FilterError } from '@/lib/sap/filter';
import type { SapConfig } from '@/lib/sap/config';

const key = { kalnr: '000012345678', kadky: '2026-10-01', tvers: '01', bwvar: 'ZUV', kkzma: '' };
const cfg = { baseUrl: 'https://gw.example/api/NWP/ZMM_BOM_COST_SRV', client: '' } as unknown as SapConfig;

describe('buildCkFilter', () => {
  it('LIST: material and one plant, plain', () => {
    expect(buildCkFilter({ matnr: '200001300', werks: 'un13' }, 'LIST')).toBe("Matnr eq '200001300' and Werks eq 'UN13'");
  });
  it('LIST: variant, version, status, dates as datetime literals (no time-zone shift) and the CurOnly flag as X', () => {
    const f = buildCkFilter({ matnr: 'M', werks: 'UN13', klvar: 'PPC1', tvers: '01', status: 'FR', dateFrom: '2026-01-01', dateTo: '2026-12-31', curOnly: true }, 'LIST');
    expect(f).toContain("Klvar eq 'PPC1'");
    expect(f).toContain("Tvers eq '01'");
    expect(f).toContain("Status eq 'FR'");
    expect(f).toContain("DateFrom eq datetime'2026-01-01T00:00:00'");
    expect(f).toContain("DateTo eq datetime'2026-12-31T00:00:00'");
    expect(f).toContain("CurOnly eq 'X'");
    expect(buildCkFilter({ matnr: 'M', werks: 'UN13', curOnly: false }, 'LIST')).not.toContain('CurOnly');
  });
  it('HEADER / COMP / ITEM accept Matnr + Werks (SAP picks the current standard)', () => {
    for (const set of ['HEADER', 'COMP', 'ITEM'] as const) expect(buildCkFilter({ matnr: 'M', werks: 'UN13' }, set)).toBe("Matnr eq 'M' and Werks eq 'UN13'");
  });
  it('or the estimate key Kalnr + Kadky + Tvers + Bwvar (+ Kkzma only when given)', () => {
    expect(buildCkFilter({ key }, 'COMP')).toBe("Kalnr eq '000012345678' and Kadky eq datetime'2026-10-01T00:00:00' and Tvers eq '01' and Bwvar eq 'ZUV'");
    expect(buildCkFilter({ key: { ...key, kkzma: 'X' } }, 'ITEM')).toContain("Kkzma eq 'X'");
  });
  it('Klvar and Status only on LIST and HEADER', () => {
    const q = { matnr: 'M', werks: 'UN13', klvar: 'PPC1', status: 'FR' };
    expect(buildCkFilter(q, 'HEADER')).toContain("Klvar eq 'PPC1'");
    expect(buildCkFilter(q, 'HEADER')).toContain("Status eq 'FR'");
    expect(buildCkFilter(q, 'COMP')).not.toContain('Klvar');
    expect(buildCkFilter(q, 'ITEM')).not.toContain('Status');
    expect(buildCkFilter({ key, klvar: 'PPC1' }, 'HEADER')).toContain("Klvar eq 'PPC1'");
  });
  it('quotes are doubled', () => {
    expect(buildCkFilter({ matnr: "A'B", werks: 'UN13' }, 'LIST')).toContain("Matnr eq 'A''B'");
  });
  it('a missing material, plant or key part throws before anything is sent', () => {
    expect(() => buildCkFilter({ werks: 'UN13' }, 'LIST')).toThrow(FilterError);
    expect(() => buildCkFilter({ matnr: 'M' }, 'LIST')).toThrow(/plant/);
    expect(() => buildCkFilter({ matnr: 'M' }, 'HEADER')).toThrow(/plant/);
    expect(() => buildCkFilter({ werks: 'UN13' }, 'COMP')).toThrow(/material/);
    expect(() => buildCkFilter({ key: { ...key, bwvar: '' } }, 'HEADER')).toThrow(/Kalnr, Kadky, Tvers and Bwvar/);
    expect(() => buildCkFilter({}, 'ITEM')).toThrow(FilterError);
  });
  it('no "+" in the URL', () => {
    const url = buildUrl('CkListSet', { $filter: buildCkFilter({ matnr: 'A B', werks: 'UN13', curOnly: true }, 'LIST') }, cfg);
    expect(url).not.toContain('+');
    expect(url).toContain('%20and%20');
  });
  it('the estimate id is stable', () => {
    expect(estimateId(key)).toBe('000012345678|2026-10-01|01|ZUV|');
  });
});
