import { describe, expect, it } from 'vitest';
import { buildWacFilter } from '@/lib/wac/filter';
import { buildUrl } from '@/lib/sap/client';
import { FilterError } from '@/lib/sap/filter';
import { presetRange, toDay } from '@/lib/wac/dates';
import { parseWacUrl, wacSearch } from '@/lib/wac/url';
import type { SapConfig } from '@/lib/sap/config';

const base = { plants: ['UN13'], dateFrom: '2026-10-01', dateTo: '2026-10-31' };
const cfg = { baseUrl: 'https://gw.example/api/NWP/ZMM_BOM_COST_SRV', client: '' } as unknown as SapConfig;

describe('buildWacFilter', () => {
  it('one plant, dates as datetime literals without a time-zone shift', () => {
    expect(buildWacFilter(base)).toBe("Werks eq 'UN13' and DateFrom eq datetime'2026-10-01T00:00:00' and DateTo eq datetime'2026-10-31T00:00:00'");
  });
  it('several plants and materials use brackets and "or"', () => {
    const f = buildWacFilter({ ...base, plants: ['un13', 'UB01', 'UN13'], materials: ['200001300', '200001301'] });
    expect(f).toContain("(Matnr eq '200001300' or Matnr eq '200001301')");
    expect(f).toContain("(Werks eq 'UN13' or Werks eq 'UB01')");
  });
  it('the flag is X for on and left out for off (Edm.String)', () => {
    expect(buildWacFilter({ ...base, inclCmp: true })).toContain("InclCmp eq 'X'");
    expect(buildWacFilter({ ...base, inclCmp: false })).not.toContain('InclCmp');
    expect(buildWacFilter(base)).not.toContain('InclCmp');
  });
  it('variance limits are decimals with the m suffix, only with the comparison on', () => {
    const f = buildWacFilter({ ...base, inclCmp: true, varPct: '5', varHigh: '12.5' });
    expect(f).toContain('VarPctIn eq 5m');
    expect(f).toContain('VarHighIn eq 12.5m');
    expect(buildWacFilter({ ...base, inclCmp: false, varPct: '5' })).not.toContain('VarPctIn');
  });
  it('Prodha only on WacRowSet; SrcIn and GrpIn only on WacCompareSet; InclCmp always on the live sets, never on documents', () => {
    const q = { ...base, prodha: ['0101160653'], src: ['SEL', 'CMAP'], grp: ['RM'] };
    expect(buildWacFilter(q, 'ROWS')).toContain("Prodha eq '0101160653'");
    expect(buildWacFilter(q, 'COMPARE')).not.toContain('Prodha');
    expect(buildWacFilter(q, 'COMPARE')).toContain("(SrcIn eq 'SEL' or SrcIn eq 'CMAP')");
    expect(buildWacFilter(q, 'COMPARE')).toContain("GrpIn eq 'RM'");
    expect(buildWacFilter(q, 'COMPARE')).toContain("InclCmp eq 'X'");
    expect(buildWacFilter(q, 'COMP')).toContain("InclCmp eq 'X'");
    expect(buildWacFilter(q, 'DOCS')).not.toContain('InclCmp');
    expect(buildWacFilter(q, 'DOCS')).not.toContain('SrcIn');
  });
  it('quotes are doubled', () => {
    expect(buildWacFilter({ ...base, materials: ["A'B"] })).toContain("Matnr eq 'A''B'");
  });
  it('a missing plant or date, or a reversed range, throws before anything is sent', () => {
    expect(() => buildWacFilter({ ...base, plants: [] })).toThrow(FilterError);
    expect(() => buildWacFilter({ ...base, plants: ['', ' '] })).toThrow(/plant/);
    expect(() => buildWacFilter({ ...base, dateFrom: '' })).toThrow(/dates/);
    expect(() => buildWacFilter({ ...base, dateFrom: '2026-11-01' })).toThrow(/after/);
    expect(() => buildWacFilter({ ...base, inclCmp: true, varPct: 'abc' })).toThrow();
  });
  it('no "+" in the URL: spaces are %20, quotes %27', () => {
    const url = buildUrl('WacRowSet', { $filter: buildWacFilter({ ...base, materials: ['A B'], inclCmp: true, varPct: '5' }) }, cfg);
    expect(url).not.toContain('+');
    expect(url).toContain('%20and%20');
    expect(url).toContain('$filter=');
  });
});

describe('dates and URL state', () => {
  it('toDay uses the local calendar day (never toISOString)', () => {
    expect(toDay(new Date(2026, 9, 1, 0, 30))).toBe('2026-10-01');
    expect(toDay(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });
  it('presets', () => {
    const now = new Date(2026, 9, 31, 15, 0);
    expect(presetRange('lastMonth', now)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(presetRange('thisMonth', now)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(presetRange('last7', now)).toEqual({ from: '2026-10-25', to: '2026-10-31' });
    expect(presetRange('last30', now)).toEqual({ from: '2026-10-02', to: '2026-10-31' });
    expect(presetRange('custom', now)).toBeNull();
    expect(presetRange('lastMonth', new Date(2026, 0, 15))).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
  it('the URL round-trips and ignores junk', () => {
    const s = wacSearch({ plants: ['UN13', 'UB01'], from: '2026-10-01', to: '2026-10-31', mat: ['A', 'B'], prodha: ['P1'], cmp: true });
    expect(s).toBe('?plants=UN13,UB01&from=2026-10-01&to=2026-10-31&mat=A,B&prodha=P1&cmp=1');
    expect(parseWacUrl(s)).toEqual({ plants: ['UN13', 'UB01'], from: '2026-10-01', to: '2026-10-31', mat: ['A', 'B'], prodha: ['P1'], cmp: true });
    expect(parseWacUrl('?from=nonsense&cmp=0')).toEqual({});
    expect(wacSearch({ plants: [], from: '', to: '', mat: [], prodha: [], cmp: false })).toBe('');
  });
  it('a space is %20 (never "+"), and parameters of someone else (pc) are kept', () => {
    const s = wacSearch({ plants: ['UN13'], from: '2026-10-01', to: '2026-10-31', mat: ['A B'], prodha: [], cmp: false }, { pc: '{"on":1,"vk":["1000"]}' });
    expect(s).not.toContain('+');
    expect(s).toContain('mat=A%20B');
    expect(new URLSearchParams(s).get('pc')).toBe('{"on":1,"vk":["1000"]}');
  });
});
