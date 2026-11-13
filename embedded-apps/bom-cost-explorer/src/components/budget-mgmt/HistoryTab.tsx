'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { BarChart3, Truck, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { Wand2 } from 'lucide-react';
import BasePriceBreakup from './BasePriceBreakup';
import FreightBreakup from './FreightBreakup';
import { Button, Field, Spinner, cx, inputCls } from '../ui';
import { CatBadge, ErrorBox, Panel, StatTile, bandClass, FilterRow, SegmentBadge, SegmentChips, type SegmentFilter, NO_RECORDS, OkBox, SkeletonRows, SourceChip, errorText, td, th } from './shared';
import { fetchHistory, fetchRateSrcDtl, fetchRates, postGenerate } from '@/lib/budgetMgmt/api';
import { COUNTRIES, MATERIAL_TYPES, type BudHistRow, type BudRateRow, type BudRateSrcDtlRow, LAST_PRICE_MODES, type LastPriceMode, type HistoryFilter } from '@/lib/budgetMgmt/types';
import { csvList, CATBASIS_KEY, BASIS_KEY, LASTP_KEY, landedRate, rowMatches, type ColFilters, freightText, RATE_BASES, avgBasePrice, lastPrice, type RateBasis, defaultHistWindow, filterHistory, groupHistory, historyBreakup, projectedValue, readBPriority, showDate, sortByCountryTotal, stripZeros, validateHistory, type Errors } from '@/lib/budgetMgmt/rules';
import { fmtNum } from '@/lib/format';

/** Rupees as lakhs (1 lakh = 100,000). */
const lakh = (v: number) => v / 100000;
const plantKey = (g: string, r: BudHistRow) => `${g}|${r.Bukrs}|${r.Werks}`;

export default function HistoryTab({ segment, setSegment, gjahr, email, onGenerated }: { segment: SegmentFilter; setSegment: (v: SegmentFilter) => void; gjahr: string; email: string; onGenerated: (g: { land1: string; gjahr: string; message: string }) => void }) {
  const [f, setF] = useState<HistoryFilter>(() => { const w = defaultHistWindow(gjahr); return { land1: 'IN', gjahr, histFrom: w.from, histTo: w.to, catAFrom: '8,000,000', catBFrom: '4,000,000', mtart: [] }; });
  const [errs, setErrs] = useState<Errors<keyof HistoryFilter>>({});
  const [rows, setRows] = useState<BudHistRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState('');
  const [q, setQ] = useState('');
  const [cats, setCats] = useState<string[]>([]);
  // Freight and landed rate exist only on saved rates (Generate Draft Rates): read once per load and matched by material.
  const [saved, setSaved] = useState<Record<string, BudRateRow[]>>({});

  // The shared fiscal year pre-fills this tab (and moves the history window with it).
  useEffect(() => { const w = defaultHistWindow(gjahr); setF((x) => ({ ...x, gjahr, histFrom: w.from, histTo: w.to })); }, [gjahr]);
  const set = <K extends keyof HistoryFilter>(k: K, v: HistoryFilter[K]) => setF((x) => ({ ...x, [k]: v }));

  async function load() {
    const e = validateHistory(f);
    setErrs(e);
    if (Object.keys(e).length) return;
    setLoading(true); setError(''); setOpen(''); setPicked([]); setPasteMsg(''); setRows(null); setSaved({});
    try { setRows(await fetchHistory(f)); } catch (x) { setError(errorText(x)); }
    setLoading(false);
    try { const rr = await fetchRates({ gjahr: f.gjahr, land1: f.land1, status: '' }); const m: Record<string, BudRateRow[]> = {}; for (const r of rr) (m[r.Matnr] ??= []).push(r); setSaved(m); } catch { /* freight and landed stay blank */ }
  }

  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState('');
  // Materials ticked in the table (single or several): Generate Draft Rates can run for just those.
  const [picked, setPicked] = useState<string[]>([]);
  const [pasteList, setPasteList] = useState('');
  const [pasteMsg, setPasteMsg] = useState('');
  async function generate(only: string[] = []) {
    if (!email) return setGenErr('Your sign-in email is not available yet - please retry in a moment');
    const what = only.length ? `${only.length} selected material${only.length === 1 ? '' : 's'}` : 'every material of this history';
    if (!window.confirm(`Generate draft rates for ${what} (${f.land1} ${f.gjahr})? SAP classifies each material (A / B / C), derives the basic rate and freight and saves a draft row for each.`)) return;
    setGenBusy(true); setGenErr('');
    try { const r = await postGenerate(f, email, only); onGenerated({ land1: f.land1, gjahr: f.gjahr, message: `${r.RowsActed} draft rates generated${r.Message ? ` — ${r.Message}` : ''}` }); }
    catch (x) { setGenErr(errorText(x)); }
    setGenBusy(false);
  }

  const [prio] = useState<string[]>(readBPriority);
  const [frtBk, setFrtBk] = useState<{ matnr: string; land1: string; histFrom: string; histTo: string; finalBasic: number | null; title: string } | null>(null);
  const [breakup, setBreakup] = useState<{ matnr: string; bukrs: string; land1: string; title: string } | null>(null);

  // Rate basis of the projection: Avg base price or Last purchase price (Info record / Contract), globally and per material (BudRateSrcDtlSet).
  const [basis, setBasisState] = useState<RateBasis>('LAST');
  const [lpMode, setLpModeState] = useState<LastPriceMode>('IR_C');
  const [rowSel, setRowSel] = useState<Record<string, { basis: RateBasis; mode: LastPriceMode }>>({});
  const [dtl, setDtl] = useState<Record<string, BudRateSrcDtlRow[] | { error: string }>>({});
  useEffect(() => { try { const b = localStorage.getItem(BASIS_KEY); if (RATE_BASES.some((x) => x.v === b)) setBasisState(b as RateBasis); const m = localStorage.getItem(LASTP_KEY); if (LAST_PRICE_MODES.some((x) => x.v === m)) setLpModeState(m as LastPriceMode); } catch { /* defaults */ } }, []);
  const setBasis = (v: RateBasis) => { setBasisState(v); try { localStorage.setItem(BASIS_KEY, v); } catch { /* not kept */ } };
  const setLpMode = (v: LastPriceMode) => { setLpModeState(v); try { localStorage.setItem(LASTP_KEY, v); } catch { /* not kept */ } };
  // Category-wise global rate basis: A, B and C can each have their own ('' = the global one). Order of precedence: the material's own choice, its category's, the global one.
  const [catSel, setCatSelState] = useState<Record<string, string>>({});
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem(CATBASIS_KEY) ?? 'null'); if (v && typeof v === 'object') setCatSelState(v); } catch { /* none */ } }, []);
  const setCatSel = (cat: string, v: string) => setCatSelState((x) => { const n = { ...x, [cat]: v }; try { localStorage.setItem(CATBASIS_KEY, JSON.stringify(n)); } catch { /* not kept */ } return n; });
  const effOf = (g: { key: string; Matcat: string }): { basis: RateBasis; mode: LastPriceMode } => {
    const own = rowSel[g.key]; if (own) return { basis: own.basis, mode: own.mode };
    const c = catSel[g.Matcat] ?? '';
    if (c === 'AVG') return { basis: 'AVG', mode: lpMode };
    if (c.startsWith('L|') && LAST_PRICE_MODES.some((m) => m.v === c.slice(2))) return { basis: 'LAST', mode: c.slice(2) as LastPriceMode };
    return { basis, mode: lpMode };
  };
  const groups = useMemo(() => sortByCountryTotal(groupHistory(rows ?? [])), [rows]);
  const dKey = (g: (typeof groups)[number]) => `${g.Matnr}|${g.plants[0]?.Bukrs || '1000'}|${g.Land1 || f.land1}`;
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setDtl({}); setRowSel({});
    if (!groups.length) return;
    let live = true; let next = 0;
    const worker = async () => { while (live && next < groups.length) { const g = groups[next++]; try { const list = await fetchRateSrcDtl(g.Matnr, g.plants[0]?.Bukrs ?? '', g.Land1 || f.land1); if (live) setDtl((x) => ({ ...x, [dKey(g)]: list })); } catch (x) { if (live) setDtl((y) => ({ ...y, [dKey(g)]: { error: errorText(x) } })); } } };
    for (let i = 0; i < 3; i++) void worker();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, retry]);
  const dtlError = Object.values(dtl).find((v): v is { error: string } => !Array.isArray(v));

  const dtlFailed = Object.values(dtl).filter((v) => !Array.isArray(v)).length;
  const dtlDone = Object.keys(dtl).length;
  const searched = useMemo(() => filterHistory(groups, q, cats).filter((g) => segment === 'ALL' || g.Segment === segment), [groups, q, cats, segment]);
  const segCounts = useMemo(() => ({ ALL: groups.length, 'Raw Material': groups.filter((g) => g.Segment === 'Raw Material').length, Perfume: groups.filter((g) => g.Segment === 'Perfume').length }), [groups]);
  // Column filters: one expression per column, on the same values the table shows.
  const [colF, setColF] = useState<ColFilters>({});
  const filtering = Object.values(colF).some((v) => v.trim());
  const shown = filtering ? searched.filter((g) => {
    const dd = dtl[dKey(g)]; const rows2 = Array.isArray(dd) ? dd : null;
    const sel = rowSel[g.key]; const { basis: effBasis, mode: effMode } = effOf(g);
    const ab = rows2 ? avgBasePrice(rows2) : null; const lp = rows2 ? lastPrice(rows2, effMode) : null;
    const rate = effBasis === 'AVG' ? (ab ? ab.RatePc : null) : (lp ? lp.row.RatePc : null);
    const bu = rows2 ? historyBreakup(g.Matcat, rows2, prio, effMode) : null;
    const sv = saved[g.Matnr] ?? [];
    const spread = (f: (r: BudRateRow) => number) => (sv.length ? Math.max(...sv.map(f)) : null);
    return rowMatches({
      material: stripZeros(g.Matnr), description: g.Maktx, uom: g.BaseUom, netQty: g.NetQty, netValue: lakh(g.NetValue), curr: g.Currency, avgRate: g.AvgRate, ctryValue: g.CtryValue,
      avgBase: ab ? ab.RatePc : null, lastPrice: lp ? lp.row.RatePc : null, lastSrc: lp ? lp.row.RateSrc : '', basis: sel ? (sel.basis === 'AVG' ? 'Avg base price' : `Last ${sel.mode}`) : 'Global',
      projRate: rate, projValue: rate == null ? null : lakh(projectedValue(g.NetQty, rate)), cat: g.Matcat, segment: g.Segment, derived: bu ? bu.derived : null, freight: sv.length ? spread((r) => r.FrtTotal) : bu?.pick ? bu.pick.FrtTotal : null, landed: sv.length ? spread((r) => r.LandedRate) : bu?.pick ? landedRate(bu.pick.RatePc, bu.pick.FrtTotal, true) : null,
      frtTotal: ab ? ab.FrtTotal : null,
      rule: bu ? `${bu.rule} ${bu.steps.map((x) => x.k).join(' ')}` : '',
    }, colF);
  }) : searched;
  const counts = useMemo(() => { const c = { A: 0, B: 0, C: 0 }; for (const g of groups) if (g.Matcat in c) c[g.Matcat as 'A']++; return c; }, [groups]);
  const num = (k: keyof HistoryFilter) => (v: string) => set(k, v);

  return (
    <div className="flex flex-col gap-3">
      <Panel title="Filters" tone="accent">
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
      </Panel>

      {error && <ErrorBox>{error}</ErrorBox>}
      {genErr && <ErrorBox>{genErr}</ErrorBox>}
      {rows && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent/30 bg-gradient-to-r from-accent/10 via-panel to-sim/10 px-3 py-2 shadow-card">
          <Button variant="primary" onClick={() => void generate()} disabled={genBusy}>{genBusy ? <Spinner /> : <Wand2 size={14} />} Generate Draft Rates (all)</Button>
          <Button onClick={() => void generate(picked)} disabled={genBusy || !picked.length}>{genBusy ? <Spinner /> : <Wand2 size={14} />} Generate for selected ({picked.length})</Button>
          <span className="text-xs text-muted">Saves a draft rate (status D) for every material of this history, or only for the ticked materials; you edit and submit them in Rates & Edit.</span>
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); const want = csvList(pasteList); const have = new Map(groups.map((g) => [stripZeros(g.Matnr).toUpperCase(), g.Matnr])); const hit = want.map((w) => have.get(stripZeros(w).toUpperCase())).filter((x): x is string => !!x); const miss = want.filter((w) => !have.has(stripZeros(w).toUpperCase())); setPicked(Array.from(new Set([...picked, ...hit]))); setPasteMsg(`${hit.length} selected${miss.length ? `, not in this history: ${miss.join(', ')}` : ''}`); }}>
            <input aria-label="Select materials by number" className={`${inputCls} w-80`} placeholder="Paste material numbers to select" value={pasteList} onChange={(e) => setPasteList(e.target.value)} />
            <Button type="submit" size="sm" disabled={!pasteList.trim()}>Select</Button>
            {pasteMsg && <span className="text-xs text-muted">{pasteMsg}</span>}
          </form>
        </div>
      )}
      {rows && rows.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-panel px-3 py-2 shadow-card">
          <Field label="Projected rate basis (global)">{(id) => <select id={id} className={inputCls} value={basis} onChange={(e) => setBasis(e.target.value as RateBasis)}>{RATE_BASES.map((b) => <option key={b.v} value={b.v}>{b.label}</option>)}</select>}</Field>
          <Field label="Last purchase price from">{(id) => <select id={id} className={inputCls} value={lpMode} onChange={(e) => setLpMode(e.target.value as LastPriceMode)}>{LAST_PRICE_MODES.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}</select>}</Field>
          <fieldset className="pb-0.5"><legend className="mb-1 text-xs font-semibold">By category <span className="font-normal text-muted">(overrides the global basis)</span></legend>
            <div className="flex gap-2">{(['A', 'B', 'C'] as const).map((c) => (
              <label key={c} className="flex items-center gap-1 text-xs font-bold"><CatBadge cat={c} />
                <select aria-label={`Rate basis of category ${c}`} className="h-9 rounded-xl border border-line bg-panel px-2 text-xs font-normal" value={catSel[c] ?? ''} onChange={(e) => setCatSel(c, e.target.value)}>
                  <option value="">Global</option><option value="AVG">Avg base price</option>{LAST_PRICE_MODES.map((m) => <option key={m.v} value={`L|${m.v}`}>Last: {m.label}</option>)}</select></label>
            ))}</div>
          </fieldset>
          <p className="max-w-xl pb-2 text-2xs text-muted">Proj Rate and Proj Value use this basis: SAP's weighted Avg base price (material + country) or the Last purchase price (latest Info record / Contract, in the order chosen; company code level). Each material can use its own basis in its Rate basis cell. The Last purchase price order is shared with Rates &amp; Edit.{dtlError && <span className="text-warn"> Avg base / last price could not be read: {dtlError.error}</span>}</p>
        </div>
      )}
      {rows && rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Materials" value={groups.length} sub={`${rows.length} plant rows`} tone="accent" />
          <StatTile label="Category A" value={counts.A} sub="top value" tone="good" />
          <StatTile label="Category B" value={counts.B} sub="mid value" tone="warn" />
          <StatTile label="Category C" value={counts.C} sub="long tail" tone="bad" />
          <StatTile label="Raw Material" value={segCounts['Raw Material']} sub="excl. perfume" tone="accent" />
          <StatTile label="Perfume" value={segCounts.Perfume} sub="ROH · group 106" tone="sim" />
        </div>
      )}
      {rows && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel px-3 py-2 shadow-card">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-faint" />
            <input aria-label="Filter by material" className={`${inputCls} w-72 pl-8`} placeholder="Material no. or description (comma for several)" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <SegmentChips value={segment} onChange={setSegment} counts={segCounts} />
          <div className="flex items-center gap-1.5" role="group" aria-label="Filter by category">
            <span className="text-xs font-semibold">Category</span>
            {(['A', 'B', 'C'] as const).map((c) => (
              <button key={c} type="button" aria-pressed={cats.includes(c)} onClick={() => setCats((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]))}
                className={cx('rounded-full px-3 py-1 text-xs font-bold ring-1', cats.includes(c) ? 'bg-accent text-white ring-accent' : 'bg-panel text-ink ring-line')}>{c} ({counts[c]})</button>
            ))}
          </div>
          <span className="text-xs text-muted">{shown.length} of {groups.length} materials</span>{filtering && <button type="button" className="text-xs font-semibold text-accent underline" onClick={() => setColF({})}>Clear column filters</button>}
          {dtlDone === groups.length && dtlFailed > 0 && <span className="text-xs font-semibold text-bad" title={dtlError?.error}>{dtlFailed} price reads failed: {dtlError?.error} <button type="button" className="underline" onClick={() => setRetry((n) => n + 1)}>Retry</button></span>}
          {dtlDone < groups.length && <span className="text-xs text-muted">Reading prices: {dtlDone} / {groups.length}</span>}
          {(q || cats.length > 0) && <button type="button" className="text-xs font-semibold text-accent underline" onClick={() => { setQ(''); setCats([]); }}>Clear filters</button>}
        </div>
      )}
      {rows && rows.length === 0 && !error && <Panel><p className="py-6 text-center text-sm text-muted">{NO_RECORDS}</p></Panel>}

      {(loading || (rows && rows.length > 0)) && (
        <Panel bodyClass="p-0">
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full border-collapse">
              <thead className="bm-thead sticky top-0 z-10">
                <tr><th className={th}><input type="checkbox" aria-label="Select all shown materials" checked={shown.length > 0 && shown.every((g) => picked.includes(g.Matnr))} onChange={(e) => setPicked(e.target.checked ? Array.from(new Set([...picked, ...shown.map((g) => g.Matnr)])) : picked.filter((m) => !shown.some((g) => g.Matnr === m)))} /></th><th className={th} /><th className={th}>Material</th><th className={th}>Description</th><th className={th}>UOM</th>
                  <th className={cx(th, 'text-right')}>Net Qty</th><th className={cx(th, 'text-right')}>Net Value (Lakhs)</th><th className={th}>Curr</th><th className={cx(th, 'text-right')}>Avg Rate</th><th className={cx(th, 'text-right')}>Country Total</th><th className={cx(th, 'text-right')}>Avg Base Price</th><th className={th}>Last Price</th><th className={th}>Rate basis</th><th className={cx(th, 'text-right')}>Proj Rate</th><th className={cx(th, 'text-right')}>Proj Value (Lakhs)</th><th className={th}>Cat</th><th className={th}>Segment</th><th className={cx(th, 'text-right')}>Derived Rate</th><th className={cx(th, 'text-right')}>Freight</th><th className={cx(th, 'text-right')}>Landed Rate</th><th className={cx(th, 'text-right')} title="BudRateSrcDtlSet BASE row: freight total of the material in the country (the breakup button shows the condition types, from FrtDtlSet)">Freight Total</th><th className={th}>Rule &amp; breakup</th></tr>
                <FilterRow filters={colF} setFilters={setColF} cols={[{ key: 'x00', off: true }, { key: 'x0', off: true }, ...['material', 'description', 'uom', 'netQty', 'netValue', 'curr', 'avgRate', 'ctryValue', 'avgBase', 'lastPrice'].map((key) => ({ key })), { key: 'basis' }, ...['projRate', 'projValue', 'cat', 'segment', 'derived', 'freight', 'landed', 'frtTotal', 'rule'].map((key) => ({ key }))]} />
              </thead>
              {loading ? <SkeletonRows cols={22} /> : (
                <tbody>
                  {shown.map((g) => {
                    const isOpen = open === g.key;
                    return (
                      <Fragment key={g.key}>
                        <tr className="bm-row cursor-pointer border-b border-line/60" onClick={() => setOpen(isOpen ? '' : g.key)} aria-expanded={isOpen}>
                          <td className={td} onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${stripZeros(g.Matnr)}`} checked={picked.includes(g.Matnr)} onChange={(e) => setPicked(e.target.checked ? [...picked, g.Matnr] : picked.filter((m) => m !== g.Matnr))} /></td>
                          <td className={td}>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                          <td className={cx(td, 'num')}>{stripZeros(g.Matnr)}</td><td className={td}>{g.Maktx}</td><td className={td}>{g.BaseUom || '—'}</td>
                          <td className={cx(td, 'num text-right')}>{fmtNum(g.NetQty, 3)}</td><td className={cx(td, 'num text-right')}>{fmtNum(lakh(g.NetValue), 3)}</td><td className={td}>{g.Currency || '—'}</td>
                          <td className={cx(td, 'num text-right')}>{fmtNum(g.AvgRate, 3)}</td><td className={cx(td, 'num text-right')}>{fmtNum(g.CtryValue, 2)}</td>{(() => {
                            const dd = dtl[dKey(g)]; const rows2 = Array.isArray(dd) ? dd : null;
                            const sel = rowSel[g.key]; const { basis: effBasis, mode: effMode } = effOf(g);
                            const ab = rows2 ? avgBasePrice(rows2) : null; const lp = rows2 ? lastPrice(rows2, effMode) : null;
                            const dash = !dd ? '…' : !rows2 ? 'n/a' : null;
                            const rate = effBasis === 'AVG' ? (ab ? ab.RatePc : null) : (lp ? lp.row.RatePc : null);
                            const val = effBasis === 'AVG' ? 'AVG' : `L|${effMode}`;
                            return <>
                              <td className={cx(td, 'num text-right')} title={!rows2 && dd ? (dd as { error: string }).error : ab ? `Weighted average base price, valid from ${showDate(ab.ValidFrom)}` : undefined}>{dash ?? (ab ? fmtNum(ab.RatePc, 3) : '—')}</td>
                              <td className={td}>{dash ?? (lp ? <span className="inline-flex items-center gap-1.5" title={`${lp.row.Vendor ? `${lp.row.Vendor} ${lp.row.Vendname} — ` : ''}valid from ${showDate(lp.row.ValidFrom)}`}><span className="num font-bold">{fmtNum(lp.row.RatePc, 3)}</span><SourceChip src={lp.row.RateSrc} /></span> : '—')}</td>
                              <td className={td} onClick={(e) => e.stopPropagation()}>
                                <select aria-label="Rate basis of this material" className="rounded border border-line bg-panel px-1 py-0.5 text-2xs" value={sel ? val : ''}
                                  onChange={(e) => { const v = e.target.value; setRowSel((x) => { const { [g.key]: _, ...rest } = x; if (!v) return rest; if (v === 'AVG') return { ...rest, [g.key]: { basis: 'AVG', mode: lpMode } }; return { ...rest, [g.key]: { basis: 'LAST', mode: v.split('|')[1] as LastPriceMode } }; }); }}>
                                  <option value="">Global</option><option value="AVG">Avg base price</option>
                                  {LAST_PRICE_MODES.map((m) => <option key={m.v} value={`L|${m.v}`}>Last: {m.label}</option>)}</select></td>
                              {!dd ? <><td className={cx(td, 'text-right text-faint')}>…</td><td className={cx(td, 'text-right text-faint')}>…</td></>
                                : <><td className={cx(td, 'num text-right')}>{rate == null ? '—' : fmtNum(rate, 3)}</td><td className={cx(td, 'num text-right')}>{rate == null ? '—' : fmtNum(lakh(projectedValue(g.NetQty, rate)), 3)}</td></>}
                            </>; })()}
                          <td className={td}><CatBadge cat={g.Matcat} /></td><td className={td}><SegmentBadge segment={g.Segment} /></td>
                          {(() => {
                            if (!Array.isArray(dtl[dKey(g)])) return <><td className={cx(td, 'text-right text-faint')}>…</td><td className={td} /><td className={td} /><td className={cx(td, 'text-right text-faint')}>…</td><td className={td}><span className="text-faint">…</span></td></>;
                            const bu = historyBreakup(g.Matcat, dtl[dKey(g)] as BudRateSrcDtlRow[], prio, effOf(g).mode);
                            return <><td className={cx(td, 'num text-right font-extrabold')}>{bu.derived == null ? '—' : fmtNum(bu.derived, 3)}</td>{(() => {
                              const sv = saved[g.Matnr] ?? [];
                              const one = (f: (r: BudRateRow) => number) => { const v = Array.from(new Set(sv.map(f))); return v.length === 0 ? '—' : v.length === 1 ? fmtNum(v[0], 3) : `${fmtNum(Math.min(...v), 3)} – ${fmtNum(Math.max(...v), 3)}`; };
                              if (sv.length) { const lines = sv.flatMap((r) => r.FrtLines); const t = lines.length ? `Freight line items: ${freightText(sv[0].FrtLines)}` : undefined; return <><td className={cx(td, 'num text-right')} title={t}>{one((r) => r.FrtTotal)}</td><td className={cx(td, 'num text-right font-extrabold')}>{one((r) => r.LandedRate)}</td></>; }
                              // No saved rate yet: the freight of the source the rule picked (marked *).
                              const pk = bu.pick; const t = pk ? (pk.FrtLines.length ? `From ${pk.RateSrc}: ${freightText(pk.FrtLines)}` : `From ${pk.RateSrc}: no freight`) : undefined;
                              return <><td className={cx(td, 'num text-right')} title={t}>{pk ? `${fmtNum(pk.FrtTotal, 3)}*` : '—'}</td><td className={cx(td, 'num text-right font-extrabold')} title={t}>{pk ? `${fmtNum(landedRate(pk.RatePc, pk.FrtTotal, true), 3)}*` : '—'}</td></>;
                            })()}
                              {(() => { const ab2 = avgBasePrice(dtl[dKey(g)] as BudRateSrcDtlRow[]); return <td className={cx(td, 'num text-right font-extrabold')} title={ab2 ? `Freight total of the base price (${freightText(ab2.FrtLines) || 'no line items'})` : undefined}>{ab2 ? fmtNum(ab2.FrtTotal, 3) : '—'}</td>; })()}
                              <td className="min-w-64 px-2 py-1.5 text-2xs"><div className="font-bold">{bu.rule}</div><div className="num text-muted">{bu.steps.map((x) => `${x.k} ${fmtNum(x.v, 3)}`).join(' · ')}</div></td></>;
                          })()}
                        </tr>
                        {isOpen && (
                          <tr className="border-b border-line bg-bg">
                            <td colSpan={22} className="px-4 py-3">
                              <p className="mb-2 text-xs font-bold">{stripZeros(g.Matnr)} — {g.Maktx} — by plant</p>
                              <table className="w-full max-w-4xl border-collapse">
                                <thead><tr><th className={th}>Plant</th><th className={th}>UOM</th><th className={cx(th, 'text-right')}>Net Qty</th><th className={cx(th, 'text-right')}>Net Value (Lakhs)</th><th className={th}>Curr</th><th className={cx(th, 'text-right')}>Avg Rate</th></tr></thead>
                                <tbody>
                                  {g.plants.map((p) => (
                                    <tr key={plantKey(g.key, p)} className="border-b border-line/60">
                                      <td className={td}>{p.Werks}</td><td className={td}>{p.BaseUom}</td>
                                      <td className={cx(td, 'num text-right')}>{fmtNum(p.NetQty, 3)}</td><td className={cx(td, 'num text-right')}>{fmtNum(lakh(p.NetValue), 3)}</td><td className={td}>{p.Currency}</td><td className={cx(td, 'num text-right')}>{fmtNum(p.AvgRate, 3)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <div className="mb-1 mt-3 flex flex-wrap items-center gap-3">
                                <p className="text-xs font-bold">Prices — BudRateSrcDtlSet <span className="font-normal text-muted">(avg base price: material + country; Info record / Contract: material + company code)</span></p>
                                <Button size="sm" onClick={() => setBreakup({ matnr: g.Matnr, bukrs: g.plants[0]?.Bukrs ?? '', land1: g.Land1 || f.land1, title: g.Maktx })}><BarChart3 size={13} /> Avg base price breakup</Button>
                                <Button size="sm" onClick={() => { const dd = dtl[dKey(g)]; const bu = Array.isArray(dd) ? historyBreakup(g.Matcat, dd, prio, effOf(g).mode) : null; setFrtBk({ matnr: g.Matnr, land1: g.Land1 || f.land1, histFrom: f.histFrom, histTo: f.histTo, finalBasic: bu?.derived ?? null, title: g.Maktx }); }}><Truck size={13} /> Freight breakup</Button>
                              </div>
                              {(() => { const dd = dtl[dKey(g)];
                                if (!dd) return <Spinner />;
                                if (!Array.isArray(dd)) return <ErrorBox>{dd.error}</ErrorBox>;
                                if (!dd.length) return <p className="text-xs text-muted">{NO_RECORDS}</p>;
                                return (
                                  <table className="w-full max-w-4xl border-collapse">
                                    <thead><tr><th className={th}>Source</th><th className={th}>Cond</th><th className={th}>Vendor</th><th className={cx(th, 'text-right')}>Rate</th><th className={th}>Curr</th><th className={cx(th, 'text-right')}>Per</th><th className={th}>Valid</th><th className={cx(th, 'text-right')}>Rate/Pc</th><th className={th}>Freight line items</th><th className={cx(th, 'text-right')}>Freight</th><th className={cx(th, 'text-right')}>Landed</th></tr></thead>
                                    <tbody>{dd.map((x, j) => (
                                      <tr key={j} className="border-b border-line/60">
                                        <td className={td}><SourceChip src={x.RateSrc} /></td><td className={td}>{x.CondType || '—'}</td><td className={td}>{x.Vendor ? `${x.Vendor} ${x.Vendname}` : '—'}</td>
                                        <td className={cx(td, 'num text-right')}>{fmtNum(x.Rate, 2)}</td><td className={td}>{x.Currency}</td><td className={cx(td, 'num text-right')}>{x.PriceUnit || '—'} {x.CondUnit}</td>
                                        <td className={td}>{x.ValidFrom ? `${showDate(x.ValidFrom)} – ${showDate(x.ValidTo)}` : '—'}</td>
                                        <td className={cx(td, 'num text-right font-extrabold text-accent')}>{fmtNum(x.RatePc, 2)}</td>
                                        <td className={cx(td, 'num')}>{x.FrtLines.length ? freightText(x.FrtLines) : '—'}</td><td className={cx(td, 'num text-right')}>{fmtNum(x.FrtTotal, 2)}</td><td className={cx(td, 'num text-right font-extrabold')}>{fmtNum(x.LandedRate > 0 ? x.LandedRate : x.RatePc + x.FrtTotal, 2)} {x.LandedCurr}</td>
                                      </tr>))}</tbody>
                                  </table>
                                ); })()}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {!shown.length && <tr><td colSpan={22} className="px-3 py-8 text-center text-sm text-muted">No materials match the filter</td></tr>}
                </tbody>
              )}
            </table>
          </div>
        </Panel>
      )}
      {frtBk && <FreightBreakup {...frtBk} onClose={() => setFrtBk(null)} />}
      {breakup && <BasePriceBreakup {...breakup} onClose={() => setBreakup(null)} />}
    </div>
  );
}
