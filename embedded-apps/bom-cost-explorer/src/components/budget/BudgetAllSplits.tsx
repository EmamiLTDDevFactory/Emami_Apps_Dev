'use client';
/** Every FG of the summary with its split, one under the other: an FG band (header B-RM / B-PM / B-Perfume against the split group totals, Selected / C-Map per pc) and its components, coloured RM / Perfume / PM. */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Square } from 'lucide-react';
import { Button, Empty, Pill, Spinner, cx } from '../ui';
import ColumnMenu, { loadChoice, type ColChoice } from './ColumnMenu';
import { fmtNum } from '@/lib/format';
import { D, ZERO } from '@/lib/cost/decimal';
import type { BudgetQuery } from '@/lib/budget/filter';
import type { BudgetSplitRow, BudgetSummaryRow } from '@/lib/budget/types';
import { BUCKET_COLOR, BUCKET_HINT, BUCKET_LABEL, SPLIT_BUCKETS, bucketOf, groupedSplitRows, rowKey } from '@/lib/budget/view';
import { cachedSplits, loadAllSplits, type Progress } from '@/lib/budget/loadAll';
import { peekRateBasis, rateBasisVersion, subscribeRateBasis, type RateBasisComp } from '@/lib/budget/rateBasis';
import type { FgSplit } from '@/lib/budget/export';

const PER_PAGE = 20, AUTO_MAX = 100, TIE = 0.0005, STORE = 'bce:budget-split-cols';
const num = (v: string, dp = 4): ReactNode => (D(v).isZero() ? <span className="text-faint">0</span> : fmtNum(v, dp, 'X'));
const dash = <span className="text-faint">—</span>;

interface SCol extends ColChoice { right?: boolean; cell: (r: BudgetSplitRow, c: RateBasisComp | undefined) => ReactNode }
const f = (key: string, label: string, group: string, k: keyof BudgetSplitRow, o: { dp?: number; right?: boolean; mono?: boolean } = {}): SCol => ({ key, label, group, right: o.right ?? o.dp !== undefined, cell: (r) => (o.dp !== undefined ? num(String(r[k] ?? ''), o.dp) : o.mono ? <span className="font-mono text-xs">{String(r[k] ?? '')}</span> : String(r[k] ?? '')) });
const COLS: SCol[] = [
  { key: 'grp', label: 'Group', group: 'Component', cell: (r) => { const b = bucketOf(r); return <span className="rounded-full px-2 py-0.5 text-2xs font-bold text-white" style={{ background: BUCKET_COLOR[b] }} title={BUCKET_HINT[b]}>{BUCKET_LABEL[b]}</span>; } },
  { key: 'item', label: 'Component', group: 'Component', cell: (r) => <span className="font-mono text-xs" style={{ paddingLeft: Math.max(0, r.Stufe - 1) * 14 }}>{r.ItemCode}</span> },
  f('desc', 'Description', 'Component', 'ItemDesc'), f('type', 'Type', 'Component', 'Mtart'), f('origin', 'Origin', 'Component', 'Hrkft'), f('ct', 'C/T', 'Component', 'Erskz'), f('alt', 'Alt BOM', 'Component', 'Stlal'), f('vendor', 'Vendor', 'Component', 'Name1'),
  f('qty', 'Qty (incl. scrap)', 'Quantity', 'Menge', { dp: 6 }), f('unit', 'Unit', 'Quantity', 'Meins'), f('pu', 'Price unit', 'Quantity', 'Epein', { dp: 0 }),
  f('bnet', 'B-Net landed', 'Cost', 'Total', { dp: 4 }), f('anet', 'Act net landed', 'Cost', 'ATotal', { dp: 4 }),
  f('bcost', 'B-Cost / pc', 'Cost', 'CostPerpc1', { dp: 4 }), f('pcost', 'Proj / pc', 'Cost', 'PCostPerpc1', { dp: 4 }), f('acost', 'Act / pc', 'Cost', 'ACostPerpc1', { dp: 4 }),
  { key: 'sel', label: 'Selected rate / pc', group: 'Selected / C-Map', right: true, cell: (_r, c) => (c?.selectedPc ? fmtNum(c.selectedPc, 4, 'X') : dash) },
  { key: 'cmap', label: 'C-Map / pc', group: 'Selected / C-Map', right: true, cell: (_r, c) => (c?.cmapPc ? fmtNum(c.cmapPc, 4, 'X') : dash) },
  f('last', 'Info-record rate (info only)', 'Cost', 'LastRate', { dp: 4 }),
  f('mach', 'Machine', 'Conversion', 'Machine', { dp: 4 }), f('lab', 'Labour', 'Conversion', 'Labour', { dp: 4 }), f('pow', 'Power', 'Conversion', 'Power', { dp: 4 }), f('stm', 'Steam', 'Conversion', 'Steam', { dp: 4 }), f('l3p', '3P conv.', 'Conversion', 'Labour3p', { dp: 4 }),
];
const DEFAULTS = ['grp', 'item', 'desc', 'type', 'origin', 'qty', 'unit', 'bcost', 'pcost', 'acost', 'sel', 'cmap'];
const GROUPS = { Component: 'Component', Quantity: 'Quantity', Cost: 'Cost per pc', 'Selected / C-Map': 'Selected / C-Map rate (load on demand)', Conversion: 'Conversion' };

export default function BudgetAllSplits({ q, fgs, email, ctx, onOpen }: { q: BudgetQuery; fgs: BudgetSummaryRow[]; email: string; ctx: string; onOpen: (r: BudgetSummaryRow) => void }) {
  useSyncExternalStore(subscribeRateBasis, rateBasisVersion, () => 0); // re-draw when rates arrive
  const [visible, setVisible] = useState<Set<string>>(() => new Set(DEFAULTS));
  useEffect(() => { const s = loadChoice(STORE, COLS.map((c) => c.key)); if (s) setVisible(s); }, []);
  const [items, setItems] = useState<FgSplit[]>(() => cachedSplits(q, fgs, email));
  const [prog, setProg] = useState<Progress | null>(null);
  const stopped = useRef(false);
  const [page, setPage] = useState(0);
  const [shut, setShut] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    stopped.current = false;
    const out = await loadAllSplits(q, fgs, ctx, email, () => stopped.current, setProg);
    setItems(out); setProg(null);
  }, [q, fgs, ctx, email]);
  // Cached splits show at once; up to AUTO_MAX FGs load by themselves, more wait for the button.
  useEffect(() => {
    setItems(cachedSplits(q, fgs, email)); setPage(0);
    if (fgs.length && fgs.length <= AUTO_MAX) void load();
  }, [q, fgs, email, load]);
  useEffect(() => () => { stopped.current = true; }, []);

  const pages = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const cur = Math.min(page, pages - 1);
  const slice = items.slice(cur * PER_PAGE, cur * PER_PAGE + PER_PAGE);
  const cols = COLS.filter((c) => visible.has(c.key));
  const missing = items.filter((x) => !x.split).length;
  const toggleShut = (k: string) => setShut((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const span = Math.max(1, cols.length);

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {prog ? (
          <>
            <span className="flex items-center gap-2 text-muted"><Spinner /> Splits {prog.done} of {prog.total}</span>
            <Button size="sm" variant="danger" onClick={() => { stopped.current = true; }}><Square size={13} /> Stop</Button>
          </>
        ) : (
          <>
            <span className="text-muted">{items.length - missing} of {items.length} FG splits loaded</span>
            {missing > 0 && <Button size="sm" variant="primary" onClick={() => void load()}>Load {missing} split{missing === 1 ? '' : 's'}</Button>}
          </>
        )}
        <span className="flex-1" />
        <Button size="sm" onClick={() => setShut(shut.size ? new Set() : new Set(slice.map((x) => rowKey(x.fg))))}>{shut.size ? 'Expand all' : 'Collapse all'}</Button>
        <ColumnMenu cols={COLS} groups={GROUPS} visible={visible} onChange={setVisible} defaults={DEFAULTS} store={STORE} />
      </div>
      {fgs.length > AUTO_MAX && missing === items.length && !prog && <p className="text-xs text-muted">{fgs.length} FGs: one SAP split call each, two at a time. Press the button to load them, or narrow the rows with the search first.</p>}
      {!items.length ? <Empty title="No finished goods">Run the selection first, or clear the search.</Empty> : (
        <div className="scroll-thin max-h-[62vh] overflow-auto rounded-2xl border border-line bg-panel shadow-card">
          <table className="w-full border-separate border-spacing-0 text-[13px]">
            <thead><tr className="text-left text-2xs font-extrabold uppercase text-muted">
              {cols.map((c) => <th key={c.key} scope="col" className={cx('sticky top-0 z-10 whitespace-nowrap border-b border-line bg-sunken px-2.5 py-2', c.right && 'text-right')}>{c.label}</th>)}
            </tr></thead>
            <tbody>
              {slice.map(({ fg, split }) => {
                const k = rowKey(fg), closed = shut.has(k);
                const rb = peekRateBasis(fg.Matnr, fg.Werks);
                const sum = { RM: ZERO, PERF: ZERO, PM: ZERO };
                for (const r of split ?? []) sum[bucketOf(r)] = sum[bucketOf(r)].plus(D(r.CostPerpc1));
                const head = { RM: D(fg.RmCost), PERF: D(fg.PerfumeCost), PM: D(fg.PmCost) };
                const tally = split ? SPLIT_BUCKETS.every((b) => head[b].minus(sum[b]).abs().lte(TIE)) : null;
                return [
                  <tr key={k} className="bg-accent/10">
                    <td colSpan={span} className="sticky left-0 border-b border-t border-line px-2.5 py-2">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <button type="button" aria-expanded={!closed} aria-label={closed ? 'Expand' : 'Collapse'} onClick={() => toggleShut(k)} className="text-accent">{closed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</button>
                        <button type="button" onClick={() => onOpen(fg)} className="font-mono text-xs font-bold text-accent hover:underline" title="Open the split of this FG">{fg.Matnr} · {fg.Werks}</button>
                        <span className="font-bold">{fg.Maktx}</span>
                        <span className="text-xs text-muted">Budget <b className="num text-ink">{fmtNum(fg.CostPerpc1, 4, 'X')}</b> / pc</span>
                        {SPLIT_BUCKETS.map((b) => (
                          <span key={b} className="text-xs text-muted" title={`Header B-${BUCKET_LABEL[b]} against the split rows of this group`}>
                            <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: BUCKET_COLOR[b] }} />{BUCKET_LABEL[b]} <b className="num text-ink">{fmtNum(head[b], 4, 'X')}</b>{split && <> / split <b className={cx('num', head[b].minus(sum[b]).abs().gt(TIE) ? 'text-bad' : 'text-ink')}>{fmtNum(sum[b], 4, 'X')}</b></>}
                          </span>
                        ))}
                        {rb && <span className="text-xs text-muted">Selected <b className="num text-ink">{fmtNum(rb.selected, 4, 'X')}</b> · C-Map <b className="num text-ink">{fmtNum(rb.cmap, 4, 'X')}</b></span>}
                        {tally === true && <Pill tone="good">Tallies</Pill>}
                        {tally === false && <Pill tone="warn" title="The header group totals differ from the split rows of the group">Does not tally</Pill>}
                        {!split && <Pill>Split not loaded</Pill>}
                      </div>
                    </td>
                  </tr>,
                  ...(closed || !split ? [] : groupedSplitRows(split).map((r) => {
                    const b = bucketOf(r), comp = rb?.comps.get(r.ItemCode);
                    return (
                      <tr key={`${k}|${r.Rowid}`} style={{ backgroundColor: `${BUCKET_COLOR[b]}14`, boxShadow: `inset 3px 0 0 ${BUCKET_COLOR[b]}` }}>
                        {cols.map((c) => <td key={c.key} className={cx('whitespace-nowrap border-b border-line/60 px-2.5 py-1.5', c.right && 'num text-right')}>{c.cell(r, comp)}</td>)}
                      </tr>
                    );
                  })),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{items.length ? `FG ${cur * PER_PAGE + 1}–${Math.min(items.length, cur * PER_PAGE + PER_PAGE)} of ${items.length}` : 'No rows'}</span>
        <span className="flex items-center gap-1">
          <button type="button" disabled={cur === 0} onClick={() => setPage(cur - 1)} className="rounded-lg border border-line px-2.5 py-1 font-semibold disabled:opacity-40">Previous</button>
          <span className="px-2">Page {cur + 1} / {pages}</span>
          <button type="button" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} className="rounded-lg border border-line px-2.5 py-1 font-semibold disabled:opacity-40">Next</button>
        </span>
      </div>
    </div>
  );
}
