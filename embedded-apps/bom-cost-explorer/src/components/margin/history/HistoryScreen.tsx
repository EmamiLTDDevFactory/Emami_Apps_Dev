'use client';
/**
 * History (CogmHistorySet): the COGM scenarios (Standard, Current, Actual) and the current ratio over the stored snapshots of one finished good in one
 * plant / market / channel, with the erosion columns. SAP computes every figure; an empty value is a gap and "n/a", never 0. Nothing loads before Show.
 */
import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, FileSpreadsheet, Minus } from 'lucide-react';
import MarginSelection, { useMarginSel } from '../MarginSelection';
import { usePlantsState, type MarginCtx } from '../MarginFrame';
import WacMessages from '../../wac/WacMessages';
import { useChartTheme } from '../../charts';
import { Button, Empty, Field, Spinner, cx, inputCls } from '../../ui';
import { fmtDate, fmtMs, fmtNum } from '@/lib/format';
import { downloadWacWorkbook } from '@/lib/wac/export';
import { dec } from '@/lib/wac/view';
import { useElapsed, useMarginRun } from '@/lib/margin/run';
import { EROSION_WORD, HISTORY_DEFAULT_DAYS, SCENARIO_LINES, erosionKind, hasLine, historySeries, historySheet, sortHistory, type ErosionKind } from '@/lib/margin/historyView';
import type { MarginHistory } from '@/lib/margin/types';

const th = 'px-2.5 py-1.5 text-left text-2xs font-bold uppercase tracking-wide text-muted';
const thN = `${th} text-right`;
const td = 'px-2.5 py-1.5 align-top';
const tdN = `${td} num whitespace-nowrap text-right`;
const NA = <span className="text-faint" title="No value from SAP">n/a</span>;
const amt = (v: string, curr: string, dp = 4) => (dec(v) === null ? NA : <>{fmtNum(v, dp, curr || 'INR')} <span className="text-2xs text-muted">{curr}</span></>);

function Erosion({ v }: { v: string }) {
  const k: ErosionKind = erosionKind(v);
  if (k === 'na') return NA;
  const Icon = k === 'worse' ? ArrowUpRight : k === 'better' ? ArrowDownRight : Minus;
  return <span className={cx('inline-flex items-center gap-1', k === 'worse' && 'text-bad', k === 'better' && 'text-good')} title="Positive erosion = cost up / amount remaining down"><Icon size={13} aria-hidden />{fmtNum(v, 2, 'X')} <span className="text-2xs text-muted">{EROSION_WORD[k]}</span></span>;
}

export default function HistoryScreen({ ctx }: { ctx: MarginCtx }) {
  const [days, setDays] = useState<string>(() => { const d = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('hd'); return d && /^\d+$/.test(d) ? d : String(HISTORY_DEFAULT_DAYS); });
  const [sel, patch] = useMarginSel(() => ({ hd: days === String(HISTORY_DEFAULT_DAYS) ? '' : days }));
  const { state: plantsState } = usePlantsState(true);
  const { state, run, stop, resume, refresh } = useMarginRun('HISTORY');
  const elapsed = useElapsed(state.running);
  const [errors, setErrors] = useState<{ materials?: string; other?: string }>({});
  const ct = useChartTheme();

  const show = () => {
    const d = Number(days);
    if (sel.materials.length !== 1) { setErrors({ materials: 'Pick exactly one finished good.' }); return; }
    if (!Number.isInteger(d) || d < 1) { setErrors({ other: 'Days must be a whole number of at least 1.' }); return; }
    setErrors({});
    run({ materials: sel.materials, plants: sel.plants, market: sel.market, channel: sel.channel, daysBack: d });
  };
  const rows = state.rows as MarginHistory[];
  const sorted = useMemo(() => sortHistory(rows), [rows]);
  const series = useMemo(() => historySeries(rows), [rows]);
  const curr = rows.find((r) => r.Curr)?.Curr ?? '';
  const noDate = rows.length - series.length;

  return (
    <>
      <MarginSelection sel={sel} onChange={patch} plantsState={plantsState} email={ctx.email} errors={errors} onRun={show} onStop={stop} onRefresh={refresh} canRefresh={!!state.q} running={state.running} elapsed={elapsed} noSource
        summary={`${sel.materials[0] ?? 'no material'} · ${sel.plants.join(', ') || 'no plant'} · ${days} days`} noMaterialsHint="Exactly one finished good. Market and channel are typed with the uploaded-prices source (an order channel looks like 10/ZOD1)."
        extra={<Field label="Days back" hint={`Default ${HISTORY_DEFAULT_DAYS}.`}>{(id) => <input id={id} inputMode="numeric" className={cx(inputCls, 'w-28')} value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} />}</Field>} />

      {state.stopped && !state.running && <p className="text-sm text-muted">The run was stopped. <button type="button" className="font-semibold text-accent underline" onClick={resume}>Continue</button></p>}
      {state.running && !rows.length && <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Reading from SAP… {fmtMs(elapsed)}</p>}
      <WacMessages messages={state.messages} error={state.error} />

      {rows.length > 0 && (
        <>
          <section aria-label="COGM over time" className="rounded-2xl border border-line bg-panel px-4 py-3 shadow-card">
            <h2 className="text-sm font-extrabold">COGM scenarios and current ratio over time</h2>
            <p className="text-xs text-muted">COGM per selling unit in {curr || 'the price currency'} (left axis); current ratio in % of the selling price (right axis). A snapshot SAP has no value for is a gap in the line.</p>
            {series.length === 0 ? <p className="mt-2 text-sm text-muted">No snapshot has a date.</p> : (
              <div className="mt-2 h-72">
                <ResponsiveContainer>
                  <LineChart data={series} margin={{ right: 10 }}>
                    <CartesianGrid stroke={ct.grid} vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: ct.axis, fontSize: 11 }} tickFormatter={(d) => fmtDate(d)} />
                    <YAxis yAxisId="c" tick={{ fill: ct.axis, fontSize: 11 }} width={70} />
                    <YAxis yAxisId="r" orientation="right" tick={{ fill: ct.axis, fontSize: 11 }} width={50} tickFormatter={(x) => `${x}%`} />
                    <Tooltip labelFormatter={(d) => fmtDate(String(d))} />
                    <Legend />
                    {SCENARIO_LINES.filter((l) => hasLine(series, l.key)).map((l, i) => <Line key={l.key} yAxisId="c" type="monotone" dataKey={l.key} name={`COGM ${l.label}`} stroke={[ct.neutral, ct.series, ct.sim][i]} strokeDasharray={['6 3', '', '2 3'][i]} strokeWidth={2} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />)}
                    {hasLine(series, 'ratio') && <Line yAxisId="r" type="monotone" dataKey="ratio" name="Ratio Current %" stroke={ct.up} strokeWidth={2} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void downloadWacWorkbook([historySheet(rows)], [['Report', 'Margin history (CogmHistorySet)'], ['Material', sel.materials[0] ?? ''], ['Plants', sel.plants.join(', ')], ['Days back', days], ['Note', 'Every figure is SAP\'s.']], 'margin-history')}><FileSpreadsheet size={14} /> Excel</Button>
            <span className="text-xs text-faint">{sorted.length} snapshot{sorted.length === 1 ? '' : 's'}{noDate > 0 ? ` · ${noDate} without a date (not in the chart)` : ''} · {fmtMs(state.ms)} in SAP</span>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-line bg-panel shadow-card">
            <table className="w-full text-sm">
              <thead className="bg-sunken"><tr><th className={th}>Snapshot</th><th className={th}>Plant</th><th className={th}>Market / channel</th><th className={thN}>COGM Standard</th><th className={thN}>COGM Current</th><th className={thN}>COGM Actual</th><th className={thN}>Ratio Current</th><th className={thN}>Erosion vs Standard</th><th className={thN}>Erosion vs Base</th></tr></thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={`${r.SnapDate}|${r.Werks}|${r.Market}|${r.Channel}|${i}`} className="border-t border-line/60">
                    <td className={td}>{r.SnapDate ? fmtDate(r.SnapDate) : NA}</td><td className={td}>{r.Werks || NA}</td><td className={td}>{[r.Market, r.Channel].filter(Boolean).join(' / ') || NA}</td>
                    <td className={tdN}>{amt(r.CogmStd, r.Curr)}</td><td className={tdN}>{amt(r.CogmCur, r.Curr)}</td><td className={tdN}>{amt(r.CogmAct, r.Curr)}</td>
                    <td className={tdN}>{dec(r.RatioCur) === null ? NA : <>{fmtNum(r.RatioCur, 1, 'X')} %</>}</td><td className={tdN}><Erosion v={r.ErosionStd} /></td><td className={tdN}><Erosion v={r.ErosionBase} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {state.q && !state.running && !state.error && rows.length === 0 && !state.stopped && <Empty title="No snapshot">SAP has no stored snapshot for this finished good in the last {days} days.</Empty>}
      {!state.q && <Empty title="Nothing loaded yet">Pick one finished good (and plant, market, channel if you need them), then press Show.</Empty>}
    </>
  );
}
