import { describe, expect, it } from 'vitest';
import { buildIcPayload, capSummary, icPermissions, icStatusText, overdueRows, photoSlots, riskTone, totalCost, validateIc, type IcDraft } from '@/components/assets/icLogic';

const d: IcDraft = { cwipid: 'CW-1', cpeid: 'CPE-1', anlkl: '3000', kostl: '1100', ebeln: '45', mblnr: '50', title: 'Press', werks: 'UN13', commissionDt: '2026-11-20', techSignoff: 'Testing Phase Long', remarks: '', equipCost: '100000', freightCost: '5000.5', installCost: '' };

describe('IC', () => {
  it('totals the three costs', () => { expect(totalCost(d)).toBe(105000.5); });
  it('validates; photos only when enforced', () => {
    expect(validateIc(d, 0, false).errors).toEqual([]);
    expect(validateIc(d, 2, true).errors).toEqual(['All three commissioning photographs are mandatory.']);
    expect(validateIc({ ...d, commissionDt: '', techSignoff: ' ', equipCost: '0' }, 3, true).errors).toEqual(['Commissioning date is required.', 'Technical sign-off name is required.', 'Equipment cost must be greater than zero.']);
  });
  it('builds the SAP payload (log #25/#26)', () => {
    const p = buildIcPayload(d, 1, new Date(2026, 10, 24, 15, 0));
    expect(p).toMatchObject({ Cwipid: 'CW-1', Cpeid: 'CPE-1', Anlkl: '3000', Ebeln: '45', Kostl: '1100', Mblnr: '50', Werks: 'UN13', PhotoCount: 1, Status: 'PENDING', Waers: 'INR', EquipCost: '100000.000', FreightCost: '5000.500', InstallCost: '0.000', TotalCost: '105000.500' });
    expect(p.TechSignoff).toBe('Testing Phas');
    expect(String(p.TechSignoff).length).toBe(12);
    expect(p.CommissionDt).toBe('/Date(' + Date.UTC(2026, 10, 20) + ')/');
    expect(p.TechSignDt).toBe('/Date(' + Date.UTC(2026, 10, 24) + ')/');
  });
  it('permissions: finance/admin approve, others edit', () => {
    expect(icPermissions('PENDING', 'Unit Head', false)).toEqual({ editable: true, canApprove: false });
    expect(icPermissions('PENDING', 'Finance Controller', false)).toEqual({ editable: false, canApprove: true });
    expect(icPermissions('PENDING', 'Unit Head', true)).toEqual({ editable: true, canApprove: true });
    expect(icPermissions('CAPITALIZED', 'Finance', true)).toEqual({ editable: false, canApprove: false });
  });
  it('maps photo slots from PHOTO1..3 documents', () => {
    const s = photoSlots([{ Category: 'PHOTO2', Filename: 'a.jpg' }]);
    expect(s.map((x) => x.uploaded)).toEqual([false, true, false]);
    expect(s[1].name).toBe('a.jpg');
  });
});

describe('Capitalization', () => {
  const rows = [{ Amount: '100', AgeDays: 10 }, { Amount: '300', AgeDays: 50 }, { Amount: '200', AgeDays: 46 }];
  it('summarises with strictly-greater overdue', () => {
    expect(capSummary(rows, 45)).toEqual({ count: 3, value: 600, avgAge: 35, overdue: 2 });
    expect(capSummary(rows, 50).overdue).toBe(0);
    expect(overdueRows(rows, 45)).toHaveLength(2);
    expect(capSummary([], 45)).toEqual({ count: 0, value: 0, avgAge: 0, overdue: 0 });
  });
  it('texts and tones', () => {
    expect(icStatusText('NOT_STARTED')).toBe('IC Not Started');
    expect(riskTone('Error')).toBe('error');
    expect(riskTone('None')).toBe('neutral');
  });
});
