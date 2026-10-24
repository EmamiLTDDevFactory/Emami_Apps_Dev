'use client';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { CostLine } from '@/lib/sap/fields';
import { allExpandableIds, visibleNodes, type CostTree, type TreeNode } from '@/lib/cost/tree';
import type { SimRow } from '@/lib/cost/simulate';
import { minCover, UNLIMITED_COVER } from '@/lib/cost/analytics';
import { D, ZERO, type Decimal } from '@/lib/cost/decimal';
import { fmtNum, fmtPct, fmtQty, fmtRate, fmtSigned } from '@/lib/format';
import { ls } from '@/lib/client/storage';
import { Button, cx, Modal, SimTag, SourceBadge, inputBase, inputCls } from './ui';
import { FreightValue } from './freight/FreightValue';
import type { FreightRun } from '@/lib/freight/breakup';
import type { FreightTagged } from '@/lib/cost/freightIncluded';
import { sourceLabel } from '@/lib/rates/sourceLabel';

export interface NodeAgg {
  inr: Decimal[]; // leaf roll-up of TotCostInr per node
  loc: Decimal[]; // leaf roll-up of TotCostLoc (meaningful for one plant)
  sim: Decimal[] | null; // leaf roll-up of the simulated total
}

interface LineCtx { r: CostLine; s: SimRow; leaf: boolean; simOn: boolean; frun?: FreightRun | null }
interface GroupCtx { n: TreeNode; i: number; agg: NodeAgg; locCurr: string; simOn: boolean }

interface Col {
  id: string;
  label: string;
  width: number;
  right?: boolean;
  line: (c: LineCtx) => ReactNode;
  group?: (c: GroupCtx) => ReactNode;
  title?: string;
}

const Amt = ({ v, curr, dp = 2, muted }: { v: Decimal | string; curr: string; dp?: number; muted?: boolean }) => (
  <span className={cx('num', muted && 'italic text-faint')}>
    {fmtNum(v, dp, curr)} <span className="text-2xs text-faint">{curr}</span>
  </span>
);

const parentTitle = 'SAP roll-up of this sub-tree. Not added again to totals (totals sum leaf rows only).';

export const TREE_COLUMNS: Col[] = [
  { id: 'level', label: 'Lvl', width: 44, right: true, line: ({ r }) => <span className="num text-muted">{r.Level}</span> },
  {
    id: 'qty', label: 'Prod. qty', width: 130, right: true,
    line: ({ r, s }) => (
      <span className="num">
        {s.changed && !s.qty.eq(D(r.ProdQty)) ? <span className="sim-val">{fmtQty(s.qty)}</span> : fmtQty(r.ProdQty)} <span className="text-2xs text-faint">{r.Meins}</span>
      </span>
    ),
  },
  { id: 'qtysrc', label: 'Qty src', width: 70, line: ({ r }) => <span className="text-2xs text-muted">{r.Qtysrc}</span> },
  {
    id: 'source', label: 'Rate source', width: 112,
    line: ({ r, s, leaf }) => (leaf ? <SourceBadge source={s.source} sim={s.repicked || s.overridden} /> : <span className="text-2xs text-faint">sub-tree</span>),
  },
  { id: 'vendor', label: 'Vendor', width: 170, line: ({ r }) => (r.SelVendor ? <span className="truncate" title={`${r.SelVendor} ${r.SelVname}`}>{r.SelVname || r.SelVendor}</span> : null) },
  { id: 'ratePc', label: 'Rate / pc', width: 130, right: true, line: ({ r, leaf }) => (leaf && r.SelSource ? <Amt v={r.SelRatePc} curr={r.SelCurr} dp={4} /> : null) },
  { id: 'fx', label: 'FX', width: 100, right: true, line: ({ r, leaf }) => (leaf && r.SelSource ? <span className="num text-muted">{fmtNum(r.SelFx, 5, 'X')}</span> : null) },
  { id: 'ratePcLoc', label: 'Rate / pc local', width: 136, right: true, line: ({ r, leaf }) => (leaf && r.SelSource ? <Amt v={r.SelRatePcLoc} curr={r.LocCurr} dp={4} /> : null) },
  {
    id: 'ratePcInr', label: 'Rate / pc INR', width: 136, right: true,
    line: ({ r, s, leaf }) => (!leaf ? null : s.changed && !s.ratePcInr.eq(D(r.SelRatePcInr)) ? <span className="sim-val num">{fmtRate(s.ratePcInr, 'INR')} <span className="text-2xs">INR</span></span> : r.SelSource ? <Amt v={r.SelRatePcInr} curr="INR" dp={4} /> : <span className="text-2xs font-semibold text-bad">NO RATE</span>),
  },
  {
    id: 'frtPc', label: 'Freight / pc', width: 146, right: true,
    line: ({ r, leaf, frun }) => (leaf && (r as FreightTagged).FrtIncluded ? <FreightValue line={r} run={frun} value={(r as FreightTagged).FrtPcLocSap}><span className="num" title={`${r.FrtSrc} freight - not added: the ${sourceLabel(r.SelSource)} rate already includes freight`}>{fmtNum((r as FreightTagged).FrtPcLocSap ?? '0', 4, r.LocCurr)} <span className="text-2xs text-faint">{r.LocCurr} · not added</span></span></FreightValue> : leaf && r.FrtSrc ? <FreightValue line={r} run={frun} value={r.FrtPcLoc}><span className="num" title={`${r.FrtSrc} freight`}>{fmtNum(r.FrtPcLoc, 4, r.LocCurr)} <span className="text-2xs text-faint">{r.LocCurr} · {r.FrtSrc === 'ACTUAL' ? 'A' : 'S'}</span></span></FreightValue> : null),
  },
  {
    id: 'frtPcInr', label: 'Freight / pc INR', width: 130, right: true,
    line: ({ r, s, leaf, frun }) => (!leaf ? null : s.changed && !s.frtPcInr.eq(D(r.FrtPcInr)) ? <span className="sim-val num">{fmtRate(s.frtPcInr, 'INR')}</span> : (r as FreightTagged).FrtIncluded ? <FreightValue line={r} run={frun} value={(r as FreightTagged).FrtPcInrSap}><span className="num" title={`Not added: the ${sourceLabel(r.SelSource)} rate already includes freight`}><Amt v={(r as FreightTagged).FrtPcInrSap ?? '0'} curr="INR" dp={4} /> <span className="text-2xs text-faint">not added</span></span></FreightValue> : r.FrtSrc ? <FreightValue line={r} run={frun} value={r.FrtPcInr}><Amt v={r.FrtPcInr} curr="INR" dp={4} /></FreightValue> : null),
  },
  {
    id: 'totPcInr', label: 'Total / pc INR', width: 136, right: true,
    line: ({ r, s, leaf }) => (leaf && s.changed ? <span className="sim-val num">{fmtRate(s.totPcInr, 'INR')}</span> : <Amt v={r.TotCostPcInr} curr="INR" dp={4} muted={!leaf} />),
  },
  {
    id: 'totLoc', label: 'Total local', width: 150, right: true,
    line: ({ r, leaf }) => <span title={leaf ? undefined : parentTitle}><Amt v={r.TotCostLoc} curr={r.LocCurr} muted={!leaf} /></span>,
    group: ({ n, i, agg, locCurr }) => (n.kind === 'plant' || n.kind === 'header' ? <Amt v={agg.loc[i]} curr={locCurr} /> : null),
  },
  {
    id: 'totInr', label: 'Total INR', width: 150, right: true, title: 'SAP figure',
    line: ({ r, leaf }) => <span title={leaf ? undefined : parentTitle}><Amt v={r.TotCostInr} curr="INR" muted={!leaf} /></span>,
    group: ({ i, agg }) => <span className="font-semibold"><Amt v={agg.inr[i]} curr="INR" /></span>,
  },
  {
    id: 'budget', label: 'Budget landed / pc', width: 150, right: true,
    line: ({ r, s, leaf }) => {
      if (!leaf || D(r.BudLanded).isZero()) return null;
      const v = s.totPcInr.minus(D(r.BudLanded));
      const pct = v.div(D(r.BudLanded)).times(100);
      return (
        <span className="num" title={`Budget ${r.BudGjahr} (${r.BudSource}) in ${r.BudSrccurr}: ${r.BudSrcamt} @ ${r.BudExchrate}`}>
          {fmtNum(r.BudLanded, 4)} <span className={cx('text-2xs', pct.gt(0) ? 'text-bad' : 'text-good')}>{pct.gt(0) ? '▲' : '▼'}{fmtPct(pct.abs(), 0)}</span>
        </span>
      );
    },
  },
  {
    id: 'cover', label: 'Coverage (days)', width: 120, right: true,
    line: ({ r, leaf }) => {
      if (!leaf) return null;
      const hasCov = [r.CovH1, r.CovH2, r.CovH3].some((v) => !D(v).isZero());
      if (!hasCov) return null;
      const m = minCover(r);
      return (
        <span className="num" title={`H1 ${r.CovH1} · H2 ${r.CovH2} · H3 ${r.CovH3} (999 = no requirement)`}>
          {m === null ? <span className="text-muted">unlimited</span> : <span className={cx(m < 30 && 'font-semibold text-bad')}>{m}</span>}
        </span>
      );
    },
  },
  { id: 'donor', label: 'Donor', width: 70, line: ({ r }) => (r.Donor ? <span className="rounded bg-warn/15 px-1 text-2xs font-semibold text-warn" title={`Costed from donor plant ${r.Donor}`}>{r.Donor}</span> : null) },
  { id: 'matkl', label: 'Mat. group', width: 100, line: ({ r }) => <span className="text-xs text-muted">{r.Matkl}</span> },
  { id: 'mtart', label: 'Type', width: 60, line: ({ r }) => <span className="text-xs text-muted">{r.Mtart}</span> },
  { id: 'compOgrp', label: 'Comp. origin group', width: 120, line: ({ r }) => <span className="text-xs text-muted">{r.CompOgrp}</span> },
  { id: 'skusize', label: 'SKU size', width: 90, line: ({ r }) => <span className="text-xs text-muted">{r.Zskusize}</span> },
];

const SIM_COL: Col = {
  id: 'sim', label: 'Simulated INR', width: 190, right: true,
  line: ({ r, s, leaf }) => {
    if (!leaf) return null;
    const d = s.total.minus(D(r.TotCostInr));
    return (
      <span className="num">
        <span className={cx(s.changed && 'sim-val')}>{fmtNum(s.total, 2)}</span>
        {!d.isZero() && <span className={cx('ml-1 text-2xs', d.gt(0) ? 'text-bad' : 'text-good')}>{fmtSigned(d)}</span>}
      </span>
    );
  },
  group: ({ i, agg }) => {
    if (!agg.sim) return null;
    const d = agg.sim[i].minus(agg.inr[i]);
    return (
      <span className="num font-semibold">
        <span className="sim-val">{fmtNum(agg.sim[i], 2)}</span>
        {!d.isZero() && <span className={cx('ml-1 text-2xs', d.gt(0) ? 'text-bad' : 'text-good')}>{fmtSigned(d)}</span>}
      </span>
    );
  },
};

export const PRESETS: Record<string, string[]> = {
  Standard: ['level', 'qty', 'skusize', 'compOgrp', 'source', 'vendor', 'ratePc', 'fx', 'ratePcLoc', 'frtPc', 'totLoc', 'totInr', 'budget', 'cover'],
  Rates: ['level', 'qty', 'source', 'vendor', 'ratePc', 'fx', 'ratePcLoc', 'ratePcInr', 'donor'],
  Freight: ['level', 'qty', 'source', 'frtPc', 'frtPcInr', 'totPcInr', 'totInr'],
  'Budget & coverage': ['level', 'qty', 'totPcInr', 'budget', 'cover', 'totInr'],
  All: TREE_COLUMNS.map((c) => c.id),
};

const KIND_STYLE: Record<string, string> = {
  country: 'row-country font-semibold',
  plant: 'row-plant font-semibold',
  header: 'row-header font-medium',
  line: 'row-line',
};

const ROW_H = 30;

export default function BomTree({
  tree, sim, simOn, agg, plantCurr, onOpen, focusRow, freightRun,
}: {
  tree: CostTree; sim: SimRow[]; simOn: boolean; agg: NodeAgg; plantCurr: Record<string, string>; onOpen: (row: number) => void; focusRow?: number | null;
  /** FreightDays / StdFrt of the run that produced the rows: enables the freight break-up on freight values (omitted = as before) */
  freightRun?: FreightRun | null;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(allExpandableIds(tree, 2)));
  const [colIds, setColIds] = useState<string[]>(PRESETS.Standard);
  const [presets, setPresets] = useState<Record<string, string[]>>({});
  const [chooser, setChooser] = useState(false);
  const [focus, setFocus] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let saved = ls.get<string[]>('bce:tree-cols', PRESETS.Standard);
    // One-time: SKU size and component origin group joined the Standard columns (2026-10-09); add
    // them to a column choice saved before that, after Prod. qty, keeping everything else as saved.
    if (!ls.get('bce:tree-cols-v2', false)) {
      const add = ['skusize', 'compOgrp'].filter((id) => !saved.includes(id));
      if (add.length) {
        const at = saved.indexOf('qty') + 1 || saved.length;
        saved = [...saved.slice(0, at), ...add, ...saved.slice(at)];
        ls.set('bce:tree-cols', saved);
      }
      ls.set('bce:tree-cols-v2', true);
    }
    setColIds(saved);
    setPresets(ls.get('bce:tree-presets', {}));
  }, []);
  useEffect(() => setExpanded(new Set(allExpandableIds(tree, 2))), [tree]);

  const cols = useMemo(() => {
    const c = colIds.map((id) => TREE_COLUMNS.find((x) => x.id === id)).filter(Boolean) as Col[];
    return simOn ? [...c, SIM_COL] : c;
  }, [colIds, simOn]);
  const setCols = (ids: string[]) => {
    setColIds(ids);
    ls.set('bce:tree-cols', ids);
  };

  const visible = useMemo(() => visibleNodes(tree, expanded), [tree, expanded]);
  const STRUCT_W = 360;
  const template = `${STRUCT_W}px ${cols.map((c) => `${c.width}px`).join(' ')}`;
  const totalWidth = STRUCT_W + cols.reduce((a, c) => a + c.width, 0);

  const v = useVirtualizer({ count: visible.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_H, overscan: 20 });

  const toggle = useCallback((id: string, open?: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // Jump to a row requested from outside (data-quality tab, drawer links).
  useEffect(() => {
    if (focusRow === null || focusRow === undefined) return;
    const ni = tree.nodes.findIndex((n) => n.row === focusRow);
    if (ni < 0) return;
    const open = new Set(expanded);
    for (let p = tree.nodes[ni].parent; p >= 0; p = tree.nodes[p].parent) open.add(tree.nodes[p].id);
    setExpanded(open);
    requestAnimationFrame(() => {
      const vis = visibleNodes(tree, open);
      const at = vis.indexOf(ni);
      if (at >= 0) {
        setFocus(at);
        v.scrollToIndex(at, { align: 'center' });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRow]);

  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-vi="${focus}"]`);
    if (el && scrollRef.current?.contains(document.activeElement)) el.focus({ preventScroll: true });
  }, [focus, visible]);

  const onKey = (e: React.KeyboardEvent) => {
    const n = tree.nodes[visible[focus]];
    if (!n) return;
    let next = focus;
    if (e.key === 'ArrowDown') next = Math.min(focus + 1, visible.length - 1);
    else if (e.key === 'ArrowUp') next = Math.max(focus - 1, 0);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = visible.length - 1;
    else if (e.key === 'PageDown') next = Math.min(focus + 20, visible.length - 1);
    else if (e.key === 'PageUp') next = Math.max(focus - 20, 0);
    else if (e.key === 'ArrowRight' && n.hasChildren) {
      if (!expanded.has(n.id)) toggle(n.id, true);
      else next = focus + 1;
    } else if (e.key === 'ArrowLeft') {
      if (n.hasChildren && expanded.has(n.id)) toggle(n.id, false);
      else if (n.parent >= 0) next = visible.indexOf(n.parent);
    } else if ((e.key === 'Enter' || e.key === ' ') && n.kind === 'line') onOpen(n.row);
    else if (e.key === 'Enter' && n.hasChildren) toggle(n.id);
    else return;
    e.preventDefault();
    if (next !== focus) {
      setFocus(next);
      v.scrollToIndex(next);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-1.5 no-print">
        <Button size="sm" onClick={() => setExpanded(new Set(allExpandableIds(tree)))}>Expand all</Button>
        <Button size="sm" onClick={() => setExpanded(new Set())}>Collapse all</Button>
        <Button size="sm" onClick={() => setExpanded(new Set(allExpandableIds(tree, 2)))}>Headers</Button>
        <span className="mx-1 h-4 w-px bg-line" />
        <label className="sr-only" htmlFor="preset">Column preset</label>
        <select
          id="preset"
          className={cx(inputBase, 'h-7 w-auto text-xs')}
          value=""
          onChange={(e) => {
            const all = { ...PRESETS, ...presets };
            if (all[e.target.value]) setCols(all[e.target.value]);
          }}
        >
          <option value="">Column preset…</option>
          {Object.keys({ ...PRESETS, ...presets }).map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <Button size="sm" onClick={() => setChooser(true)}>Columns ({colIds.length})</Button>
        <span className="ml-auto text-2xs text-faint">{tree.rows.length.toLocaleString('en-IN')} rows · ↑↓ move · ←→ collapse/expand · Enter details</span>
      </div>

      <div
        ref={scrollRef}
        role="treegrid"
        aria-label="BOM cost tree"
        aria-rowcount={visible.length}
        onKeyDown={onKey}
        className="scroll-thin relative min-h-0 flex-1 overflow-auto"
      >
        <div style={{ width: totalWidth, minWidth: '100%' }}>
          <div role="row" className="sticky top-0 z-20 grid border-b border-line bg-panel text-2xs font-semibold uppercase tracking-wide text-muted" style={{ gridTemplateColumns: template }}>
            <div role="columnheader" className="sticky left-0 z-10 bg-panel px-3 py-2">Structure</div>
            {cols.map((c) => (
              <div role="columnheader" key={c.id} className={cx('px-2 py-2', c.right && 'text-right')} title={c.title}>
                {c.label} {c.id === 'sim' && <SimTag />}
              </div>
            ))}
          </div>
          <div style={{ height: v.getTotalSize(), position: 'relative' }}>
            {v.getVirtualItems().map((vi) => {
              const ni = visible[vi.index];
              return (
                <TreeRow
                  key={ni}
                  vi={vi.index}
                  top={vi.start}
                  ni={ni}
                  node={tree.nodes[ni]}
                  tree={tree}
                  sim={sim}
                  simOn={simOn}
                  agg={agg}
                  cols={cols}
                  template={template}
                  open={expanded.has(tree.nodes[ni].id)}
                  focused={vi.index === focus}
                  locCurr={plantCurr[tree.rows[tree.nodes[ni].start]?.Hwerks] ?? ''}
                  onToggle={toggle}
                  onOpen={onOpen}
                  onFocus={setFocus}
                  frun={freightRun}
                />
              );
            })}
          </div>
        </div>
      </div>

      <Modal open={chooser} onClose={() => setChooser(false)} title="Columns" footer={<Button variant="primary" onClick={() => setChooser(false)}>Done</Button>}>
        <ColumnChooser colIds={colIds} setCols={setCols} presets={presets} setPresets={(p) => { setPresets(p); ls.set('bce:tree-presets', p); }} />
      </Modal>
    </div>
  );
}

function ColumnChooser({ colIds, setCols, presets, setPresets }: { colIds: string[]; setCols: (c: string[]) => void; presets: Record<string, string[]>; setPresets: (p: Record<string, string[]>) => void }) {
  const [name, setName] = useState('');
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1">
        {TREE_COLUMNS.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={colIds.includes(c.id)}
              onChange={(e) => setCols(e.target.checked ? TREE_COLUMNS.map((x) => x.id).filter((id) => id === c.id || colIds.includes(id)) : colIds.filter((x) => x !== c.id))}
            />
            {c.label}
          </label>
        ))}
      </div>
      <div className="flex gap-2 border-t border-line pt-3">
        <input className={inputCls} placeholder="Save current columns as…" value={name} onChange={(e) => setName(e.target.value)} />
        <Button disabled={!name.trim()} onClick={() => { setPresets({ ...presets, [name.trim()]: colIds }); setName(''); }}>Save preset</Button>
      </div>
      {Object.keys(presets).length > 0 && (
        <ul className="space-y-1">
          {Object.keys(presets).map((k) => (
            <li key={k} className="flex items-center justify-between text-sm">
              <button type="button" className="text-accent hover:underline" onClick={() => setCols(presets[k])}>{k}</button>
              <button type="button" className="text-2xs text-faint hover:text-bad" onClick={() => { const p = { ...presets }; delete p[k]; setPresets(p); }}>delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TreeRow = memo(function TreeRow({
  vi, top, ni, node: n, tree, sim, simOn, agg, cols, template, open, focused, locCurr, onToggle, onOpen, onFocus, frun,
}: {
  vi: number; top: number; ni: number; node: TreeNode; tree: CostTree; sim: SimRow[]; simOn: boolean; agg: NodeAgg; cols: Col[]; template: string;
  open: boolean; focused: boolean; locCurr: string; onToggle: (id: string, open?: boolean) => void; onOpen: (row: number) => void; onFocus: (i: number) => void;
  frun?: FreightRun | null;
}) {
  const isLine = n.kind === 'line';
  const r = isLine ? tree.rows[n.row] : null;
  const s = isLine ? sim[n.row] : null;
  const leaf = isLine && tree.isLeaf[n.row];
  const indent = n.depth * 16;
  return (
    <div
      role="row"
      data-vi={vi}
      aria-level={n.depth + 1}
      aria-expanded={n.hasChildren ? open : undefined}
      aria-selected={focused}
      tabIndex={focused ? 0 : -1}
      onFocus={() => onFocus(vi)}
      onClick={() => (isLine ? onOpen(n.row) : onToggle(n.id))}
      className={cx(
        'absolute left-0 grid w-full cursor-pointer items-center border-b border-line/60 text-[13px]',
        s?.changed ? 'row-sim' : KIND_STYLE[n.kind],
        focused && 'ring-1 ring-inset ring-accent',
      )}
      style={{ top, height: ROW_H, gridTemplateColumns: template }}
    >
      <div role="gridcell" className="sticky left-0 z-10 flex h-full min-w-0 items-center gap-1 bg-inherit pr-2" style={{ paddingLeft: 8 + indent }}>
        {n.hasChildren ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={open ? 'Collapse' : 'Expand'}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-faint hover:bg-sunken hover:text-ink"
            onClick={(e) => { e.stopPropagation(); onToggle(n.id); }}
          >
            <span className={cx('transition-transform', open && 'rotate-90')}>▸</span>
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <span className={cx('shrink-0 font-mono text-xs', n.kind !== 'line' && 'text-ink')}>{n.kind === 'country' ? n.sub : n.label}</span>
        <span className="min-w-0 truncate text-xs text-muted">{n.kind === 'country' ? n.label : n.sub}</span>
        {r?.Donor && <span className="ml-1 shrink-0 rounded bg-warn/15 px-1 text-[10px] font-bold text-warn" title={`Rate from donor plant ${r.Donor}`}>Donor plant {r.Donor}</span>}
        {s?.overridden && <span className="ml-1 shrink-0 rounded bg-sim/15 px-1 text-[10px] font-bold text-sim">OVERRIDE</span>}
      </div>
      {cols.map((c) => (
        <div role="gridcell" key={c.id} className={cx('min-w-0 truncate px-2', c.right && 'text-right')}>
          {r && s ? c.line({ r, s, leaf, simOn, frun }) : c.group?.({ n, i: ni, agg, locCurr, simOn })}
        </div>
      ))}
    </div>
  );
});

export { ZERO, UNLIMITED_COVER };
