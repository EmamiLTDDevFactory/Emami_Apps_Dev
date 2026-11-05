'use client';
/** Summary table of a budget run: sortable, searchable, paged client side (the rows are in memory; sorting never calls SAP). Click a row for its split. */
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Pill, cx } from '../ui';
import { fmtDate, fmtNum } from '@/lib/format';
import { D } from '@/lib/cost/decimal';
import { issuesOf, lastVariancePct, rowKey, sortRows, variancePct, varTone, type Col } from '@/lib/budget/view';
import type { BudgetSummaryRow } from '@/lib/budget/types';

export const PAGE = 100;
const VAR_KEY = '_var', LAST_KEY = '_lastvar';

const toneCls = { good: 'text-good', warn: 'text-warn', bad: 'text-bad font-bold' } as const;
function Pct({ v }: { v: ReturnType<typeof variancePct> }) {
  if (!v) return <span className="text-faint">—</span>;
  const t = varTone(v);
  return <span className={cx('num', t && toneCls[t])}>{v.gte(0) ? '+' : '−'}{fmtNum(v.abs(), 1, 'X')}%</span>;
}

export default function BudgetTable({ rows, cols, onOpen, selected }: { rows: BudgetSummaryRow[]; cols: Col<BudgetSummaryRow>[]; onOpen: (r: BudgetSummaryRow) => void; selected?: string | null }) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [page, setPage] = useState(0);
  const showVar = cols.some((c) => c.key === 'ACostPerpc1'), showLast = cols.some((c) => c.key === 'LastRate');
  const sorted = useMemo(() => {
    if (!sort) return rows;
    if (sort.key === VAR_KEY || sort.key === LAST_KEY) {
      const f = sort.key === VAR_KEY ? variancePct : lastVariancePct, m = sort.dir === 'asc' ? 1 : -1;
      return [...rows].sort((a, b) => { const x = f(a), y = f(b); return x === null ? 1 : y === null ? -1 : x.comparedTo(y) * m; });
    }
    const c = cols.find((x) => x.key === sort.key);
    return c ? sortRows(rows, c.key, c.kind, sort.dir) : rows;
  }, [rows, sort, cols]);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const slice = sorted.slice(cur * PAGE, cur * PAGE + PAGE);
  const head = (key: string, label: string, title?: string, sticky = false) => (
    <th key={key} scope="col" title={title} aria-sort={sort?.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cx('sticky top-0 z-10 whitespace-nowrap border-b border-line bg-sunken px-2.5 py-2 text-left text-2xs font-extrabold uppercase tracking-wide text-muted', sticky && 'left-0 z-20')}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-ink" onClick={() => setSort(sort?.key === key ? (sort.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' })}>
        {label}{sort?.key === key && (sort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </button>
    </th>
  );
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="scroll-thin max-h-[62vh] overflow-auto rounded-2xl border border-line bg-panel shadow-card">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              {cols.map((c) => head(c.key, c.label, undefined, !!c.sticky))}
              {showVar && head(VAR_KEY, 'Act vs budget %', 'Actual vs budget material cost per piece. Computed here from the two SAP figures.')}
              {showLast && head(LAST_KEY, 'Info rate vs budget % (info only)', 'Info-record rate vs budget material cost per piece. Information only: the budget is priced from zcomponent / zcomponent_n. Computed here from the two SAP figures.')}
              <th scope="col" className="sticky top-0 z-10 border-b border-line bg-sunken px-2.5 py-2 text-left text-2xs font-extrabold uppercase text-muted">Checklist</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => {
              const k = rowKey(r), issues = issuesOf(r);
              return (
                <tr key={k} tabIndex={0} onClick={() => onOpen(r)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(r); }} aria-selected={selected === k}
                  className={cx('cursor-pointer odd:bg-panel even:bg-sunken/40 hover:bg-accent/10 focus:bg-accent/10 focus:outline-none', selected === k && 'bg-accent/15')}>
                  {cols.map((c) => {
                    const v = (r as unknown as Record<string, unknown>)[c.key];
                    return (
                      <td key={c.key} className={cx('whitespace-nowrap border-b border-line/60 px-2.5 py-1.5', c.kind === 'd' && 'text-right', c.sticky && 'sticky left-0 z-[1] bg-inherit font-mono text-xs font-bold text-accent')} style={c.width ? { minWidth: c.width } : undefined}>
                        {c.kind === 'd' ? <span className="num">{D(v as string).isZero() ? <span className="text-faint">0</span> : fmtNum(v as string, c.dp ?? 4, 'X')}</span>
                          : c.kind === 't' ? fmtDate(v as string | null) : c.kind === 'f' ? (v ? <Pill tone="warn">X</Pill> : '') : String(v ?? '')}
                      </td>
                    );
                  })}
                  {showVar && <td className="whitespace-nowrap border-b border-line/60 px-2.5 py-1.5 text-right"><Pct v={variancePct(r)} /></td>}
                  {showLast && <td className="whitespace-nowrap border-b border-line/60 px-2.5 py-1.5 text-right"><Pct v={lastVariancePct(r)} /></td>}
                  <td className="border-b border-line/60 px-2.5 py-1.5">{issues.length ? <Pill tone="warn" title={issues.join('\n')}>{issues.length} issue{issues.length > 1 ? 's' : ''}</Pill> : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{sorted.length ? `${cur * PAGE + 1}–${Math.min(sorted.length, cur * PAGE + PAGE)} of ${sorted.length}` : 'No rows'}</span>
        <span className="flex items-center gap-1">
          <button type="button" disabled={cur === 0} onClick={() => setPage(cur - 1)} className="rounded-lg border border-line px-2.5 py-1 font-semibold disabled:opacity-40">Previous</button>
          <span className="px-2">Page {cur + 1} / {pages}</span>
          <button type="button" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} className="rounded-lg border border-line px-2.5 py-1 font-semibold disabled:opacity-40">Next</button>
        </span>
      </div>
    </div>
  );
}
