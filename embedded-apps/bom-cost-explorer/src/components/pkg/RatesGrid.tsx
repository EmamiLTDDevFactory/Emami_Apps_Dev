'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cx } from '../ui';
import { SkeletonRows } from '../budget-mgmt/shared';
import ComponentTable from './ComponentTable';
import { FlagChips } from './FlagChips';
import { NumEdit, type CellApi } from './NumEdit';
import { SrcChip } from './StatusChip';
import { NO_ORIGIN, blocked, fmtRate4, fmtVar2, originKey, originSummary, stripZeros, type OriginSummary } from '@/lib/pkg/rules';
import type { PkgGroup } from '@/lib/pkg/types';

export const VIRTUAL_ABOVE = 300;
const th = 'sticky top-0 z-20 whitespace-nowrap border-b border-line bg-panel px-2 py-1.5 text-left text-xs font-bold';
const td = 'whitespace-nowrap px-2 py-1.5 text-xs';
const COLS = 20;
const fmtQty = (n: number) => (n ? n.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-');

export interface GridProps {
  groups: PkgGroup[]; grouped?: boolean; loading: boolean; cell: Omit<CellApi, 'order' | 'editKey' | 'setEditKey'>;
  editKey: string | null; setEditKey: (k: string | null) => void;
  expanded: Set<string>; onToggle: (m: string) => void; selected: Set<string>; onSelect: (m: string, on: boolean) => void; onSelectAll: (on: boolean) => void;
}

export default function RatesGrid({ groups, grouped = false, loading, cell, editKey, setEditKey, expanded, onToggle, selected, onSelect, onSelectAll }: GridProps) {
  const scroller = useRef<HTMLDivElement>(null);
  // Rows: materials, or origin-group sections (a summary row, then its materials unless the section is collapsed).
  const [closed, setClosed] = useState<Set<string>>(new Set());
  type Entry = { kind: 'org'; s: OriginSummary } | { kind: 'mat'; g: PkgGroup };
  const entries = useMemo<Entry[]>(() => {
    if (!grouped) return groups.map((g) => ({ kind: 'mat', g }));
    const out: Entry[] = [];
    for (const s of originSummary(groups)) {
      out.push({ kind: 'org', s });
      if (!closed.has(s.key)) for (const g of groups) if (originKey(g) === s.key) out.push({ kind: 'mat', g });
    }
    return out;
  }, [groups, grouped, closed]);
  // The width the open component panel may use: the visible width of the grid, so it never slides under the sticky columns.
  const [vw, setVw] = useState(1100);
  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const upd = () => setVw(Math.max(640, el.clientWidth - 24));
    upd();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(upd); ro.observe(el); return () => ro.disconnect();
  }, []);
  const virtual = !grouped && groups.length > VIRTUAL_ABOVE;
  const virt = useVirtualizer({ count: virtual ? entries.length : 0, getScrollElement: () => scroller.current, estimateSize: () => 38, overscan: 8 });
  // Tab order of the editable cells, in screen order: basic rate, then the ZBUD % of every open material.
  const order = useMemo(() => groups.flatMap((g) => [`${g.head.Matnr}|R`, ...(expanded.has(g.head.Matnr) ? g.comps.map((c) => `${g.head.Matnr}|${c.Idnrk}|Z`) : [])]), [groups, expanded]);
  const api: CellApi = { ...cell, editKey, setEditKey, order };

  const vItems = virtual ? virt.getVirtualItems() : entries.map((_, index) => ({ index, start: 0, end: 0 }));
  const padTop = virtual && vItems.length ? vItems[0].start : 0;
  const padBottom = virtual && vItems.length ? virt.getTotalSize() - vItems[vItems.length - 1].end : 0;
  const allSel = groups.length > 0 && groups.every((g) => selected.has(g.head.Matnr));

  return (
    <div ref={scroller} className="max-h-[65vh] overflow-auto rounded-2xl border border-line bg-panel shadow-card">
      <table className="w-full min-w-[1700px] border-collapse">
        <thead>
          <tr>
            <th className={cx(th, 'left-0 w-9')}><input type="checkbox" aria-label="Select all shown materials" checked={allSel} onChange={(e) => onSelectAll(e.target.checked)} /></th>
            <th className={cx(th, 'left-9 w-8')}><span className="sr-only">Expand</span></th>
            <th className={cx(th, 'left-[68px]')}>Material</th>
            <th className={th}>Description</th><th className={th}>Type / Grp</th><th className={th}>Plant</th><th className={th}>Origin grp</th><th className={th}>ZBUD material</th>
            <th className={cx(th, 'text-right')}>Net qty</th><th className={cx(th, 'text-right')}>Net value</th><th className={th}>Src</th>
            <th className={cx(th, 'text-right')}>Basic (SAP)</th><th className={cx(th, 'text-right')}>Basic (used)</th><th className={cx(th, 'text-right')}>Budgeted</th>
            <th className={cx(th, 'text-right')}>Variance</th><th className={cx(th, 'text-right')}>Var %</th><th className={cx(th, 'text-right')}>Freight / unit</th><th className={cx(th, 'text-right')}>Landed</th><th className={th}>Cur / per / UoM</th><th className={th}>Flags</th>
          </tr>
        </thead>
        {loading && !groups.length && <SkeletonRows cols={COLS} />}
        {padTop > 0 && <tbody aria-hidden="true"><tr><td colSpan={COLS} style={{ height: padTop, padding: 0 }} /></tr></tbody>}
        {vItems.map((v) => {
          const e = entries[v.index];
          if (!e) return null;
          if (e.kind === 'org') {
            const s = e.s, shut = closed.has(s.key);
            return (
              <tbody key={`org|${s.key}`} className="border-b border-line">
                <tr className="bg-sunken">
                  <td colSpan={COLS} className="p-0">
                    <div className="sticky left-0 box-border flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-xs" style={{ width: vw }}>
                      <button type="button" aria-expanded={!shut} aria-label={`${shut ? 'Show' : 'Hide'} materials of origin group ${s.key === NO_ORIGIN ? 'none' : s.key}`}
                        className="rounded p-0.5 hover:bg-panel focus-visible:ring-2 focus-visible:ring-accent" onClick={() => setClosed((c) => { const n = new Set(c); if (n.has(s.key)) n.delete(s.key); else n.add(s.key); return n; })}>
                        {shut ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      </button>
                      <span className="text-sm font-extrabold">{s.key === NO_ORIGIN ? 'No origin group' : `Origin group ${s.key}`}</span>
                      {s.zbud && <span className="text-muted">ZBUD material <b className="text-ink">{stripZeros(s.zbud)}</b></span>}
                      <span className="text-muted"><b className="text-ink">{s.n}</b> material{s.n === 1 ? '' : 's'}{s.blocked ? <> · <b className="text-bad">{s.blocked} blocked</b></> : null}</span>
                      <span className="text-muted">Net qty <b className="tabular-nums text-ink">{fmtQty(s.netQty)}</b></span>
                      <span className="text-muted">Net value <b className="tabular-nums text-ink">{fmtQty(s.netValue)}</b></span>
                      <span className="text-muted">Avg var % <b className="tabular-nums text-ink">{s.avgVarPct === null ? '-' : fmtVar2(s.avgVarPct)}</b></span>
                    </div>
                  </td>
                </tr>
              </tbody>
            );
          }
          const g = e.g;
          const h = g.head, m = h.Matnr, open = expanded.has(m), bl = blocked(h);
          const sticky = cx('sticky z-10', open ? 'bg-sunken' : 'bg-panel');
          return (
            <tbody key={m} ref={virtual ? virt.measureElement : undefined} data-index={v.index} className="border-b border-line/60">
              <tr className={cx('hover:bg-sunken/40', selected.has(m) && 'bg-accent/5', open && 'bg-sunken')}>
                <td className={cx(td, sticky, 'left-0')}><input type="checkbox" aria-label={`Select ${stripZeros(m)}`} checked={selected.has(m)} onChange={(e) => onSelect(m, e.target.checked)} /></td>
                <td className={cx(td, sticky, 'left-9')}>
                  <button type="button" aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} components of ${stripZeros(m)}`} className="rounded p-0.5 hover:bg-sunken focus-visible:ring-2 focus-visible:ring-accent" onClick={() => onToggle(m)}>
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                </td>
                <td className={cx(td, sticky, 'left-[68px] font-bold')}>{stripZeros(m)}</td>
                <td className={cx(td, 'max-w-[260px] truncate')} title={h.Maktx}>{h.Maktx}</td>
                <td className={cx(td, 'text-muted')}>{h.Mtart} / {h.Matkl}</td>
                <td className={cx(td, 'text-muted')}>{h.Werks || '-'}</td>
                <td className={td}>{h.OriginGrp || '-'}</td>
                <td className={td} title="8-series ZBUD header material of the origin group">{h.ZbudMatnr ? stripZeros(h.ZbudMatnr) : '-'}</td>
                <td className={cx(td, 'text-right tabular-nums')} title={`Net quantity (${h.Meins}), 12 months to the key date`}>{fmtQty(h.NetQty)}</td>
                <td className={cx(td, 'text-right tabular-nums')} title="Net value in local currency, 12 months to the key date">{fmtQty(h.NetValue)}</td>
                <td className={td}><SrcChip src={h.RateSrc} /></td>
                <td className={cx(td, 'text-right tabular-nums')}>{fmtRate4(h.BasicRateSap)}</td>
                <td className={cx(td, 'text-right')}><NumEdit cell={api} k={`${m}|R`} level="R" matnr={m} value={h.BasicRateUsed} sap={h.BasicRateSap} fmt={fmtRate4} label={`basic rate of ${stripZeros(m)}`} /></td>
                <td className={cx(td, 'text-right font-bold tabular-nums')}>{bl ? '-' : fmtRate4(h.BudgetRate)}</td>
                <td className={cx(td, 'text-right tabular-nums', !bl && (h.Variance > 0 ? 'text-bad' : h.Variance < 0 ? 'text-good' : ''))}>{bl ? '-' : fmtRate4(h.Variance)}</td>
                <td className={cx(td, 'text-right tabular-nums', !bl && (h.VariancePct > 0 ? 'text-bad' : h.VariancePct < 0 ? 'text-good' : ''))}>{bl ? '-' : fmtVar2(h.VariancePct)}</td>
                <td className={cx(td, 'text-right tabular-nums')} title={[h.FrtCond1 && `${h.FrtCond1} ${fmtRate4(h.FrtRate1)}`, h.FrtCond2 && `${h.FrtCond2} ${fmtRate4(h.FrtRate2)}`, h.FrtCond3 && `${h.FrtCond3} ${fmtRate4(h.FrtRate3)}`, h.FrtCond4 && `${h.FrtCond4} ${fmtRate4(h.FrtRate4)}`].filter(Boolean).join(' · ') || 'No freight rate'}>{h.FrtTotal ? fmtRate4(h.FrtTotal) : '-'}</td>
                <td className={cx(td, 'text-right tabular-nums')} title={`Budgeted in ${h.GroupCurr || 'INR'} + freight, per ${h.Peinh}`}>{bl || !h.LandedRate ? '-' : fmtRate4(h.LandedRate)}</td>
                <td className={cx(td, 'text-muted')}>{h.Waers} / {h.Peinh} / {h.Meins}</td>
                <td className={td}><FlagChips flags={h.MsgFlags} matnr={h.Matnr} descr={h.Maktx} /></td>
              </tr>
              {open && (
                <tr>
                  <td colSpan={COLS} className="bg-sunken p-0">
                    <div className="sticky left-0 box-border px-3 py-2" style={{ width: vw }}>
                      <div className="ml-6 overflow-x-auto rounded-xl border border-line border-l-4 border-l-accent bg-panel px-3 py-2 shadow-card">
                        <ComponentTable g={g} cell={api} />
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          );
        })}
        {padBottom > 0 && <tbody aria-hidden="true"><tr><td colSpan={COLS} style={{ height: padBottom, padding: 0 }} /></tr></tbody>}
        {!loading && !groups.length && <tbody><tr><td colSpan={COLS} className="px-3 py-8 text-center text-sm text-muted">No materials match</td></tr></tbody>}
      </table>
    </div>
  );
}
