import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeEntity, normDate, normDecimal, normBool, unwrapCollection } from '@/lib/sap/normalize';
import { parseODataError, parseSapMessageHeader } from '@/lib/sap/messages';
import { COST_LINE, RATE_OPTION, RATE_ROW, type CostLine, type RateRow } from '@/lib/sap/fields';
import { NAV_RATE_OPTIONS } from '@/lib/sap/entities';

const fixture = (n: string) => JSON.parse(readFileSync(join(__dirname, '../../mock/fixtures', `${n}.json`), 'utf8'));

describe('scalar normalisers', () => {
  it('converts /Date(ms)/ (with or without offset) to an ISO day', () => {
    expect(normDate('/Date(1774915200000)/')).toBe('2026-03-31');
    expect(normDate('/Date(1774915200000+0000)/')).toBe('2026-03-31');
    expect(normDate('/Date(0)/')).toBeNull();
    expect(normDate('20260331')).toBe('2026-03-31');
    expect(normDate('00000000')).toBeNull();
    expect(normDate(null)).toBeNull();
  });
  it('keeps decimals as exact strings', () => {
    expect(normDecimal('12.3400')).toBe('12.34');
    expect(normDecimal('0.1')).toBe('0.1');
    expect(normDecimal('12.50-')).toBe('-12.5');
    expect(normDecimal('')).toBe('0');
    expect(normDecimal('abc')).toBe('0');
    expect(normDecimal('123456789012345.123456')).toBe('123456789012345.123456');
  });
  it('reads ABAP booleans', () => {
    expect(normBool('X')).toBe(true);
    expect(normBool(true)).toBe(true);
    expect(normBool('')).toBe(false);
  });
});

describe('entity normalisation', () => {
  it('strips __metadata, expands RateOptions and types every field', () => {
    const f = fixture('CostLineSet-B');
    const { results } = unwrapCollection(f.body);
    const rows = results.map((r) => normalizeEntity<CostLine>(r, COST_LINE, { [NAV_RATE_OPTIONS]: RATE_OPTION }));
    const r = rows.find((x) => x.HasChild === '' && (x.RateOptions?.length ?? 0) > 1)!;
    expect((r as unknown as Record<string, unknown>).__metadata).toBeUndefined();
    expect(typeof r.Seqnr).toBe('number');
    expect(typeof r.TotCostInr).toBe('string');
    expect(r.TotCostInr).toMatch(/^-?\d+(\.\d+)?$/);
    expect(r.DelvAsof).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.RateOptions![0].ValidFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((r.RateOptions![0] as unknown as Record<string, unknown>).__metadata).toBeUndefined();
  });
  it('drops a __deferred navigation stub (key left out)', () => {
    const raw = { Seqnr: 1, RateOptions: { __deferred: { uri: 'x' } } };
    const row = normalizeEntity<CostLine>(raw, COST_LINE, { RateOptions: RATE_OPTION });
    expect('RateOptions' in row).toBe(false);
  });
  it('unwraps an expanded V2 collection { results: [...] } with /Date()/ and decimals converted', () => {
    const raw = {
      __metadata: { type: 'X.CostLine' },
      Seqnr: 3,
      TotCostInr: '12.5000',
      RateOptions: { results: [{ __metadata: { type: 'X.RateOption' }, Source: 'INFOREC', RatePcInr: '1.230000', ValidFrom: '/Date(1774915200000)/' }] },
    };
    const row = normalizeEntity<CostLine>(raw, COST_LINE, { RateOptions: RATE_OPTION });
    expect(row.TotCostInr).toBe('12.5');
    expect(row.RateOptions).toHaveLength(1);
    expect(row.RateOptions![0]).toMatchObject({ Source: 'INFOREC', RatePcInr: '1.23', ValidFrom: '2026-03-31' });
    expect((row.RateOptions![0] as unknown as Record<string, unknown>).__metadata).toBeUndefined();
  });
  it('accepts a bare-array expansion and an empty expansion', () => {
    expect(normalizeEntity<CostLine>({ RateOptions: [] }, COST_LINE, { RateOptions: RATE_OPTION }).RateOptions).toEqual([]);
    expect(normalizeEntity<CostLine>({ RateOptions: { results: [] } }, COST_LINE, { RateOptions: RATE_OPTION }).RateOptions).toEqual([]);
  });
  it('reads $inlinecount', () => {
    const f = fixture('RateRowSet-R');
    const { results, count } = unwrapCollection(f.body);
    expect(count).toBeGreaterThanOrEqual(results.length);
    const row = normalizeEntity<RateRow>(results[0], RATE_ROW);
    expect(row.Validto === null || /^\d{4}/.test(row.Validto)).toBe(true);
  });
});

describe('SAP messages', () => {
  it('parses the sap-message header with details', () => {
    const f = fixture('CostLineSet-B');
    const m = parseSapMessageHeader(f.sapMessage);
    expect(m.length).toBeGreaterThanOrEqual(2);
    expect(m.some((x) => x.severity === 'warning' && /NOPE/.test(x.message))).toBe(true);
  });
  it('never throws on junk', () => {
    expect(parseSapMessageHeader('not json')).toEqual([{ code: '', message: 'not json', severity: 'warning' }]);
    expect(parseSapMessageHeader(null)).toEqual([]);
  });
  it('maps the OData error body to message.value', () => {
    const f = fixture('CostLineSet-error-400');
    expect(parseODataError(f.body, 'x').message).toMatch(/FAIL01/);
    expect(parseODataError({}, 'fallback').message).toBe('fallback');
  });
});
