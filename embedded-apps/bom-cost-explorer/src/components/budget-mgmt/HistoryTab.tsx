'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { Wand2 } from 'lucide-react';
import { Button, Card, Field, Spinner, cx, inputCls } from '../ui';
import { CatBadge, ErrorBox, NO_RECORDS, OkBox, SkeletonRows, SourceChip, errorText, td, th } from './shared';
import { fetchHistory, fetchRateSources, fetchRateSrcDtl, fetchRates, postGenerate } from '@/lib/budgetMgmt/api';
import { COUNTRIES, MATERIAL_TYPES, type BudHistRow, type BudRateRow, type BudRateSrcDtlRow, type BudRateSrcRow, LAST_PRICE_MODES, type LastPriceMode, type HistoryFilter } from '@/lib/budgetMgmt/types';
import { BASIS_KEY, LASTP_KEY, RATE_BASES, avgBasePrice, lastPrice, type RateBasis, defaultHistWindow, filterHistory, groupHistory, historyBreakup, latestSourceRate, projectedValue, readBPriority, showDate, sortByCountryTotal, stripZeros, validateHistory, type Errors } from '@/lib/budgetMgmt/rules';
import { fmtNum } from '@/lib/format';

/** Rupees as lakhs (1 lakh = 100,000). */
const lakh = (v: number) => v / 100000;
const plantKey = (g: string, r: BudHistRow) => `${g}|${r.Bukrs}|${r.Werks}`;

export default function HistoryTab({ gjahr, email, onGenerated }: { gjahr: string; email: string; onGenerated: (g: { land1: string; gjahr: string; message: string }) => void }) {
  const [f, setF] = useState<HistoryFilter>(() => { const w = defaultHistWindow(gjahr); return { land1: 'IN', gjahr, histFrom: w.from, histTo: w.to, catAFrom: '8,000,000', catBFrom: '4,000,000', mtart: [] }; });
  const [errs, setErrs] = useState<Errors<keyof HistoryFilter>>({});
  const [rows, setRows] = useState<BudHistRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState('');
  const [plantOpen, setPlantOpen] = useState('');
  const [q, setQ] = useState('');
  const [cats, setCats] = useState<string[]>([]);
  // Freight and landed rate exist only on saved rates (Generate Draft Rates): read once per load and matched by material.
  const [saved, setSaved] = useState<Record<string, BudRateRow[]>>({});
  const [sources, setSources] = useState<Record<string, { rows?: BudRateSrcRow[]; error?: string; loading?: boolean }>>({});

  // The shared fiscal year pre-fills this tab (and moves the history window with it).
  useEffect(() => { const w = defaultHistWindow(gjahr); setF((x) => ({ ...x, gjahr, histFrom: w.from, histTo: w.to })); }, [gjahr]);
  const set = <K extends keyof HistoryFilter>(k: K, v: HistoryFilter[K]) => setF((x) => ({ ...x, [k]: v }));

  async function load() {
    const e = validateHistory(f);
    setErrs(e);
    if (Object.keys(e).length) return;
    setLoading(true); setError(''); setOpen(''); setPlantOpen(''); setSources({}); setRows(null); setSaved({});
    try { setRows(await fetchHistory(f)); } catch (x) { setError(errorText(x)); }
    setLoading(false);
    try { const rr = await fetchRates({ gjahr: f.gjahr, land1: f.land1, status: '' }); const m: Record<string, BudRateRow[]> = {}; for (const r of rr) (m[r.Matnr] ??= []).push(r); setSaved(m); } catch { /* freight and landed stay blank */ }
  }

  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState('');
  async function generate() {
    if (!email) return setGenErr('Your sign-in email is not available yet - please retry in a moment');
    if (!window.confirm(`Generate draft rates for ${f.land1} ${f.gjahr} from this history? SAP classifies every material (A / B / C), derives the basic rate and freight and saves a draft row for each.`)) return;
    setGenBusy(true); setGenErr('');
    try { const r = await postGenerate(f, email); onGenerated({ land1: f.land1, gjahr: f.gjahr, message: `${r.RowsActed} draft rates generated${r.Message ? ` — ${r.Message}` : ''}` }); }
    catch (x) { setGenErr(errorText(x)); }
    setGenBusy(false);
  }

  async function togglePlant(r: BudHistRow, k: string) {
    if (plantOpen === k) return setPlantOpen('');
    setPlantOpen(k);
    if (sources[k]) return;
    try { setSources((s) => ({ ...s, [k]: { loading: true } })); const list = await fetchRateSources(r.Matnr, r.Bukrs, r.Werks, r.Land1 || f.land1); setSources((s) => ({ ...s, [k]: { rows: list } })); }
    catch (x) { setSources((s) => ({ ...s, [k]: { error: errorText(x) } })); }
  }

  const [prio] = useState<string[]>(readBPriority);

  // Rate basis of the projection: Latest source (as before), Avg base price or Last purchase price (Info record / Contract), globally and per material (BudRateSrcDtlSet).
  const [basis, setBasisState] = useState<RateBasis>('LATEST');
  const [lpMode, setLpModeState] = useState<LastPriceMode>('IR_C');
  const [rowSel, setRowSel] = useState<Record<string, { basis: RateBasis; mode: LastPriceMode }>>({});
  const [dtl, setDtl] = useState<Record<string, BudRateSrcDtlRow[] | { error: string }>>({});
  useEffect(() => { try { const b = localStorage.getItem(BASIS_KEY); if (RATE_BASES.some((x) => x.v === b)) setBasisState(b as RateBasis); const m = localStorage.getItem(LASTP_KEY); if (LAST_PRICE_MODES.some((x) => x.v === m)) setLpModeState(m as LastPriceMode); } catch { /* defaults */ } }, []);
  const setBasis = (v: RateBasis) => { setBasisState(v); try { localStorage.setItem(BASIS_KEY, v); } catch { /* not kept */ } };
  const setLpMode = (v: LastPriceMode) => { setLpModeState(v); try { localStorage.setItem(LASTP_KEY, v); } catch { /* not kept */ } };
  const groups = useMemo(() => sortByCountryTotal(groupHistory(rows ?? [])), [rows]);
  const dKey = (g: (typeof groups)[number]) => `${g.Matnr}|${g.plants[0]?.Bukrs || '1000'}|${g.Land1 || f.land1}`;
  useEffect(() => {
    setDtl({}); setRowSel({});
    if (!groups.length) return;
    let live = true; let next = 0;
    const worker = async () => { while (live && next < groups.length) { const g = groups[next++]; try { const list = await fetchRateSrcDtl(g.Matnr, g.plants[0]?.Bukrs ?? '', g.Land1 || f.land1); if (live) setDtl((x) => ({ ...x, [dKey(g)]: list })); } catch (x) { if (live) setDtl((y) => ({ ...y, [dKey(g)]: { error: errorText(x) } })); } } };
    for (let i = 0; i < 3; i++) void worker();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);
  const dtlError = Object.values(dtl).find((v): v is { error: string } => !Array.isArray(v));

  // Projected rate: the latest rate source of every material, read in table order (biggest country total first), a few at a time.
  const [proj, setProj] = useState<Record<string, { rate: number | null; failed?: string }>>({});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setProj({});
    if (!groups.length) return;
    let live = true; let next = 0;
    const one = async (g: (typeof groups)[number]) => {
      try {
        const lists = await Promise.all(g.plants.map(async (p) => { const k = plantKey(g.key, p); const list = await fetchRateSources(p.Matnr, p.Bukrs, p.Werks, p.Land1 || f.land1); if (live) setSources((s) => ({ ...s, [k]: { rows: list } })); return list; }));
        if (live) setProj((x) => ({ ...x, [g.key]: { rate: latestSourceRate(lists.flat()) } }));
      } catch (x) { if (live) setProj((y) => ({ ...y, [g.key]: { rate: null, failed: errorText(x) } })); }
    };
    const worker = async () => { while (live && next < groups.length) await one(groups[next++]); };
    for (let i = 0; i < 3; i++) void worker();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, retry]);
  const failed = Object.values(proj).filter((x) => x.failed);
  const projDone = Object.keys(proj).length;
  const shown = useMemo(() => filterHistory(groups, q, cats), [groups, q, cats]);
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
      {genErr && <ErrorBox>{genErr}</ErrorBox>}
      {rows && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel px-3 py-2 shadow-card">
          <Button variant="primary" onClick={() => void generate()} disabled={genBusy}>{genBusy ? <Spinner /> : <Wand2 size={14} />} Generate Draft Rates</Button>
          <span className="text-xs text-muted">Saves a draft rate (status D) for every material of this history; you edit and submit them in Rates & Edit.</span>
        </div>
      )}
      {rows && rows.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-panel px-3 py-2 shadow-card">
          <Field label="Projected rate basis (global)">{(id) => <select id={id} className={inputCls} value={basis} onChange={(e) => setBasis(e.target.value as RateBasis)}>{RATE_BASES.map((b) => <option key={b.v} value={b.v}>{b.label}</option>)}</select>}</Field>
          <Field label="Last purchase price from">{(id) => <select id={id} className={inputCls} value={lpMode} onChange={(e) => setLpMode(e.target.value as LastPriceMode)}>{LAST_PRICE_MODES.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}</select>}</Field>
          <p className="max-w-xl pb-2 text-2xs text-muted">Proj Rate and Proj Value use this basis: the latest rate source (as before), SAP's weighted Avg base price (material + country), or the Last purchase price (latest Info record / Contract, in the order chosen; company code level). Each material can use its own basis in its Rate basis cell. The Last purchase price order is shared with Rates &amp; Edit.{dtlError && <span className="text-warn"> Avg base / last price could not be read: {dtlError.error}</span>}</p>
        </div>
      )}
      {rows && rows.length > 0 && <p className="text-sm font-semibold text-ink">Loaded {groups.length} materials ({rows.length} plant rows) — Cat A: {counts.A} · Cat B: {counts.B} · Cat C: {counts.C}</p>}
      {rows && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel px-3 py-2 shadow-card">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-faint" />
            <input aria-label="Filter by material" className={`${inputCls} w-72 pl-8`} placeholder="Material no. or description (comma for several)" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex items-center gap-1.5" role="group" aria-label="Filter by category">
            <span className="text-xs font-semibold">Category</span>
            {(['A', 'B', 'C'] as const).map((c) => (
              <button key={c} type="button" aria-pressed={cats.includes(c)} onClick={() => setCats((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]))}
                className={cx('rounded-full px-3 py-1 text-xs font-bold ring-1', cats.includes(c) ? 'bg-accent text-white ring-accent' : 'bg-panel text-ink ring-line')}>{c} ({counts[c]})</button>
            ))}
          </div>
          <span className="text-xs text-muted">{shown.length} of {groups.length} materials</span>
          {projDone === groups.length && failed.length > 0 && <span className="text-xs font-semibold text-bad" title={failed[0].failed}>{failed.length} rate reads failed: {failed[0].failed} <button type="button" className="underline" onClick={() => setRetry((n) => n + 1)}>Retry</button></span>}
          {projDone < groups.length && <span className="text-xs text-muted">Reading latest rates: {projDone} / {groups.length}</span>}
          {(q || cats.length > 0) && <button type="button" className="text-xs font-semibold text-accent underline" onClick={() => { setQ(''); setCats([]); }}>Clear filters</button>}
        </div>
      )}
      {rows && rows.length === 0 && !error && <Card><p className="py-6 text-center text-sm text-muted">{NO_RECORDS}</p></Card>}

      {(loading || (rows && rows.length > 0)) && (
        <Card bodyClass="p-0">
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10 bg-sunken">
                <tr><th className={th} /><th className={th}>Material</th><th className={th}>Description</th><th className={th}>UOM</th>
                  <th className={cx(th, 'text-right')}>Net Qty</th><th className={cx(th, 'text-right')}>Net Value (Lakhs)</th><th className={th}>Curr</th><th className={cx(th, 'text-right')}>Avg Rate</th><th className={cx(th, 'text-right')}>Country Total</th><th className={cx(th, 'text-right')}>Avg Base Price</th><th className={th}>Last Price</th><th className={th}>Rate basis</th><th className={cx(th, 'text-right')}>Proj Rate</th><th className={cx(th, 'text-right')}>Proj Value (Lakhs)</th><th className={th}>Cat</th><th className={cx(th, 'text-right')}>Derived Rate</th><th className={cx(th, 'text-right')}>Freight</th><th className={cx(th, 'text-right')}>Landed Rate</th><th className={th}>Rule &amp; breakup</th></tr>
              </thead>
              {loading ? <SkeletonRows cols={19} /> : (
                <tbody>
                  {shown.map((g) => {
                    const isOpen = open === g.key;
                    return (
                      <Fragment key={g.key}>
                        <tr className="cursor-pointer border-b border-line/60 hover:bg-sunken/60" onClick={() => setOpen(isOpen ? '' : g.key)} aria-expanded={isOpen}>
                          <td className={td}>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                          <td className={cx(td, 'num')}>{stripZeros(g.Matnr)}</td><td className={td}>{g.Maktx}</td><td className={td}>{g.BaseUom || '—'}</td>
                          <td className={cx(td, 'num text-right')}>{fmtNum(g.NetQty, 3)}</td><td className={cx(td, 'num text-right')}>{fmtNum(lakh(g.NetValue), 3)}</td><td className={td}>{g.Currency || '—'}</td>
                          <td className={cx(td, 'num text-right')}>{fmtNum(g.AvgRate, 6)}</td><td className={cx(td, 'num text-right')}>{fmtNum(g.CtryValue, 2)}</td>{(() => {
                            const pr = proj[g.key]; const dd = dtl[dKey(g)]; const rows2 = Array.isArray(dd) ? dd : null;
                            const sel = rowSel[g.key]; const effBasis = sel?.basis ?? basis; const effMode = sel?.mode ?? lpMode;
                            const ab = rows2 ? avgBasePrice(rows2) : null; const lp = rows2 ? lastPrice(rows2, effMode) : null;
                            const dash = !dd ? '…' : !rows2 ? 'n/a' : null;
                            const rate = effBasis === 'AVG' ? (ab ? ab.RatePc : null) : effBasis === 'LAST' ? (lp ? lp.row.RatePc : null) : pr?.rate ?? null;
                            const ready = effBasis === 'LATEST' ? !!pr : !!dd;
                            const val = effBasis === 'AVG' ? 'A|IR_C' : effBasis === 'LAST' ? `L|${effMode}` : 'LATEST';
                            return <>
                              <td className={cx(td, 'num text-right')} title={!rows2 && dd ? (dd as { error: string }).error : ab ? `Weighted average base price, valid from ${showDate(ab.ValidFrom)}` : undefined}>{dash ?? (ab ? fmtNum(ab.RatePc, 3) : '—')}</td>
                              <td className={td}>{dash ?? (lp ? <span className="inline-flex items-center gap-1.5" title={`${lp.row.Vendor ? `${lp.row.Vendor} ${lp.row.Vendname} — ` : ''}valid from ${showDate(lp.row.ValidFrom)}`}><span className="num font-bold">{fmtNum(lp.row.RatePc, 3)}</span><SourceChip src={lp.row.RateSrc} /></span> : '—')}</td>
                              <td className={td} onClick={(e) => e.stopPropagation()}>
                                <select aria-label="Rate basis of this material" className="rounded border border-line bg-panel px-1 py-0.5 text-2xs" value={sel ? val : ''}
                                  onChange={(e) => { const v = e.target.value; setRowSel((x) => { const { [g.key]: _, ...rest } = x; if (!v) return rest; if (v === 'LATEST') return { ...rest, [g.key]: { basis: 'LATEST', mode: lpMode } }; const [b, m] = v.split('|'); return { ...rest, [g.key]: { basis: b === 'A' ? 'AVG' : 'LAST', mode: m as LastPriceMode } }; }); }}>
                                  <option value="">Global</option><option value="LATEST">Latest source</option><option value="A|IR_C">Avg base price</option>
                                  {LAST_PRICE_MODES.map((m) => <option key={m.v} value={`L|${m.v}`}>Last: {m.label}</option>)}</select></td>
                              {!ready ? <><td className={cx(td, 'text-right text-faint')}>…</td><td className={cx(td, 'text-right text-faint')}>…</td></>
                                : <><td className={cx(td, 'num text-right')} title={effBasis === 'LATEST' ? pr?.failed : undefined}>{effBasis === 'LATEST' && pr?.failed ? 'error' : rate == null ? '—' : fmtNum(rate, 3)}</td><td className={cx(td, 'num text-right')}>{rate == null ? '—' : fmtNum(lakh(projectedValue(g.NetQty, rate)), 3)}</td></>}
                            </>; })()}
                          <td className={td}><CatBadge cat={g.Matcat} /></td>
                          {(() => {
                            if (!proj[g.key]) return <><td className={cx(td, 'text-right text-faint')}>…</td><td className={td} /><td className={td} /><td className={td}><span className="text-faint">…</span></td></>;
                            const bu = historyBreakup(g.Matcat, g.plants.flatMap((p) => sources[plantKey(g.key, p)]?.rows ?? []), prio);
                            return <><td className={cx(td, 'num text-right font-extrabold')}>{bu.derived == null ? '—' : fmtNum(bu.derived, 3)}</td>{(() => {
                              const sv = saved[g.Matnr] ?? [];
                              const one = (f: (r: BudRateRow) => number) => { const v = Array.from(new Set(sv.map(f))); return v.length === 0 ? '—' : v.length === 1 ? fmtNum(v[0], 3) : `${fmtNum(Math.min(...v), 3)} – ${fmtNum(Math.max(...v), 3)}`; };
                              const t = sv.length ? undefined : 'No saved rate yet — Generate Draft Rates';
                              return <><td className={cx(td, 'num text-right')} title={t}>{one((r) => r.FrtTotal)}</td><td className={cx(td, 'num text-right font-extrabold')} title={t}>{one((r) => r.LandedRate)}</td></>;
                            })()}
                              <td className="min-w-64 px-2 py-1.5 text-2xs"><div className="font-bold">{bu.rule}</div><div className="num text-muted">{bu.steps.map((x) => `${x.k} ${fmtNum(x.v, 3)}`).join(' · ')}</div></td></>;
                          })()}
                        </tr>
                        {isOpen && (
                          <tr className="border-b border-line bg-bg">
                            <td colSpan={19} className="px-4 py-3">
                              <p className="mb-2 text-xs font-bold">{stripZeros(g.Matnr)} — {g.Maktx} — by plant <span className="font-normal text-muted">(click a plant for its rate sources)</span></p>
                              <table className="w-full max-w-4xl border-collapse">
                                <thead><tr><th className={th}>Plant</th><th className={th}>UOM</th><th className={cx(th, 'text-right')}>Net Qty</th><th className={cx(th, 'text-right')}>Net Value (Lakhs)</th><th className={th}>Curr</th><th className={cx(th, 'text-right')}>Avg Rate</th></tr></thead>
                                <tbody>
                                  {g.plants.map((p) => {
                                    const k = plantKey(g.key, p); const pOpen = plantOpen === k; const s = sources[k];
                                    return (
                                      <Fragment key={k}>
                                        <tr className="cursor-pointer border-b border-line/60 hover:bg-sunken/60" onClick={() => void togglePlant(p, k)} aria-expanded={pOpen}>
                                          <td className={td}><span className="inline-flex items-center gap-1">{pOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{p.Werks}</span></td><td className={td}>{p.BaseUom}</td>
                                          <td className={cx(td, 'num text-right')}>{fmtNum(p.NetQty, 3)}</td><td className={cx(td, 'num text-right')}>{fmtNum(lakh(p.NetValue), 3)}</td><td className={td}>{p.Currency}</td><td className={cx(td, 'num text-right')}>{fmtNum(p.AvgRate, 6)}</td>
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
                  {!shown.length && <tr><td colSpan={19} className="px-3 py-8 text-center text-sm text-muted">No materials match the filter</td></tr>}
                </tbody>
              )}
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
