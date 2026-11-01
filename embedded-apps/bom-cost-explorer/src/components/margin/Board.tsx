'use client';
/**
 * Margin Board: per finished good, market and channel, the selling price against the cost of four scenarios (Standard, Actual, Budget, Current) as SAP
 * computed them (CogmRowSet). The browser only presents, sorts, filters and exports: there are no totals or weighted values, only row counts. A scenario
 * SAP does not mark OK is n/a, never 0. Nothing loads before Show (also not from the URL); a live run goes in batches of 25 finished goods with Stop.
 */
import { Fragment, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronDown, ChevronRight, Columns3, FileSpreadsheet, Info, Minus } from 'lucide-react';
import MarginFrame, { usePlantsState } from './MarginFrame';
import MarginSelection, { useMarginSel } from './MarginSelection';
import RowDetail from './board/RowDetail';
import WacMessages from '../wac/WacMessages';
import { Button, Empty, Pill, Spinner, Stat, cx, inputCls } from '../ui';
import { fmtMs, fmtNum } from '@/lib/format';
import { buildMarginFilter } from '@/lib/margin/filter';
import { useElapsed, useMarginRun } from '@/lib/margin/run';
import { toMarginQuery } from '@/lib/margin/selection';
import { SCENARIO_LABEL, type MarginRow, type Scenario } from '@/lib/margin/types';
import { COLUMNS, EROSION_WORD, IMPACT_WORD, NO_FILTERS, SEVERITY_WORD, VARIANCE_WORD, countBy, defaultHidden, directionOf, filterRows, filtersActive, hasAmt, headerGroups, rowKey, rowNote, scenarioCells, severityOf, sortRows, statusWord, varianceCells, type BoardFilters, type ColKey, type Direction, type SortDir } from '@/lib/margin/boardView';
import { downloadBoard } from '@/lib/margin/boardExport';
import { intersectPlants } from '@/lib/wac/view';
import { loadSapConfig } from '@/lib/sap/config';

const th = 'px-2.5 py-1.5 text-left text-2xs font-bold uppercase tracking-wide text-muted whitespace-nowrap';
const td = 'px-2.5 py-1.5 align-top';
const tdN = `${td} num whitespace-nowrap text-right`;
const NA = <span className="text-faint" title="No value from SAP">n/a</span>;
const NA_SC = (s: Scenario) => <span className="text-faint" title={`SAP has no ${SCENARIO_LABEL[s]} cost for this row`}>n/a</span>;
const amt = (v: string, curr: string, dp = 4) => (hasAmt(v) ? <>{fmtNum(v, dp, curr)} <span className="text-2xs text-muted">{curr}</span></> : NA);
const pct = (v: string, dp = 1) => (hasAmt(v) ? `${fmtNum(v, dp, 'X')} %` : null);
const SEV_TONE = { H: 'bad', M: 'warn', L: 'neutral' } as const;
const SEV_MARK = { H: '▲', M: '●', L: '○' } as const;

/** Direction with an icon AND a word (colour is never the only signal). `badWhenUp`: a rise is bad (cost up / loss). */
function Dir({ d, words, children }: { d: Direction; words: Record<Direction, string>; children: React.ReactNode }) {
  const Icon = d === 'up' ? ArrowUpRight : d === 'down' ? ArrowDownRight : Minus;
  const tone = d === 'up' ? 'text-bad' : d === 'down' ? 'text-good' : 'text-muted';
  return <span className="inline-flex flex-col items-end"><span>{children}</span><span className={cx('inline-flex items-center gap-0.5 text-2xs font-semibold', tone)}><Icon size={11} aria-hidden />{words[d]}</span></span>;
}

function Cell({ r, k }: { r: MarginRow; k: ColKey }) {
  const sc = (s: Scenario, f: 'cogm' | 'ratio' | 'remain') => {
    const c = scenarioCells(r, s);
    if (!c.ok) return NA_SC(s);
    const v = c[f];
    if (!hasAmt(v)) return NA;
    return f === 'ratio' ? pct(v) : amt(v, r.Curr);
  };
  switch (k) {
    case 'fg': {
      const note = rowNote(r);
      return (
        <div className="min-w-[14rem]">
          <span className="font-mono font-bold">{r.Matnr}</span> <span className="text-muted">{r.Maktx}</span> <span className="text-2xs text-faint">· {r.Werks}</span>
          {note && <div className={cx('mt-0.5 flex items-start gap-1 text-2xs', r.Status ? 'text-warn' : 'text-muted')}>{r.Status ? <AlertTriangle size={11} className="mt-px shrink-0" aria-hidden /> : <Info size={11} className="mt-px shrink-0" aria-hidden />}<span className="min-w-0 break-words">{note}</span></div>}
        </div>
      );
    }
    case 'market': return <span className="whitespace-nowrap">{r.Market || '—'} <span className="text-faint">/</span> {r.Channel || '—'}</span>;
    case 'mrp': return amt(r.Mrp, r.Curr);
    case 'sp': return <span title={[r.PriceFrom, r.PriceSrc].filter(Boolean).join(' · ') || undefined}>{amt(r.SellPrice, r.Curr)}</span>;
    case 'stdCogm': return sc('STD', 'cogm'); case 'stdRatio': return sc('STD', 'ratio'); case 'stdRemain': return sc('STD', 'remain');
    case 'actCogm': return sc('ACT', 'cogm'); case 'actRatio': return sc('ACT', 'ratio'); case 'actRemain': return sc('ACT', 'remain');
    case 'budCogm': return sc('BUD', 'cogm'); case 'budRatio': return sc('BUD', 'ratio'); case 'budRemain': return sc('BUD', 'remain');
    case 'curCogm': return sc('CUR', 'cogm'); case 'curRatio': return sc('CUR', 'ratio'); case 'curRemain': return sc('CUR', 'remain');
    case 'varStd': case 'varAct': case 'varBud': {
      const v = varianceCells(r, k === 'varStd' ? 'STD' : k === 'varAct' ? 'ACT' : 'BUD');
      if (!hasAmt(v.abs) && !hasAmt(v.pct)) return NA;
      return <Dir d={directionOf(hasAmt(v.pct) ? v.pct : v.abs)} words={VARIANCE_WORD}>{hasAmt(v.abs) ? amt(v.abs, r.Curr) : null} {hasAmt(v.pct) && <span className="text-muted">({pct(v.pct)})</span>}</Dir>;
    }
    case 'erosion': return hasAmt(r.ErosionPct) ? <Dir d={directionOf(r.ErosionPct)} words={EROSION_WORD}>{pct(r.ErosionPct)}</Dir> : NA;
    case 'annual': return hasAmt(r.AnnualImpactInr) ? <Dir d={directionOf(r.AnnualImpactInr)} words={IMPACT_WORD}>{fmtNum(r.AnnualImpactInr, 0, 'INR')} <span className="text-2xs text-muted">INR</span></Dir> : NA;
    case 'reqSp': return amt(r.ReqSpRestore, r.Curr);
    case 'reqMrp': return amt(r.ReqMrpRestore, r.Curr);
    case 'alert': { const s = severityOf(r); return s ? <Pill tone={SEV_TONE[s]} title={r.AlertTxt || undefined}>{SEV_MARK[s]} {SEVERITY_WORD[s]}{r.AlertCnt ? ` · ${r.AlertCnt}` : ''}</Pill> : <span className="text-faint">—</span>; }
    case 'status': return r.Status ? <Pill tone="warn" title={rowNote(r)}>{r.Status} · {statusWord(r.Status)}</Pill> : <Pill tone="good">OK</Pill>;
  }
}

function Screen({ email }: { email: string }) {
  const { state: plantsState, plants } = usePlantsState(true);
  const [sel, patch] = useMarginSel();
  const { state, run, stop, resume, refresh } = useMarginRun('ROW');
  const elapsed = useElapsed(state.running);
  const [errors, setErrors] = useState<Partial<Record<'materials' | 'plants' | 'areas' | 'other', string>>>({});
  const [runAt, setRunAt] = useState<Date | null>(null);
  const [sort, setSort] = useState<{ key: ColKey; dir: SortDir }>({ key: 'annual', dir: 'desc' });
  const [hidden, setHidden] = useState<Set<ColKey>>(defaultHidden);
  const [filters, setFilters] = useState<BoardFilters>(NO_FILTERS);
  const [open, setOpen] = useState<string | null>(null);
  const system = useMemo(() => { if (typeof window === 'undefined') return ''; const c = loadSapConfig(); return c.ok ? c.config.system : ''; }, []);

  const start = () => {
    const e: typeof errors = {};
    const q = toMarginQuery(sel);
    if (sel.source === 'L' && !sel.materials.length && !sel.prodha.trim() && !sel.brand.trim()) e.materials = 'Pick at least one finished good (or a product hierarchy or brand).';
    if (sel.priceSrc === 'O' && !sel.vkorg.length) e.areas = 'Pick at least one sales organisation (load the sales areas first).';
    let plantsOk = sel.plants;
    if (sel.plants.length && plants.length) { plantsOk = intersectPlants(sel.plants, plants.map((p) => p.Werks)); if (!plantsOk.length) e.plants = 'None of these plants is available to you in SAP.'; }
    if (!Object.keys(e).length) { try { buildMarginFilter({ ...q, materials: q.materials?.slice(0, 25) }, 'ROW'); } catch (err) { e.other = (err as Error).message; } }
    setErrors(e);
    if (Object.keys(e).length) return;
    setRunAt(new Date()); setOpen(null); setFilters(NO_FILTERS);
    run({ ...q, plants: plantsOk });
  };

  const all = state.q ? state.rows : null;
  const shown = useMemo(() => (all ? sortRows(filterRows(all, filters), sort.key, sort.dir) : []), [all, filters, sort]);
  const counts = useMemo(() => countBy(all ?? []), [all]);
  const visible = useMemo(() => COLUMNS.filter((c) => c.key === 'fg' || !hidden.has(c.key)), [hidden]);
  const groups = useMemo(() => headerGroups(visible), [visible]);
  const onSort = (key: ColKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));
  const incomplete = !state.running && state.total > 0 && state.doneCount < state.total;

  const doExport = async () => {
    if (!state.q || !all) return;
    const q = state.q;
    await downloadBoard(shown, [
      ['Report', 'Margin board: selling price against Standard, Actual, Budget and Current cost, as SAP computed them (per selling unit)'], ['SAP system', system], ['Run at', runAt?.toLocaleString('en-IN') ?? ''],
      ['Finished goods', q.materials?.length ? q.materials.join(', ') : 'by hierarchy / brand / plant'], ['Plants', (q.plants ?? []).join(', ') || 'all'],
      ['Price source', q.priceSrc === 'O' ? `Latest sales order (sales org ${(q.vkorg ?? []).join(', ') || 'all'}, ${q.soDays ?? ''} days)` : `Uploaded prices${q.market ? `, market ${q.market}` : ''}${q.channel ? `, channel ${q.channel}` : ''}`],
      ['Data', q.source === 'S' ? 'Snapshot' : 'Live'], ['Freight', q.inclFrt ? 'included' : 'not included'], ['Price date', q.priceDate || 'today'],
      ['Rows exported', String(shown.length)], ['Rows loaded', String(all.length)], ['Note', 'n/a = SAP has no value for that scenario. Positive variance / erosion = cost up / remaining amount down; positive annual impact = loss, negative = saving.'],
    ]);
  };

  return (
    <>
      <MarginSelection sel={sel} onChange={patch} plantsState={plantsState} email={email} errors={errors} running={state.running} elapsed={elapsed} onRun={start} onStop={stop} onRefresh={refresh} canRefresh={!!state.q} />

      {state.q && state.total > 1 && (
        <div className="flex flex-col gap-1" aria-live="polite">
          <div className="flex items-center justify-between text-xs text-muted"><span>{state.running ? 'Costing batch' : 'Batches'} <b>{Math.min(state.doneCount + (state.running ? 1 : 0), state.total)}</b> of {state.total} (25 finished goods each)</span><span>{state.doneCount} done</span></div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={state.total} aria-valuenow={state.doneCount} aria-label="Live batches done"><div className="h-full bg-accent transition-all" style={{ width: `${(state.doneCount / state.total) * 100}%` }} /></div>
        </div>
      )}
      {state.running && state.doneCount === 0 && <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> {sel.source === 'L' ? 'Live costing in SAP' : 'Reading the snapshot'}… {fmtMs(elapsed)}</p>}
      {state.stopped && !state.running && <p className="text-sm text-muted">The run was stopped. What was loaded is shown.</p>}
      {(incomplete || (state.error && !state.running)) && state.q && <div className="flex items-center gap-2 text-sm"><span className="text-muted">{state.doneCount} of {state.total} batches loaded.</span><Button size="sm" onClick={resume}>Continue the remaining batches</Button></div>}
      <WacMessages messages={state.messages} error={state.error} />

      {all && all.length === 0 && !state.running && !state.error && <Empty title="SAP returned no rows">Check the selection (plants, market, channel, sales area) or the SAP messages above.</Empty>}
      {all && all.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <Stat label="Rows" value={all.length} sub={shown.length !== all.length ? `${shown.length} shown` : undefined} />
            <Stat label="High alerts" value={counts.high} tone={counts.high ? 'bad' : undefined} sub="rows with a High alert" />
            <Stat label="Medium alerts" value={counts.medium} tone={counts.medium ? 'warn' : undefined} sub="rows with a Medium alert" />
            <Stat label="No price" value={counts.noPrice} tone={counts.noPrice ? 'warn' : undefined} sub="Status P" />
            <Stat label="No standard cost" value={counts.noStd} tone={counts.noStd ? 'warn' : undefined} sub="Status S" />
            <Stat label="No current cost" value={counts.noCur} tone={counts.noCur ? 'warn' : undefined} sub="Status C" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input className={cx(inputCls, 'w-64')} placeholder="Search finished good, plant, market…" aria-label="Search rows" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
            <label className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-muted">Alert
              <select className="rounded-lg border border-line bg-panel px-2 py-1 text-sm normal-case" value={filters.severity} onChange={(e) => setFilters({ ...filters, severity: e.target.value as BoardFilters['severity'] })}>
                <option value="all">All</option><option value="H">High</option><option value="M">Medium</option><option value="L">Low</option><option value="none">No alert</option>
              </select>
            </label>
            <label className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-muted">Status
              <select className="rounded-lg border border-line bg-panel px-2 py-1 text-sm normal-case" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as BoardFilters['status'] })}>
                <option value="all">All</option><option value="ok">OK</option><option value="P">No price</option><option value="S">No standard cost</option><option value="C">No current cost</option>
              </select>
            </label>
            {filtersActive(filters) && <Button size="sm" variant="ghost" onClick={() => setFilters(NO_FILTERS)}>Clear filters</Button>}
            <details className="relative">
              <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-xs font-semibold hover:bg-sunken"><Columns3 size={14} aria-hidden /> Columns</summary>
              <div className="absolute z-20 mt-1 max-h-80 w-64 overflow-auto rounded-xl border border-line bg-panel p-2 shadow-pop">
                {COLUMNS.filter((c) => c.key !== 'fg').map((c) => (
                  <label key={c.key} className="flex items-center gap-2 px-2 py-1 text-sm"><input type="checkbox" checked={!hidden.has(c.key)} onChange={() => setHidden((s) => { const n = new Set(s); if (n.has(c.key)) n.delete(c.key); else n.add(c.key); return n; })} /> <span className="text-2xs text-faint">{c.group}</span> {c.label}</label>
                ))}
              </div>
            </details>
            <Button size="sm" onClick={() => void doExport()} disabled={!shown.length} title="Excel: every shown row with all SAP fields, and the parameters of the run"><FileSpreadsheet size={14} /> Excel</Button>
            <span className="ml-auto text-xs text-faint">{shown.length} row{shown.length === 1 ? '' : 's'} · click a row (or press Enter) for the cost split, component price effects, alerts and history</span>
          </div>
          <p className="text-xs text-muted">Amounts are per selling unit in the price currency. <b>Amount remaining</b> = amount remaining after manufacturing cost. Positive variance / erosion = cost up / remaining amount down; positive annual impact = a loss, negative = a saving. n/a = SAP has no value for that scenario.</p>

          {shown.length === 0 ? <Empty title="No row matches the filters">Clear the filters to see all {all.length} rows.</Empty> : (
            <div className="overflow-x-auto rounded-2xl border border-line bg-panel shadow-card">
              <table className="w-full text-sm">
                <thead className="bg-sunken">
                  <tr><th className="w-6" />{groups.map((g) => <th key={g.group} colSpan={g.span} className="border-l border-line/60 px-2.5 py-1 text-center text-2xs font-extrabold uppercase tracking-wide text-ink">{g.group}</th>)}</tr>
                  <tr>
                    <th />
                    {visible.map((c) => (
                      <th key={c.key} scope="col" aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={cx(th, c.numeric && 'text-right')}>
                        <button type="button" className="inline-flex items-center gap-1 font-bold uppercase tracking-wide hover:text-ink" onClick={() => onSort(c.key)}>{c.label}{sort.key === c.key ? <span aria-hidden>{sort.dir === 'asc' ? '▲' : '▼'}</span> : null}</button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const k = rowKey(r);
                    const isOpen = open === k;
                    return (
                      <Fragment key={k}>
                        <tr tabIndex={0} aria-expanded={isOpen} className={cx('cursor-pointer border-t border-line/60 hover:bg-sunken focus:bg-sunken focus:outline-none', isOpen && 'bg-sunken/60')} onClick={() => setOpen(isOpen ? null : k)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(isOpen ? null : k); } }}>
                          <td className="px-1 py-1.5 text-faint" aria-hidden>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                          {visible.map((c) => <td key={c.key} className={c.numeric ? tdN : td}><Cell r={r} k={c.key} /></td>)}
                        </tr>
                        {isOpen && state.q && <tr className="border-t border-line/60 bg-sunken/30"><td colSpan={visible.length + 1} className="px-4 py-3" onClick={(e) => e.stopPropagation()}><RowDetail q={state.q} r={r} /></td></tr>}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {!state.q && <Empty title="Nothing loaded yet">Pick the finished goods, the plants and the price source, then press Show.</Empty>}
    </>
  );
}

export default function Board() {
  return (
    <MarginFrame active="margin" title="Margin board" subtitle="Selling price against Standard, Actual, Budget and Current cost, as SAP computed them. Amount remaining after manufacturing cost; no totals are calculated here.">
      {({ email }) => <Screen email={email} />}
    </MarginFrame>
  );
}
