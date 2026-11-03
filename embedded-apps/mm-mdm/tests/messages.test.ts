import { describe, expect, it } from 'vitest';
import { abapField, cellKey, groupByTab, indexByField, messageKey, parseTarget, tabOfTarget, type TabLike } from '@/lib/messages';
import type { Message } from '@/lib/types';

const m = (target: string, severity: Message['severity'] = 'E'): Message => ({ code: 'X', message: target, severity, target });
const tabs: TabLike[] = [
  { id: 'MARA_BASIC1', title: 'Basic data 1', entity: 'Material', fields: ['Material.MTART', 'Material.NTGEW'] },
  { id: 'MARC_GEN', title: 'Plant general', entity: 'Plant', fields: ['Plant.DISMM'] },
  { id: 'MARM_UOM', title: 'Units', entity: 'UnitOfMeasure', fields: ['UnitOfMeasure.MEINH', 'UnitOfMeasure.UMREZ'] }
];

describe('targets', () => {
  it('Entity/FIELD', () => expect(parseTarget('Material/NTGEW')).toEqual({ entity: 'Material', field: 'NTGEW' }));
  it('the grid index in a target is 1-based, the screen counts from 0', () => {
    expect(parseTarget('UnitOfMeasure[2]/MEINH')).toEqual({ entity: 'UnitOfMeasure', field: 'MEINH', row: 1 });
    expect(parseTarget('UnitOfMeasure[1]/MEINH')?.row).toBe(0);
    expect(cellKey(parseTarget('UnitOfMeasure[2]/MEINH')!)).toBe('UnitOfMeasure.MEINH#1');
  });
  it('the Gateway sends camel case property names', () => {
    expect(parseTarget('Plant/Dismm')?.field).toBe('DISMM');
    expect(parseTarget('InspectionType[3]/SerialNo')).toEqual({ entity: 'InspectionType', field: 'SERIAL_NO', row: 2 });
    expect(abapField('NTGEW')).toBe('NTGEW');
  });
  it('general messages have no key', () => {
    expect(parseTarget('')).toBeUndefined();
    expect(parseTarget('nonsense')).toBeUndefined();
    expect(messageKey(m(''))).toBeUndefined();
  });
  it('the first message of a cell is the one shown', () => {
    const idx = indexByField([m('Material/NTGEW'), { ...m('Material/NTGEW'), message: 'second' }, m('UnitOfMeasure[2]/MEINH')]);
    expect(Object.keys(idx)).toEqual(['Material.NTGEW', 'UnitOfMeasure.MEINH#1']);
    expect(idx['Material.NTGEW'].message).toBe('Material/NTGEW');
  });
});

describe('grouping by tab', () => {
  it('finds the tab of the field, else the first tab of the entity', () => {
    expect(tabOfTarget(parseTarget('Material/NTGEW'), tabs)?.id).toBe('MARA_BASIC1');
    expect(tabOfTarget(parseTarget('Material/UNKNOWN'), tabs)?.id).toBe('MARA_BASIC1');
    expect(tabOfTarget(parseTarget('Valuation/BKLAS'), tabs)).toBeUndefined();
  });
  it('groups in tab order with counts; the rest is general', () => {
    const r = groupByTab([m('UnitOfMeasure[2]/MEINH'), m('Plant/DISMM', 'W'), m('Material/NTGEW'), m('Material/MTART'), m(''), m('Valuation/BKLAS')], tabs);
    expect(r.groups.map((g) => [g.tab.id, g.errors, g.warnings])).toEqual([['MARA_BASIC1', 2, 0], ['MARC_GEN', 0, 1], ['MARM_UOM', 1, 0]]);
    expect(r.general).toHaveLength(2);
  });
});
