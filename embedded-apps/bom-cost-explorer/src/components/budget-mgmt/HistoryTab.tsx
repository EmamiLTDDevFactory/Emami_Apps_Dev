'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { Button, Card, Field, Spinner, cx, inputCls } from '../ui';
import { CatBadge, ErrorBox, NO_RECORDS, SkeletonRows, SourceChip, errorText, td, th } from './shared';
import { fetchHistory, fetchRateSources } from '@/lib/budgetMgmt/api';
import { COUNTRIES, MATERIAL_TYPES, type BudHistRow, type BudRateSrcRow, type HistoryFilter } from '@/lib/budgetMgmt/types';
import { defaultHistWindow, groupHistory, showDate, stripZeros, validateHistory, type Errors } from '@/lib/budgetMgmt/rules';
import { fmtNum } from '@/lib/format';

const plantKey = (g: string, r: BudHistRow) => `${g}|${r.Werks}`;

export default function HistoryTab({ gjahr }: { gjahr: string }) {
  const [f, setF] = useState<HistoryFilter>(() => { const w = defaultHistWindow(gjahr); return { land1: 'IN', gjahr, histFrom: w.from, histTo: w.to, catAFrom: '8,000,000', catBFrom: '4,000,000', mtart: [] }; });
  const [errs, setErrs] = useState<Errors<keyof HistoryFilter>>({});
  const [rows, setRows] = useState<BudHistRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState('');
  const [plantOpen, setPlantOpen] = useState('');
  const [sources, setSources] = useState<Record<string, { rows?: BudRateSrcRow[]; error?: string; loading?: boolean }>>({});

  // The shared fiscal year pre-fills this tab (and moves the history window with it).
  useEffect(() => { const w = defaultHistWindow(gjahr); setF((x) => ({ ...x, gjahr, histFrom: w.from, histTo: w.to })); }, [gjahr]);
  const set = <K extends keyof HistoryFilter>(k: K, v: HistoryFilter[K]) => setF((x) => ({ ...x, [k]: v }));

  async function load() {
    const e = validateHistory(f);
    setErrs(e);
    if (Object.keys(e).length) return;
    setLoading(true); setError(''); setOpen(''); setPlantOpen(''); setSources({}); setRows(null);
    try { setRows(await fetchHistory(f)); } catch (x) { setError(errorText(x)); }
    setLoading(false);
  }

  async function togglePlant(r: BudHistRow, k: string) {
    if (plantOpen === k) return setPlantOpen('');
    setPlantOpen(k);
    if (sources[k]) return;
    try { setSources((s) => ({ ...s, [k]: { loading: true } })); const list = await fetchRateSources(r.Matnr, r.Werks, r.Land1 || f.land1); setSources((s) => ({ ...s, [k]: { rows: list } })); }
    catch (x) { setSources((s) => ({ ...s, [k]: { error: errorText(x) } })); }
  }

  const groups = useMemo(() => groupHistory(rows ?? []), [rows]);
  const counts = useMemo(() => { const c = { A: 0, B: 0, C: 0 }; for (const g of groups) if (g.Matcat in c) c[g.Matcat as 'A']++; return c; }, [groups]);
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
          <fieldset className="sm:col-span-2 lg:col-span-4 xl:col-span-7">
            <legend className="mb-1 text-xs font-semibold">Material type <span className="font-normal text-muted">(none ticked = all types)</span></legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {MATERIAL_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={(f.mtart ?? []).includes(t)} onChange={(e) => set('mtart', e.target.checked ? [...(f.mtart ?? []), t] : (f.mtart ?? []).filter((x) => x !== t))} />{t}</label>
              ))}
            </div>
          </fieldset>
          <div className="flex items-end"><Button type="submit" variant="primary" disabled={loading}>{loading ? <Spinner /> : <Search size={14} />} Load History</Button></div>
        </form>
      </Card>

      {error && <ErrorBox>{error}</ErrorBox>}
      {rows && rows.length > 0 && <p className="text-sm font-semibold text-ink">Loaded {groups.length} materials ({rows.length} plant rows) — Cat A: {counts.A} · Cat B: {counts.B} · Cat C: {counts.C}</p>}
      {rows && rows.length === 0 && !error && <Card><p className="py-6 text-center text-sm text-muted">{NO_RECORDS}</p></Card>}

      {(loading || (rows && rows.length > 0)) && (
        <Card bodyClass="p-0">
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10 bg-sunken">
                <tr><th className={th} /><th className={th}>Material</th><th className={th}>Description</th><th className={th}>Country</th><th className={th}>Plants</th><th className={th}>Type</th><th className={th}>UOM</th>
                  <th className={cx(th, 'text-right')}>Net Qty</th><th className={cx(th, 'text-right')}>Net Value</th><th className={th}>Curr</th><th className={cx(th, 'text-right')}>Avg Rate</th><th className={cx(th, 'text-right')}>Country Total</th><th className={th}>Cat</th></tr>
              </thead>
              {loading ? <SkeletonRows cols={13} /> : (
                <tbody>
                  {groups.map((g) => {
                    const isOpen = open === g.key;
                    return (
                      <Fragment key={g.key}>
                        <tr className="cursor-pointer border-b border-line/60 hover:bg-sunken/60" onClick={() => setOpen(isOpen ? '' : g.key)} aria-expanded={isOpen}>
                          <td className={td}>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                          <td className={cx(td, 'num')}>{stripZeros(g.Matnr)}</td><td className={td}>{g.Maktx}</td><td className={td}>{g.Land1}</td>
                          <td className={td} title={g.plants.map((p) => p.Werks).join(', ')}>{g.plants.length === 1 ? g.plants[0].Werks : `${g.plants.length} plants`}</td><td className={td}>{g.Mtart || '—'}</td><td className={td}>{g.BaseUom || '—'}</td>
                          <td className={cx(td, 'num text-right')}>{fmtNum(g.NetQty, 3)}</td><td className={cx(td, 'num text-right')}>{fmtNum(g.NetValue, 2)}</td><td className={td}>{g.Currency || '—'}</td>
                          <td className={cx(td, 'num text-right')}>{fmtNum(g.AvgRate, 6)}</td><td className={cx(td, 'num text-right')}>{fmtNum(g.CtryValue, 2)}</td><td className={td}><CatBadge cat={g.Matcat} /></td>
                        </tr>
                        {isOpen && (
                          <tr className="border-b border-line bg-bg">
                            <td colSpan={13} className="px-4 py-3">
                              <p className="mb-2 text-xs font-bold">{stripZeros(g.Matnr)} — {g.Maktx} — by plant <span className="font-normal text-muted">(click a plant for its rate sources)</span></p>
                              <table className="w-full max-w-4xl border-collapse">
                                <thead><tr><th className={th}>Plant</th><th className={th}>UOM</th><th className={cx(th, 'text-right')}>Net Qty</th><th className={cx(th, 'text-right')}>Net Value</th><th className={th}>Curr</th><th className={cx(th, 'text-right')}>Avg Rate</th></tr></thead>
                                <tbody>
                                  {g.plants.map((p) => {
                                    const k = plantKey(g.key, p); const pOpen = plantOpen === k; const s = sources[k];
                                    return (
                                      <Fragment key={k}>
                                        <tr className="cursor-pointer border-b border-line/60 hover:bg-sunken/60" onClick={() => void togglePlant(p, k)} aria-expanded={pOpen}>
                                          <td className={td}><span className="inline-flex items-center gap-1">{pOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{p.Werks}</span></td><td className={td}>{p.BaseUom}</td>
                                          <td className={cx(td, 'num text-right')}>{fmtNum(p.NetQty, 3)}</td><td className={cx(td, 'num text-right')}>{fmtNum(p.NetValue, 2)}</td><td className={td}>{p.Currency}</td><td className={cx(td, 'num text-right')}>{fmtNum(p.AvgRate, 6)}</td>
                                        </tr>
                                        {pOpen && (
                                          <tr className="border-b border-line">
                                            <td colSpan={6} className="px-3 py-2">
                                              <p className="mb-1 text-xs font-bold">Rate sources — plant {p.Werks}</p>
                                              {!s || s.loading ? <Spinner /> : s.error ? <ErrorBox>{s.error}</ErrorBox> : s.rows!.length === 0 ? <p className="text-xs text-muted">{NO_RECORDS}</p> : (
                                                <table className="w-full border-collapse">
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
                              </table>
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
