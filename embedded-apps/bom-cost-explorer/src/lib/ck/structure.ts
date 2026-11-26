/**
 * CK13N "Costing Structure", every level, as SAP shows it (verified on live NWP 26.11.2026 against CK13N for 400016966 @ UN13, 01.11.2026 / Z9P1 / 01).
 *
 * CkItemSet returns the itemization of ONE estimate (one level). CK13N's costing structure differs from it in two ways:
 *  1. A component that has an estimate of its own is valued with THAT estimate - the one with the same costing date (Kadky), costing variant, version
 *     and valuation variant as the parent, whatever its status (KA or FR) - not with the price stored in the parent's itemization. When the component was
 *     re-costed after the parent, the two differ (151029143: 1.45 in the finished good's itemization, 1.46 in its own estimate -> CK13N 1,477.52).
 *  2. A produced component (bulk / WIP / semi-finished) is opened: its own estimate's itemization is shown below it, scaled to the parent quantity, and
 *     the same two rules apply again at that level, down to the last level.
 *
 * Value of a material line = base-unit quantity x own estimate cost per unit. The base-unit quantity is the line quantity when it is already in the base
 * unit, else itemization value / itemization price (the price is per base unit; the quantity may be in another unit, e.g. G on a KG material). Activities and lines
 * without an own estimate keep the itemization value. The structure's total can therefore differ from the estimate's total (CK13N shows the same gap).
 */
import Decimal from 'decimal.js';
import type { CkItemRow, CkListRow } from './types';
import type { CkEstimateKey } from './filter';

const ZERO = new Decimal(0);
const d = (v: string | number | null | undefined): Decimal => { try { const s = String(v ?? '').trim(); return s ? new Decimal(s) : ZERO; } catch { return ZERO; } };
const strip = (m: string) => String(m ?? '').trim().replace(/^0+/, '');
const day = (v: string | null | undefined) => String(v ?? '').slice(0, 10);

/** The estimate a structure is read from: key + the variant fields that pick the same estimate one level down. */
export interface StructRoot { kadky: string; tvers: string; klvar: string; bwvar: string }

export interface StructNode {
  id: string;
  depth: number;
  item: CkItemRow;
  matnr: string;
  /** quantity in the item unit, for the chosen scale (per lot or per piece of the root) */
  qty: Decimal;
  /** quantity in the component's base unit (what its own estimate is per); null when the itemization has no price */
  baseQty: Decimal | null;
  /** value as CK13N's costing structure shows it */
  value: Decimal;
  /** value in the parent's itemization (what CkItemSet says) */
  itemValue: Decimal;
  /** the component's own estimate used for the value (same costing date, variant, version) */
  own: CkListRow | null;
  /** own = valued with the own estimate; item = itemization value (activity, no own estimate, or no price to scale) */
  basis: 'own' | 'item';
  children: StructNode[];
}

export interface StructDeps {
  /** every estimate of a material in a plant (CkListSet) */
  list: (matnr: string, werks: string) => Promise<CkListRow[]>;
  /** the itemization of one estimate (CkItemSet by key) */
  items: (key: CkEstimateKey) => Promise<CkItemRow[]>;
  onProgress?: (done: number, total: number) => void;
}

/** Material types never opened (bought, their estimate is only their own price line). */
export const LEAF_MTART = new Set(['ROH', 'VERP', 'HAWA']);
const MAX_DEPTH = 8;
const CONCURRENCY = 6;

/** The estimate of the same costing run: same costing date, variant, version and valuation variant. */
export const sameRun = (r: CkListRow, root: StructRoot) =>
  day(r.Kadky) === day(root.kadky) && r.Tvers === root.tvers && r.Bwvar === root.bwvar && (!root.klvar || !r.Klvar || r.Klvar === root.klvar);

function limiter(n: number) {
  let active = 0; const queue: (() => void)[] = [];
  const next = () => { if (active < n && queue.length) { active++; queue.shift()!(); } };
  return <T,>(f: () => Promise<T>): Promise<T> => new Promise<T>((res, rej) => { queue.push(() => f().then(res, rej).finally(() => { active--; next(); })); next(); });
}

/**
 * Builds the full structure below one estimate. `items` = its itemization (CkItemSet), `scale` = how many units of the root to show (the lot size like
 * CK13N, or 1 for per piece), `werks` = plant of the root. Lower-level reads are cached per material and plant and run 6 at a time.
 */
export async function buildStructure(items: CkItemRow[], root: StructRoot, werks: string, scale: Decimal, deps: StructDeps): Promise<{ nodes: StructNode[]; total: Decimal; itemTotal: Decimal }> {
  const run = limiter(CONCURRENCY);
  const lists = new Map<string, Promise<CkListRow[]>>();
  let done = 0; let total = 0;
  const tick = () => deps.onProgress?.(done, total);
  const listOf = (matnr: string, w: string) => {
    const k = `${matnr}|${w}`;
    let p = lists.get(k);
    if (!p) { total++; tick(); p = run(() => deps.list(matnr, w)).catch(() => [] as CkListRow[]).finally(() => { done++; tick(); }); lists.set(k, p); }
    return p;
  };
  const itemsOf = (key: CkEstimateKey) => { total++; tick(); return run(() => deps.items(key)).catch(() => [] as CkItemRow[]).finally(() => { done++; tick(); }); };

  async function level(rows: CkItemRow[], f: Decimal, w: string, depth: number, path: string): Promise<StructNode[]> {
    return Promise.all(rows.map(async (r, i): Promise<StructNode> => {
      const id = `${path}/${r.Posnr || i}`;
      const qty = d(r.QtyUnit).times(f);
      const itemValue = d(r.ValueUnit).times(f);
      const price = d(r.Price); const per = d(r.PriceUnit).gt(0) ? d(r.PriceUnit) : new Decimal(1);
      const unitPrice = price.gt(0) ? price.div(per) : null;
      // base-unit quantity: the line's own quantity when it is already in the base unit (qty x price gives the value), else value / price (e.g. G on a KG
      // material). Using the quantity avoids the rounding of SAP's 2-decimal values on small lines (151001693: 0.023 KG x 98.08 = 2.26, as CK13N).
      const inBase = unitPrice && !qty.isZero() && qty.times(unitPrice).minus(itemValue).abs().lte(Decimal.max(new Decimal('0.02'), itemValue.abs().times('0.02')));
      const baseQty = unitPrice ? (inBase ? qty : itemValue.div(unitPrice)) : null;
      const matnr = strip(r.Idnrk);
      const node: StructNode = { id, depth, item: r, matnr, qty, baseQty, value: itemValue, itemValue, own: null, basis: 'item', children: [] };
      if (r.Typps === 'E' || !matnr || !r.HasEst || depth >= MAX_DEPTH) return node;
      const own = (await listOf(matnr, r.ItemWerks || w)).find((x) => sameRun(x, root)) ?? null;
      if (!own) return node;
      node.own = own;
      const ownUnit = d(own.Total);
      if (baseQty && ownUnit.gt(0)) { node.value = baseQty.times(ownUnit); node.basis = 'own'; }
      if (LEAF_MTART.has(String(r.Mtart).toUpperCase()) || !baseQty) return node;
      const key: CkEstimateKey = { kalnr: own.Kalnr, kadky: day(own.Kadky), tvers: own.Tvers, bwvar: own.Bwvar, kkzma: own.Kkzma || undefined };
      const sub = (await itemsOf(key)).filter((c) => !(strip(c.Idnrk) === matnr && c.Typps !== 'E')); // a bought part's estimate is only its own price line
      if (sub.length) node.children = await level(sub, baseQty, r.ItemWerks || w, depth + 1, id);
      return node;
    }));
  }
  const nodes = await level(items, scale, werks, 1, '');
  return { nodes, total: nodes.reduce((t, n) => t.plus(n.value), ZERO), itemTotal: nodes.reduce((t, n) => t.plus(n.itemValue), ZERO) };
}

/** Depth-first list of the nodes (for tables and exports). */
export function flatten(nodes: StructNode[]): StructNode[] {
  const out: StructNode[] = [];
  const walk = (ns: StructNode[]) => { for (const n of ns) { out.push(n); walk(n.children); } };
  walk(nodes);
  return out;
}

/** Lowest level of the structure: the lines a cost is made of (opened lines are replaced by what is below them). Activities of every level included. */
export function lastLevel(nodes: StructNode[]): StructNode[] {
  const out: StructNode[] = [];
  const walk = (ns: StructNode[]) => { for (const n of ns) { if (n.children.length) walk(n.children); else out.push(n); } };
  walk(nodes);
  return out;
}
