import { describe, expect, it } from 'vitest';
import { addRow, duplicateRow, nextCell, removeRow, type CellKind, type KeyEvent } from '@/lib/gridRows';
import { runRules } from '@/lib/demo/rules';
import { indexByField, parseTarget } from '@/lib/messages';
import type { RequestData } from '@/lib/types';

const k = (key: string, o: Partial<KeyEvent> = {}): KeyEvent => ({ key, ctrl: false, shift: false, alt: false, ...o });
const ctx = (kind: CellKind = 'text', atStart = true, atEnd = true) => ({ kind, atStart, atEnd });
const dims = { rows: 3, cols: 4 };

describe('row operations', () => {
  const rows = [{ MEINH: 'KG', UMREZ: 1 }, { MEINH: 'PC', UMREZ: 12 }];
  it('add appends an empty row', () => expect(addRow(rows)).toEqual([...rows, {}]));
  it('remove drops the row and leaves the others', () => expect(removeRow(rows, 0)).toEqual([rows[1]]));
  it('duplicate copies the row under it without its key', () => {
    const r = duplicateRow(rows, 0, ['MEINH']);
    expect(r).toHaveLength(3);
    expect(r[1]).toEqual({ UMREZ: 1 });
    expect(r[0]).toBe(rows[0]);
    expect(r[2]).toBe(rows[1]);
  });
  it('duplicate of a row that is not there changes nothing', () => expect(duplicateRow(rows, 5, ['MEINH'])).toBe(rows));
  it('operations never change the input', () => { const before = JSON.stringify(rows); addRow(rows); removeRow(rows, 1); duplicateRow(rows, 1, []); expect(JSON.stringify(rows)).toBe(before); });
});

describe('keyboard movement', () => {
  const at = { row: 1, col: 1 };
  it('Enter goes down, Shift+Enter up, stopping at the ends', () => {
    expect(nextCell(k('Enter'), at, dims, ctx())).toEqual({ row: 2, col: 1 });
    expect(nextCell(k('Enter', { shift: true }), at, dims, ctx())).toEqual({ row: 0, col: 1 });
    expect(nextCell(k('Enter'), { row: 2, col: 1 }, dims, ctx())).toBeNull();
  });
  it('Ctrl+Enter adds a row, Alt+Delete removes this one', () => {
    expect(nextCell(k('Enter', { ctrl: true }), at, dims, ctx())).toBe('add');
    expect(nextCell(k('Delete', { alt: true }), at, dims, ctx())).toBe('remove');
  });
  it('arrows move between rows in text cells, not in lists or dates (they use the arrows themselves)', () => {
    expect(nextCell(k('ArrowDown'), at, dims, ctx('text'))).toEqual({ row: 2, col: 1 });
    expect(nextCell(k('ArrowDown'), at, dims, ctx('select'))).toBeNull();
    expect(nextCell(k('ArrowDown'), at, dims, ctx('combo'))).toBeNull();
    expect(nextCell(k('ArrowUp'), at, dims, ctx('date'))).toBeNull();
    expect(nextCell(k('ArrowUp', { ctrl: true }), at, dims, ctx('date'))).toEqual({ row: 0, col: 1 });
  });
  it('left and right leave the cell only at the edge of the text', () => {
    expect(nextCell(k('ArrowRight'), at, dims, ctx('text', false, false))).toBeNull();
    expect(nextCell(k('ArrowRight'), at, dims, ctx('text', false, true))).toEqual({ row: 1, col: 2 });
    expect(nextCell(k('ArrowLeft'), at, dims, ctx('text', true, false))).toEqual({ row: 1, col: 0 });
    expect(nextCell(k('ArrowRight'), at, dims, ctx('checkbox', false, false))).toEqual({ row: 1, col: 2 });
    expect(nextCell(k('ArrowLeft'), { row: 0, col: 0 }, dims, ctx('text'))).toBeNull();
  });
  it('Enter in a text area is a line break, not a move', () => expect(nextCell(k('Enter'), at, dims, ctx('textarea'))).toBeNull());
});

describe('errors of a grid cell', () => {
  const data = (rows: Record<string, string>[]): RequestData => ({ single: { Material: { MTART: 'FERT', MBRSH: 'F' }, Description: { MAKTX: 'X' } }, multi: { SalesTaxData: rows }, views: ['MVKE_SORG1_TAX'] });
  it('the demo rules point to the row with a 1-based index, and the screen finds the cell of that row (0-based)', () => {
    const msgs = runRules(data([{ ALAND: 'IN', TATYP: 'JOIG' }, { ALAND: '' }]));
    const t = msgs.filter((m) => m.target?.startsWith('SalesTaxData'));
    expect(t.length).toBeGreaterThan(0);
    expect(t.every((m) => m.target?.startsWith('SalesTaxData[2]/'))).toBe(true);
    const idx = indexByField(msgs);
    expect(idx['SalesTaxData.ALAND#1']?.message).toMatch(/enter/i);
    expect(idx['SalesTaxData.ALAND#0']).toBeUndefined();
    expect(parseTarget('SalesTaxData[2]/ALAND')).toEqual({ entity: 'SalesTaxData', field: 'ALAND', row: 1 });
  });
  it('a complete row has no message', () => expect(runRules(data([{ ALAND: 'IN', TATYP: 'JOIG' }])).filter((m) => m.target?.startsWith('SalesTaxData'))).toEqual([]));
});
