'use client';
/**
 * Expanded row of the main table: three lazy sub-views, each with its own loading, error and (when the comparison switch was
 * off) "Run live comparison" state. Comparison and Components run SAP's live costing, so they start only when this row's tab
 * is opened (and, with the switch off, only after the button). Documents is a plain database read and starts when opened.
 */
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Play, RefreshCw } from 'lucide-react';
import { Button, Spinner, Tabs, cx, inputCls } from '../ui';
import { useChartTheme } from '../charts';
import VarCell from './VarCell';
import { PriceBlank, PriceCells, PriceHeads, PriceScope, PriceStrip } from '../price-context/slots';
import { fmtDate, fmtNum, fmtQty } from '@/lib/format';
import type { WacEntry } from '@/lib/wac/cache';
import type { WacFilterInput } from '@/lib/wac/filter';
import { useWacCompare, useWacComponents, useWacDocuments } from '@/lib/wac/useWac';
import { GROUP_LABEL, dec, sortComponents } from '@/lib/wac/view';
import type { WacCompRow, WacCompareRow, WacDocRow, WacRow, WacSource } from '@/lib/wac/types';

type Tab = 'comparison' | 'components' | 'documents';
const inr = (v: string, dp = 4) => (dec(v) === null ? '—' : fmtNum(v, dp, 'INR'));
const th = 'px-2.5 py-1.5 text-left text-2xs font-bold uppercase tracking-wide text-muted';
const thN = `${th} text-right`;
const td = 'px-2.5 py-1.5 align-top';
const tdN = `${td} num whitespace-nowrap text-right`;
const SRC_LABEL: Record<WacSource, string> = { SEL: 'Selected', CMAP: 'C-MAP', CON: 'Consumption', AVG: 'Average' };

function State<T>({ entry, onRetry, what }: { entry: WacEntry<T> | undefined; onRetry: () => void; what: string }) {
  if (!entry || entry.status === 'loading') return <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Loading {what} from SAP… this can take a while for the live costing; use Stop in the toolbar to cancel.</p>;
  if (entry.status === 'cancelled') return <p className="text-sm text-muted">Cancelled. <button type="button" className="font-semibold text-accent underline" onClick={onRetry}>Load again</button></p>;
  if (entry.status === 'error') {
    return (
      <div role="alert" className="flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/[0.06] px-3 py-2 text-sm">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-bad" aria-hidden /><span className="min-w-0 break-words">{entry.error}</span>
        <Button size="sm" variant="ghost" onClick={onRetry} className="ml-auto shrink-0"><RefreshCw size={13} /> Retry</Button>
      </div>
    );
  }
  return null;
}

function RunButton({ onRun, label }: { onRun: () => void; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" onClick={onRun}><Play size={13} /> {label}</Button>
      <span className="text-xs text-faint">Live costing: about 10-15 s per 25 finished goods. Source costs use today&apos;s rates and the current BOM.</span>
    </div>
  );
}

/* ------------------------------ Comparison ------------------------------ */
const SRC_ORDER: WacSource[] = ['SEL', 'CMAP', 'CON', 'AVG'];
const GRP_ORDER = ['RM', 'PM', 'PERF', 'MAT'];

function Comparison({ rows, matnr, plant }: { rows: WacCompareRow[]; matnr: string; plant: string }) {
  const t = useChartTheme();
  const groups = GRP_ORDER.filter((g) => rows.some((r) => r.Grp === g));
  const sources = SRC_ORDER.filter((s) => rows.some((r) => r.Src === s));
  const cell = (g: string, s: WacSource) => rows.find((r) => r.Grp === g && r.Src === s);
  const actual = (g: string) => rows.find((r) => r.Grp === g)?.ActPu ?? '';
  if (!rows.length) return <p className="text-sm text-muted">SAP has no rate in any source for this finished good, so there is nothing to compare.</p>;

  const num = (v: string) => { const d = dec(v); return d ? Number(d.toFixed(6)) : 0; };
  const parts: { key: string; label: string; color: string }[] = [{ key: 'RM', label: 'RM', color: t.series }, { key: 'PM', label: 'PM', color: '#0e9fb5' }, { key: 'PERF', label: 'Perfume', color: '#eda100' }];
  const chart = [{ name: 'Actual', ...Object.fromEntries(parts.map((p) => [p.key, num(actual(p.key))])) },
    ...sources.map((s) => ({ name: SRC_LABEL[s], ...Object.fromEntries(parts.map((p) => [p.key, num(cell(p.key, s)?.SrcPu ?? '')])) }))];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr><th className={th}>Group</th><th className={thN}>Actual / unit</th>{sources.map((s) => <th key={s} className={thN}>{SRC_LABEL[s]}</th>)}<PriceHeads className={thN} /></tr></thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g} className={cx('border-t border-line/60', g === 'MAT' && 'bg-sunken/50 font-semibold')}>
                <td className={td}>{GROUP_LABEL[g]}</td>
                <td className={tdN}>{inr(actual(g))}</td>
                {sources.map((s) => {
                  const c = cell(g, s);
                  if (!c) return <td key={s} className={cx(tdN, 'text-faint')} title="No rate in this source for this group">—</td>;
                  const low = (dec(c.CoverPct)?.lt(100) ?? false);
                  return (
                    <td key={s} className={tdN}>
                      <div>{inr(c.SrcPu)}</div>
                      <VarCell value={c.VarPct} flag={c.Flag} dir={c.Dir} />
                      <div className={cx('text-2xs', low ? 'text-warn' : 'text-faint')} title={low ? `Only ${c.NRated} of ${c.NComp} components have a rate in this source; the rest use the selected rate.` : undefined}>
                        {c.NRated} of {c.NComp} rated ({dec(c.CoverPct)?.toFixed(0) ?? '—'} %){low && <span className="sr-only"> low coverage</span>}
                      </div>
                      {low && <div className="max-w-[190px] whitespace-normal text-left text-2xs text-warn">Only {c.NRated} of {c.NComp} components have a rate in this source; the rest use the selected rate.</div>}
                    </td>
                  );
                })}
                {g === 'MAT' ? <PriceCells matnr={matnr} plant={plant} className={tdN} costCurr="INR" costValue={actual(g)} /> : <PriceBlank className={tdN} />}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1.5 text-2xs text-faint">+ actual is above the source, − below. Source costs use today&apos;s rates and the current BOM; actual uses the documents of the period.</p>
      </div>
      <div className="h-64 min-w-0" role="img" aria-label="Stacked bar chart of RM, PM and Perfume cost per unit: actual and each rate source">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={t.grid} />
            <XAxis dataKey="name" tick={{ fill: t.axis, fontSize: 11 }} />
            <YAxis tick={{ fill: t.axis, fontSize: 11 }} width={46} />
            <Tooltip formatter={(v) => fmtNum(Number(v ?? 0), 4, 'INR')} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {parts.map((p) => <Bar key={p.key} dataKey={p.key} name={p.label} stackId="u" fill={p.color} isAnimationActive={false} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ------------------------------ Components ------------------------------ */
function Components({ rows }: { rows: WacCompRow[] }) {
  const [grp, setGrp] = useState<Set<string>>(new Set(['RM', 'PM', 'PERF']));
  const [q, setQ] = useState('');
  const sorted = useMemo(() => sortComponents(rows), [rows]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return sorted.filter((c) => grp.has(c.Grp) && (!s || c.Idnrk.toLowerCase().includes(s) || c.CompTxt.toLowerCase().includes(s)));
  }, [sorted, grp, q]);
  // Hide a source whose rates are all zero/empty (the average dataset before it is loaded).
  const has = (k: 'Cmap' | 'Con' | 'Avg') => rows.some((r) => !(dec(r[`Rate${k}` as 'RateCmap'])?.isZero() ?? true));
  const showCmap = has('Cmap'), showCon = has('Con'), showAvg = has('Avg');
  const toggle = (g: string) => setGrp((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  if (!rows.length) return <p className="text-sm text-muted">SAP returned no components for this finished good.</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {(['RM', 'PM', 'PERF'] as const).map((g) => (
          <button key={g} type="button" aria-pressed={grp.has(g)} onClick={() => toggle(g)} className={cx('rounded-full border px-3 py-1 text-xs font-bold', grp.has(g) ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted')}>{GROUP_LABEL[g]}</button>
        ))}
        <input aria-label="Search components" className={cx(inputCls, 'w-56')} placeholder="Search component…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-xs text-faint">{shown.length} of {rows.length} components, largest variance first. Variances are against the selected rate.</span>
      </div>
      <div className="max-h-[420px] overflow-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-sunken"><tr>
            <th className={th}>Component</th><th className={th}>Group</th><th className={th}>Type</th><th className={th}>Source used</th><th className={th}>Uom</th><th className={thN}>Qty / unit</th>
            <th className={thN}>Selected rate</th>{showCmap && <th className={thN}>C-MAP rate</th>}{showCon && <th className={thN}>Consumption rate</th>}{showAvg && <th className={thN}>Average rate</th>}
            {showCmap && <th className={thN}>C-MAP var</th>}{showCon && <th className={thN}>Consumption var</th>}{showAvg && <th className={thN}>Average var</th>}
          </tr></thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.Rowid} className="border-t border-line/60">
                <td className={td}><span className="font-mono font-bold text-accent">{c.Idnrk}</span> <span className="text-muted">{c.CompTxt}</span></td>
                <td className={td}>{GROUP_LABEL[c.Grp]}</td><td className={td}>{c.Mtart}</td><td className={td}>{c.SrcSel || '—'}</td><td className={td}>{c.Uom}</td>
                <td className={tdN}>{fmtNum(c.QtyPu, 4, 'X')}</td>
                <td className={tdN}>{inr(c.RateSel, 6)}</td>{showCmap && <td className={tdN}>{inr(c.RateCmap, 6)}</td>}{showCon && <td className={tdN}>{inr(c.RateCon, 6)}</td>}{showAvg && <td className={tdN}>{inr(c.RateAvg, 6)}</td>}
                {showCmap && <td className={tdN}><VarCell value={c.VarpCmap} flag={c.Flag} /></td>}{showCon && <td className={tdN}><VarCell value={c.VarpCon} flag={c.Flag} /></td>}{showAvg && <td className={tdN}><VarCell value={c.VarpAvg} flag={c.Flag} /></td>}
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={13} className="px-3 py-5 text-center text-muted">Nothing matches the filter.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------ Documents ------------------------------ */
function Documents({ rows }: { rows: WacDocRow[] }) {
  if (!rows.length) return <p className="text-sm text-muted">No goods-receipt documents in this period for the selection.</p>;
  return (
    <div className="max-h-[420px] overflow-auto rounded-xl border border-line">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-sunken"><tr>
          <th className={th}>Document</th><th className={th}>Posted</th><th className={th}>Batch</th><th className={th}>Process order</th><th className={th}>Via</th>
          <th className={thN}>Quantity</th><th className={thN}>RM</th><th className={thN}>PM</th><th className={thN}>Perfume</th><th className={thN}>Conversion</th><th className={thN}>Landed</th><th className={thN}>PO-cost rows</th>
        </tr></thead>
        <tbody>
          {rows.map((d) => {
            const rev = dec(d.Qty)?.lt(0) ?? false;
            return (
              <tr key={d.Rowid} className="border-t border-line/60">
                <td className={cx(td, 'font-mono')}>{d.Mblnr}/{d.Mjahr}</td><td className={td}>{d.Budat ? fmtDate(d.Budat) : '—'}</td><td className={td}>{d.Charg || '—'}</td><td className={cx(td, 'font-mono')}>{d.Aufnr || '—'}</td>
                <td className={td}>{d.Via === 'SUBCONTRACTING' ? 'Subcontracting' : d.Via === 'PROD_ORDER' ? 'Process order' : d.Via}</td>
                <td className={cx(tdN, rev && 'font-bold text-bad')}>{fmtQty(d.Qty)} {d.Uom}{rev && <span className="ml-1 text-2xs uppercase">↩ reversal</span>}</td>
                <td className={tdN}>{inr(d.Rm, 2)}</td><td className={tdN}>{inr(d.Pm, 2)}</td><td className={tdN}>{inr(d.Perf, 2)}</td><td className={tdN}>{inr(d.Conv, 2)}</td><td className={tdN}>{inr(d.Landed, 2)}</td>
                <td className={cx(tdN, d.Rows > 1 && 'font-bold text-warn')} title={d.Rows > 1 ? 'Several PO-cost rows in this document' : undefined}>{d.Rows}{d.Rows > 1 && <span className="sr-only"> (several)</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------ Panel ------------------------------ */
export default function RowDetail({ row, run, cmpOn }: { row: WacRow; run: WacFilterInput; cmpOn: boolean }) {
  const [tab, setTab] = useState<Tab>('comparison');
  const [started, setStarted] = useState({ compare: cmpOn, comp: cmpOn });
  const q = useMemo<WacFilterInput>(() => ({ ...run, plants: [row.Werks], materials: [row.Matnr], prodha: undefined, inclCmp: true }), [run, row.Werks, row.Matnr]);
  const compare = useWacCompare(q, tab === 'comparison' && started.compare, run);
  const comps = useWacComponents(q, tab === 'components' && started.comp, run);
  const docs = useWacDocuments(q, tab === 'documents', run);

  return (
    <PriceScope materials={[row.Matnr]}>
    <div className="flex flex-col gap-3 px-3 py-3" onClick={(e) => e.stopPropagation()}>
      <PriceStrip matnr={row.Matnr} plant={row.Werks} costCurr="INR" />
      <Tabs<Tab> label="Detail views" value={tab} onChange={setTab} tabs={[{ id: 'comparison', label: 'Comparison' }, { id: 'components', label: 'Components' }, { id: 'documents', label: 'Documents' }]} />
      {tab === 'comparison' && (started.compare
        ? (compare.entry?.status === 'done' ? <Comparison rows={compare.entry.data as WacCompareRow[]} matnr={row.Matnr} plant={row.Werks} /> : <State entry={compare.entry} onRetry={compare.retry} what="the comparison" />)
        : <RunButton label="Run live comparison" onRun={() => setStarted((s) => ({ ...s, compare: true }))} />)}
      {tab === 'components' && (started.comp
        ? (comps.entry?.status === 'done' ? <Components rows={comps.entry.data as WacCompRow[]} /> : <State entry={comps.entry} onRetry={comps.retry} what="the components" />)
        : <RunButton label="Run live comparison" onRun={() => setStarted((s) => ({ ...s, comp: true }))} />)}
      {tab === 'documents' && (docs.entry?.status === 'done' ? <Documents rows={docs.entry.data as WacDocRow[]} /> : <State entry={docs.entry} onRetry={docs.retry} what="the documents" />)}
      {tab === 'comparison' && compare.entry?.status === 'done' && compare.entry.messages.length > 0 && <p className="text-xs text-warn">{compare.entry.messages.map((m) => m.message).join(' · ')}</p>}
    </div>
    </PriceScope>
  );
}
