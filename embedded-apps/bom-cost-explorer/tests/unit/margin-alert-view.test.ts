import { describe, expect, it } from 'vitest';
import { RULES, boardLink, countBySeverity, filterBySeverity, impactDirection, isComponentScope, scopeText, sortByImpact } from '@/lib/margin/alertView';
import { ALERT_HEADERS, alertSheet } from '@/lib/margin/alertExport';
import { buildMarginFilter } from '@/lib/margin/filter';
import { parseMarginSearch } from '@/lib/margin/selection';
import type { MarginAlert } from '@/lib/margin/types';

const al = (p: Partial<MarginAlert> = {}): MarginAlert => ({ Rule: 'E1', Severity: 'M', Scope: 'F', Matnr: 'A', Maktx: 'FG A', Werks: 'UB01', Market: '', Channel: '', Comp: '', Text: 't', Value: '12', Threshold: '10', ImpactInr: '1000', Curr: 'INR', FgCnt: 0, ...p });

describe('Alerts sorting and filtering', () => {
  it('sorted by ImpactInr, largest first; a row with no impact last; input untouched', () => {
    const rows = [al({ Matnr: 'LOW', ImpactInr: '10' }), al({ Matnr: 'NONE', ImpactInr: '' }), al({ Matnr: 'HIGH', ImpactInr: '5000' }), al({ Matnr: 'SAVE', ImpactInr: '-300' })];
    expect(sortByImpact(rows).map((r) => r.Matnr)).toEqual(['HIGH', 'LOW', 'SAVE', 'NONE']);
    expect(rows[0].Matnr).toBe('LOW');
  });
  it('equal impact: higher severity first', () => {
    expect(sortByImpact([al({ Matnr: 'L', Severity: 'L' }), al({ Matnr: 'H', Severity: 'H' })]).map((r) => r.Matnr)).toEqual(['H', 'L']);
  });
  it('severity filter on the rows; empty = all; counts per severity', () => {
    const rows = [al({ Severity: 'H' }), al({ Severity: 'M' }), al({ Severity: 'H' }), al({ Severity: '' })];
    expect(filterBySeverity(rows, ['H'])).toHaveLength(2); expect(filterBySeverity(rows, [])).toHaveLength(4);
    expect(countBySeverity(rows)).toEqual({ H: 2, M: 1, L: 0, '': 1 });
  });
  it('rule filter goes to SAP as RuleIn in brackets with "or"; plant, hierarchy and brand are entity filters', () => {
    const f = buildMarginFilter({ rule: ['E1', 'E3'], plants: ['ub01'], prodha: '0101', brand: 'NAV', source: 'S' }, 'ALERT');
    expect(f).toContain("(RuleIn eq 'E1' or RuleIn eq 'E3')"); expect(f).toContain("Werks eq 'UB01'"); expect(f).toContain("Prodha eq '0101'"); expect(f).toContain("Brand eq 'NAV'");
    expect(RULES).toHaveLength(9);
  });
});

describe('Alerts scope and links', () => {
  it('scope C shows the component and the number of finished goods; scope F the finished good', () => {
    expect(scopeText(al({ Scope: 'C', Comp: '151001807', FgCnt: 12 }))).toBe('Component 151001807 · 12 finished goods');
    expect(scopeText(al({ Scope: 'C', Comp: 'X', FgCnt: 1 }))).toBe('Component X · 1 finished good');
    expect(scopeText(al())).toBe('Finished good A FG A'); expect(isComponentScope(al({ Scope: 'C' }))).toBe(true);
  });
  it('a finished-good row links to the board with its material and plant; the URL only fills the selection', () => {
    const link = boardLink(al({ Matnr: '400009226', Werks: 'ub01' }), '/bom')!;
    expect(link.startsWith('/bom/margin/?')).toBe(true); expect(link).not.toContain('+');
    const sel = parseMarginSearch(link.slice(link.indexOf('?')));
    expect(sel.materials).toEqual(['400009226']); expect(sel.plants).toEqual(['UB01']);
  });
  it('a component row has no single finished good, so no link', () => expect(boardLink(al({ Scope: 'C', Comp: 'X', FgCnt: 3 }))).toBeNull());
  it('impact direction: positive = loss, negative = saving, nothing = n/a', () => {
    expect(impactDirection('5')).toBe('loss'); expect(impactDirection('-5')).toBe('saving'); expect(impactDirection('0')).toBe('none'); expect(impactDirection('')).toBe('na');
  });
});

describe('Alerts Excel', () => {
  it('headers and rows as shown (scope text, severity word, loss / saving)', () => {
    const s = alertSheet([al({ Scope: 'C', Comp: 'C1', FgCnt: 4, Severity: 'H', ImpactInr: '-20' })]);
    expect(s.name).toBe('Alerts'); expect(s.cols.map((c) => c.header)).toEqual([...ALERT_HEADERS]);
    const col = (h: string) => s.cols.find((c) => c.header === h)!;
    expect(col('Severity').get(0)).toBe('High'); expect(col('Scope').get(0)).toBe('Component C1 · 4 finished goods'); expect(col('Finished goods affected').get(0)).toBe(4);
    expect(col('Impact INR').get(0)).toBe(-20); expect(col('Loss / saving').get(0)).toBe('Saving');
  });
});
