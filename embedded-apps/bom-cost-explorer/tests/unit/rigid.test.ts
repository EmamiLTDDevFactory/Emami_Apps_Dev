import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { buildRigidFilter } from '@/lib/rigid/service';
import { baseWhatIf, buildUp, parseCalc, polymerImpact, sensitivity, simulate, vendorCompare } from '@/lib/rigid/model';
import { parseBudget, parseHistory, rigidAlerts, utilisation, budgetPerPiece } from '@/lib/rigid/analysis';
import { rigidSheets } from '@/lib/rigid/export';
import { RIGID_FIELDS, type RigidRow } from '@/lib/rigid/fields';

const blank = (): RigidRow => Object.fromEntries(Object.entries(RIGID_FIELDS).map(([k, [, kind]]) => [k, kind === 's' || kind === 'd' ? (kind === 'd' ? '0' : '') : kind === 'i' ? 0 : null])) as unknown as RigidRow;
const row = (p: Partial<RigidRow>): RigidRow => ({ ...blank(), ...p });
/** One mould: 16 cavities, 9.5 s, 22 h, 95 %: output 118,... ; resin 2.5 kg x 79.2 + 2.5 x 602 */
const M = (over: Partial<RigidRow> = {}) => row({ Grain: 'M', Flag: 'OK', Matnr: '151000753', Mould: '600000095', Lifnr: '99', Vendor: 'PLASTO', RunCavity: '16', CycTime: '9.5', HoursDay: '22', FacProd: '95', Zmrt: '14371', Zmbx: '20', Zmfg: '4', ...over });
const comps = [row({ Grain: 'B', Matnr: '151000753', Mould: '600000095', Lifnr: '99', Comp: 'A', BomQty: '2.5', Zpbr: '79.2' }), row({ Grain: 'B', Matnr: '151000753', Mould: '600000095', Lifnr: '99', Comp: 'B', BomQty: '2.5', Zpbr: '602', ScrapPct: '2' })];
const mouldRows = () => {
  const m = M();
  const out = (22 * 3600 * 0.95) / 9.5 * 16, conv = 14371 / out * 1000, mat = 2.5 * 79.2 + 2.5 * 1.02 * 602;
  return [{ ...m, TotOut: String(out), ConvCost: String(conv), MatCost: String(mat), LandRate: String(Math.round(mat + conv + 20 + 4)) }, ...comps];
};

describe('rigid filter', () => {
  it('builds the filter without leading zeros and with the mode', () => {
    expect(buildRigidFilter({ matnr: ['000000000151000753'], werks: 'un13', mode: 'B' })).toBe("Matnr eq '151000753' and Werks eq 'UN13' and Mode eq 'B'");
    expect(buildRigidFilter({ matnr: ['1', '2'] })).toBe("(Matnr eq '1' or Matnr eq '2')");
    expect(() => buildRigidFilter({ matnr: [] })).toThrow();
    expect(() => buildRigidFilter({ matnr: ['1'], werks: 'ABC' })).toThrow();
  });
});

describe('rigid model', () => {
  it('the what-if with the SAP values reproduces the SAP landed rate', () => {
    const c = parseCalc(mouldRows());
    expect(c.moulds).toHaveLength(1);
    const m = c.moulds[0];
    const r = simulate(m, baseWhatIf(m));
    expect(r.landedRounded.toString()).toBe(m.landed.toString());
  });
  it('resin +10 % and slower cycle raise the landed rate; ITC / margin follow the base', () => {
    const m = parseCalc(mouldRows()).moulds[0];
    const w = baseWhatIf(m);
    const up = simulate(m, { ...w, rates: { A: '87.12', B: '662.2' } }).landedRounded;
    expect(up.gt(m.landed)).toBe(true);
    const slow = simulate(m, { ...w, cycTime: '19' }).landedRounded;
    expect(slow.gt(m.landed)).toBe(true);
    const withMar = simulate(m, { ...w, marPct: '10' }).landedRounded;
    expect(withMar.gt(m.landed)).toBe(true);
    expect(sensitivity(m).find((s) => s.pct === 10)!.delta.gt(0)).toBe(true);
    expect(sensitivity(m).find((s) => s.pct === -10)!.delta.lt(0)).toBe(true);
  });
  it('compares vendors cheapest first and handles zero cycle time', () => {
    const rows = [...mouldRows(), { ...M({ Lifnr: '71', Vendor: 'ASIAN', Mould: '600000099', LandRate: '9999' }) }];
    const v = vendorCompare(parseCalc(rows));
    expect(v[0].cheapest).toBe(true); expect(v[1].diff.gt(0)).toBe(true);
    const z = simulate(parseCalc(mouldRows()).moulds[0], { ...baseWhatIf(parseCalc(mouldRows()).moulds[0]), cycTime: '0' });
    expect(z.conv.isZero()).toBe(true);
  });
  it('lists the build-up lines and the polymer impact', () => {
    expect(buildUp(M({ MatCost: '1703', ConvCost: '113', Zmbx: '20' })).map((l) => l.key)).toEqual(['mat', 'conv', 'box', 'frt']);
    const u = polymerImpact([row({ Grain: 'U', Matnr: '151000753', BomQty: '2.5' }), row({ Grain: 'U', Matnr: '151000762', BomQty: '1' })], new Decimal(10), new Decimal(80));
    expect(u[0].deltaPer1000.toString()).toBe('20');
  });
});

describe('rigid analysis', () => {
  it('budget per piece uses the price unit; history keeps the landed row; alerts and utilisation', () => {
    const b = parseBudget([row({ Grain: 'D', Gjahr: '2026', Landed: '1950', BomQty: '1000', Budqty: '4200000', Meins: 'PC' })]);
    expect(budgetPerPiece(b)!.toString()).toBe('1.95');
    const h = parseHistory([row({ Grain: 'H', ValidFrom: '2026-09-01', ValidTo: '2026-09-30', Mould: '6', Lifnr: '9', Infnr: 'I', LandRate: '0' }), row({ Grain: 'H', ValidFrom: '2026-09-01', ValidTo: '2026-09-30', Mould: '6', Lifnr: '9', Infnr: 'I', LandRate: '1980' })]);
    expect(h).toHaveLength(1); expect(h[0].landed.toString()).toBe('1980');
    const calc = parseCalc([...mouldRows(), row({ Grain: 'M', Flag: 'ERR', Msg: 'GRN not done for the mould material', Mould: '600000210' })]);
    const al = rigidAlerts({ calc, budget: b, history: h, cockpitRatePc: new Decimal('1.00'), today: '2026-11-25' });
    expect(al.some((a) => a.sev === 'high' && /GRN not done/.test(a.text))).toBe(true);
    expect(al.some((a) => /above the rate used in this costing/.test(a.text))).toBe(true);
    expect(al.some((a) => /has expired/.test(a.text))).toBe(true);
    const u = utilisation(calc, new Decimal('4200000'));
    expect(u[0].daysForBudget!.gt(0)).toBe(true);
  });
  it('exports one sheet per part', () => {
    const calc = parseCalc(mouldRows());
    const s = rigidSheets({ vendors: vendorCompare(calc), moulds: calc.moulds, budget: null, history: [], util: utilisation(calc, null), alerts: [] });
    expect(s.map((x) => x.name)).toEqual(['Vendors', 'Build-up', 'Components', 'Utilisation', 'Alerts']);
    expect(s[0].cols[0].get(0)).toBe('600000095');
  });
});

import { parseFgRigid } from '@/lib/rigid/fgRigid';
describe('finished good rigid split', () => {
  it('parses G and R rows; other = landed - resin - conversion; no rows = empty map (screens stay as they were)', () => {
    const m = parseFgRigid([
      row({ Grain: 'G', Matnr: '400004939', Werks: 'UN09', LandRate: '1.9462', MatCost: '1.7371', ConvCost: '0.1153', Nmould: 1, Flag: 'OK' }),
      row({ Grain: 'R', Matnr: '400004939', Comp: '151000753', CompQty: '1.02', LandRate: '1908', MatCost: '1703', ConvCost: '113', Flag: 'OK', ValidFrom: '2026-09-01' }),
    ]);
    const x = m.get('400004939')!;
    expect(x.other.toFixed(4)).toBe('0.0938'); expect(x.list).toHaveLength(1); expect(x.list[0].comp).toBe('151000753');
    expect(parseFgRigid([]).size).toBe(0);
  });
});
