import { describe, expect, it } from 'vitest';
import { actionBody, historyFilter, patchBody, rateFilter, rateKeyPath, sourceFilter } from '@/lib/budgetMgmt/api';
import { csvList, dateText, defaultHistWindow, fiscalYear, isEditable, padMatnr, showDate, stripZeros, toSapDate, validateAction, validateEdit, validateHistory } from '@/lib/budgetMgmt/rules';

const hist = { land1: 'IN', gjahr: '2026', histFrom: '2025-04-01', histTo: '2026-03-31', catAFrom: '8,000,000', catBFrom: '4,000,000' };

describe('budget rate management rules', () => {
  it('formats dates and material numbers', () => {
    expect(showDate('20260401')).toBe('01.04.2026');
    expect(toSapDate('2026-04-01')).toBe('20260401');
    expect(dateText('/Date(1775001600000)/')).toBe('20260401');
    expect(padMatnr('10000001')).toBe('000000000010000001');
    expect(padMatnr('abc')).toBe('ABC');
    expect(stripZeros('000000000010000001')).toBe('10000001');
    expect(csvList('a, b  a;c')).toEqual(['A', 'B', 'C']);
  });
  it('fiscal year starts in April; history window is the year before', () => {
    expect(fiscalYear(new Date(2026, 3, 1))).toBe('2026');
    expect(fiscalYear(new Date(2026, 2, 31))).toBe('2025');
    expect(defaultHistWindow('2026')).toEqual({ from: '2025-04-01', to: '2026-03-31' });
  });
  it('builds the history, rate and source filters', () => {
    expect(historyFilter(hist)).toBe("Land1 eq 'IN' and Gjahr eq '2026' and HistFrom eq datetime'2025-04-01T00:00:00' and HistTo eq datetime'2026-03-31T00:00:00' and CatAFrom eq 8000000m and CatBFrom eq 4000000m");
    expect(rateFilter({ gjahr: '2026', land1: 'IN', status: 'D' })).toBe("Gjahr eq '2026' and Land1 eq 'IN' and ApprStatus eq 'D'");
    expect(rateFilter({ gjahr: '2026', land1: 'IN', status: '', matnr: ['1', '2'], werks: ['1000'] })).toBe("Gjahr eq '2026' and Land1 eq 'IN' and (Matnr eq '000000000000000001' or Matnr eq '000000000000000002') and Werks eq '1000'");
    expect(sourceFilter('10000001', '1000', 'IN')).toBe("Matnr eq '000000000010000001' and Werks eq '1000' and Land1 eq 'IN'");
  });
  it('validates the history filter', () => {
    expect(validateHistory(hist)).toEqual({});
    expect(validateHistory({ ...hist, gjahr: '26' }).gjahr).toBeTruthy();
    expect(validateHistory({ ...hist, histFrom: '2026-03-31' }).histFrom).toBeTruthy();
    expect(validateHistory({ ...hist, catAFrom: '3,000,000' }).catAFrom).toBeTruthy();
  });
  it('validates the edit row', () => {
    expect(validateEdit({ adjType: 'N', adjValue: '', overrideRate: '', overrideRsn: '' })).toEqual({});
    expect(validateEdit({ adjType: 'P', adjValue: '', overrideRate: '', overrideRsn: '' }).adjValue).toBeTruthy();
    expect(validateEdit({ adjType: 'P', adjValue: '1000', overrideRate: '', overrideRsn: '' }).adjValue).toBeTruthy();
    expect(validateEdit({ adjType: 'P', adjValue: '-5', overrideRate: '', overrideRsn: '' })).toEqual({});
    expect(validateEdit({ adjType: 'A', adjValue: '-12.5', overrideRate: '', overrideRsn: '' })).toEqual({});
    expect(validateEdit({ adjType: 'N', adjValue: '', overrideRate: '10', overrideRsn: '' }).overrideRsn).toBeTruthy();
    expect(validateEdit({ adjType: 'N', adjValue: '', overrideRate: '0', overrideRsn: 'x' }).overrideRate).toBeTruthy();
    expect(validateEdit({ adjType: 'N', adjValue: '', overrideRate: '10', overrideRsn: 'x' })).toEqual({});
  });
  it('validates the action panel', () => {
    const p = { action: 'APPROVE' as const, gjahr: '2026', land1: 'IN', matnrCsv: '', werksCsv: '', reason: '', email: 'a@b.com' };
    expect(validateAction(p)).toEqual({});
    expect(validateAction({ ...p, email: '' }).email).toBeTruthy();
    expect(validateAction({ ...p, email: 'nope' }).email).toBeTruthy();
    expect(validateAction({ ...p, action: 'REJECT' }).reason).toBeTruthy();
    expect(validateAction({ ...p, action: 'REJECT', reason: 'bad' })).toEqual({});
  });
  it('builds the write bodies and the row key', () => {
    expect(rateKeyPath({ Gjahr: '2026', Land1: 'IN', Matnr: '10000001', Werks: '1000', ValidFrom: '20260401' })).toBe("BudRateSet(Gjahr='2026',Land1='IN',Matnr='000000000010000001',Werks='1000',ValidFrom='20260401')");
    expect(patchBody({ adjType: 'P', adjValue: '5', overrideRate: '', overrideRsn: 'ignored' })).toEqual({ AdjType: 'P', AdjValue: '5', OverrideRate: '0', OverrideRsn: '' });
    expect(patchBody({ adjType: 'N', adjValue: '9', overrideRate: '1,250.5', overrideRsn: ' why ' })).toEqual({ AdjType: 'N', AdjValue: '0', OverrideRate: '1250.5', OverrideRsn: 'why' });
    expect(actionBody({ action: 'SUBMIT', gjahr: '2026', land1: 'IN', matnrCsv: '', werksCsv: '1000', reason: 'x', email: ' A@B.com ' })).toEqual({ Action: 'SUBMIT', Gjahr: '2026', Land1: 'IN', MatnrCsv: '', WerksCsv: '1000', Reason: '', Email: 'a@b.com' });
  });
  it('only draft and revised rates are editable', () => {
    expect(['D', 'V'].every(isEditable)).toBe(true);
    expect(['S', 'A', 'R'].some(isEditable)).toBe(false);
  });
});
