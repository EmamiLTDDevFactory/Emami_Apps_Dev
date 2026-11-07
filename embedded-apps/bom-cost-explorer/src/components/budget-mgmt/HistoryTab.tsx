'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { Button, Card, Field, Spinner, cx, inputCls } from '../ui';
import { CatBadge, ErrorBox, NO_RECORDS, SkeletonRows, SourceChip, errorText, td, th } from './shared';
import { fetchHistory, fetchRateSources } from '@/lib/budgetMgmt/api';
import { COUNTRIES, type BudHistRow, type BudRateSrcRow, type HistoryFilter } from '@/lib/budgetMgmt/types';
import { defaultHistWindow, showDate, stripZeros, validateHistory, type Errors } from '@/lib/budgetMgmt/rules';
import { fmtNum } from '@/lib/format';

const rowKey = (r: BudHistRow, i: number) => r.Rowid || `${r.Matnr}|${r.Werks}|${i}`;

export default function HistoryTab({ gjahr }: { gjahr: string }) {
  const [f, setF] = useState<HistoryFilter>(() => { const w = defaultHistWindow(gjahr); return { land1: 'IN', gjahr, histFrom: w.from, histTo: w.to, catAFrom: '8,000,000', catBFrom: '4,000,000' }; });
  const [errs, setErrs] = useState<Errors<keyof HistoryFilter>>({});
  const [rows, setRows] = useState<BudHistRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState('');
  const [sources, setSources] = useState<Record<string, { rows?: BudRateSrcRow[]; error?: string; loading?: boolean }>>({});

  // The shared fiscal year pre-fills this tab (and moves the history window with it).
  useEffect(() => { const w = defaultHistWindow(gjahr); setF((x) => ({ ...x, gjahr, histFrom: w.from, histTo: w.to })); }, [gjahr]);
  const set = <K extends keyof HistoryFilter>(k: K, v: HistoryFilter[K]) => setF((x) => ({ ...x, [k]: v }));

  async function load() {
    const e = validateHistory(f);
    setErrs(e);
    if (Object.keys(e).length) return;
    setLoading(true); setError(''); setOpen(''); setSources({}); setRows(null);
    try { setRows(await fetchHistory(f)); } catch (x) { setError(errorText(x)); }
    setLoading(false);
  }

  async function toggle(r: BudHistRow, k: string) {
    if (open === k) return setOpen('');
    setOpen(k);
    if (sources[k]) return;
    try { setSources((s) => ({ ...s, [k]: { loading: true } })); const list = await fetchRateSources(r.Matnr, r.Werks, r.Land1 || f.land1); setSources((s) => ({ ...s, [k]: { rows: list } })); }
    catch (x) { setSources((s) => ({ ...s, [k]: { error: errorText(x) } })); }
  }

  const counts = useMemo(() => { const c = { A: 0, B: 0, C: 0 }; for (const r of rows ?? []) if (r.Matcat in c) c[r.Matcat as 'A']++; return c; }, [rows]);
  const num = (k: keyof HistoryFilter) => (v: string) => set(k, v);

  return (
    <div className="flex flex-col gap-3">
      <Card title="Filters">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7" onSubmit={(e) => { e.preventDefault(); void load(); }}>
          <Field label="Country" error={errs.land1}>{(id) => <select id={id} className={cx(inputCls, errs.land1 && 'border-bad')} value={f.land1} onChange={(e) => set('land1', e.target.value)}>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select>}</Field>
          <Field label="Year" error={errs.gjahr}>{(id) => <input id={id} className={cx(inputCls, errs.gjahr && 'border-bad')} inputMode="numeric" maxLength={4} value={f.gjahr} onChange={(e) => set('gjahr', e.target.value)} />}</Field>
          <Field label="From" error={errs.histFrom}>{(id) => <input id={id} type="date" className={cx(inputCls, errs.histFrom && 'border-bad')} value={f.histFrom} onChange={(e) => set('histFrom', e.target.value)} />}</Field>
          <Field label="To" error={errs.histTo}>{(id) => <input id={id} type="date" className={cx(inputCls, errs.histTo && 'border-bad')} value={f.histTo} onChange={(e) => set('histTo', e.target.value)} />}</Field>
          <Field label="Cat A ≥" error={errs.catAFrom}>{(id) => <input id={id} className={cx(inputCls, errs.catAFrom && 'border-bad')} inputMode="decimal" value={f.catAFrom} onChange={(e) => num('catAFrom')(e.target.value)} />}</Field>
          <Field label="Cat B ≥" error={errs.catBFrom}>{(id) => <input id={id} className={cx(inputCls, errs.catBFrom && 'border-bad')} inputMode="decimal" value={f.catBFrom} onChange={(e) => num('catBFrom')(e.target.value)} />}</Field>
          <div className="flex items-end"><Button type="submit" variant="primary" disabled={loading}>{loading ? <Spinner /> : <Search size={14} />} Load History</Button></div>
        </form>
      </Card>

      {error && <ErrorBox>{error}</ErrorBox>}
      {rows && rows.length > 0 && <p className="text-sm font-semibold text-ink">Loaded {rows.length} materials — Cat A: {counts.A} · Cat B: {counts.B} · Cat C: {counts.C}</p>}
      {rows && rows.length === 0 && !error && <Card><p className="py-6 text-center text-sm text-muted">{NO_RECORDS}</p></Card>}

      {(loading || (rows && rows.length > 0)) && (
        <Card bodyClass="p-0">
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10 bg-sunken">
                <tr><th className={th} /><th className={th}>Material</th><th className={th}>Description</th><th className={th}>Country</th><th className={th}>Plant</th><th className={th}>Type</th><th className={th}>UOM</th>
                  <th className={cx(th, 'text-right')}>Net Qty</th><th className={cx(th, 'text-right')}>Net Value</th><th className={th}>Curr</th><th className={cx(th, 'text-right')}>Avg Rate</th><th className={cx(th, 'text-right')}>Country Total</th><th className={th}>Cat</th></tr>
              </thead>
              {loading ? <SkeletonRows cols={13} /> : (
                <tbody>
                  {rows!.map((r, i) => {
                    const k = rowKey(r, i); const isOpen = open === k; const s = sources[k];
                    return (
                      <Fragment key={k}>
                        <tr className="cursor-pointer border-b border-line/60 hover:bg-sunken/60" onClick={() => void toggle(r, k)} aria-expanded={isOpen}>
                          <td className={td}>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                          <td className={cx(td, 'num')}>{stripZeros(r.Matnr)}</td><td className={td}>{r.Maktx}</td><td className={td}>{r.Land1}</td><td className={td}>{r.Werks}</td><td className={td}>{r.Mtart}</td><td className={td}>{r.BaseUom}</td>
                          <td className={cx(td, 'num text-right')}>{fmtNum(r.NetQty, 3)}</td><td className={cx(td, 'num text-right')}>{fmtNum(r.NetValue, 2)}</td><td className={td}>{r.Currency}</td>
                          <td className={cx(td, 'num text-right')}>{fmtNum(r.AvgRate, 6)}</td><td className={cx(td, 'num text-right')}>{fmtNum(r.CtryValue, 2)}</td><td className={td}><CatBadge cat={r.Matcat} /></td>
                        </tr>
                        {isOpen && (
                          <tr className="border-b border-line bg-bg">
                            <td colSpan={13} className="px-4 py-3">
                              <p className="mb-2 text-xs font-bold">{stripZeros(r.Matnr)} — {r.Maktx} — Rate sources</p>
                              {!s || s.loading ? <Spinner /> : s.error ? <ErrorBox>{s.error}</ErrorBox> : s.rows!.length === 0 ? <p className="text-xs text-muted">{NO_RECORDS}</p> : (
                                <table className="w-full max-w-4xl border-collapse">
                                  <thead><tr><th className={th}>Source</th><th className={th}>Cond</th><th className={th}>Vendor</th><th className={cx(th, 'text-right')}>Rate</th><th className={th}>Curr</th><th className={cx(th, 'text-right')}>Per</th><th className={th}>Valid</th><th className={cx(th, 'text-right')}>Rate/Pc (INR)</th></tr></thead>
                                  <tbody>{s.rows!.map((x, j) => (
                                    <tr key={j} className="border-b border-line/60">
                                      <td className={td}><SourceChip src={x.RateSrc} /></td><td className={td}>{x.CondType || '—'}</td><td className={td}>{x.Vendor ? `${x.Vendor} ${x.Vendname}` : '—'}</td>
                                      <td className={cx(td, 'num text-right')}>{fmtNum(x.Rate, 2)}</td><td className={td}>{x.Currency}</td><td className={cx(td, 'num text-right')}>{x.PriceUnit || '—'}</td>
                                      <td className={td}>{x.ValidFrom ? `${showDate(x.ValidFrom)} – ${showDate(x.ValidTo)}` : '—'}</td>
                                      <td className={cx(td, 'num text-right font-extrabold text-accent')}>{fmtNum(x.RatePc, 2)}</td>
                                    </tr>))}</tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              )}
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
