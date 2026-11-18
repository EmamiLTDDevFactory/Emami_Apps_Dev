/**
 * RM / PM / Perfume cost of every tree node (leaf roll-up of TotCostInr, SAP's figure), for the FG rows of the BOM tree and its Excel.
 * Category rules are the app's one place (categories.ts): Perfume = ROH + material group 106, RM = other ROH, PM = PKGN / VERP.
 */
import { costCategory, type CostCategory } from './categories';
import { D, type Decimal } from './decimal';
import { leafPrefix, nodeTotals, type CostTree } from './tree';

export interface CatTotals { rm: Decimal[]; pm: Decimal[]; perf: Decimal[] }

export function categoryTotals(tree: CostTree): CatTotals {
  const by = (c: CostCategory) => nodeTotals(tree, leafPrefix(tree, (i) => (costCategory(tree.rows[i]) === c ? tree.rows[i].TotCostInr : D(0))));
  return { rm: by('RM'), pm: by('PM'), perf: by('PERFUME') };
}

/** Per unit of the finished good = total / explosion quantity. null when the quantity is unknown or not positive. */
export const perUnit = (total: Decimal, explQty: Decimal | null | undefined): Decimal | null => (explQty && explQty.gt(0) ? total.div(explQty) : null);
