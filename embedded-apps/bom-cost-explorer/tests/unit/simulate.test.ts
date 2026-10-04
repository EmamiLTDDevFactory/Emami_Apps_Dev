import { describe, expect, it } from 'vitest';
import { EMPTY_SIM, isIdentity, quantityBreaks, repick, selectedOptionIndex, simulate, simulateRow, tornado, type SimSettings } from '@/lib/cost/simulate';
import { rowKey } from '@/lib/cost/tree';
import { leaf, opt, parent } from './helpers';

const options = [
  opt({ Source: 'CONTRACT', Cond: 'PB00', Curr: 'INR', RatePc: '12', RatePcInr: '12', ValidFrom: '2026-01-01', Plant: '1000' }),
  opt({ Source: 'INFOREC', Cond: 'PB00', Curr: 'USD', RatePc: '0.12', RatePcInr: '10', ValidFrom: '2026-06-01', Plant: '1000' }),
  opt({ Source: 'MBEW', Cond: 'VPRS', Curr: 'INR', RatePc: '11', RatePcInr: '11', ValidFrom: '2026-09-01', Plant: '1000' }),
];
// SAP selected CONTRACT at 12 INR/pc, freight 1/pc, qty 10 -> 130
const row = leaf(1, 1, 'RM1', '12', '1', '10', { SelSource: 'CONTRACT', SelCond: 'PB00', RateOptions: options });
const S = (p: Partial<SimSettings>): SimSettings => ({ ...EMPTY_SIM, ...p });

describe('rate re-selection', () => {
  it('finds the option SAP selected', () => expect(selectedOptionIndex(row)).toBe(0));
  it('cheapest option', () => expect(repick(row, 'cheapest', [])).toBe(1));
  it('latest valid-from', () => expect(repick(row, 'latest', [])).toBe(2));
  it('priority order: first source that has an option', () => {
    expect(repick(row, 'priority', ['MBEW', 'INFOREC'])).toBe(2);
    expect(repick(row, 'priority', ['MARKT', 'INFOREC', 'CONTRACT'])).toBe(1);
  });
  it('keeps SAP\'s own pick when the top available source is the one SAP used', () => {
    expect(repick(row, 'priority', ['MARKT', 'CONTRACT', 'INFOREC'])).toBe(-1);
    expect(simulateRow(row, S({ pick: 'priority', prio: ['CONTRACT', 'INFOREC'] })).changed).toBe(false);
  });
  it('re-picked total = RatePcInr(option) x ProdQty + FrtPcInr x ProdQty', () => {
    const s = simulateRow(row, S({ pick: 'cheapest' }));
    expect(s.repicked).toBe(true);
    expect(s.source).toBe('INFOREC');
    expect(s.total.toFixed(2)).toBe('110.00'); // (10 + 1) x 10
  });
  it('rows without options keep SAP (no rate stays no rate)', () => {
    const nr = leaf(2, 1, 'X', '0', '2', '5');
    expect(simulateRow(nr, S({ pick: 'cheapest' })).source).toBe('');
  });
});

describe('% what-ifs', () => {
  it('identity settings return SAP figures untouched', () => {
    expect(isIdentity(EMPTY_SIM)).toBe(true);
    const [s] = simulate([row], EMPTY_SIM);
    expect(s.total.toFixed(2)).toBe('130.00');
    expect(s.changed).toBe(false);
  });
  it('rate % applies to the effective source only', () => {
    expect(simulateRow(row, S({ ratePct: { CONTRACT: 5 } })).total.toFixed(4)).toBe('136.0000'); // (12.6 + 1) x 10
    expect(simulateRow(row, S({ ratePct: { INFOREC: 50 } })).changed).toBe(false);
  });
  it('freight % changes freight only', () => {
    expect(simulateRow(row, S({ freightPct: -20 })).total.toFixed(4)).toBe('128.0000'); // (12 + 0.8) x 10
  });
  it('FX % hits the currency the amount is priced in', () => {
    const usd = simulateRow(row, S({ pick: 'cheapest', fxPct: { USD: 10 } })); // INFOREC in USD: 10 -> 11
    expect(usd.ratePcInr.toFixed(4)).toBe('11.0000');
    expect(usd.frtPcInr.toFixed(4)).toBe('1.0000'); // freight is INR
    expect(simulateRow(row, S({ fxPct: { USD: 10 } })).changed).toBe(false); // SAP pick is INR
  });
  it('quantity multiplier scales ProdQty', () => {
    expect(simulateRow(row, S({ qtyMult: 2 })).total.toFixed(2)).toBe('260.00');
  });
  it('combines effects multiplicatively', () => {
    const s = simulateRow(row, S({ ratePct: { CONTRACT: 10 }, freightPct: 10, qtyMult: 0.5 }));
    expect(s.total.toFixed(4)).toBe('71.5000'); // (13.2 + 1.1) x 5
  });
  it('a manual override replaces the rate and ignores source % and FX', () => {
    const s = simulateRow(row, S({ overrides: { [rowKey(row)]: '9.5' }, ratePct: { CONTRACT: 50 } }));
    expect(s.overridden).toBe(true);
    expect(s.total.toFixed(2)).toBe('105.00'); // (9.5 + 1) x 10
  });
  it('parent rows never carry a simulated total', () => {
    expect(simulateRow(parent(9, 1, 'P', '999'), S({ qtyMult: 3 })).total.toFixed()).toBe('0');
  });
});

describe('sensitivity', () => {
  const rows = [row, leaf(2, 1, 'PM1', '2', '0.5', '10', { SelCurr: 'INR' })];
  const sim = simulate(rows, EMPTY_SIM);
  it('tornado: +/-10% of each driver, largest first', () => {
    const t = tornado(rows, sim, { pct: 10 });
    expect(t[0].driver).toMatch(/RM1/);
    expect(t[0].up.toFixed(2)).toBe('13.00');
    expect(t[0].down.toFixed(2)).toBe('-13.00');
    const frt = t.find((b) => b.kind === 'freight')!;
    expect(frt.base.toFixed(2)).toBe('15.00');
  });
  it('quantity breaks scale linearly', () => {
    const [h] = quantityBreaks(rows, sim, '1000', [0.5, 1, 2]);
    expect(h.breaks.map((b) => b.total.toFixed(2))).toEqual(['77.50', '155.00', '310.00']);
    expect(h.breaks[0].perPc.toFixed(4)).toBe(h.breaks[2].perPc.toFixed(4));
  });
});
