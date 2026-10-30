'use client';
/**
 * The main table, virtualised (one row per finished good and plant; hundreds of rows are normal). Rows have variable height
 * because a row can expand into the detail views, so each one is measured. Keyboard: Tab to a row, Enter / Space expands it,
 * Arrow Up / Down move between rows. Sorting is client-side and never refetches.
 */
import { useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronRight, Scale } from 'lucide-react';
import { cx } from '../ui';
import RowDetail from './RowDetail';
import VarCell from './VarCell';
import { fmtNum, fmtQty } from '@/lib/format';
import type { ColKey, SortDir, WacCol } from '@/lib/wac/columns';
import type { WacFilterInput } from '@/lib/wac/filter';
import type { WacRow } from '@/lib/wac/types';
import { dec, flagOf, reconWarn, rowKey, type SelectionTotal } from '@/lib/wac/view';

const inr = (v: string) => (dec(v) === null ? '—' : fmtNum(v, 4, 'INR'));
const ACTUAL: Partial<Record<ColKey, 'rm' | 'pm' | 'perf' | 'mat' | 'conv' | 'landed'>> = { rm: 'rm', pm: 'pm', perf: 'perf', mat: 'mat', conv: 'conv', landed: 'landed' };
const ACT_FIELD = { rm: 'ActRm', pm: 'ActPm', perf: 'ActPerf', mat: 'ActMat', conv: 'ActConv', landed: 'ActLanded' } as const;

function Cell({ col, r, reconPct }: { col: WacCol; r: WacRow; reconPct: number }) {
  switch (col.key) {
    case 'fg':
      return (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate"><span className="font-mono font-bold text-accent">{r.Matnr}</span> <span className="text-muted">{r.Maktx}</span></span>
          {r.Status === 'D' && <span title="Some documents have several PO-cost rows: check the PO utility view" aria-label="Some documents have several PO-cost rows" role="img" className="shrink-0 text-warn"><AlertTriangle size={13} /></span>}
          {reconWarn(r, reconPct) && <span title={`Landed cost does not reconcile with material plus conversion (difference ${fmtNum(r.ActRecon, 4, 'INR')} per unit)`} aria-label={`Reconciliation difference ${r.ActRecon}`} role="img" className="shrink-0 text-warn"><Scale size={13} /></span>}
        </span>
      );
    case 'plant': return <span className="font-mono">{r.Werks}</span>;
    case 'brand': return <>{r.Zbrand || '—'}</>;
    case 'prodha': return <span className="font-mono text-xs">{r.Prodha || '—'}</span>;
    case 'crs': return <span className="truncate text-xs" title={`${r.Zskugrcodecrs} - ${r.Zskugroupcrs}`}>{[r.Zskugrcodecrs, r.Zskugroupcrs].filter(Boolean).join(' - ') || '—'}</span>;
    case 'qty': return <span className="num">{fmtQty(r.Qty)} <span className="text-muted">{r.Uom}</span></span>;
    case 'docs': return <span className="num">{r.Docs} / {r.Batches}</span>;
    default: {
      const a = ACTUAL[col.key];
      if (a) return <span className="num">{inr(r[ACT_FIELD[a]])}</span>;
      if (col.src) return <VarCell value={r[`Varp${col.src}` as 'VarpSel']} flag={flagOf(r, col.src)} />;
      return null;
    }
  }
}

export default function WacTable({ rows, cols, sort, onSort, open, onToggle, run, cmpOn, total, reconPct }: {
  rows: WacRow[]; cols: WacCol[]; sort: { key: ColKey; dir: SortDir }; onSort: (k: ColKey) => void;
  open: ReadonlySet<string>; onToggle: (k: string) => void; run: WacFilterInput; cmpOn: boolean; total: SelectionTotal | null; reconPct: number;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => parent.current, estimateSize: () => 46, overscan: 8, measureElement: (el) => el.getBoundingClientRect().height });
  const grid = `28px ${cols.map((c) => `${c.width}px`).join(' ')}`;
  const width = 28 + cols.reduce((s, c) => s + c.width, 0);

  const focusRow = useCallback((i: number) => {
    if (i < 0 || i >= rows.length) return;
    v.scrollToIndex(i);
    requestAnimationFrame(() => (parent.current?.querySelector(`[data-rowindex="${i}"]`) as HTMLElement | null)?.focus());
  }, [rows.length, v]);

  const key = (e: React.KeyboardEvent, i: number, k: string) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(k); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); focusRow(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusRow(i - 1); }
  };

  return (
    <div ref={parent} className="max-h-[72vh] overflow-auto rounded-2xl border border-line bg-panel shadow-card" role="table" aria-label="Actual cost per finished good and plant" aria-rowcount={rows.length + 1}>
      <div style={{ minWidth: width }}>
        <div role="row" className="sticky top-0 z-10 grid items-center border-b border-line bg-sunken text-2xs font-bold uppercase tracking-wide text-muted" style={{ gridTemplateColumns: grid }}>
          <span role="columnheader" className="px-2"><span className="sr-only">Expand</span></span>
          {cols.map((c) => (
            <button key={c.key} type="button" role="columnheader" aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} onClick={() => onSort(c.key)}
              className={cx('flex items-center gap-1 px-2 py-2 hover:text-ink', c.num ? 'justify-end text-right' : 'text-left', c.group === 'var' && 'text-accent')}>
              {c.label}{sort.key === c.key && (sort.dir === 'asc' ? <ArrowUp size={11} aria-hidden /> : <ArrowDown size={11} aria-hidden />)}
            </button>
          ))}
        </div>
        <div style={{ height: v.getTotalSize(), position: 'relative' }}>
          {v.getVirtualItems().map((vi) => {
            const r = rows[vi.index];
            const k = rowKey(r);
            const isOpen = open.has(k);
            return (
              <div key={r.Rowid} data-index={vi.index} ref={v.measureElement} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)` }} className="border-b border-line/60">
                <div role="row" tabIndex={0} data-rowindex={vi.index} aria-rowindex={vi.index + 2} aria-expanded={isOpen} aria-label={`${r.Matnr} ${r.Maktx}, plant ${r.Werks}. Press Enter to ${isOpen ? 'collapse' : 'expand'}.`}
                  onClick={() => onToggle(k)} onKeyDown={(e) => key(e, vi.index, k)}
                  className="grid cursor-pointer items-center py-2 text-sm hover:bg-accent/5 focus:bg-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50" style={{ gridTemplateColumns: grid }}>
                  <span className="px-2 text-muted" aria-hidden>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                  {cols.map((c) => <div key={c.key} role="cell" className={cx('min-w-0 px-2', c.num && 'text-right')}><Cell col={c} r={r} reconPct={reconPct} /></div>)}
                </div>
                {isOpen && <div className="border-t border-line/60 bg-sunken/30"><RowDetail row={r} run={run} cmpOn={cmpOn} /></div>}
              </div>
            );
          })}
        </div>
        {total && (
          <div role="row" className="sticky bottom-0 z-10 grid items-center border-t-2 border-line bg-sunken py-2 text-sm font-bold" style={{ gridTemplateColumns: grid }}>
            <span />
            {cols.map((c) => (
              <div key={c.key} role="cell" className={cx('min-w-0 px-2', c.num && 'text-right')}>
                {c.key === 'fg' ? <span title="The only figure computed on this page: sum of (unit value x quantity) divided by the sum of quantity">Selection total (weighted by quantity, computed here)</span>
                  : c.key === 'qty' ? <span className="num">{fmtQty(total.qty)} <span className="font-normal text-muted">{total.uom}</span></span>
                  : ACTUAL[c.key] ? <span className="num">{inr(total[ACTUAL[c.key]!])}</span> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
