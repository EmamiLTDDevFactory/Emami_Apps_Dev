'use client';
/**
 * Standard cost > Costing structure: the released CK13N estimate, every level (lib/ck/structure.ts). Each line carries the value stored in the estimate it
 * belongs to (the finished good's released itemization at level 1, the opened bulk's own estimate below it), so level 1 adds up to the released total.
 * The components' own estimates of the same costing date are read too: when one was costed again AFTER the release (e.g. status KA, costed 24.11 for a
 * 01.11 release) its newer value is shown only as information ("Costed again after release"), never in the released figures.
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

export interface StructState { status: 'idle' | 'loading' | 'done' | 'error'; nodes?: StructNode[]; total?: Decimal; itemTotal?: Decimal; error?: string; progress?: [number, number] }

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
    }).then((r) => { if (live) setS({ status: 'done', nodes: r.nodes, total: r.total, itemTotal: r.itemTotal }); })
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
    return !onlyDiff || (n.basis === 'own' && !n.value.minus(n.itemValue).abs().lt('0.005'));
  });
  const headTotal = new Decimal(header.TotalLot || '0');
  const released = state.itemTotal!;
  const gap = released.minus(headTotal);
  const later = state.total!.minus(released);
  const changed = all.filter((n) => n.basis === 'own' && !n.value.minus(n.itemValue).abs().lt('0.005'));
  const toggle = (id: string) => setClosed((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const parents = all.filter((n) => n.children.length).map((n) => n.id);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">
        The released estimate {header.StatusTxt || header.Status} of {header.Kadky ?? ''} (variant {header.Klvar}, version {header.Tvers}), down to the last level, per costing lot of {fmtQty(header.Losgr)} {header.Meeht}.
        Every value is the one stored in the estimate the line belongs to, so the first level adds up to the released total. A produced component (bulk / WIP) is opened with its own estimate of the same costing date.
      </p>
      {!gap.abs().lt('0.05') && <p className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs">The first-level lines add up to {fmtNum(released.toFixed(2), 2, curr)} {curr}, the released total is {fmtNum(headTotal.toFixed(2), 2, curr)} {curr}: SAP sent the item values rounded.</p>}
      {changed.length > 0 && (
        <p className="rounded-xl border border-line bg-sunken px-3 py-2 text-xs text-muted">
          <b className="text-ink">{changed.length} component(s) were costed again after this release</b> (their own estimate of the same costing date has a newer, not-released value, status &quot;Costed Without Errors&quot;).
          The released figures do not change; the newer value is shown in &quot;Costed again after release&quot; only for information ({later.gt(0) ? '+' : ''}{fmtNum(later.toFixed(2), 2, curr)} {curr} on the lot if they were used). Tick the box to list only them.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => setClosed(new Set())}>Expand all</Button>
        <Button size="sm" variant="ghost" onClick={() => setClosed(new Set(parents))}>Collapse all</Button>
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> Only components costed again after release</label>
        <span className="text-xs text-faint">{all.length} lines · {Math.max(...all.map((n) => n.depth))} levels</span>
      </div>
      <div className="max-h-[620px] overflow-auto rounded-xl border border-line">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="sticky top-0 bg-sunken"><tr>
            <th className={th}>Costing structure</th><th className={thN}>Total value (released)</th><th className={thN}>Quantity</th><th className={th}>Resource</th><th className={thN}>Price / unit</th><th className={thN}>Costed again after release</th><th className={thN}>Change</th><th className={th}>Own estimate</th>
          </tr></thead>
          <tbody>
            <tr className="border-t border-line bg-line/20 font-bold">
              <td className={td}>{header.Matnr} {header.Maktx}</td><td className={tdN}>{fmtNum(headTotal.toFixed(2), 2, curr)} <span className="text-muted">{curr}</span></td><td className={tdN}>{fmtQty(header.Losgr)} {header.Meeht}</td><td className={td}>{header.Werks}</td><td className={tdN} /><td className={tdN} /><td className={tdN} /><td className={td}>{header.StatusTxt || header.Status}</td>
            </tr>
            {shown.map((n) => {
              const r = n.item; const recost = n.basis === 'own' && !n.value.minus(n.itemValue).abs().lt('0.005'); const diff = n.value.minus(n.itemValue); const open = !closed.has(n.id);
              const kids = n.children.length ? n.children.reduce((t, c) => t.plus(c.itemValue), new Decimal(0)) : null;
              return (
                <tr key={n.id} className={cx('border-t border-line/60', n.children.length > 0 && 'font-semibold')}>
                  <td className={td}>
                    <span className="inline-flex items-start gap-1" style={{ paddingLeft: `${(n.depth - 1) * 18}px` }}>
                      {n.children.length ? <button type="button" aria-label={open ? 'Collapse' : 'Expand'} onClick={() => toggle(n.id)} className="mt-0.5 text-muted hover:text-ink">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button> : <span className="inline-block w-[13px]" />}
                      {r.Typps === 'E' ? <span><span className="font-mono text-xs text-muted">E</span> {r.Lstar} <span className="text-muted">{r.KstarTxt}</span></span> : <span><span className="font-mono text-xs">{n.matnr}</span> {r.ItemTxt}</span>}
                    </span>
                  </td>
                  <td className={tdN}>{fmtNum(n.itemValue.toFixed(2), 2, curr)}{kids && !kids.minus(n.itemValue).abs().lt('0.05') && <span className="block text-2xs font-normal text-warn" title="Sum of the lines below, from this component's own estimate">lines below: {fmtNum(kids.toFixed(2), 2, curr)}</span>}</td>
                  <td className={tdN}>{fmtQty(n.qty.toFixed(3))} <span className="text-muted">{r.Uom}</span></td>
                  <td className={cx(td, 'text-xs text-muted')}>{[r.ItemWerks, r.Kostl, r.Lstar].filter(Boolean).join(' ')}</td>
                  <td className={tdN}>{r.Typps === 'E' || !Number(r.Price) ? '' : <>{fmtNum(r.Price, 4, curr)}<span className="text-2xs text-muted"> / {Number(r.PriceUnit) > 1 ? `${fmtNum(r.PriceUnit, 0, 'X')} ` : ''}base unit</span></>}</td>
                  <td className={cx(tdN, 'text-muted')}>{recost ? fmtNum(n.value.toFixed(2), 2, curr) : ''}</td>
                  <td className={cx(tdN, !recost ? 'text-faint' : diff.gt(0) ? 'text-bad' : 'text-good')}>{recost ? `${diff.gt(0) ? '+' : ''}${fmtNum(diff.toFixed(2), 2, curr)}` : ''}</td>
                  <td className={cx(td, 'text-xs')}>{n.own ? <span className={recost ? 'text-warn' : 'text-muted'} title={`Estimate ${n.own.Kalnr}, costing date ${n.own.Kadky ?? ''}`}>{n.own.StatusTxt || n.own.Status}{recost ? ` · ${fmtNum(n.own.Total, 4, curr)} / unit` : ''}</span> : <span className="text-faint">–</span>}</td>
                </tr>
              );
            })}
            <tr className="border-t border-line bg-line/10 font-bold"><td className={td}>Sum of the first-level lines</td><td className={tdN}>{fmtNum(released.toFixed(2), 2, curr)}</td><td colSpan={6} /></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
