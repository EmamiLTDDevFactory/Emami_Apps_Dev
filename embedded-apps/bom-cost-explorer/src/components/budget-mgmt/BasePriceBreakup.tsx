'use client';
/**
 * Avg Base Price breakup (BasePrcDetSet): the purchase-order lines behind SAP's weighted average, with the calculation (total value / total quantity)
 * and charts: the rate of every PO line over time against the average, and where the quantity and value come from by vendor.
 */
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { X } from 'lucide-react';
import { Button, Segmented, Spinner, cx } from '../ui';
import { useChartTheme } from '../charts';
import { ErrorBox, NO_RECORDS, errorText, td, th } from './shared';
import { fetchBasePrcDet } from '@/lib/budgetMgmt/api';
import type { BasePrcRow } from '@/lib/budgetMgmt/types';
import { basePrcBreakup, basePrcMonthly, basePrcPoints, showDate, stripZeros } from '@/lib/budgetMgmt/rules';
import { fmtNum } from '@/lib/format';
import AiNarrateSlot from '../ai/AiNarrateSlot';
import { rateOutlook } from '@/lib/ai/forecast';
import { rateOutlookSpec } from '@/lib/ai/builders/quality';

const Stat = ({ k, v, sub, strong }: { k: string; v: string; sub?: string; strong?: boolean }) => (
  <div className="rounded-xl border border-line bg-panel px-3 py-2"><p className="text-2xs text-muted">{k}</p><p className={cx('num text-lg', strong && 'font-extrabold text-accent')}>{v}</p>{sub && <p className="text-2xs text-muted">{sub}</p>}</div>
);

export default function BasePriceBreakup({ matnr, bukrs, land1, title, onClose }: { matnr: string; bukrs: string; land1: string; title: string; onClose: () => void }) {
  const [rows, setRows] = useState<BasePrcRow[] | null>(null);
  const [error, setError] = useState('');
  const t = useChartTheme();
  useEffect(() => {
    let live = true;
    setRows(null); setError('');
    fetchBasePrcDet(matnr, bukrs, land1).then((r) => live && setRows(r), (x) => live && setError(errorText(x)));
    return () => { live = false; };
  }, [matnr, bukrs, land1]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);

  const b = useMemo(() => (rows ? basePrcBreakup(rows) : null), [rows]);
  const cur = b?.currency || 'INR';
  // Rate over time, weighted by quantity: per month (bars = quantity, line = the month's weighted average) or per PO line (dot size = quantity).
  const monthly = useMemo(() => (b ? basePrcMonthly(b) : []), [b]);
  const points = useMemo(() => (b ? basePrcPoints(b) : []), [b]);
  const [rateView, setRateView] = useState<'month' | 'line'>('month');
  const outlook = useMemo(() => (b ? rateOutlook(b.byMonth) : null), [b]);
  const vendors = useMemo(() => (b ? b.byVendor.map((v) => ({ name: v.vendorName ? `${v.vendor} · ${v.vendorName}` : v.vendor, value: v.value, qty: v.qty, avg: v.avg ?? 0 })) : []), [b]);
  const tip = { contentStyle: { background: t.surface, border: `1px solid ${t.grid}`, borderRadius: 6, fontSize: 12, color: t.text } };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print" role="dialog" aria-modal="true" aria-label="Avg base price breakup">
      <div className="absolute inset-0 bg-plum-deep/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col rounded-2xl border border-line bg-panel shadow-pop">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div><p className="text-sm font-bold">Avg base price breakup — {stripZeros(matnr)}</p><p className="text-xs text-muted">{title} · company code {bukrs || '1000'} · country {land1}</p></div>
          <Button size="sm" onClick={onClose}><X size={13} /> Close</Button>
        </div>
        <div className="overflow-auto p-4">
          {!rows && !error && <div className="flex items-center gap-2 py-10 text-sm text-muted"><Spinner /> Reading the calculation…</div>}
          {error && <ErrorBox>{error}</ErrorBox>}
          {rows && b && b.lines.length === 0 && <p className="py-8 text-center text-sm text-muted">{NO_RECORDS}</p>}
          {rows && b && b.lines.length > 0 && (
            <div className="flex flex-col gap-5">
              <section aria-label="Calculation">
                <div className="grid gap-3 sm:grid-cols-4">
                  <Stat k={`Total value (${cur})`} v={fmtNum(b.totalValue, 2)} sub={`${b.lines.length} purchase-order lines`} />
                  <Stat k={`Total quantity (${b.uom || 'UoM'})`} v={fmtNum(b.totalQty, 3)} />
                  <Stat k="Weighted average" v={b.avg === null ? '—' : fmtNum(b.avg, 3)} sub={`${fmtNum(b.totalValue, 2)} ÷ ${fmtNum(b.totalQty, 3)}`} strong />
                  <Stat k="SAP's Avg base price" v={b.sapAvg === null ? '—' : fmtNum(b.sapAvg, 3)} sub={b.sapAvg === null ? 'no summary row' : b.agrees ? '✓ matches the lines' : '≠ differs from the lines'} />
                </div>
                {outlook && (
                  <div className="mt-3 rounded-xl border border-line bg-sunken/30 p-3 text-xs">
                    <p className="font-bold">Rate outlook (statistics on the purchase history, a suggestion for the budget-rate owner)</p>
                    {outlook.enough && outlook.outlook !== null
                      ? <p className="mt-1 text-muted">Last month {outlook.latest !== null ? fmtNum(outlook.latest, 3) : '—'} · 3-month avg {outlook.avg3 !== null ? fmtNum(outlook.avg3, 3) : '—'} · 6-month avg {outlook.avg6 !== null ? fmtNum(outlook.avg6, 3) : '—'} · trend {fmtNum(outlook.slopePctPerMonth ?? 0, 2)} % a month · outlook for {outlook.horizon} months <b className="text-ink">{fmtNum(outlook.outlook, 3)}</b> (range {fmtNum(outlook.low ?? 0, 3)} to {fmtNum(outlook.high ?? 0, 3)} {cur} / {b.uom || 'unit'}). {outlook.reason}</p>
                      : <p className="mt-1 text-muted">{outlook.reason}</p>}
                    <AiNarrateSlot className="mt-2" label="Explain the outlook with AI" build={() => rateOutlookSpec({ material: stripZeros(matnr), title, unit: b.uom, currency: cur, out: outlook })} />
                  </div>
                )}
                <p className="mt-2 text-xs text-muted">Avg base price = Σ value of the lines ÷ Σ quantity of the lines. A line with a negative value (a return or credit) lowers the average.</p>
              </section>

              <section aria-label="Charts" className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-line p-3">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold">Rate over time vs the weighted average ({cur} / {b.uom || 'unit'})</p>
                    <Segmented size="sm" label="Rate chart" value={rateView} onChange={setRateView} options={[{ value: 'month', label: 'By month' }, { value: 'line', label: 'By PO line' }]} />
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer>
                      {rateView === 'month' ? (
                        <ComposedChart data={monthly} margin={{ top: 8, right: 4, bottom: 4, left: 0 }}>
                          <CartesianGrid stroke={t.grid} vertical={false} />
                          <XAxis dataKey="label" tick={{ fill: t.axis, fontSize: 10 }} interval="preserveStartEnd" />
                          <YAxis yAxisId="r" tick={{ fill: t.axis, fontSize: 10 }} width={52} domain={[0, 'auto']} />
                          <YAxis yAxisId="q" orientation="right" tick={{ fill: t.axis, fontSize: 10 }} width={52} />
                          <Tooltip {...tip} formatter={(v: unknown, n: unknown) => [v === null || v === undefined ? '—' : fmtNum(String(v), 3), String(n)]} labelFormatter={(l: unknown, p: readonly { payload?: { lines?: number; value?: number } }[]) => `${String(l)} · ${p?.[0]?.payload?.lines ?? 0} PO line(s) · value ${fmtNum(String(p?.[0]?.payload?.value ?? 0), 2)}`} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar yAxisId="q" dataKey="qty" name={`Quantity bought (${b.uom || 'UoM'})`} fill={t.series} fillOpacity={0.35} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                          <Line yAxisId="r" type="monotone" dataKey="rate" name="Month's weighted rate" stroke={t.series} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
                          {b.avg !== null && <ReferenceLine yAxisId="r" y={b.avg} stroke={t.up} strokeDasharray="5 4" ifOverflow="extendDomain" label={{ value: `avg ${fmtNum(b.avg, 3)}`, fill: t.up, fontSize: 11, position: 'insideTopLeft' }} />}
                        </ComposedChart>
                      ) : (
                        <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                          <CartesianGrid stroke={t.grid} />
                          <XAxis type="number" dataKey="t" domain={['dataMin', 'dataMax']} scale="time" tick={{ fill: t.axis, fontSize: 10 }} tickFormatter={(v: number) => new Date(v).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' })} />
                          <YAxis type="number" dataKey="rate" name="Rate" tick={{ fill: t.axis, fontSize: 10 }} width={52} domain={[0, 'auto']} />
                          <ZAxis type="number" dataKey="qty" range={[25, 500]} name="Quantity" />
                          <Tooltip {...tip} cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => {
                            const d = payload?.[0]?.payload as { date: string; rate: number; qty: number; value: number; po: string; vendor: string } | undefined;
                            return d ? <div style={tip.contentStyle} className="px-2 py-1"><div className="font-bold">PO {d.po} · {d.date}</div><div>{d.vendor}</div><div>Rate {fmtNum(d.rate, 3)} · qty {fmtNum(d.qty, 3)} {b.uom} · value {fmtNum(d.value, 2)}</div></div> : null;
                          }} />
                          <Scatter data={points} fill={t.series} fillOpacity={0.6} isAnimationActive={false} />
                          {b.avg !== null && <ReferenceLine y={b.avg} stroke={t.up} strokeDasharray="5 4" ifOverflow="extendDomain" label={{ value: `avg ${fmtNum(b.avg, 3)}`, fill: t.up, fontSize: 11, position: 'insideTopLeft' }} />}
                        </ScatterChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-1 text-2xs text-muted">{rateView === 'month' ? 'Each month\'s rate is its total value ÷ total quantity; months with more quantity pull the average more.' : 'One dot per PO line; the bigger the dot, the bigger the quantity — large purchases decide the weighted average.'}</p>
                </div>
                <div className="rounded-xl border border-line p-3">
                  <p className="mb-1 text-xs font-bold">Value and quantity by vendor</p>
                  <div className="h-64">
                    <ResponsiveContainer>
                      <BarChart data={vendors} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                        <CartesianGrid stroke={t.grid} vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: t.axis, fontSize: 10 }} />
                        <YAxis yAxisId="v" tick={{ fill: t.axis, fontSize: 10 }} width={60} tickFormatter={(v: number) => fmtNum(v / 100000, 1) + 'L'} />
                        <YAxis yAxisId="q" orientation="right" tick={{ fill: t.axis, fontSize: 10 }} width={52} />
                        <Tooltip {...tip} formatter={(v: unknown, n: unknown) => [fmtNum(String(v), 2), String(n)]} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar yAxisId="v" dataKey="value" name={`Value (${cur})`} fill={t.series} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                        <Bar yAxisId="q" dataKey="qty" name={`Quantity (${b.uom || 'UoM'})`} fill={t.down} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <table className="mt-2 w-full border-collapse"><thead><tr><th className={th}>Vendor</th><th className={cx(th, 'text-right')}>Quantity</th><th className={cx(th, 'text-right')}>Value</th><th className={cx(th, 'text-right')}>Avg rate</th><th className={cx(th, 'text-right')}>Qty share</th></tr></thead>
                    <tbody>{b.byVendor.map((v) => <tr key={v.vendor} className="border-b border-line/60"><td className={td}><span className="num">{v.vendor}</span>{v.vendorName && <span className="ml-1.5 text-muted">{v.vendorName}</span>}</td><td className={cx(td, 'num text-right')}>{fmtNum(v.qty, 3)}</td><td className={cx(td, 'num text-right')}>{fmtNum(v.value, 2)}</td><td className={cx(td, 'num text-right')}>{v.avg === null ? '—' : fmtNum(v.avg, 3)}</td><td className={cx(td, 'num text-right')}>{fmtNum(v.qtyShare * 100, 1)}%</td></tr>)}</tbody></table>
                </div>
              </section>

              <section aria-label="Purchase-order lines">
                <p className="mb-1 text-xs font-bold">Purchase-order lines behind the average</p>
                <div className="max-h-[40vh] overflow-auto rounded-xl border border-line">
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 bg-sunken"><tr><th className={th}>PO date</th><th className={th}>PO</th><th className={th}>Item</th><th className={th}>Vendor</th><th className={th}>Plant</th><th className={cx(th, 'text-right')}>Quantity</th><th className={th}>UoM</th><th className={cx(th, 'text-right')}>Value ({cur})</th><th className={cx(th, 'text-right')}>Rate</th><th className={cx(th, 'text-right')}>Qty share</th></tr></thead>
                    <tbody>
                      {b.lines.map((l) => (
                        <tr key={l.Rowid} className="border-b border-line/60">
                          <td className={td}>{showDate(l.Podate)}</td><td className={cx(td, 'num')}>{l.Ebeln}</td><td className={cx(td, 'num')}>{l.Ebelp}</td><td className={td}><span className="num">{l.Vendor}</span>{l.Vendname && <span className="ml-1.5 text-muted">{l.Vendname}</span>}</td><td className={td}>{l.Plant}</td>
                          <td className={cx(td, 'num text-right')}>{fmtNum(l.Qtybase, 3)}</td><td className={td}>{l.Baseunit}</td>
                          <td className={cx(td, 'num text-right', l.Valuelocal < 0 && 'text-bad')}>{fmtNum(l.Valuelocal, 2)}</td><td className={cx(td, 'num text-right')}>{l.rate === null ? '—' : fmtNum(l.rate, 3)}</td><td className={cx(td, 'num text-right')}>{fmtNum(l.qtyShare * 100, 2)}%</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="sticky bottom-0 bg-sunken font-extrabold"><tr><td className={td} colSpan={5}>Total</td><td className={cx(td, 'num text-right')}>{fmtNum(b.totalQty, 3)}</td><td className={td}>{b.uom}</td><td className={cx(td, 'num text-right')}>{fmtNum(b.totalValue, 2)}</td><td className={cx(td, 'num text-right text-accent')}>{b.avg === null ? '—' : fmtNum(b.avg, 3)}</td><td className={cx(td, 'num text-right')}>100%</td></tr></tfoot>
                  </table>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
