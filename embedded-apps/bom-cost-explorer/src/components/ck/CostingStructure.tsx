'use client';
/**
 * Standard cost > Costing structure: CK13N's costing structure, every level (lib/ck/structure.ts). Lower-level estimates are read when the tab is opened
 * (one CkListSet per component with an estimate, one CkItemSet per produced component); nothing is computed by SAP differently from CK13N.
 */
import { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button, Spinner, cx } from '../ui';
import { fmtNum, fmtQty } from '@/lib/format';
import { fetchCk } from '@/lib/ck/service';
import { buildStructure, flatten, type StructNode } from '@/lib/ck/structure';
import type { CkHeaderRow, CkItemRow } from '@/lib/ck/types';

const th = 'px-2.5 py-1.5 text-left text-2xs font-bold uppercase tracking-wide text-muted';
const thN = `${th} text-right`;
const td = 'px-2.5 py-1.5 align-top';
const tdN = `${td} num whitespace-nowrap text-right`;

export interface StructState { status: 'idle' | 'loading' | 'done' | 'error'; nodes?: StructNode[]; total?: Decimal; error?: string; progress?: [number, number] }

/** Builds the structure for the header + its itemization; re-runs when they change. */
export function useCostingStructure(header: CkHeaderRow | null, items: CkItemRow[] | null, run: boolean): StructState {
  const [s, setS] = useState<StructState>({ status: 'idle' });
  useEffect(() => {
    if (!run || !header || !items) return;
    let live = true;
    setS({ status: 'loading', progress: [0, 0] });
    const root = { kadky: header.Kadky ?? '', tvers: header.Tvers, klvar: header.Klvar, bwvar: header.Bwvar };
    const lot = new Decimal(header.Losgr || '1');
    buildStructure(items, root, header.Werks, lot.gt(0) ? lot : new Decimal(1), {
      list: (matnr, werks) => fetchCk('LIST', { matnr, werks }).then((r) => r.rows),
      items: (key) => fetchCk('ITEM', { key }).then((r) => r.rows),
      onProgress: (d, t) => { if (live) setS((p) => (p.status === 'loading' ? { ...p, progress: [d, t] } : p)); },
    }).then((r) => { if (live) setS({ status: 'done', nodes: r.nodes, total: r.total }); })
      .catch((e: Error) => { if (live) setS({ status: 'error', error: e.message }); });
    return () => { live = false; };
  }, [run, header, items]);
  return s;
}

export function CostingStructureTab({ header, state }: { header: CkHeaderRow; state: StructState }) {
  const curr = header.Curr || 'INR';
  const all = useMemo(() => (state.nodes ? flatten(state.nodes) : []), [state.nodes]);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [onlyDiff, setOnlyDiff] = useState(false);
  if (state.status === 'loading') return <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Reading the lower-level estimates from SAP… {state.progress ? `${state.progress[0]} of ${state.progress[1]}` : ''}</p>;
  if (state.status === 'error') return <p className="text-sm text-bad">The costing structure could not be built: {state.error}</p>;
  if (!state.nodes) return <p className="text-sm text-muted">Loading the itemization from SAP…</p>;
  const shown = all.filter((n) => {
    for (let p = n.id.slice(0, n.id.lastIndexOf('/')); p; p = p.slice(0, p.lastIndexOf('/'))) if (closed.has(p)) return false;
    return !onlyDiff || !n.value.minus(n.itemValue).abs().lt('0.005');
  });
  const headTotal = new Decimal(header.TotalLot || '0');
  const gap = state.total!.minus(headTotal);
  const toggle = (id: string) => setClosed((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const parents = all.filter((n) => n.children.length).map((n) => n.id);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">
        As CK13N shows it, down to the last level, per costing lot of {fmtQty(header.Losgr)} {header.Meeht}. A component with an estimate of its own is valued with that estimate
        (same costing date {header.Kadky ?? ''}, variant {header.Klvar}, version {header.Tvers}); a produced component is opened with its own itemization.
        &quot;In the itemization&quot; is what the finished good&apos;s estimate itself stored for the line.
      </p>
      {!gap.abs().lt('0.01') && (
        <p className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs">
          The lines add up to {fmtNum(state.total!.toFixed(2), 2, curr)} {curr}; the estimate total is {fmtNum(headTotal.toFixed(2), 2, curr)} {curr} (difference {fmtNum(gap.toFixed(2), 2, curr)}).
          Some components were costed again after this estimate, so their own estimates differ from what this estimate used. CK13N shows the same difference.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => setClosed(new Set())}>Expand all</Button>
        <Button size="sm" variant="ghost" onClick={() => setClosed(new Set(parents))}>Collapse all</Button>
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> Only lines that differ from the itemization</label>
        <span className="text-xs text-faint">{all.length} lines · {Math.max(...all.map((n) => n.depth))} levels</span>
      </div>
      <div className="max-h-[620px] overflow-auto rounded-xl border border-line">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="sticky top-0 bg-sunken"><tr>
            <th className={th}>Costing structure</th><th className={thN}>Total value</th><th className={thN}>Quantity</th><th className={th}>Resource</th><th className={thN}>In the itemization</th><th className={thN}>Difference</th><th className={th}>Valued with</th>
          </tr></thead>
          <tbody>
            <tr className="border-t border-line bg-line/20 font-bold">
              <td className={td}>{header.Matnr} {header.Maktx}</td><td className={tdN}>{fmtNum(headTotal.toFixed(2), 2, curr)} <span className="text-muted">{curr}</span></td><td className={tdN}>{fmtQty(header.Losgr)} {header.Meeht}</td><td className={td}>{header.Werks}</td><td className={tdN} /><td className={tdN} /><td className={td}>estimate {header.StatusTxt || header.Status}</td>
            </tr>
            {shown.map((n) => {
              const r = n.item; const diff = n.value.minus(n.itemValue); const open = !closed.has(n.id);
              return (
                <tr key={n.id} className={cx('border-t border-line/60', n.children.length > 0 && 'font-semibold')}>
                  <td className={td}>
                    <span className="inline-flex items-start gap-1" style={{ paddingLeft: `${(n.depth - 1) * 18}px` }}>
                      {n.children.length ? <button type="button" aria-label={open ? 'Collapse' : 'Expand'} onClick={() => toggle(n.id)} className="mt-0.5 text-muted hover:text-ink">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button> : <span className="inline-block w-[13px]" />}
                      {r.Typps === 'E' ? <span><span className="font-mono text-xs text-muted">E</span> {r.Lstar} <span className="text-muted">{r.KstarTxt}</span></span> : <span><span className="font-mono text-xs">{n.matnr}</span> {r.ItemTxt}</span>}
                    </span>
                  </td>
                  <td className={tdN}>{fmtNum(n.value.toFixed(2), 2, curr)}</td>
                  <td className={tdN}>{fmtQty(n.qty.toFixed(3))} <span className="text-muted">{r.Uom}</span></td>
                  <td className={cx(td, 'text-xs text-muted')}>{[r.ItemWerks, r.Kostl, r.Lstar].filter(Boolean).join(' ')}</td>
                  <td className={tdN}>{fmtNum(n.itemValue.toFixed(2), 2, curr)}</td>
                  <td className={cx(tdN, diff.abs().lt('0.005') ? 'text-faint' : diff.gt(0) ? 'text-bad' : 'text-good')}>{diff.abs().lt('0.005') ? '–' : `${diff.gt(0) ? '+' : ''}${fmtNum(diff.toFixed(2), 2, curr)}`}</td>
                  <td className={cx(td, 'text-xs')}>{n.basis === 'own' && n.own ? <span title={`Estimate ${n.own.Kalnr}`}>own estimate · {n.own.StatusTxt || n.own.Status} · {fmtNum(n.own.Total, 4, curr)} / unit</span> : <span className="text-muted">itemization</span>}</td>
                </tr>
              );
            })}
            <tr className="border-t border-line bg-line/10 font-bold"><td className={td}>Sum of the lines</td><td className={tdN}>{fmtNum(state.total!.toFixed(2), 2, curr)}</td><td colSpan={5} /></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
