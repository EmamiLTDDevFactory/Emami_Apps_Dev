import { describe, expect, it } from 'vitest';
import { resolveUnit } from '@/lib/refs';
import { FORM } from '@/lib/form';
import type { RequestData } from '@/lib/types';

const data = (single: RequestData['single'] = {}): RequestData => ({ single, multi: {}, views: [] });
const meta = (key: string) => FORM.fields[key];

describe('unit and currency of quantities and amounts', () => {
  it('gross weight: the unit comes from MARA-GEWEI of the same material', () => {
    const row = { GEWEI: 'KG', BRGEW: '1.2' };
    expect(resolveUnit(meta('Material.BRGEW'), row, data({ Material: row }), FORM.fields)).toMatchObject({ kind: 'unit', value: 'KG', locked: false });
  });
  it('empty reference: shown without unit and the value is locked with a hint', () => {
    const r = resolveUnit(meta('Material.BRGEW'), { BRGEW: '1' }, data({ Material: { BRGEW: '1' } }), FORM.fields);
    expect(r).toMatchObject({ kind: 'unit', value: '', locked: true });
    expect(r.hint).toContain(FORM.fields['Material.GEWEI'].label);
  });
  it('plant quantities take the base unit from the material row (another entity)', () => {
    const row = { MINBE: '10' };
    expect(resolveUnit(meta('Plant.MINBE'), row, data({ Material: { MEINS: 'EA' }, Plant: row }), FORM.fields).value).toBe('EA');
    expect(resolveUnit(meta('Plant.MINBE'), row, data({ Plant: row }), FORM.fields).locked).toBe(true);
  });
  it('amounts take the currency from the field of the dictionary table, wherever the request has it (T001-WAERS is on Valuation)', () => {
    const val = { WAERS: 'INR', VERPR: '5' };
    expect(resolveUnit(meta('Valuation.VERPR'), val, data({ Valuation: val }), FORM.fields)).toMatchObject({ kind: 'currency', value: 'INR' });
    expect(resolveUnit(meta('Material.ZSKUSIZE'), {}, data({ Valuation: { WAERS: 'INR' } }), FORM.fields)).toMatchObject({ kind: 'currency', value: 'INR', locked: false });
    expect(resolveUnit(meta('Valuation.VERPR'), { VERPR: '5' }, data({ Valuation: { VERPR: '5' } }), FORM.fields).locked).toBe(true);
  });
  it('a grid row uses its own row (MARM-GEWEI is in the same row)', () => {
    const row = { GEWEI: 'G', BRGEW: '5' };
    const m = Object.values(FORM.fields).find((f) => f.entity === 'UnitOfMeasure' && f.type === 'QUAN' && f.refField === 'GEWEI');
    expect(m).toBeTruthy();
    expect(resolveUnit(m!, row, data({ Material: { GEWEI: 'KG' } }), FORM.fields).value).toBe('G');
  });
  it('a reference the request does not have is never locked and shows nothing (RV61A-KOEI1)', () => {
    expect(resolveUnit(meta('Material.ZZSCHEMEP'), {}, data(), FORM.fields)).toMatchObject({ kind: 'currency', known: false, locked: false, value: '' });
  });
  it('other field types have no unit', () => {
    expect(resolveUnit(meta('Material.MATKL'), {}, data(), FORM.fields).kind).toBe('none');
  });
});
