'use client';
/**
 * "Rate sources" tab of the BOM costing page: every rate option SAP has for the leaf components, one block
 * per source in the report's colours, the option SAP used in bold, the cheapest marked, and Used vs
 * Cheapest with the saving. Options load lazily (lib/rates) the first time this tab opens.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FileSpreadsheet, RefreshCw } from 'lucide-react';
import type { CostLine } from '@/lib/sap/fields';
import type { CostQuery } from '@/lib/query/schema';
import type { RatesState } from '@/lib/rates/useRateOptions';
import { buildSourcesModel, type SourceOptionRow } from '@/lib/rates/sources';
import { exportTable, type XCol } from '@/lib/client/export';
import { fmtDate, fmtNum, fmtQty, fmtRate, fmtSigned } from '@/lib/format';
import { Button, cx, Segmented, SimTag, Skeleton, SourceBadge, sourceColorVar } from '../ui';
import { ALL_RATE_SOURCES, prioLabel } from '@/lib/rates/priority';
import { ratesIntegrity } from '@/lib/rates/integrity';
import IntegrityBanner from './IntegrityBanner';
import { hasFreightColumns, rateWithFreight } from '@/lib/rates/withFreight';
import RateCompare from './RateCompare';

type ColSet = 'compact' | 'report' | 'local';

interface Col {
  id: string;
  label: string;
  width: number;
  right?: boolean;
  cell: (r: SourceOptionRow) => React.ReactNode;
  xlsx: XCol;
}

const COLS: Col[] = [
  { id: 'comp', label: 'Component', width: 120, cell: (r) => <span className="font-mono text-xs">{r.line.Idnrk}</span>, xlsx: { header: 'Component', get: () => '' } },
  { id: 'desc', label: 'Description', width: 220, cell: (r) => <span className="truncate" title={r.line.Maktx}>{r.line.Maktx}</span>, xlsx: { header: 'Description', width: 34, get: () => '' } },
  { id: 'plant', label: 'Plant', width: 64, cell: (r) => r.opt.Plant || r.line.Werks, xlsx: { header: 'Plant', get: () => '' } },
  { id: 'cond', label: 'Cond', width: 64, cell: (r) => r.opt.Cond, xlsx: { header: 'Cond', get: () => '' } },
  { id: 'curr', label: 'Curr', width: 56, cell: (r) => r.opt.Curr, xlsx: { header: 'Curr', get: () => '' } },
  { id: 'rate', label: 'Rate', width: 110, right: true, cell: (r) => <span className="num">{fmtRate(r.opt.Rate)}</span>, xlsx: { header: 'Rate', dp: 4, get: () => 0 } },
  { id: 'uom', label: 'UoM', width: 56, cell: (r) => r.opt.Uom, xlsx: { header: 'UoM', get: () => '' } },
  { id: 'valid', label: 'Valid from', width: 96, cell: (r) => fmtDate(r.opt.ValidFrom), xlsx: { header: 'Valid from', get: () => '' } },
  { id: 'ratePc', label: 'Rate / pc', width: 110, right: true, cell: (r) => <span className="num">{fmtRate(r.opt.RatePc)}</span>, xlsx: { header: 'Rate / pc', dp: 4, get: () => 0 } },
  { id: 'fx', label: 'FX → INR', width: 96, right: true, cell: (r) => <span className="num text-muted">{fmtNum(r.opt.FxInr, 5, 'X')}</span>, xlsx: { header: 'FX to INR', dp: 6, get: () => 0 } },
  { id: 'ratePcInr', label: 'Rate / pc INR', width: 120, right: true, cell: (r) => <span className="num">{fmtRate(r.opt.RatePcInr)}</span>, xlsx: { header: 'Rate / pc INR', dp: 4, curr: 'INR', get: () => 0 } },
  { id: 'qty', label: 'Qty', width: 110, right: true, cell: (r) => <span className="num">{fmtQty(r.line.ProdQty)} <span className="text-2xs text-faint">{r.line.Meins}</span></span>, xlsx: { header: 'Qty', dp: 3, get: () => 0 } },
  { id: 'frtInr', label: 'Freight / pc INR', width: 120, right: true, cell: (r) => <span className="num text-muted">{fmtRate(r.line.FrtPcInr)}</span>, xlsx: { header: 'Freight / pc INR', dp: 4, curr: 'INR', get: () => 0 } },
  { id: 'totInr', label: 'Total INR', width: 130, right: true, cell: (r) => <span className="num">{fmtNum(r.total, 2)}</span>, xlsx: { header: 'Total INR', dp: 2, curr: 'INR', get: () => 0 } },
  { id: 'locCurr', label: 'Local curr', width: 76, cell: (r) => r.opt.LocCurr || r.line.LocCurr, xlsx: { header: 'Local curr', get: () => '' } },
  { id: 'ratePcLoc', label: 'Rate / pc local', width: 120, right: true, cell: (r) => <span className="num">{fmtRate(r.opt.RatePcLoc)}</span>, xlsx: { header: 'Rate / pc local', dp: 4, get: () => 0 } },
  { id: 'costLoc', label: 'Cost local', width: 120, right: true, cell: (r) => <span className="num">{fmtNum(r.opt.CostLoc, 2)}</span>, xlsx: { header: 'Cost local', dp: 2, get: () => 0 } },
  { id: 'frtLoc', label: 'Freight / pc local', width: 124, right: true, cell: (r) => <span className="num text-muted">{fmtRate(r.line.FrtPcLoc)}</span>, xlsx: { header: 'Freight / pc local', dp: 4, get: () => 0 } },
  { id: 'totLoc', label: 'Total local', width: 130, right: true, cell: (r) => <span className="num">{fmtNum(r.totalLoc, 2)}</span>, xlsx: { header: 'Total local', dp: 2, get: () => 0 } },
];

/** Contract and Info record blocks only: rate + the line's freight per piece, local and INR. */
const FRT_COLS: Col[] = [
  { id: 'rfLoc', label: 'Rate + freight / pc local', width: 150, right: true, cell: (r) => { const w = rateWithFreight(r.opt, r.line); return w?.loc ? <span className="num">{fmtRate(w.loc)} <span className="text-2xs text-faint">{w.locCurr}</span></span> : '—'; }, xlsx: { header: 'Rate + freight / pc local', dp: 4, get: () => 0 } },
  { id: 'rfInr', label: 'Rate + freight / pc INR', width: 150, right: true, cell: (r) => { const w = rateWithFreight(r.opt, r.line); return w ? <span className="num">{fmtRate(w.inr)}</span> : '—'; }, xlsx: { header: 'Rate + freight / pc INR', dp: 4, curr: 'INR', get: () => 0 } },
];

const SETS: Record<ColSet, string[]> = {
  compact: ['comp', 'desc', 'plant', 'ratePcInr', 'qty', 'totInr'],
  report: ['comp', 'desc', 'plant', 'cond', 'curr', 'rate', 'uom', 'valid', 'ratePc', 'fx', 'ratePcInr', 'qty', 'frtInr', 'totInr'],
  local: ['comp', 'desc', 'plant', 'locCurr', 'ratePcLoc', 'qty', 'costLoc', 'frtLoc', 'totLoc'],
};

type Item = { kind: 'block'; source: string; lines: number; total: string } | { kind: 'head'; source: string } | { kind: 'row'; row: SourceOptionRow } | { kind: 'empty'; source: string };

const ROW_H = 30;

export default function RateSources({ rows, rates, query, onOpenRow, prio }: { rows: CostLine[]; rates: RatesState; query: CostQuery; onOpenRow?: (i: number) => void; /** priority of the run (for "none" cells and the label); default = query.prio */ prio?: string[] }) {
  const [set, setSet] = useState<ColSet>('compact');
  const [view, setView] = useState<'blocks' | 'compare'>('blocks');
  const runPrio = prio ?? query.prio ?? [];
  const { request } = rates;
  useEffect(() => { request(); }, [request]);

  const model = useMemo(() => (rates.status === 'ready' ? buildSourcesModel(rows) : null), [rates.status, rows]);
  const cols = useMemo(() => SETS[set].map((id) => COLS.find((c) => c.id === id)!), [set]);
  const colsFor = (source: string) => (hasFreightColumns(source) ? [...cols, ...FRT_COLS] : cols);
  const items = useMemo<Item[]>(() => {
    if (!model) return [];
    const out: Item[] = [];
    // All five sources always (an empty block = no rate from that source, not an error), then any other.
    const bySource = new Map(model.blocks.map((b) => [b.source, b]));
    const order = [...ALL_RATE_SOURCES, ...model.blocks.map((b) => b.source).filter((x) => !ALL_RATE_SOURCES.includes(x))];
    for (const src of order) {
      const b = bySource.get(src);
      if (!b) { out.push({ kind: 'block', source: src, lines: 0, total: '' }, { kind: 'empty', source: src }); continue; }
      out.push({ kind: 'block', source: b.source, lines: b.lines, total: fmtNum(b.total, 2) }, { kind: 'head', source: b.source });
      for (const r of b.rows) out.push({ kind: 'row', row: r });
    }
    return out;
  }, [model]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: items.length, getScrollElement: () => scrollRef.current, estimateSize: (i) => (items[i]?.kind === 'block' ? 40 : ROW_H), overscan: 20 });

  const srcCounts = useMemo(() => rows.filter((r) => !r.HasChild?.trim()).map((r) => r.SrcCount || 0), [rows]);
  const integrity = useMemo(() => (rates.status === 'ready' ? ratesIntegrity(rows.filter((r) => !r.HasChild?.trim())) : null), [rates.status, rows]);

  if (rates.status === 'idle' || rates.status === 'loading') {
    return <div className="p-4"><p className="mb-3 text-sm text-muted">Loading rate options from SAP…</p><Skeleton rows={10} /></div>;
  }
  if (rates.status === 'unavailable' || rates.status === 'error') {
    const multi = srcCounts.filter((n) => n > 1).length;
    return (
      <div className="p-5">
        <div className="max-w-2xl rounded-xl border border-line bg-sunken/60 px-4 py-3 text-sm text-ink" role="note">
          <p className="font-semibold">{rates.status === 'unavailable' ? 'Rate options are not available from SAP for this system' : 'Rate options could not be loaded right now'}</p>
          <p className="mt-1 text-muted">
            {rates.status === 'unavailable'
              ? `The costing and SAP's selected rate are complete. SAP reports ${multi.toLocaleString('en-IN')} component(s) with more than one rate source (see "n sources" on each line).`
              : rates.note}
          </p>
          <button type="button" onClick={rates.retest} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline">
            <RefreshCw size={12} /> Re-test
          </button>
        </div>
      </div>
    );
  }
  if (!model) return null;

  const doExport = () => {
    const flat = model.blocks.flatMap((b) => b.rows);
    const val = (r: SourceOptionRow, id: string): string | number => {
      const n = (x: unknown) => Number(x ?? 0);
      switch (id) {
        case 'comp': return r.line.Idnrk;
        case 'desc': return r.line.Maktx;
        case 'plant': return r.opt.Plant || r.line.Werks;
        case 'cond': return r.opt.Cond;
        case 'curr': return r.opt.Curr;
        case 'rate': return n(r.opt.Rate);
        case 'uom': return r.opt.Uom;
        case 'valid': return r.opt.ValidFrom ?? '';
        case 'ratePc': return n(r.opt.RatePc);
        case 'fx': return n(r.opt.FxInr);
        case 'ratePcInr': return n(r.opt.RatePcInr);
        case 'qty': return n(r.line.ProdQty);
        case 'frtInr': return n(r.line.FrtPcInr);
        case 'totInr': return Number(r.total.toFixed(2));
        case 'locCurr': return r.opt.LocCurr || r.line.LocCurr;
        case 'ratePcLoc': return n(r.opt.RatePcLoc);
        case 'costLoc': return n(r.opt.CostLoc);
        case 'frtLoc': return n(r.line.FrtPcLoc);
        case 'totLoc': return Number(r.totalLoc.toFixed(2));
        case 'rfLoc': { const w = rateWithFreight(r.opt, r.line); return w?.loc ? Number(w.loc.toFixed(4)) : ''; }
        case 'rfInr': { const w = rateWithFreight(r.opt, r.line); return w ? Number(w.inr.toFixed(4)) : ''; }
        default: return '';
      }
    };
    const xcols: XCol[] = [
      { header: 'Source', get: (i) => flat[i].opt.Source },
      { header: 'Header', get: (i) => flat[i].line.Headmat },
      ...SETS.report.concat(['locCurr', 'ratePcLoc', 'costLoc', 'frtLoc', 'totLoc']).map((id) => ({ ...COLS.find((c) => c.id === id)!.xlsx, get: (i: number) => val(flat[i], id) })),
      ...FRT_COLS.map((c) => ({ ...c.xlsx, get: (i: number) => val(flat[i], c.id) })),
      { header: 'Used by SAP', get: (i) => (flat[i].used ? 'X' : '') },
      { header: 'Cheapest', get: (i) => (flat[i].cheapest ? 'X' : '') },
    ];
    void exportTable({
      fmt: 'xlsx', name: 'Rate sources', query, cols: xcols, count: flat.length,
      extraParams: [['Rate options from', rates.mode === 'direct' ? 'RateOptionSet' : 'CostLineSet $expand=RateOptions'], ['Used total INR', model.usedTotal.toFixed(2)], ['Cheapest total INR', model.cheapestTotal.toFixed(2)], ['Saving INR', model.saving.toFixed(2)]],
    });
  };

  const width = [...cols, ...FRT_COLS].reduce((n, c) => n + c.width, 0) + 120;
  return (
    <div className="flex h-full flex-col">
      <IntegrityBanner integrity={integrity} className="mx-3 mt-2" />
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2">
        <Summary label="Used (SAP)" value={fmtNum(model.usedTotal, 2)} />
        <Summary label="Cheapest" value={fmtNum(model.cheapestTotal, 2)} sim />
        <Summary label="Saving" value={fmtSigned(model.saving, 2)} tone={model.saving.gt(0) ? 'good' : undefined} />
        <span className="text-xs text-muted">
          Priority: <b className="text-ink">{prioLabel(runPrio)}</b> ·{' '}
          {model.linesWithOptions.toLocaleString('en-IN')} of {model.leafLines.toLocaleString('en-IN')} leaf components have options
          {model.noRateLines ? ` · ${model.noRateLines} without a rate (freight only)` : ''}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Segmented<'blocks' | 'compare'> size="sm" label="Rate sources view" value={view} onChange={setView} options={[{ value: 'blocks', label: 'By source' }, { value: 'compare', label: 'Compare' }]} />
          {view === 'blocks' && <Segmented<ColSet> size="sm" label="Columns" value={set} onChange={setSet} options={[{ value: 'compact', label: 'Compact' }, { value: 'report', label: 'Report' }, { value: 'local', label: 'Local currency' }]} />}
          <Button size="sm" onClick={doExport} title="Excel: every option, all columns"><FileSpreadsheet size={14} /> Excel</Button>
        </div>
      </div>
      {view === 'compare' ? <div className="min-h-0 flex-1"><RateCompare rows={rows} prio={runPrio} onOpenRow={onOpenRow} /></div> : (
      <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-auto">
        <div style={{ height: v.getTotalSize(), width, position: 'relative' }}>
          {v.getVirtualItems().map((vi) => {
            const it = items[vi.index];
            const style = { position: 'absolute' as const, top: 0, left: 0, width: '100%', height: vi.size, transform: `translateY(${vi.start}px)` };
            if (it.kind === 'block') {
              return (
                <div key={vi.key} style={{ ...style, borderLeft: `4px solid ${sourceColorVar(it.source)}`, background: `color-mix(in srgb, ${sourceColorVar(it.source)} 10%, transparent)` }} className="flex items-center gap-3 px-3 text-sm">
                  <SourceBadge source={it.source} />
                  <span className="text-muted">{it.lines.toLocaleString('en-IN')} component(s)</span>
                  {!runPrio.includes(it.source) && <span className="text-2xs text-faint">not in priority</span>}
                  {it.total && <span className="ml-auto font-semibold"><span className="text-2xs text-faint">best of source, total </span><span className="num">{it.total}</span> <span className="text-2xs text-faint">INR</span></span>}
                </div>
              );
            }
            if (it.kind === 'empty') {
              return <div key={vi.key} style={style} className="flex items-center px-4 text-xs text-faint">No rate from {it.source} for these components{runPrio.includes(it.source) ? ' (in the priority: shown as "none" in Compare)' : ''}.</div>;
            }
            if (it.kind === 'head') {
              return (
                <div key={vi.key} style={style} className="flex items-center bg-sunken text-2xs font-bold uppercase tracking-wide text-muted">
                  {colsFor(it.source).map((c) => <div key={c.id} style={{ width: c.width }} className={cx('px-2', c.right && 'text-right')}>{c.label}</div>)}
                  <div className="w-[120px] px-2">Mark</div>
                </div>
              );
            }
            const r = it.row;
            return (
              <div
                key={vi.key}
                style={style}
                className={cx('flex cursor-pointer items-center border-t border-line text-[13px] hover:bg-sunken/70', r.used && 'font-bold')}
                onClick={() => onOpenRow?.(r.lineIdx)}
                title={r.used ? 'Rate SAP used for this component' : undefined}
              >
                {colsFor(r.opt.Source).map((c) => <div key={c.id} style={{ width: c.width }} className={cx('truncate px-2', c.right && 'text-right')}>{c.cell(r)}</div>)}
                <div className="flex w-[120px] gap-1 px-2 text-2xs">
                  {r.used && <span className="rounded bg-accent/10 px-1.5 py-px font-bold text-accent">USED</span>}
                  {r.cheapest && <span className="rounded bg-good/15 px-1.5 py-px font-bold text-good">CHEAPEST</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}

function Summary({ label, value, tone, sim }: { label: string; value: string; tone?: 'good'; sim?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-3 py-1.5">
      <div className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-faint">{label}{sim && <SimTag />}</div>
      <div className={cx('num text-sm font-extrabold', tone === 'good' && 'text-good')}>{value} <span className="text-2xs font-semibold text-muted">INR</span></div>
    </div>
  );
}
