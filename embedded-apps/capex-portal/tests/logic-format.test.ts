import { describe, it, expect } from 'vitest';
import * as F from '@/lib/format';

describe('parseSapDate', () => {
  it('handles /Date(ms)/ and offset suffix', () => {
    expect(F.parseSapDate('/Date(1730764800000)/')?.toISOString()).toBe('2024-11-05T00:00:00.000Z');
    expect(F.parseSapDate('/Date(1730764800000+0000)/')?.getTime()).toBe(1730764800000);
    expect(F.parseSapDate('/Date(-86400000)/')?.toISOString()).toBe('1969-12-31T00:00:00.000Z');
  });
  it('handles ISO and YYYYMMDD', () => {
    expect(F.parseSapDate('2026-11-05')?.toISOString()).toBe('2026-11-05T00:00:00.000Z');
    expect(F.parseSapDate('2026-11-05T10:20:30Z')?.toISOString()).toBe('2026-11-05T10:20:30.000Z');
    expect(F.parseSapDate('20261105')?.toISOString()).toBe('2026-11-05T00:00:00.000Z');
  });
  it('zero / empty / garbage dates are null', () => {
    for (const v of ['0000-00-00', '00000000', '0000-00-00T00:00:00', '', '  ', null, undefined, 'nope', '/Date(abc)/', '/Date(-62135596800000)/'])
      expect(F.parseSapDate(v as string)).toBeNull();
  });
});

describe('date formatting', () => {
  it('fmtDate', () => {
    expect(F.fmtDate('/Date(1730764800000)/')).toBe('05 Nov 2024');
    expect(F.fmtDate('2026-09-01')).toBe('01 Sep 2026');
    expect(F.fmtDate('0000-00-00')).toBe('-');
    expect(F.fmtDate(null)).toBe('-');
  });
  it('fmtDateTime', () => {
    expect(F.fmtDateTime('2026-11-05T10:20:30')).toBe('05 Nov 2026, 10:20');
    expect(F.fmtDateTime('00000000')).toBe('-');
  });
  it('toIsoDate / toSapDate round trip', () => {
    expect(F.toIsoDate('/Date(1730764800000)/')).toBe('2024-11-05');
    expect(F.toIsoDate('00000000')).toBe('');
    expect(F.toSapDate('2026-11-05')).toBe('/Date(' + Date.UTC(2026, 10, 5) + ')/');
    expect(F.toSapDate(new Date(2026, 10, 5, 13, 0))).toBe('/Date(' + Date.UTC(2026, 10, 5) + ')/');
    expect(F.toSapDate('0000-00-00')).toBe('');
    expect(F.parseSapDate(F.toSapDate('2026-11-05'))?.toISOString()).toBe('2026-11-05T00:00:00.000Z');
  });
});

describe('num', () => {
  it('is NaN-safe', () => {
    expect(F.num('1234.50')).toBe(1234.5);
    expect(F.num(' 7 ')).toBe(7);
    expect(F.num('')).toBe(0);
    expect(F.num(null)).toBe(0);
    expect(F.num(undefined)).toBe(0);
    expect(F.num('abc')).toBe(0);
    expect(F.num(NaN)).toBe(0);
    expect(F.num(Infinity)).toBe(0);
    expect(F.num(-5)).toBe(-5);
  });
});

describe('money', () => {
  it('lakh / crore like formatter.js', () => {
    expect(F.inLakhs(6000000)).toBe('60.00 L');
    expect(F.inCrores(5000000000)).toBe('500.00 Cr');
    expect(F.fmtInr(6000000)).toBe('₹ 60.00 L');
    expect(F.fmtInr(50000)).toBe('₹ 0.50 L');
    expect(F.fmtInr(1000000)).toBe('₹ 10.00 L'); // exactly 10 lakh
    expect(F.fmtInr('123456789')).toBe('₹ 12.35 Cr');
  });
  it('switches to Cr exactly at 1 crore, also for negatives', () => {
    expect(F.fmtInr(9999999)).toBe('₹ 100.00 L');
    expect(F.fmtInr(10000000)).toBe('₹ 1.00 Cr');
    expect(F.fmtInr(-10000000)).toBe('₹ -1.00 Cr');
  });
  it('rounding', () => {
    expect(F.inLakhs(123456)).toBe('1.23 L');
    expect(F.inLakhs(129999)).toBe('1.30 L');
    expect(F.inLakhs(12345678)).toBe('123.46 L');
  });
  it('lakh grouping for large lakh values', () => {
    expect(F.inLakhs(999999999)).toBe('10,000.00 L');
    expect(F.inLakhs(123456789012)).toBe('12,34,567.89 L');
  });
  it('blanks -> "-"', () => {
    for (const v of [null, undefined, '', 'x', NaN]) {
      expect(F.fmtInr(v as never)).toBe('-');
      expect(F.fmtInrFull(v as never)).toBe('-');
      expect(F.fmtPct(v as never)).toBe('-');
    }
  });
  it('fmtInrFull Indian grouping', () => {
    expect(F.fmtInrFull(1234567)).toBe('₹ 12,34,567.00');
    expect(F.fmtInrFull('1234567.5')).toBe('₹ 12,34,567.50');
    expect(F.fmtInrFull(0)).toBe('₹ 0.00');
    expect(F.rupees(1234567.8)).toBe('₹ 12,34,568');
  });
  it('fmtPct one decimal', () => {
    expect(F.fmtPct(18.54)).toBe('18.5%');
    expect(F.fmtPct('15')).toBe('15.0%');
  });
  it('share / widthPct', () => {
    expect(F.share(50, 200)).toBe(25);
    expect(F.share(5, 0)).toBe(0);
    expect(F.share(500, 200)).toBe(100);
    expect(F.widthPct(1, 3)).toBe('33.33%');
  });
});

describe('fiscal year', () => {
  it('fyDigits', () => {
    expect(F.fyDigits('2026')).toBe('2026');
    expect(F.fyDigits('FY2026')).toBe('2026');
    expect(F.fyDigits('FY 2026-27')).toBe('2026');
    expect(F.fyDigits('')).toBe('');
    expect(F.fyDigits(null)).toBe('');
  });
  it('key / label incl. century wrap', () => {
    expect(F.fyKey('2026')).toBe('FY2026');
    expect(F.fyLabel('FY2026')).toBe('FY 2026-27');
    expect(F.fyLabel('2099')).toBe('FY 2099-00');
    expect(F.fyLabel('2008')).toBe('FY 2008-09');
    expect(F.fyKey('')).toBe('');
  });
  it('currentFiscalYear is April-March', () => {
    expect(F.currentFiscalYear(new Date(2026, 3, 1))).toBe('2026');
    expect(F.currentFiscalYear(new Date(2026, 2, 31))).toBe('2025');
    expect(F.currentFiscalYear(new Date(2026, 10, 24))).toBe('2026');
    expect(F.currentFiscalYear(new Date(2027, 0, 15))).toBe('2026');
    expect(F.currentFiscalYear(new Date(2026, 11, 31))).toBe('2026');
  });
});

describe('status', () => {
  it('labels and tones, case-insensitive', () => {
    expect(F.statusLabel('IN_APPROVAL')).toBe('In Approval');
    expect(F.statusLabel('approved')).toBe('Approved');
    expect(F.statusTone('APPROVED')).toBe('success');
    expect(F.statusTone('REJECTED')).toBe('error');
    expect(F.statusTone('HOLD')).toBe('warning');
    expect(F.statusTone('DRAFT')).toBe('neutral');
    expect(F.statusTone('SOMETHING')).toBe('info');
    expect(F.statusTone('')).toBe('info');
  });
  it('truncated 12-char statuses compare by prefix', () => {
    expect(F.statusLabel('UNDER_EVALUA')).toBe('Under Evaluation');
    expect(F.statusTone('UNDER_EVALUA')).toBe('warning');
    expect(F.statusLabel('NON_COMPLIAN')).toBe('Not Compliant');
    expect(F.statusTone('NON_COMPLIAN')).toBe('error');
    expect(F.isStatus('UNDER_EVALUA', 'UNDER_EVALUATION')).toBe(true);
    expect(F.isStatus('UNDER_EVALUATION', 'UNDER_EVALUATION')).toBe(true);
    expect(F.isStatus('UNDER', 'UNDER_EVALUATION')).toBe(false); // short strings are not prefixes
    expect(F.isStatus('', 'UNDER_EVALUATION')).toBe(false);
  });
  it('unknown / blank labels', () => {
    expect(F.statusLabel('WEIRD')).toBe('WEIRD');
    expect(F.statusLabel('')).toBe('-');
    expect(F.statusLabel(null)).toBe('-');
  });
  it('timelineTone', () => {
    expect(F.timelineTone('approved')).toBe('done');
    expect(F.timelineTone('PENDING')).toBe('current');
    expect(F.timelineTone('WAITING')).toBe('waiting');
    expect(F.timelineTone(undefined)).toBe('waiting');
  });
});

describe('SLA', () => {
  it('defaults 3/5, strictly greater-than', () => {
    expect(F.slaState(0)).toBe('onTrack');
    expect(F.slaState(3)).toBe('onTrack');
    expect(F.slaState(4)).toBe('atRisk');
    expect(F.slaState(5)).toBe('atRisk');
    expect(F.slaState(6)).toBe('breached');
    expect(F.slaState('abc')).toBe('onTrack');
    expect(F.slaState(null)).toBe('onTrack');
  });
  it('custom and falsy thresholds', () => {
    expect(F.slaState(2, 1, 2)).toBe('atRisk');
    expect(F.slaState(3, 1, 2)).toBe('breached');
    expect(F.slaState(4, 0, 0)).toBe('atRisk'); // 0 = unset -> defaults 3/5
  });
  it('tone / label', () => {
    expect(F.slaTone('onTrack')).toBe('success');
    expect(F.slaTone('atRisk')).toBe('warning');
    expect(F.slaTone('breached')).toBe('error');
    expect(F.slaLabel(1)).toBe('On Track (1 day)');
    expect(F.slaLabel(4)).toBe('At Risk (4 days)');
    expect(F.slaLabel(9)).toBe('SLA Breached (9 days)');
  });
  it('priorityTone', () => {
    expect(F.priorityTone('High')).toBe('error');
    expect(F.priorityTone('Medium')).toBe('warning');
    expect(F.priorityTone('Low')).toBe('success');
    expect(F.priorityTone('')).toBe('success');
  });
});

describe('misc', () => {
  it('metric tones', () => {
    expect(F.irrTone(18)).toBe('good');
    expect(F.irrTone(15)).toBe('warn');
    expect(F.irrTone(14.99)).toBe('bad');
    expect(F.irrTone(NaN)).toBe('none');
    expect(F.npvTone(0)).toBe('bad');
    expect(F.npvTone(1)).toBe('good');
    expect(F.paybackTone(3)).toBe('good');
    expect(F.paybackTone(5)).toBe('warn');
    expect(F.paybackTone(5.1)).toBe('bad');
    expect(F.paybackTone(null)).toBe('none');
    expect(F.balanceTone(0)).toBe('error');
    expect(F.balanceTone('5')).toBe('success');
  });
  it('small helpers', () => {
    expect(F.fmtDays(1)).toBe('1 day');
    expect(F.fmtDays(0)).toBe('0 days');
    expect(F.orDash('')).toBe('-');
    expect(F.initials('Ravi Kumar Singh')).toBe('RS');
    expect(F.initials('')).toBe('?');
    expect(F.stars(3.6)).toBe('★★★★☆');
    expect(F.yesNo('X')).toBe('Yes');
    expect(F.vendorCardTone('L1', false)).toBe('l1');
    expect(F.vendorCardTone('L2', true)).toBe('selected');
  });
});
