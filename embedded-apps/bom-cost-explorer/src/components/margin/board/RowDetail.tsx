'use client';
/** The four detail tabs of a Board row. Each tab loads its SAP set only when it is opened. SAP's figures are shown as they are. */
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button, Pill, Spinner, Tabs, cx } from '../../ui';
import { useChartTheme } from '../../charts';
import { useDetail } from './useDetail';
import { fmtDate, fmtNum } from '@/lib/format';
import { dec } from '@/lib/wac/view';
import type { WacEntry } from '@/lib/wac/cache';
import type { MarginQuery } from '@/lib/margin/filter';
import type { MarginAlert, MarginDriver, MarginHistory, MarginRow } from '@/lib/margin/types';
import { SEVERITY_WORD, costSplit, detailQuery, hasAmt, hasSplit, historyQuery, noEffect, noEffectReason } from '@/lib/margin/boardView';

type Tab = 'split' | 'drivers' | 'alerts' | 'history';
const th = 'px-2.5 py-1.5 text-left text-2xs font-bold uppercase tracking-wide text-muted';
const thN = `${th} text-right`;
const td = 'px-2.5 py-1.5 align-top';
const tdN = `${td} num whitespace-nowrap text-right`;
const NA = <span className="text-faint" title="No value from SAP">n/a</span>;
const amt = (v: string, curr: string, dp = 4) => (hasAmt(v) ? <>{fmtNum(v, dp, curr)} <span className="text-2xs text-muted">{curr}</span></> : NA);
const SEV_TONE = { H: 'bad', M: 'warn', L: 'neutral' } as const;

function State<T>({ entry, retry, what }: { entry: WacEntry<T> | undefined; retry: () => void; what: string }) {
  if (!entry || entry.status === 'loading') return <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Reading {what} from SAP… (no time limit)</p>;
  if (entry.status === 'cancelled') return <p className="text-sm text-muted">Stopped. <button type="button" className="font-semibold text-accent underline" onClick={retry}>Read again</button></p>;
  if (entry.status === 'error') return (
    <div role="alert" className="flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/[0.06] px-3 py-2 text-sm">
      <AlertTriangle size={15} className="mt-0.5 shrink-0 text-bad" aria-hidden /><span className="min-w-0 break-words">{entry.error}</span>
      <Button size="sm" variant="ghost" onClick={retry} className="ml-auto shrink-0"><RefreshCw size={13} /> Retry</Button>
    </div>
  );
  return null;
}

/* ------------------------------ cost split ------------------------------ */
function CostSplit({ r }: { r: MarginRow }) {
  const t = useChartTheme();
  const parts = useMemo(() => costSplit(r), [r]);
  const colors: Record<string, string> = { Rm: '#4338CA', Pm: '#0e9fb5', Conv: '#eda100', Ovh: '#2a78d6', Oth: '#8B8FA3' };
  const n = (v: string) => { const d = dec(v); return d ? d.toNumber() : 0; };
  const data = [{ name: 'Standard', ...Object.fromEntries(parts.map((p) => [p.key, n(p.std)])) }, { name: 'Current', ...Object.fromEntries(parts.map((p) => [p.key, n(p.cur)])) }];
  if (!hasSplit(r)) return <p className="text-sm text-muted">SAP sent no cost split for this row.</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="h-64" role="img" aria-label="Stacked cost parts, Standard against Current">
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ left: 10, right: 10 }}>
            <CartesianGrid stroke={t.grid} horizontal={false} />
            <XAxis type="number" tick={{ fill: t.axis, fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={70} tick={{ fill: t.axis, fontSize: 11 }} />
            <Tooltip formatter={(x, k) => [`${fmtNum(Number(x), 4, r.Curr)} ${r.Curr}`, parts.find((p) => p.key === k)?.label ?? String(k)]} />
            <Legend formatter={(k) => parts.find((p) => p.key === k)?.label ?? String(k)} />
            {parts.map((p) => <Bar key={p.key} dataKey={p.key} stackId="a" fill={colors[p.key]} isAnimationActive={false} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-sunken"><tr><th className={th}>Cost part (per selling unit)</th><th className={thN}>Standard</th><th className={thN}>Current</th></tr></thead>
          <tbody>
            {parts.map((p) => (
              <tr key={p.key} className="border-t border-line/60"><td className={td}><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: colors[p.key] }} aria-hidden />{p.label}</td><td className={tdN}>{amt(p.std, r.Curr)}</td><td className={tdN}>{amt(p.cur, r.Curr)}</td></tr>
            ))}
            <tr className="border-t-2 border-line bg-sunken font-bold"><td className={td}>COGM (SAP)</td><td className={tdN}>{r.OkStd ? amt(r.CogmStd, r.Curr) : NA}</td><td className={tdN}>{r.OkCur ? amt(r.CogmCur, r.Curr) : NA}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------ drivers ------------------------------ */
function Drivers({ q, r, enabled }: { q: MarginQuery; r: MarginRow; enabled: boolean }) {
  const dq = useMemo(() => detailQuery(q, r), [q, r]);
  const { entry, retry } = useDetail('DRIVER', dq, enabled);
  const rows = (entry?.status === 'done' ? entry.data : null) as MarginDriver[] | null;
  if (!rows) return <State entry={entry} retry={retry} what="the component price effects" />;
  if (!rows.length) return <p className="text-sm text-muted">SAP returned no component price effects for this row.</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-sunken"><tr><th className={th}>Component</th><th className={th}>Group</th><th className={th}>Source</th><th className={thN}>Standard price</th><th className={thN}>Current price</th><th className={thN}>Price change %</th><th className={thN}>Change per selling unit</th><th className={thN}>Annual (INR)</th></tr></thead>
          <tbody>
            {rows.map((d, i) => {
              const none = noEffect(d);
              return (
                <tr key={`${d.Idnrk}|${i}`} className={cx('border-t border-line/60', none && 'text-faint')}>
                  <td className={td}><span className="font-mono font-bold">{d.Idnrk}</span> <span className="text-muted">{d.CompTxt}</span></td><td className={td}>{d.Grp}</td><td className={td}>{d.SrcSel || NA}</td>
                  <td className={tdN}>{hasAmt(d.PStd) ? fmtNum(d.PStd, 4, r.Curr) : NA}</td><td className={tdN}>{hasAmt(d.PCur) ? fmtNum(d.PCur, 4, r.Curr) : NA}</td>
                  {none ? <td className={td} colSpan={3}><Pill tone="neutral" title={noEffectReason(d)}>No price effect: {noEffectReason(d)}</Pill></td> : (
                    <>
                      <td className={tdN}>{hasAmt(d.PricePct) ? `${fmtNum(d.PricePct, 1, 'X')} %` : NA}</td><td className={tdN}>{amt(d.DeltaUnit, d.Curr || r.Curr)}</td><td className={tdN}>{hasAmt(d.AnnualInr) ? <>{fmtNum(d.AnnualInr, 0, 'INR')} <span className="text-2xs text-muted">INR</span></> : NA}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Positive = cost up (remaining amount down). A component with no standard price or no rate has no price effect; that is not a zero. Figures are SAP&apos;s.</p>
    </div>
  );
}

/* ------------------------------ alerts ------------------------------ */
function Alerts({ q, r, enabled }: { q: MarginQuery; r: MarginRow; enabled: boolean }) {
  const dq = useMemo(() => detailQuery(q, r), [q, r]);
  const { entry, retry } = useDetail('ALERT', dq, enabled);
  const rows = (entry?.status === 'done' ? entry.data : null) as MarginAlert[] | null;
  if (!rows) return <State entry={entry} retry={retry} what="the alerts" />;
  if (!rows.length) return <p className="text-sm text-muted">No alert for this row.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-sm">
        <thead className="bg-sunken"><tr><th className={th}>Rule</th><th className={th}>Severity</th><th className={th}>Scope</th><th className={th}>Component</th><th className={th}>Text</th><th className={thN}>Value</th><th className={thN}>Threshold</th><th className={thN}>Impact (INR)</th></tr></thead>
        <tbody>
          {rows.map((a, i) => (
            <tr key={`${a.Rule}|${i}`} className="border-t border-line/60">
              <td className={cx(td, 'font-mono font-bold')}>{a.Rule}</td>
              <td className={td}>{a.Severity ? <Pill tone={SEV_TONE[a.Severity as 'H']}>{a.Severity === 'H' ? '▲ ' : a.Severity === 'M' ? '● ' : '○ '}{SEVERITY_WORD[a.Severity as 'H']}</Pill> : NA}</td>
              <td className={td}>{a.Scope === 'C' ? (a.FgCnt === undefined ? 'Component' : `Component (${a.FgCnt} finished goods)`) : a.Scope === 'F' ? 'Finished good' : NA}</td><td className={td}>{a.Comp || '—'}</td><td className={td}>{a.Text}</td>
              <td className={tdN}>{hasAmt(a.Value) ? fmtNum(a.Value, 2, 'X') : NA}</td><td className={tdN}>{hasAmt(a.Threshold) ? fmtNum(a.Threshold, 2, 'X') : NA}</td><td className={tdN}>{hasAmt(a.ImpactInr) ? fmtNum(a.ImpactInr, 0, 'INR') : NA}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------ history ------------------------------ */
function History({ r, enabled }: { r: MarginRow; enabled: boolean }) {
  const t = useChartTheme();
  const [days, setDays] = useState(180);
  const hq = useMemo(() => historyQuery(r, days), [r, days]);
  const { entry, retry } = useDetail('HISTORY', hq, enabled);
  const rows = ((entry?.status === 'done' ? entry.data : null) as MarginHistory[] | null)?.slice().sort((a, b) => String(a.SnapDate ?? '').localeCompare(String(b.SnapDate ?? ''))) ?? null;
  const n = (v: string) => { const d = dec(v); return d ? d.toNumber() : null; };
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">Days back
        <select className="rounded-lg border border-line bg-panel px-2 py-1 text-sm normal-case" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[90, 180, 365].map((d) => <option key={d} value={d}>{d}</option>)}</select>
      </label>
      {!rows ? <State entry={entry} retry={retry} what="the history" /> : rows.length === 0 ? <p className="text-sm text-muted">No snapshot of this row in the last {days} days.</p> : (
        <>
          <div className="h-64" role="img" aria-label="COGM of the scenarios over time">
            <ResponsiveContainer>
              <LineChart data={rows.map((h) => ({ date: h.SnapDate ?? '', std: n(h.CogmStd), cur: n(h.CogmCur), act: n(h.CogmAct) }))}>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="date" tick={{ fill: t.axis, fontSize: 11 }} tickFormatter={(d) => (d ? fmtDate(d) : '')} />
                <YAxis tick={{ fill: t.axis, fontSize: 11 }} width={60} />
                <Tooltip formatter={(x, k) => [x === null || x === undefined ? 'n/a' : `${fmtNum(Number(x), 4, r.Curr)} ${r.Curr}`, k === 'std' ? 'Standard' : k === 'cur' ? 'Current' : 'Actual']} labelFormatter={(d) => (d ? fmtDate(String(d)) : '')} />
                <Legend formatter={(k) => (k === 'std' ? 'Standard' : k === 'cur' ? 'Current' : 'Actual')} />
                <Line type="monotone" dataKey="std" stroke="#8B8FA3" dot={false} connectNulls={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="cur" stroke="#C0392B" dot={false} connectNulls={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="act" stroke="#2a78d6" strokeDasharray="4 3" dot={false} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="max-h-64 overflow-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-sunken"><tr><th className={th}>Date</th><th className={thN}>Standard</th><th className={thN}>Current</th><th className={thN}>Actual</th><th className={thN}>Ratio %</th><th className={thN}>Erosion vs standard</th><th className={thN}>Erosion vs base</th></tr></thead>
              <tbody>
                {rows.map((h, i) => (
                  <tr key={i} className="border-t border-line/60"><td className={td}>{h.SnapDate ? fmtDate(h.SnapDate) : NA}</td><td className={tdN}>{amt(h.CogmStd, h.Curr || r.Curr)}</td><td className={tdN}>{amt(h.CogmCur, h.Curr || r.Curr)}</td><td className={tdN}>{amt(h.CogmAct, h.Curr || r.Curr)}</td>
                    <td className={tdN}>{hasAmt(h.RatioCur) ? `${fmtNum(h.RatioCur, 1, 'X')} %` : NA}</td><td className={tdN}>{hasAmt(h.ErosionStd) ? fmtNum(h.ErosionStd, 4, 'X') : NA}</td><td className={tdN}>{hasAmt(h.ErosionBase) ? fmtNum(h.ErosionBase, 4, 'X') : NA}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function RowDetail({ q, r }: { q: MarginQuery; r: MarginRow }) {
  const [tab, setTab] = useState<Tab>('split');
  return (
    <div className="flex flex-col gap-3">
      <Tabs<Tab> label="Row details" value={tab} onChange={setTab} tabs={[{ id: 'split', label: 'Cost split' }, { id: 'drivers', label: 'Component price effects' }, { id: 'alerts', label: 'Alerts', badge: r.AlertCnt ? <span className="rounded-full bg-sunken px-1.5 text-2xs font-bold">{r.AlertCnt}</span> : undefined }, { id: 'history', label: 'History' }]} />
      {tab === 'split' && <CostSplit r={r} />}
      {tab === 'drivers' && <Drivers q={q} r={r} enabled />}
      {tab === 'alerts' && <Alerts q={q} r={r} enabled />}
      {tab === 'history' && <History r={r} enabled />}
    </div>
  );
}
