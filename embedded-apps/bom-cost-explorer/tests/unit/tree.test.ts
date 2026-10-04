import { describe, expect, it } from 'vitest';
import { buildTree, grandTotal, leafPrefix, nodeTotals, visibleNodes, allExpandableIds } from '@/lib/cost/tree';
import { leaf, parent } from './helpers';

// FG1 @1000:  A (leaf 10) ; B (parent 30) > [B1 (leaf 20) ; B2 (parent 10) > [B21 (leaf 10)]] ; C (leaf 5)
const rows1000 = [
  leaf(1, 1, 'A', '10', '0', '1'),
  parent(2, 1, 'B', '30'),
  leaf(3, 2, 'B1', '20', '0', '1'),
  parent(4, 2, 'B2', '10'),
  leaf(5, 3, 'B21', '10', '0', '1'),
  leaf(6, 1, 'C', '4', '1', '1'),
];
const rowsBD = [leaf(1, 1, 'A', '7', '0', '1', { Land1: 'BD', Landx: 'Bangladesh', Hwerks: 'BD10', Werks: 'BD10', LocCurr: 'BDT' })];

describe('buildTree', () => {
  const t = buildTree([...rowsBD, ...rows1000]);
  it('groups country > plant > header and keeps depth-first order', () => {
    const kinds = t.nodes.map((n) => `${n.kind}:${n.label}`);
    expect(kinds.slice(0, 4)).toEqual(['country:Bangladesh', 'plant:BD10', 'header:FG1', 'line:A']);
    expect(kinds).toContain('country:India');
  });
  it('attaches a component to the last row one level up', () => {
    const b21 = t.nodes.find((n) => n.label === 'B21')!;
    expect(t.nodes[b21.parent].label).toBe('B2');
    expect(t.nodes[t.nodes[b21.parent].parent].label).toBe('B');
    const c = t.nodes.find((n) => n.label === 'C')!;
    expect(t.nodes[c.parent].kind).toBe('header');
  });
  it('gives every node a contiguous row range and a skip pointer', () => {
    const b = t.nodes.find((n) => n.label === 'B')!;
    expect(t.rows.slice(b.start, b.end).map((r) => r.Idnrk)).toEqual(['B', 'B1', 'B2', 'B21']);
    expect(t.nodes[b.next].label).toBe('C');
  });
  it('hides collapsed subtrees', () => {
    expect(visibleNodes(t, new Set()).length).toBe(2); // two countries
    expect(visibleNodes(t, new Set(allExpandableIds(t))).length).toBe(t.nodes.length);
  });
});

describe('leaf roll-ups', () => {
  const t = buildTree([...rows1000, ...rowsBD]);
  const prefix = leafPrefix(t, (i) => t.rows[i].TotCostInr);
  const tot = nodeTotals(t, prefix);
  it('sums leaf rows only, never parent rows', () => {
    // leaves: 10 + 20 + 10 + 5 = 45 (parents 30 and 10 are NOT added)
    const h = t.nodes.findIndex((n) => n.kind === 'header' && t.rows[n.start].Hwerks === '1000');
    expect(tot[h].toFixed(2)).toBe('45.00');
    const b = t.nodes.findIndex((n) => n.label === 'B');
    expect(tot[b].toFixed(2)).toBe('30.00');
    expect(grandTotal(prefix).toFixed(2)).toBe('52.00');
  });
  it('adds money exactly (no float drift)', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => leaf(i + 1, 1, `X${i}`, '0.1', '0', '1', { TotCostInr: '0.1' }));
    const tt = buildTree(rows);
    expect(grandTotal(leafPrefix(tt, (i) => tt.rows[i].TotCostInr)).toFixed()).toBe('100');
  });
  it('builds a 12k-row tree quickly', () => {
    const rows = Array.from({ length: 12000 }, (_, i) => leaf(i + 1, (i % 4) + 1, `X${i}`, '1.5', '0.1', '2', { HasChild: i % 4 === 3 ? '' : 'X', Headmat: `FG${Math.floor(i / 400)}` }));
    const t0 = performance.now();
    const tt = buildTree(rows);
    nodeTotals(tt, leafPrefix(tt, (i) => tt.rows[i].TotCostInr));
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});
