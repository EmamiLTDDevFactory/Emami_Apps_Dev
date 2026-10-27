'use client';
import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Pivot } from '@/lib/cost/pivot';
import { fmtNum, fmtQty, fmtRate } from '@/lib/format';
import { cx, inputBase, inputCls, SourceBadge } from './ui';

const SUB = ['Qty', 'Rate/pc', 'Frt/pc', 'Cost INR', 'Source'] as const;
const W = { Qty: 90, 'Rate/pc': 100, 'Frt/pc': 90, 'Cost INR': 120, Source: 118 } as const;
const ROW_H = 30;

/** Mode C: one column group per plant, all INR. Cheapest plant's cost is highlighted. */
export default function ComparisonView({ pivot, plantNames }: { pivot: Pivot; plantNames: Record<string, string> }) {
  const [filter, setFilter] = useState('');
  const [onlyDiff, setOnlyDiff] = useState(false);
  const rows = useMemo(() => {
    const t = filter.trim().toLowerCase();
    return pivot.rows.filter((r) => {
      if (r.kind === 'total') return true;
      if (onlyDiff && !r.diff?.gt(0)) return false;
      return !t || r.comp.toLowerCase().includes(t) || r.compText.toLowerCase().includes(t) || r.head.toLowerCase().includes(t);
    });
  }, [pivot, filter, onlyDiff]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_H, overscan: 20 });
  const plantW = SUB.reduce((a, s) => a + W[s], 0);
  const template = `300px ${pivot.plants.map(() => SUB.map((s) => `${W[s]}px`).join(' ')).join(' ')} 120px 120px 120px 110px`;
  const width = 300 + plantW * pivot.plants.length + 470;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-1.5 no-print">
        <input className={cx(inputBase, 'h-7 w-60 text-xs')} placeholder="Filter components…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter components" />
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> Only rows with a difference
        </label>
        <span className="ml-auto text-2xs text-faint">All amounts in INR (the only currency comparable across plants). Min/max need at least two costed plants.</span>
      </div>
      <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-auto" role="table" aria-label="Plant comparison">
        <div style={{ width, minWidth: '100%' }}>
          <div className="sticky top-0 z-20 bg-panel" role="rowgroup">
            <div className="grid border-b border-line text-xs font-semibold" style={{ gridTemplateColumns: `300px ${pivot.plants.map(() => `${plantW}px`).join(' ')} 470px` }} role="row">
              <div className="sticky left-0 bg-panel px-3 py-1.5" aria-hidden="true" />
              {pivot.plants.map((p) => (
                <div key={p} className="border-l border-line px-2 py-1.5 text-center" role="columnheader">
                  <span className="font-mono">{p}</span> <span className="font-normal text-muted">{plantNames[p]}</span>
                </div>
              ))}
              <div className="border-l border-line px-2 py-1.5 text-center" role="columnheader">Comparison (INR)</div>
            </div>
            <div className="grid border-b border-line text-2xs font-semibold uppercase tracking-wide text-muted" style={{ gridTemplateColumns: template }} role="row">
              <div className="sticky left-0 bg-panel px-3 py-1 text-left" role="columnheader">Header / component</div>
              {pivot.plants.map((p) => SUB.map((s, i) => <div key={p + s} className={cx('px-2 py-1 text-right', i === 0 && 'border-l border-line', s === 'Source' && 'text-left')} role="columnheader">{s}</div>))}
              <div className="border-l border-line px-2 py-1 text-right">Min</div>
              <div className="px-2 py-1 text-right">Max</div>
              <div className="px-2 py-1 text-right">Difference</div>
              <div className="px-2 py-1">Cheapest</div>
            </div>
          </div>
          <div style={{ height: v.getTotalSize(), position: 'relative' }} role="rowgroup">
            {v.getVirtualItems().map((vi) => {
              const r = rows[vi.index];
              const total = r.kind === 'total';
              return (
                <div key={vi.key} role="row" className={cx('absolute left-0 grid w-full items-center border-b border-line/60 text-[13px]', total && 'bg-sunken font-semibold')} style={{ top: vi.start, height: ROW_H, gridTemplateColumns: template }}>
                  <div className={cx('sticky left-0 z-10 flex min-w-0 items-center gap-2 px-3', total ? 'bg-sunken' : 'bg-panel')} role="cell">
                    {total ? (
                      <>
                        <span className="font-mono text-xs">{r.head}</span>
                        <span className="truncate text-xs">{r.headText} — TOTAL</span>
                      </>
                    ) : (
                      <>
                        <span className="pl-4 font-mono text-xs">{r.comp}</span>
                        <span className="truncate text-xs text-muted">{r.compText}</span>
                      </>
                    )}
                  </div>
                  {pivot.plants.map((p) => {
                    const c = r.cells[p];
                    const cheapest = r.cheapest === p;
                    return SUB.map((s, i) => (
                      <div key={p + s} role="cell" className={cx('num truncate px-2 text-right', i === 0 && 'border-l border-line/60', s === 'Source' && 'text-left', s === 'Cost INR' && cheapest && 'bg-good/15 font-semibold text-good')} title={s === 'Cost INR' && cheapest ? 'Cheapest plant' : undefined}>
                        {!c ? (s === 'Cost INR' ? <span className="text-faint">—</span> : null)
                          : s === 'Qty' ? (total ? '' : `${fmtQty(c.qty)}`)
                          : s === 'Rate/pc' ? (total ? '' : c.hasRate ? fmtRate(c.ratePc) : <span className="text-2xs text-bad">NO RATE</span>)
                          : s === 'Frt/pc' ? (total ? '' : fmtRate(c.frtPc))
                          : s === 'Cost INR' ? fmtNum(c.cost, 2)
                          : total ? '' : <SourceBadge source={c.source === 'MIXED' ? 'MIXED' : c.source} />}
                      </div>
                    ));
                  })}
                  <div role="cell" className="num border-l border-line/60 px-2 text-right">{r.min ? fmtNum(r.min, 2) : '—'}</div>
                  <div role="cell" className="num px-2 text-right">{r.max ? fmtNum(r.max, 2) : '—'}</div>
                  <div role="cell" className={cx('num px-2 text-right', r.diff?.gt(0) && 'text-warn')}>{r.diff ? fmtNum(r.diff, 2) : '—'}</div>
                  <div role="cell" className="px-2 font-mono text-xs">{r.cheapest ?? '—'}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
