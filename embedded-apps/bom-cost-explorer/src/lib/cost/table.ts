import { D, ZERO, type Decimal } from '../cost/decimal';
import { currencyOf, type ColDef } from '../views';
import type { PageRequest } from '../query/schema';

export interface TableTotals {
  /** column key -> currency ('' = unit-less) -> sum (decimal string) */
  [col: string]: Record<string, string>;
}

/** Search + per-column filters + sort + totals + page over the full cached result. */
export function queryTable<T extends Record<string, unknown>>(rows: T[], cols: ColDef[], page: PageRequest) {
  const term = page.search.trim().toLowerCase();
  const strCols = cols.filter((c) => c.kind === 's').map((c) => c.key);
  const filters = Object.entries(page.filters).filter(([k, v]) => v && cols.some((c) => c.key === k));
  let out = rows.filter((r) => {
    if (term && !strCols.some((k) => String(r[k] ?? '').toLowerCase().includes(term))) return false;
    for (const [k, v] of filters) {
      const want = v.toLowerCase();
      const have = String(r[k] ?? '').toLowerCase();
      if (want.startsWith('=') ? have !== want.slice(1) : !have.includes(want)) return false;
    }
    return true;
  });
  const col = cols.find((c) => c.key === page.sort);
  if (col) {
    const dir = page.dir === 'desc' ? -1 : 1;
    const cmp =
      col.kind === 'd'
        ? (a: T, b: T) => D(a[col.key] as string).cmp(D(b[col.key] as string))
        : col.kind === 'i'
          ? (a: T, b: T) => Number(a[col.key]) - Number(b[col.key])
          : (a: T, b: T) => String(a[col.key] ?? '').localeCompare(String(b[col.key] ?? ''), 'en', { numeric: true });
    out = [...out].sort((a, b) => cmp(a, b) * dir);
  }
  const totals: TableTotals = {};
  for (const c of cols.filter((x) => x.sum)) {
    const acc = new Map<string, Decimal>();
    for (const r of out) {
      const cur = currencyOf(c, r) ?? '';
      acc.set(cur, (acc.get(cur) ?? ZERO).plus(D(r[c.key] as string)));
    }
    totals[c.key] = Object.fromEntries(Array.from(acc.entries()).map(([k, v]) => [k, v.toFixed()]));
  }
  const rowsOut = page.all ? out : out.slice(page.skip, page.skip + page.top);
  return { rows: rowsOut, total: out.length, totals };
}
