'use client';
/**
 * Portfolio (CogmBoardSet): finished goods, high / medium alerts, data gaps, weighted ratios, revenue and annual impact per group (product hierarchy,
 * plant, market or brand), with a bar chart of the impact. SAP computes every figure; nothing is summed here. A group opens the filtered Board
 * (it never runs by itself). Nothing loads before Show; no call has a time limit (Stop ends it).
 */
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, FileSpreadsheet, Minus } from 'lucide-react';
import MarginSelection, { useMarginSel } from '../MarginSelection';
import { usePlantsState, type MarginCtx } from '../MarginFrame';
import WacMessages from '../../wac/WacMessages';
import { useChartTheme } from '../../charts';
import { Button, Empty, Spinner, Stat, cx } from '../../ui';
import { fmtMs, fmtNum } from '@/lib/format';
import { BASE_PATH } from '@/lib/client/session';
import { downloadWacWorkbook } from '@/lib/wac/export';
import { dec } from '@/lib/wac/view';
import { toMarginQuery } from '@/lib/margin/selection';
import { useElapsed, useMarginRun } from '@/lib/margin/run';
import { GROUP_BYS, GROUP_BY_LABEL, IMPACT_WORD, groupBoardSearch, impactBars, impactKind, portfolioSheet, sortGroups, type GroupBy, type ImpactKind } from '@/lib/margin/portfolioView';
import type { MarginBoard } from '@/lib/margin/types';

const th = 'px-2.5 py-1.5 text-left text-2xs font-bold uppercase tracking-wide text-muted';
const thN = `${th} text-right`;
const td = 'px-2.5 py-1.5 align-top';
const tdN = `${td} num whitespace-nowrap text-right`;
const NA = <span className="text-faint" title="No value from SAP">n/a</span>;
const pctCell = (v: string) => (dec(v) === null ? NA : <>{fmtNum(v, 1, 'X')} %</>);
const inr = (v: string) => (dec(v) === null ? NA : <>{fmtNum(v, 0, 'INR')} <span className="text-2xs text-muted">INR</span></>);
const cnt = (v: number, tone?: 'bad' | 'warn') => <span className={cx(v > 0 && tone === 'bad' && 'font-bold text-bad', v > 0 && tone === 'warn' && 'font-bold text-warn')}>{v}</span>;

function Impact({ v }: { v: string }) {
  const k: ImpactKind = impactKind(v);
  if (k === 'na') return NA;
  const Icon = k === 'loss' ? ArrowUpRight : k === 'saving' ? ArrowDownRight : Minus;
  return <span className={cx('inline-flex items-center justify-end gap-1', k === 'loss' && 'text-bad', k === 'saving' && 'text-good')} title="Positive annual impact = loss, negative = saving"><Icon size={13} aria-hidden />{fmtNum(v, 0, 'INR')} <span className="text-2xs text-muted">INR · {IMPACT_WORD[k]}</span></span>;
}

export default function PortfolioScreen({ ctx }: { ctx: MarginCtx }) {
  const [groupBy, setGroupBy] = useState<GroupBy>(() => { const g = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('gb'); return (GROUP_BYS as string[]).includes(g ?? '') ? (g as GroupBy) : 'P'; });
  const [sel, patch] = useMarginSel(() => ({ gb: groupBy }));
  const { state: plantsState } = usePlantsState(true);
  const { state, run, stop, resume, refresh } = useMarginRun('BOARD');
  const elapsed = useElapsed(state.running);
  const [errors, setErrors] = useState<{ materials?: string; plants?: string; other?: string }>({});
  const [ranBy, setRanBy] = useState<GroupBy>('P');
  const ct = useChartTheme();

  const show = () => {
    if (!sel.materials.length && !sel.plants.length && !sel.prodha.trim() && !sel.brand.trim()) { setErrors({ other: 'Pick finished goods, a plant, a product hierarchy or a brand.' }); return; }
    setErrors({});
    setRanBy(groupBy);
    run({ ...toMarginQuery(sel), groupBy });
  };
  const rows = state.rows as MarginBoard[];
  const sorted = useMemo(() => sortGroups(rows), [rows]);
  const bars = useMemo(() => impactBars(rows), [rows]);
  const withGaps = rows.filter((r) => r.NoDataCnt > 0).length;

  return (
    <>
      <MarginSelection sel={sel} onChange={patch} plantsState={plantsState} email={ctx.email} errors={errors} onRun={show} onStop={stop} onRefresh={refresh} canRefresh={!!state.q} running={state.running} elapsed={elapsed}
        noMaterialsHint="Optional here: a plant, product hierarchy or brand also selects the portfolio. A live run takes 25 finished goods at a time."
        extra={(
          <fieldset className="flex flex-col gap-1"><legend className="text-2xs font-bold uppercase tracking-wide text-muted">Group by</legend>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Group by">
              {GROUP_BYS.map((g) => <button key={g} type="button" role="radio" aria-checked={groupBy === g} onClick={() => setGroupBy(g)} className={cx('rounded-full border px-3 py-1 text-xs font-bold', groupBy === g ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:text-ink')}>{GROUP_BY_LABEL[g]}</button>)}
            </div>
          </fieldset>
        )} />

      {state.total > 1 && <p className="text-xs text-muted" aria-live="polite">Batch {state.doneCount} of {state.total}{state.running ? ' …' : ''}</p>}
      {state.stopped && !state.running && <p className="text-sm text-muted">The run was stopped. <button type="button" className="font-semibold text-accent underline" onClick={resume}>Continue</button></p>}
      {state.running && !rows.length && <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Reading from SAP… {fmtMs(elapsed)}{sel.source === 'L' ? ' (live costing can take a while)' : ''}</p>}
      <WacMessages messages={state.messages} error={state.error} />

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={GROUP_BY_LABEL[ranBy]} value={sorted.length} sub="groups from SAP" />
            <Stat label="High alerts" value={sorted.reduce((a, r) => a + (r.AlertHigh > 0 ? 1 : 0), 0)} sub="groups with at least one" tone={sorted.some((r) => r.AlertHigh > 0) ? 'bad' : undefined} />
            <Stat label="Groups with data gaps" value={withGaps} tone={withGaps ? 'warn' : undefined} sub="no price / standard / current" />
            <Stat label="Rows" value={sorted.length} sub={`${fmtMs(state.ms)} in SAP`} />
          </div>

          <section aria-label="Annual impact by group" className="rounded-2xl border border-line bg-panel px-4 py-3 shadow-card">
            <h2 className="text-sm font-extrabold">Annual impact by group (INR)</h2>
            <p className="text-xs text-muted">Positive = loss (cost up, amount remaining down), negative = saving. Groups with no impact from SAP are left out.</p>
            {bars.length === 0 ? <p className="mt-2 text-sm text-muted">SAP sent no annual impact for these groups.</p> : (
              <div className="mt-2" style={{ height: Math.max(180, bars.length * 30 + 40) }}>
                <ResponsiveContainer>
                  <BarChart data={bars} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid stroke={ct.grid} horizontal={false} />
                    <XAxis type="number" tick={{ fill: ct.axis, fontSize: 11 }} tickFormatter={(x) => fmtNum(x, 0, 'INR')} />
                    <YAxis type="category" dataKey="name" width={150} tick={{ fill: ct.axis, fontSize: 11 }} />
                    <Tooltip formatter={(x, _n, p) => [`${fmtNum(Number(x), 0, 'INR')} INR · ${IMPACT_WORD[(p?.payload as { kind: ImpactKind }).kind]}`, 'Annual impact']} />
                    <Bar dataKey="value" isAnimationActive={false} label={{ position: 'right', fontSize: 10, fill: ct.text, formatter: (x: unknown) => `${Number(x) > 0 ? '▲ loss' : Number(x) < 0 ? '▼ saving' : ''}` }}>
                      {bars.map((b, bi) => <Cell key={`${b.key}|${bi}`} fill={b.kind === 'loss' ? ct.up : b.kind === 'saving' ? ct.down : ct.neutral} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void downloadWacWorkbook([portfolioSheet(rows, ranBy)], [['Report', 'Margin portfolio (CogmBoardSet)'], ['Grouped by', GROUP_BY_LABEL[ranBy]], ['Source', sel.source === 'L' ? 'live' : 'snapshot'], ['Price source', sel.priceSrc === 'O' ? 'latest sales order' : 'uploaded prices'], ['Note', 'Every figure is SAP\'s; nothing is summed or weighted here.']], 'margin-portfolio')}><FileSpreadsheet size={14} /> Excel</Button>
            <span className="text-xs text-faint">Click a group to open the Board for it (you press Show there).</span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-line bg-panel shadow-card">
            <table className="w-full text-sm">
              <thead className="bg-sunken"><tr><th className={th}>{GROUP_BY_LABEL[ranBy]}</th><th className={thN}>Finished goods</th><th className={thN}>High alerts</th><th className={thN}>Medium alerts</th><th className={thN}>Data gaps</th><th className={thN}>Weighted ratio Standard</th><th className={thN}>Weighted ratio Current</th><th className={thN}>Revenue</th><th className={thN}>Annual impact</th></tr></thead>
              <tbody>
                {sorted.map((r, ri) => {
                  const gb = (GROUP_BYS as string[]).includes(r.GroupKind) ? (r.GroupKind as GroupBy) : ranBy;
                  return (
                    <tr key={`${r.GroupKind}|${r.GrpKey}|${ri}`} className="border-t border-line/60 hover:bg-sunken">
                      <td className={td}><a className="font-semibold text-accent underline-offset-2 hover:underline" href={`${BASE_PATH}/margin/${groupBoardSearch(sel, gb, r.GrpKey)}`} title="Open the Board for this group">{r.GrpKey || NA}</a> <span className="text-muted">{r.GrpTxt}</span></td>
                      <td className={tdN}>{r.FgCnt}</td><td className={tdN}>{cnt(r.AlertHigh, 'bad')}</td><td className={tdN}>{cnt(r.AlertMed, 'warn')}</td><td className={tdN}>{cnt(r.NoDataCnt, 'warn')}</td>
                      <td className={tdN}>{pctCell(r.WratioStd)}</td><td className={tdN}>{pctCell(r.WratioCur)}</td><td className={tdN}>{inr(r.RevenueInr)}</td><td className={tdN}><Impact v={r.AnnualImpactInr} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">Weighted ratios are % of the selling price. Every figure is SAP&apos;s; the table has no totals row.</p>
        </>
      )}
      {state.q && !state.running && !state.error && rows.length === 0 && !state.stopped && <Empty title="No groups">SAP returned no group for this selection.</Empty>}
      {!state.q && <Empty title="Nothing loaded yet">Pick the selection and how to group, then press Show.</Empty>}
    </>
  );
}
