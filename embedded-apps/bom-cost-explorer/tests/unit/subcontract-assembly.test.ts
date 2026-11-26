import { describe, expect, it } from 'vitest';
import { buildTree, grandTotal, isLeafRow, isSubcontractAssembly, leafPrefix, nodeTotals } from '@/lib/cost/tree';
import { leaf, parent } from './helpers';

// Shape of live NWP 400018695 @ UN02 (26.11.2026): 151036318 is a subcontracted PKGN assembly (Haschild X, Sobsl 30) with its own INFOREC cost (the
// subcontractor's charge) and its own components; 250005597 is a WIP parent (Sobsl blank) whose own figure is only the roll-up.
const rows = [
  parent(1, 1, '151036318', '0.81', { Sobsl: '30', Mtart: 'PKGN', SelSource: 'INFOREC' }),
  leaf(2, 2, '151032437', '10.28', '0', '1'),
  leaf(3, 2, '151032082', '3.8', '0', '1'),
  leaf(4, 1, '151035902', '41.3', '0', '1'),
  parent(5, 1, '250005597', '155.49', { Mtart: 'WIP', SelSource: 'CONSUMP' }),
  leaf(6, 2, '100000034', '136', '0', '1'),
];

describe('subcontracted assembly (MARC-SOBSL 30)', () => {
  it('a parent with Sobsl 30 counts its own cost; a WIP parent still does not', () => {
    expect(isLeafRow(rows[0])).toBe(true);
    expect(isSubcontractAssembly(rows[0])).toBe(true);
    expect(isLeafRow(rows[4])).toBe(false);
    expect(isSubcontractAssembly(rows[1])).toBe(false); // a leaf is not an assembly
  });
  it('the header total = assembly charge + its components + the rest; the WIP roll-up figure is left out', () => {
    const t = buildTree(rows);
    expect(grandTotal(leafPrefix(t, (i) => t.rows[i].TotCostInr)).toFixed(2)).toBe('192.19'); // 0.81 + 10.28 + 3.80 + 41.30 + 136
    const totals = nodeTotals(t, leafPrefix(t, (i) => t.rows[i].TotCostInr));
    const asm = t.nodes.findIndex((n) => n.kind === 'line' && t.rows[n.row].Idnrk === '151036318');
    expect(totals[asm].toFixed(2)).toBe('14.89'); // own 0.81 + 10.28 + 3.80
  });
  it('without Sobsl 30 it is excluded as before', () => {
    const t = buildTree(rows.map((r) => ({ ...r, Sobsl: '' })));
    expect(grandTotal(leafPrefix(t, (i) => t.rows[i].TotCostInr)).toFixed(2)).toBe('191.38');
  });
});
