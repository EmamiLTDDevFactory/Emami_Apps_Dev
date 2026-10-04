import type { CostLine } from '../sap/fields';
import { D, ZERO, type Decimal } from './decimal';

export type NodeKind = 'country' | 'plant' | 'header' | 'line';

/**
 * Flat pre-order tree. Every node covers a CONTIGUOUS range [start, end) of `rows` (rows are
 * grouped country > plant > header and kept depth-first inside a header), so the leaf roll-up of
 * any node is one prefix-sum subtraction - cheap enough to recompute on every simulation change
 * for 10,000+ rows.
 */
export interface TreeNode {
  id: string;
  kind: NodeKind;
  depth: number;
  label: string;
  sub: string;
  parent: number; // node index, -1 for roots
  next: number; // index of the first node after this subtree (pre-order skip pointer)
  start: number; // row range covered (lines: [rowIndex, rowIndex+1) for leaves, subtree for parents)
  end: number;
  row: number; // row index for 'line' nodes, -1 otherwise
  hasChildren: boolean;
}

export interface CostTree {
  rows: CostLine[];
  nodes: TreeNode[];
  isLeaf: boolean[]; // per row: HasChild blank
}

export const rowKey = (r: Pick<CostLine, 'Hwerks' | 'Werks' | 'Headmat' | 'Seqnr'>) => `${r.Hwerks}|${r.Werks}|${r.Headmat}|${r.Seqnr}`;
export const isLeafRow = (r: Pick<CostLine, 'HasChild'>) => !r.HasChild || r.HasChild.trim() === '';

/** Rows arrive depth-first. Group them country > plant > header without disturbing the order
 * inside a header (stable sort, Seqnr as the tiebreaker). */
export function groupRows(rows: CostLine[]): CostLine[] {
  const firstSeen = new Map<string, number>();
  rows.forEach((r, i) => {
    for (const k of [r.Land1, `${r.Land1}|${r.Hwerks}`, `${r.Land1}|${r.Hwerks}|${r.Headmat}`]) if (!firstSeen.has(k)) firstSeen.set(k, i);
  });
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const ka = [firstSeen.get(a.r.Land1)!, firstSeen.get(`${a.r.Land1}|${a.r.Hwerks}`)!, firstSeen.get(`${a.r.Land1}|${a.r.Hwerks}|${a.r.Headmat}`)!];
      const kb = [firstSeen.get(b.r.Land1)!, firstSeen.get(`${b.r.Land1}|${b.r.Hwerks}`)!, firstSeen.get(`${b.r.Land1}|${b.r.Hwerks}|${b.r.Headmat}`)!];
      return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2] || a.r.Seqnr - b.r.Seqnr || a.i - b.i;
    })
    .map((x) => x.r);
}

/** Builds the tree once per result. The parent of a component is the last row seen at Level-1
 * within the same header (Level-1 = 0 means the header itself). */
export function buildTree(input: CostLine[], plantNames: Record<string, string> = {}): CostTree {
  const rows = groupRows(input);
  const nodes: TreeNode[] = [];
  const isLeaf = rows.map(isLeafRow);
  const open: number[] = []; // stack of node indexes whose subtree is still open
  const close = (toDepth: number, rowEnd: number) => {
    while (open.length && nodes[open[open.length - 1]].depth >= toDepth) {
      const n = nodes[open.pop()!];
      n.next = nodes.length;
      n.end = rowEnd;
    }
  };
  const push = (n: Omit<TreeNode, 'next' | 'end' | 'parent' | 'hasChildren'>, rowEnd: number) => {
    close(n.depth, rowEnd);
    const parent = open.length ? open[open.length - 1] : -1;
    if (parent >= 0) nodes[parent].hasChildren = true;
    nodes.push({ ...n, parent, next: -1, end: n.start, hasChildren: false });
    open.push(nodes.length - 1);
  };

  let country = '';
  let plant = '';
  let header = '';
  rows.forEach((r, i) => {
    if (r.Land1 !== country) {
      country = r.Land1;
      plant = header = '';
      push({ id: `c:${r.Land1}`, kind: 'country', depth: 0, label: r.Landx || r.Land1, sub: r.Land1, start: i, row: -1 }, i);
    }
    if (r.Hwerks !== plant) {
      plant = r.Hwerks;
      header = '';
      push({ id: `p:${r.Land1}|${r.Hwerks}`, kind: 'plant', depth: 1, label: r.Hwerks, sub: plantNames[r.Hwerks] ?? '', start: i, row: -1 }, i);
    }
    if (r.Headmat !== header) {
      header = r.Headmat;
      push({ id: `h:${r.Hwerks}|${r.Werks}|${r.Headmat}`, kind: 'header', depth: 2, label: r.Headmat, sub: r.Headtxt, start: i, row: -1 }, i);
    }
    // Level 1 sits directly under the header (depth 3); deeper levels nest under the last row
    // one level up. A level jump (missing parent) is attached to the nearest open ancestor.
    const lvl = Math.max(1, r.Level || 1);
    const depth = 2 + lvl;
    push({ id: `l:${rowKey(r)}`, kind: 'line', depth, label: r.Idnrk, sub: r.Maktx, start: i, row: i }, i);
  });
  close(-1, rows.length);
  // A line's own range: for parents it spans its subtree; leaves cover just themselves.
  for (const n of nodes) if (n.kind === 'line' && !n.hasChildren) n.end = n.start + 1;
  return { rows, nodes, isLeaf };
}

/** Indexes of the nodes to render, honouring collapsed nodes (pre-order skip). */
export function visibleNodes(tree: CostTree, expanded: ReadonlySet<string>): number[] {
  const out: number[] = [];
  const { nodes } = tree;
  let i = 0;
  while (i < nodes.length) {
    const n = nodes[i];
    out.push(i);
    i = n.hasChildren && !expanded.has(n.id) ? n.next : i + 1;
  }
  return out;
}

export function allExpandableIds(tree: CostTree, maxDepth = Infinity): string[] {
  return tree.nodes.filter((n) => n.hasChildren && n.depth <= maxDepth).map((n) => n.id);
}

/** Prefix sums of a per-row value counting LEAF rows only (parents carry SAP's own roll-up of
 * their subtree, so adding them would double count). */
export function leafPrefix(tree: CostTree, value: (row: number) => Decimal | string): Decimal[] {
  const p: Decimal[] = new Array(tree.rows.length + 1);
  p[0] = ZERO;
  for (let i = 0; i < tree.rows.length; i++) p[i + 1] = tree.isLeaf[i] ? p[i].plus(D(value(i))) : p[i];
  return p;
}

export const rangeSum = (prefix: Decimal[], start: number, end: number) => prefix[end].minus(prefix[start]);

/** Leaf roll-up for every node. */
export function nodeTotals(tree: CostTree, prefix: Decimal[]): Decimal[] {
  return tree.nodes.map((n) => rangeSum(prefix, n.start, n.end));
}

export const grandTotal = (prefix: Decimal[]) => prefix[prefix.length - 1];
