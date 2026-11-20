import { describe, expect, it } from 'vitest';
import { buildTree, leafPrefix, nodeTotals } from '@/lib/cost/tree';
import { categoryTotals, perUnit } from '@/lib/cost/catTotals';
import { D } from '@/lib/cost/decimal';
import { EMPTY_SIM, simulate } from '@/lib/cost/simulate';
import { bomTreeSheet, TREE_EXPORT } from '@/lib/client/treeExport';
import { TREE_COLUMNS } from '@/components/BomTree';
import { leaf, parent } from './helpers';

// FG1 @1000: RM1 (ROH, 10 x 2 = 20) ; PERF (ROH 106, 5 x 1 = 5) ; PM1 (PKGN, 3 x 2 = 6) ; W (WIP, sub-tree 50) > [ RM2 (ROH, 25 x 2 = 50) ]
const rows = [
  leaf(1, 1, 'RM1', '10', '0', '2', { Mtart: 'ROH', Matkl: '101' }),
  leaf(2, 1, 'PERF', '5', '0', '1', { Mtart: 'ROH', Matkl: '106' }),
  leaf(3, 1, 'PM1', '3', '0', '2', { Mtart: 'PKGN', Matkl: '300' }),
  parent(4, 1, 'W', '50', { Mtart: 'HALB' }),
  leaf(5, 2, 'RM2', '25', '0', '2', { Mtart: 'ROH', Matkl: '101' }),
];
const tree = buildTree(rows);
const sim = simulate(tree.rows, EMPTY_SIM);
const agg = {
  inr: nodeTotals(tree, leafPrefix(tree, (i) => tree.rows[i].TotCostInr)),
  loc: nodeTotals(tree, leafPrefix(tree, (i) => tree.rows[i].TotCostLoc)),
  sim: null,
};
const sheet = (colIds: string[], explQty: string | null = '1') => bomTreeSheet({ tree, sim, simOn: false, agg, colIds, explQty });
const col = (s: ReturnType<typeof sheet>, header: string) => s.cols.find((c) => c.header === header)!;
const at = (label: string) => tree.nodes.findIndex((n) => n.label === label);

describe('Excel = the shown BOM tree columns', () => {
  it('has the structure columns plus exactly the chosen ones, in order', () => {
    const s = sheet(['level', 'totInr']);
    expect(s.cols.map((c) => c.header)).toEqual(['Row', 'Plant', 'FG', 'Structure', 'Description', 'Lvl', 'Total INR']);
  });
  it('one row per tree node (country, plant, FG, components)', () => {
    expect(sheet(['totInr']).count).toBe(tree.nodes.length);
    expect(col(sheet(['totInr']), 'Row').get(0)).toBe('Country');
  });
  it('every tree column has an export definition (so a column on screen can never be missing from the Excel)', () => {
    for (const c of TREE_COLUMNS) expect(TREE_EXPORT[c.id]?.length, c.id).toBeGreaterThan(0);
  });
});

describe('WIP line carries no cost', () => {
  const s = sheet(['qty', 'ratePcInr', 'totPcInr', 'totInr', 'source']);
  it('is typed WIP and every cost column is blank', () => {
    const i = at('W');
    expect(col(s, 'Row').get(i)).toBe('WIP');
    for (const h of ['Rate / pc INR', 'Total / pc INR', 'Total INR', 'Rate source']) expect(col(s, h).get(i), h).toBeNull();
    expect(col(s, 'Prod. qty').get(i)).not.toBeNull(); // quantity is not a cost
  });
  it('its component below keeps the cost, so nothing is lost', () => {
    expect(col(s, 'Total INR').get(at('RM2'))).toBe(50);
    expect(col(s, 'Row').get(at('RM2'))).toBe('Component');
  });
  it('an ordinary leaf keeps its cost', () => {
    expect(col(s, 'Total INR').get(at('RM1'))).toBe(20);
  });
});

describe('RM / PM / Perfume on the FG row', () => {
  it('classifies ROH = RM, ROH 106 = Perfume, PKGN/VERP = PM, leaf rows only', () => {
    const c = categoryTotals(tree);
    const fg = at('FG1');
    expect(c.rm[fg].toString()).toBe('70'); // RM1 20 + RM2 50 (the WIP roll-up 50 is not added again)
    expect(c.perf[fg].toString()).toBe('5');
    expect(c.pm[fg].toString()).toBe('6');
  });
  it('total and per unit (total / explosion quantity); blank per unit without a quantity', () => {
    const s = sheet(['rmTot', 'rmPc', 'pmTot', 'pmPc', 'perfTot', 'perfPc'], '10');
    const fg = at('FG1');
    expect(col(s, 'RM total INR').get(fg)).toBe(70);
    expect(col(s, 'RM / unit INR').get(fg)).toBe(7);
    expect(col(s, 'PM / unit INR').get(fg)).toBe(0.6);
    expect(col(s, 'Perfume / unit INR').get(fg)).toBe(0.5);
    expect(col(s, 'RM total INR').get(at('RM1'))).toBeNull(); // FG rows only
    expect(col(sheet(['rmPc'], null), 'RM / unit INR').get(fg)).toBeNull();
    expect(perUnit(D(5), D(0))).toBeNull();
  });
});
