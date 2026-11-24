import { describe, expect, it } from 'vitest';
import type { QuotaItem, QuotaSummary } from '@/lib/entities';
import { capsFromConfig, quotaCheck, rollupUnits, usedTone, validateQuota } from '@/components/quota/quotaLogic';

const sum = (o: Partial<QuotaSummary>) => ({ Werks: 'UN13', PlantName: 'Unit 13', Fiscalyear: '2026', Used: '150000', Reserved: '0', Itemcount: 3, Yearcap: '200000', Singlecap: '50000', Remaining: '50000', ...o }) as QuotaSummary;

describe('quota', () => {
  const caps = capsFromConfig({ QUOTA_YEAR_CAP: '200000', QUOTA_SINGLE_CAP: '50000', QUOTA_YEAR_CAP_PAC1: '500000' });
  it('reads caps and per-plant overrides, defaults when absent', () => {
    expect(caps).toEqual({ yearCap: 200000, singleCap: 50000, plantCaps: { PAC1: 500000 } });
    expect(capsFromConfig({})).toEqual({ yearCap: 200000, singleCap: 50000, plantCaps: {} });
  });
  it('rolls up units from the summary for the fiscal year', () => {
    const u = rollupUnits([sum({}), sum({ Werks: 'UN14', Fiscalyear: '2025' })], [], caps, 'FY2026');
    expect(u).toHaveLength(1);
    expect(u[0]).toMatchObject({ werks: 'UN13', used: 150000, cap: 200000, remaining: 50000, count: 3 });
  });
  it('falls back to approved items, plant cap applied', () => {
    const items = [
      { Werks: 'PAC1', PlantName: 'Pacharia', Fiscalyear: '2026', Status: 'APPROVED', Amount: '100000' },
      { Werks: 'PAC1', PlantName: 'Pacharia', Fiscalyear: '2026', Status: 'PENDING', Amount: '999' },
    ] as QuotaItem[];
    const u = rollupUnits([], items, caps, '2026');
    expect(u[0]).toMatchObject({ used: 100000, count: 1, cap: 500000, remaining: 400000 });
  });
  it('checks single and annual caps through checkQuota', () => {
    const units = rollupUnits([sum({})], [], caps, '2026');
    expect(quotaCheck({ plant: 'UN13', title: '', amount: '', justification: '' }, units, caps)).toBeNull();
    expect(quotaCheck({ plant: 'UN13', title: '', amount: '40000', justification: '' }, units, caps)).toMatchObject({ ok: true, remainingAfter: 10000 });
    expect(quotaCheck({ plant: 'UN13', title: '', amount: '60000', justification: '' }, units, caps)?.reason).toMatch(/Single capex/);
    expect(quotaCheck({ plant: 'UN13', title: '', amount: '50001', justification: '' }, units, caps)?.ok).toBe(false);
    const full = rollupUnits([sum({ Used: '180000', Remaining: '20000' })], [], caps, '2026');
    expect(quotaCheck({ plant: 'UN13', title: '', amount: '30000', justification: '' }, full, caps)?.reason).toMatch(/Annual unit quota/);
  });
  it('validates the form', () => {
    const units = rollupUnits([sum({})], [], caps, '2026');
    expect(validateQuota({ plant: '', title: '', amount: '', justification: '' }, units, caps).slice(0, 4)).toEqual(['Select the unit.', 'Description is required.', 'Amount must be greater than zero.', 'Justification is required.']);
    expect(validateQuota({ plant: 'UN13', title: 'x', amount: '1000', justification: 'y' }, units, caps)).toEqual([]);
  });
  it('tones by consumption', () => {
    expect(usedTone({ used: 90, cap: 100 })).toBe('error');
    expect(usedTone({ used: 70, cap: 100 })).toBe('warning');
    expect(usedTone({ used: 10, cap: 100 })).toBe('success');
  });
});
