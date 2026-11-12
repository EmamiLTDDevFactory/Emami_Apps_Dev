'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Pencil, Save, Search, X } from 'lucide-react';
import { Button, Card, Field, Pill, Spinner, cx, inputCls } from '../ui';
import { CatBadge, ErrorBox, FilterRow, SegmentBadge, SegmentChips, usePerfume, type SegmentFilter, NO_RECORDS, OkBox, SkeletonRows, SourceChip, StatusBadge, errorText, td, th } from './shared';
import RateEditPanel from './RateEditPanel';
import SourcePriorityEditor from '../rates/SourcePriorityEditor';
import { fetchRateSrcDtl, fetchRates, patchRate } from '@/lib/budgetMgmt/api';
import { COUNTRIES, STATUS_LABEL, type AdjType, type BudRateRow, type BudRateSrcDtlRow, type LastPriceMode, LAST_PRICE_MODES, type RateEdit } from '@/lib/budgetMgmt/types';
import { CATLASTP_KEY, LASTP_KEY, rowMatches, type ColFilters, freightText, showDate, DEFAULT_B_PRIORITY, adjustRate, avgBasePrice, lastPrice, amount, budgetedBasic, isEditable, freightApplies, historyBreakup, landedRate, rateBreakup, stripZeros, validateEdit, type Errors } from '@/lib/budgetMgmt/rules';
import { fmtNum } from '@/lib/format';

const PRIO_KEY = 'bud-mgmt-b-priority';
const dtlKey = (r: BudRateRow) => `${r.Matnr}|${r.Bukrs || '1000'}|${r.Land1}`;
const keyOf = (r: BudRateRow) => `${r.Gjahr}|${r.Land1}|${r.Matnr}|${r.Werks}|${r.ValidFrom}`;
/** Columns frozen up to Derived (md and wider): width and left offset of each. */
const FROZEN = [88, 56, 88, 44, 48, 84, 84, 104];
const LEFT = FROZEN.map((_, i) => FROZEN.slice(0, i).reduce((a, b) => a + b, 0));
const frozen = (i: number, head = false) => ({ className: cx('md:sticky', head ? 'md:z-30 bg-sunken' : 'md:z-10 bg-panel'), style: { left: LEFT[i], width: FROZEN[i], minWidth: FROZEN[i], maxWidth: FROZEN[i] } });
const ADJ: { v: AdjType; label: string }[] = [{ v: 'N', label: 'None' }, { v: 'P', label: 'Percent (%)' }, { v: 'A', label: 'Amount' }];

export default function RatesTab({ segment, setSegment, gjahr, generated }: { segment: SegmentFilter; setSegment: (v: SegmentFilter) => void; gjahr: string; generated?: { land1: string; gjahr: string; message: string } | null }) {
  const [land1, setLand1] = useState(generated?.land1 ?? 'IN');
  const [year, setYear] = useState(generated?.gjahr ?? gjahr);
  const [status, setStatus] = useState('D');
  const [rows, setRows] = useState<BudRateRow[] | null>(null);
  const perfume = usePerfume(land1, year);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [yearErr, setYearErr] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState('');
  const [form, setForm] = useState<RateEdit>({ adjType: 'N', adjValue: '', overrideRate: '', overrideRsn: '' });
  const [fErr, setFErr] = useState<Errors<keyof RateEdit>>({});
  const [saveErr, setSaveErr] = useState('');
  const [saving, setSaving] = useState(false);
  // Category B source priority (spec 7.2): kept in this browser until a central setting exists.
  const [prio, setPrioState] = useState<string[]>([...DEFAULT_B_PRIORITY]);
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem(PRIO_KEY) ?? 'null'); if (Array.isArray(v) && v.length) setPrioState(v.map(String)); } catch { /* default */ } }, []);
  const setPrio = (v: string[]) => { setPrioState(v); try { localStorage.setItem(PRIO_KEY, JSON.stringify(v)); } catch { /* not kept */ } };
  // Avg Base Price and Last Price (BudRateSrcDtlSet): read once per material; the Last Price priority is global (kept in this browser) with a per-row choice.
  const [dtl, setDtl] = useState<Record<string, BudRateSrcDtlRow[] | { error: string }>>({});
  const [lpGlobal, setLpGlobalState] = useState<LastPriceMode>('IR_C');
  const [lpRow, setLpRow] = useState<Record<string, LastPriceMode>>({});
  useEffect(() => { try { const v = localStorage.getItem(LASTP_KEY); if (LAST_PRICE_MODES.some((m) => m.v === v)) setLpGlobalState(v as LastPriceMode); } catch { /* default */ } }, []);
  // Category-wise global last price order ('' = the global one); precedence: the row's own choice, its category's, the global one.
  const [lpCat, setLpCatState] = useState<Record<string, string>>({});
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem(CATLASTP_KEY) ?? 'null'); if (v && typeof v === 'object') setLpCatState(v); } catch { /* none */ } }, []);
  const setLpCat = (cat: string, v: string) => setLpCatState((x) => { const n = { ...x, [cat]: v }; try { localStorage.setItem(CATLASTP_KEY, JSON.stringify(n)); } catch { /* not kept */ } return n; });
  const modeFor = (r: BudRateRow, k: string): LastPriceMode => lpRow[k] ?? (LAST_PRICE_MODES.some((m) => m.v === lpCat[r.Matcat]) ? (lpCat[r.Matcat] as LastPriceMode) : lpGlobal);
  const setLpGlobal = (v: LastPriceMode) => { setLpGlobalState(v); try { localStorage.setItem(LASTP_KEY, v); } catch { /* not kept */ } };
  useEffect(() => {
    setDtl({}); setLpRow({});
    const seen = new Map<string, BudRateRow>();
    for (const r of rows ?? []) if (!seen.has(dtlKey(r))) seen.set(dtlKey(r), r);
    const todo = Array.from(seen);
    if (!todo.length) return;
    let live = true; let next = 0;
    const worker = async () => { while (live && next < todo.length) { const [k, r] = todo[next++]; try { const list = await fetchRateSrcDtl(r.Matnr, r.Bukrs, r.Land1); if (live) setDtl((x) => ({ ...x, [k]: list })); } catch (x) { if (live) setDtl((y) => ({ ...y, [k]: { error: errorText(x) } })); } } };
    for (let i = 0; i < 3; i++) void worker();
    return () => { live = false; };
  }, [rows]);
  const dtlError = Object.values(dtl).find((v): v is { error: string } => !Array.isArray(v));

  // Simulation (nothing is saved): one global adjustment (optionally by category) and per-row simulations set with Enter in the edit panel.
  const [gType, setGType] = useState<'P' | 'A'>('P');
  const [gValue, setGValue] = useState('');
  const [gCats, setGCats] = useState<string[]>([]);
  const [gSim, setGSim] = useState<{ type: 'P' | 'A'; value: number; cats: string[] } | null>(null);
  const [gErr, setGErr] = useState('');
  const [rowSim, setRowSim] = useState<Record<string, RateEdit>>({});
  function runGlobal() {
    const v = amount(gValue);
    if (gValue.trim() === '' || !Number.isFinite(v)) return setGErr('Enter the adjustment value');
    if (gType === 'P' && (v < -99 || v > 999)) return setGErr('Percent must be between -99 and 999');
    setGErr(''); setGSim({ type: gType, value: v, cats: gCats });
  }
  // Apply to all: saves the simulated adjustment on every editable row in scope. Rows with an override (it would win), no source rate or a non-positive result are skipped.
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState('');
  async function applyAll() {
    if (!gSim) return;
    const adj: RateEdit = { adjType: gSim.type, adjValue: String(gSim.value), overrideRate: '', overrideRsn: '' };
    const inScope = shown.filter((r) => isEditable(r.ApprStatus) && (!gSim.cats.length || gSim.cats.includes(r.Matcat)));
    const todo = inScope.filter((r) => !(r.OverrideRate > 0) && r.SrcRate > 0 && Object.keys(validateEdit(adj, r.SrcRate)).length === 0);
    const skipped = inScope.length - todo.length;
    if (!todo.length) return setApplyMsg(`Nothing to apply: ${inScope.length} editable rows in scope, all skipped (override set, no saved source rate, or the rate would be zero or negative).`);
    const label = `${gSim.type === 'P' ? `${gSim.value}%` : gSim.value}`;
    if (!window.confirm(`Save a ${label} ${gSim.type === 'P' ? 'percent' : 'amount'} adjustment on ${todo.length} rates (${gSim.cats.length ? `category ${gSim.cats.join(', ')}` : 'all categories'})?${skipped ? `\n${skipped} rows will be skipped (override set, no saved source rate, or a non-positive result).` : ''}\nThis replaces any adjustment those rows already have.`)) return;
    setApplying(true); setApplyMsg('');
    let done = 0; const failed: string[] = []; let next = 0;
    const worker = async () => { while (next < todo.length) { const r = todo[next++]; try { await patchRate(r, adj); done++; } catch (x) { failed.push(`${stripZeros(r.Matnr)}: ${errorText(x)}`); } } };
    await Promise.all([worker(), worker(), worker()]);
    setApplying(false); setGSim(null); setRowSim({}); setGValue('');
    setApplyMsg(`${done} of ${todo.length} rates adjusted${skipped ? `, ${skipped} skipped` : ''}${failed.length ? `. Failed: ${failed.slice(0, 3).join('; ')}${failed.length > 3 ? ` (+${failed.length - 3} more)` : ''}` : ''}.`);
    await load();
  }
  const [yearShown, setYearShown] = useState(generated?.gjahr ?? gjahr);
  // Shared FY changed from the page header: pre-fill (the user's own edit of the field is kept until the header changes again).
  if (yearShown !== gjahr) { setYearShown(gjahr); setYear(gjahr); }

  async function load(y = year, l = land1, s = status) {
    if (!/^\d{4}$/.test(y)) return setYearErr('Year must be 4 digits');
    setYearErr(''); setLoading(true); setError(''); setEditing('');
    try { setRows(await fetchRates({ gjahr: y, land1: l, status: s })); } catch (x) { setRows(null); setError(errorText(x)); }
    setLoading(false);
  }

  // Opened by Generate Draft Rates: load the drafts of what was just generated.
  useEffect(() => { if (generated) void load(generated.gjahr, generated.land1, 'D'); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function startEdit(r: BudRateRow) {
    setEditing(keyOf(r)); setFErr({}); setSaveErr('');
    setForm({ adjType: (r.AdjType === 'P' || r.AdjType === 'A' ? r.AdjType : 'N') as AdjType, adjValue: r.AdjValue ? String(r.AdjValue) : '', overrideRate: r.OverrideRate ? String(r.OverrideRate) : '', overrideRsn: r.OverrideRsn });
  }

  function simulateRow(r: BudRateRow, base: number | undefined) {
    const e = validateEdit(form, base);
    setFErr(e);
    if (Object.keys(e).length) return;
    setRowSim((x) => ({ ...x, [keyOf(r)]: { ...form } }));
  }

  async function save(r: BudRateRow) {
    const e = validateEdit(form, r.SrcRate > 0 ? r.SrcRate : undefined);
    setFErr(e);
    if (Object.keys(e).length) return;
    setSaving(true); setSaveErr('');
    try { await patchRate(r, form); setEditing(''); setRowSim((x) => { const { [keyOf(r)]: _, ...rest } = x; return rest; }); await load(); } catch (x) { setSaveErr(errorText(x)); }
    setSaving(false);
  }

  const shown = useMemo(() => { const n = q.trim().toLowerCase(); return (rows ?? []).filter((r) => (segment === 'ALL' || !perfume.ready || perfume.segmentOf(r.Matnr) === segment) && (!n || stripZeros(r.Matnr).toLowerCase().includes(n) || r.Matnr.toLowerCase().includes(n))).sort((a, b) => (a.Matcat || 'Z').localeCompare(b.Matcat || 'Z')); }, [rows, q, segment, perfume.ready]);

  // One place for what a row shows (the table and the column filters read the same values).
  const [colF, setColF] = useState<ColFilters>({});
  function calc(r: BudRateRow, k: string) {
    const dd0 = dtl[dtlKey(r)]; const hb = !r.RateSrc && !(r.SrcRate > 0) && Array.isArray(dd0) ? historyBreakup(r.Matcat, dd0, prio, modeFor(r, k)) : null;
    const bu = hb ?? rateBreakup(r, prio);
    // Simulation: the row's own (Enter in the edit panel) else the global adjustment, on the effective source rate; freight as shown.
    const base = hb?.pick ? hb.pick.RatePc : r.SrcRate > 0 ? r.SrcRate : r.DerivedRate;
    const applies = hb?.pick ? true : freightApplies(r.RateSrc);
    const frt = hb?.pick ? hb.pick.FrtTotal : r.FrtTotal; // a row SAP saved without a rate: the picked source's freight
    const curLanded = hb?.pick ? landedRate(hb.pick.RatePc, hb.pick.FrtTotal, true) : r.LandedRate;
    const rs = rowSim[k];
    const simBasic = base > 0 || (rs && rs.overrideRate.trim() !== '') ? (rs ? budgetedBasic(base, rs) : gSim && (!gSim.cats.length || gSim.cats.includes(r.Matcat)) ? adjustRate(base, gSim.type, gSim.value) : null) : null;
    const simLanded = simBasic == null ? null : landedRate(simBasic, frt, applies || (!!rs && rs.overrideRate.trim() !== ''));
    return { hb, bu, base, curLanded, rs, simBasic, simLanded };
  }
  function filterValues(r: BudRateRow): Record<string, string | number | null> {
    const k = keyOf(r); const c = calc(r, k); const dd = dtl[dtlKey(r)]; const rows2 = Array.isArray(dd) ? dd : null;
    const ab = rows2 ? avgBasePrice(rows2) : null; const lp = rows2 ? lastPrice(rows2, modeFor(r, k)) : null;
    return {
      material: stripZeros(r.Matnr), segment: perfume.segmentOf(r.Matnr), plant: r.Werks, validFrom: showDate(r.ValidFrom), cat: r.Matcat, uom: r.BaseUom, source: c.hb?.pick ? c.hb.pick.RateSrc : r.RateSrc,
      srcRate: c.hb?.pick ? c.hb.pick.RatePc : r.SrcRate, derived: c.hb ? c.hb.derived : r.DerivedRate, avgBase: ab ? ab.RatePc : null, lastPrice: lp ? lp.row.RatePc : null,
      rule: `${c.bu.rule} ${c.bu.steps.map((x) => x.k).join(' ')}`, adj: r.OverrideRate > 0 ? `Override ${r.OverrideRate}` : r.AdjType === 'P' ? `${r.AdjValue}%` : r.AdjType === 'A' ? String(r.AdjValue) : '',
      freight: c.hb?.pick ? c.hb.pick.FrtTotal : r.FrtTotal, landed: c.curLanded, simBasic: c.simBasic, simLanded: c.simLanded,
      delta: c.simLanded == null || !(c.curLanded > 0) ? null : c.simLanded - c.curLanded, status: `${r.ApprStatus} ${STATUS_LABEL[r.ApprStatus as keyof typeof STATUS_LABEL] ?? ''}`,
    };
  }
  const visible = Object.values(colF).some((v) => v.trim()) ? shown.filter((r) => rowMatches(filterValues(r), colF)) : shown;

  const simOn = !!gSim || Object.keys(rowSim).length > 0;
  const COLS = simOn ? 20 : 17;

  return (
    <div className="flex flex-col gap-3">
      <Card title="Filters">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => { e.preventDefault(); void load(); }}>
          <Field label="Country">{(id) => <select id={id} className={inputCls} value={land1} onChange={(e) => setLand1(e.target.value)}>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select>}</Field>
          <Field label="Year" error={yearErr}>{(id) => <input id={id} className={cx(inputCls, yearErr && 'border-bad')} inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value)} />}</Field>
          <Field label="Status">{(id) => <select id={id} className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{k} - {v}</option>)}</select>}</Field>
          <div className="flex items-end"><Button type="submit" variant="primary" disabled={loading}>{loading ? <Spinner /> : <Search size={14} />} Load</Button></div>
        </form>
      </Card>

      {rows && rows.length > 0 && (
        <Card title="Global adjustment simulation" actions={(gSim || Object.keys(rowSim).length > 0) && <Button size="sm" onClick={() => { setGSim(null); setRowSim({}); setGValue(''); setGErr(''); }}><X size={13} /> Clear simulation</Button>}>
          <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); runGlobal(); }}>
            <Field label="Adjustment">{(id) => <select id={id} className={inputCls} value={gType} onChange={(e) => setGType(e.target.value as 'P' | 'A')}><option value="P">Percent (%)</option><option value="A">Amount</option></select>}</Field>
            <Field label={gType === 'P' ? 'Value (%, + or −)' : 'Value (+ or −)'} error={gErr}>{(id) => <input id={id} className={cx(inputCls, 'w-36', gErr && 'border-bad')} inputMode="decimal" value={gValue} onChange={(e) => setGValue(e.target.value)} placeholder="Press Enter" />}</Field>
            <fieldset><legend className="mb-1 text-xs font-semibold">Categories <span className="font-normal text-muted">(none = all)</span></legend>
              <div className="flex gap-1.5">{(['A', 'B', 'C'] as const).map((c) => <button key={c} type="button" aria-pressed={gCats.includes(c)} onClick={() => setGCats((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]))} className={cx('rounded-full px-3 py-1 text-xs font-bold ring-1', gCats.includes(c) ? 'bg-accent text-white ring-accent' : 'bg-panel text-ink ring-line')}>{c}</button>)}</div>
            </fieldset>
            <Button type="submit" variant="primary" disabled={applying}>Simulate</Button>
            <Button type="button" variant="danger" disabled={!gSim || applying} onClick={() => void applyAll()}>{applying ? <Spinner /> : <Save size={14} />} Apply to all</Button>
          </form>
          {applyMsg && <p role="status" className="mt-2 text-sm font-semibold">{applyMsg}</p>}
          <p className="mt-2 text-2xs text-muted">Applies the adjustment to the rate of every row in the table (its source rate, plus freight) and shows the simulated basic and landed rate. Nothing is saved until you click Apply to all (it saves this adjustment on every editable Draft / Revised row in scope; rows with an override or no saved source rate are skipped); a rate simulated in a row's edit panel (Enter) takes priority for that row.</p>
        </Card>
      )}

      {rows && rows.length > 0 && (
        <Card title="Last price priority (global)">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Last price from">{(id) => <select id={id} className={inputCls} value={lpGlobal} onChange={(e) => setLpGlobal(e.target.value as LastPriceMode)}>{LAST_PRICE_MODES.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}</select>}</Field>
            <fieldset><legend className="mb-1 text-xs font-semibold">By category <span className="font-normal text-muted">(overrides the global order)</span></legend>
              <div className="flex gap-2">{(['A', 'B', 'C'] as const).map((c) => (
                <label key={c} className="flex items-center gap-1 text-xs font-bold"><CatBadge cat={c} />
                  <select aria-label={`Last price order of category ${c}`} className="h-9 rounded-xl border border-line bg-panel px-2 text-xs font-normal" value={lpCat[c] ?? ''} onChange={(e) => setLpCat(c, e.target.value)}>
                    <option value="">Global</option>{LAST_PRICE_MODES.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}</select></label>
              ))}</div>
            </fieldset>
            <p className="max-w-xl pb-2 text-2xs text-muted">Last price is the latest Info record or Contract price of the material (company code level); the first source of the chosen order that has one is used. Avg base price is SAP's weighted average (material + country). Each row can override the global choice in its Last price cell or in its edit panel.</p>
          </div>
          {dtlError && <p className="mt-2 text-xs text-warn">Avg base / last price could not be read: {dtlError.error}</p>}
        </Card>
      )}

      <details className="rounded-2xl border border-line bg-panel px-4 py-2 shadow-card">
        <summary className="cursor-pointer text-sm font-bold">Category B rate source priority <span className="font-normal text-muted">(first source with a valid rate is used)</span></summary>
        <div className="mt-2 max-w-sm"><SourcePriorityEditor value={prio} onChange={setPrio} compact /></div>
      </details>

      {perfume.error && segment !== 'ALL' && <ErrorBox>Segments could not be read ({perfume.error}) — showing every material.</ErrorBox>}
      {generated && <OkBox>✅ {generated.message}</OkBox>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {rows && rows.length === 0 && !error && <Card><p className="py-6 text-center text-sm text-muted">{NO_RECORDS}</p></Card>}

      {(loading || (rows && rows.length > 0)) && (
        <Card
          title={<span className="flex items-center gap-2">Rates {rows && <Pill tone="accent">{visible.length === (rows?.length ?? 0) ? `${visible.length} rows` : `${visible.length} of ${rows?.length ?? 0} rows`}</Pill>}</span>}
          actions={<><SegmentChips value={segment} onChange={setSegment} />{Object.values(colF).some((v) => v.trim()) && <Button size="sm" onClick={() => setColF({})}><X size={13} /> Clear filters</Button>}<input className={cx(inputCls, 'w-48')} placeholder="Filter: material" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter by material" /></>}
          bodyClass="p-0"
        >
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10 bg-sunken">
                <tr>
                  {(['Material', 'Plant', 'Valid from', 'Cat', 'UOM', 'Source', 'Src rate', 'Derived'] as const).map((h, i) => { const f = frozen(i, true); return <th key={h} className={cx(th, f.className, i >= 6 && 'text-right', i === FROZEN.length - 1 && 'border-r border-line')} style={f.style}>{h}</th>; })}
                  <th className={th}>Segment</th><th className={cx(th, 'text-right')}>Avg base price</th><th className={th}>Last price</th><th className={th}>Rule &amp; breakup</th><th className={th}>Adj</th><th className={cx(th, 'text-right')}>Freight</th><th className={cx(th, 'text-right')}>Landed rate</th>
                  {simOn && <><th className={cx(th, 'text-right')}>Sim. basic</th><th className={cx(th, 'text-right')}>Sim. landed</th><th className={cx(th, 'text-right')}>Δ landed</th></>}<th className={th}>Status</th><th className={th} /></tr>
                <FilterRow filters={colF} setFilters={setColF} cols={[
                  ...(['material', 'plant', 'validFrom', 'cat', 'uom', 'source', 'srcRate', 'derived'] as const).map((key, i) => ({ key, className: frozen(i, true).className, style: frozen(i, true).style })),
                  { key: 'segment' }, { key: 'avgBase' }, { key: 'lastPrice' }, { key: 'rule' }, { key: 'adj' }, { key: 'freight' }, { key: 'landed' },
                  ...(simOn ? [{ key: 'simBasic' }, { key: 'simLanded' }, { key: 'delta' }] : []), { key: 'status' }, { key: 'x', off: true },
                ]} />
              </thead>
              {loading ? <SkeletonRows cols={COLS} /> : (
                <tbody>
                  {visible.map((r, i) => {
                    const k = keyOf(r); const isEd = editing === k;
                    const { hb, bu, base, curLanded, rs, simBasic, simLanded } = calc(r, k);
                    return (
                      <Fragment key={k}>
                        {(i === 0 || visible[i - 1].Matcat !== r.Matcat) && <tr className="bg-sunken/60"><td colSpan={COLS} className="px-2 py-1 text-xs font-bold"><CatBadge cat={r.Matcat} /> Category {r.Matcat || '—'}</td></tr>}
                        <tr className={cx('border-b border-line/60', isEd && 'bg-accent/5')}>
                          {(() => {
                            const date = r.ValidFrom.length === 8 ? `${r.ValidFrom.slice(6)}.${r.ValidFrom.slice(4, 6)}.${r.ValidFrom.slice(0, 4)}` : r.ValidFrom;
                            const f = (i: number) => frozen(i);
                            return <>
                              <td className={cx(td, 'num', f(0).className)} style={f(0).style}>{stripZeros(r.Matnr)}</td><td className={cx(td, f(1).className)} style={f(1).style}>{r.Werks}</td><td className={cx(td, f(2).className)} style={f(2).style}>{date}</td>
                              <td className={cx(td, f(3).className)} style={f(3).style}><CatBadge cat={r.Matcat} /></td><td className={cx(td, f(4).className)} style={f(4).style}>{r.BaseUom || '—'}</td>
                              <td className={cx(td, f(5).className)} style={f(5).style}><SourceChip src={hb?.pick ? `${hb.pick.RateSrc}*` : r.RateSrc} /></td>
                              <td className={cx(td, 'num text-right', f(6).className)} style={f(6).style}>{hb?.pick ? `${fmtNum(hb.pick.RatePc, 2)}*` : fmtNum(r.SrcRate, 2)}</td>
                              <td className={cx(td, 'num text-right border-r border-line', f(7).className)} style={f(7).style}>{hb ? (hb.derived == null ? '—' : <span title="From the rate sources — SAP saved no rate for this row">{fmtNum(hb.derived, 2)}*</span>) : <>{fmtNum(r.DerivedRate, 2)} {r.DerivedCurr}</>}</td>
                            </>;
                          })()}
                          <td className={td}><SegmentBadge segment={perfume.segmentOf(r.Matnr)} /></td>
                          {(() => {
                            const dd = dtl[dtlKey(r)];
                            if (!dd) return <><td className={cx(td, 'text-right text-faint')}>…</td><td className={cx(td, 'text-faint')}>…</td></>;
                            if (!Array.isArray(dd)) return <><td className={cx(td, 'text-right text-faint')} title={dd.error}>n/a</td><td className={cx(td, 'text-faint')} title={dd.error}>n/a</td></>;
                            const ab = avgBasePrice(dd); const mode = modeFor(r, k); const lp = lastPrice(dd, mode);
                            return <>
                              <td className={cx(td, 'num text-right')} title={ab ? `Weighted average base price (material + country), valid from ${showDate(ab.ValidFrom)}` : 'No average base price'}>{ab ? fmtNum(ab.RatePc, 2) : '—'}</td>
                              <td className={td}><div className="flex items-center gap-1.5"><span className="num font-bold" title={lp ? `${lp.row.Vendor ? `${lp.row.Vendor} ${lp.row.Vendname} — ` : ''}valid from ${showDate(lp.row.ValidFrom)}${lp.row.FrtTotal ? ` — freight ${fmtNum(lp.row.FrtTotal, 2)}, landed ${fmtNum(lp.row.LandedRate, 2)}` : ''}` : 'No price from the chosen source'}>{lp ? fmtNum(lp.row.RatePc, 2) : '—'}</span>{lp && <SourceChip src={lp.row.RateSrc} />}
                                <select aria-label="Last price priority of this row" className="rounded border border-line bg-panel px-1 py-0.5 text-2xs" value={lpRow[k] ?? ''} onChange={(e) => setLpRow((x) => { const { [k]: _, ...rest } = x; return e.target.value ? { ...rest, [k]: e.target.value as LastPriceMode } : rest; })}>
                                  <option value="">Global</option>{LAST_PRICE_MODES.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}</select></div></td>
                            </>;
                          })()}
                          <td className="min-w-64 px-2 py-1.5 text-2xs"><div className="font-bold">{bu.rule}{hb && <span className="font-normal text-warn"> — from sources, not saved</span>}</div><div className="num text-muted">{bu.steps.map((x) => `${x.k} ${fmtNum(x.v, 2)}`).join(' → ')}</div></td>
                          <td className={cx(td, 'num')} title={r.OverrideRate > 0 ? r.OverrideRsn : undefined}>{r.OverrideRate > 0 ? `Override ${fmtNum(r.OverrideRate, 2)}` : r.AdjType === 'P' ? `${r.AdjValue < 0 ? '−' : '+'}${fmtNum(Math.abs(r.AdjValue), 2)}%` : r.AdjType === 'A' ? `${r.AdjValue < 0 ? '−' : '+'}${fmtNum(Math.abs(r.AdjValue), 2)}` : '—'}</td>
                          <td className={cx(td, 'num text-right')}>{(() => { const lines = hb?.pick ? hb.pick.FrtLines : r.FrtLines; const t = lines.length ? `Freight line items: ${freightText(lines)}` : undefined; return hb?.pick ? <span title={t ?? 'No freight on this source'}>{fmtNum(hb.pick.FrtTotal, 2)}*</span> : <span title={t}>{fmtNum(r.FrtTotal, 2)}</span>; })()}</td><td className={cx(td, 'num text-right font-extrabold')}>{hb?.pick ? `${fmtNum(curLanded, 2)}*` : `${fmtNum(r.LandedRate, 2)} ${r.LandedCurr}`}</td>
                          {simOn && <>
                            <td className={cx(td, 'num text-right font-bold text-accent')}>{simBasic == null ? '—' : <span title={rs ? 'Simulated in the edit panel' : 'Global simulation'} className={simBasic <= 0 ? 'text-bad' : undefined}>{fmtNum(simBasic, 2)}{rs && ' ✎'}</span>}</td>
                            <td className={cx(td, 'num text-right font-extrabold text-accent')}>{simLanded == null ? '—' : fmtNum(simLanded, 2)}</td>
                            <td className={cx(td, 'num text-right')}>{simLanded == null || !(curLanded > 0) ? '—' : `${simLanded >= curLanded ? '+' : '−'}${fmtNum(Math.abs(simLanded - curLanded), 2)} (${fmtNum(((simLanded - curLanded) / curLanded) * 100, 2)}%)`}</td>
                          </>}
                          <td className={td}><StatusBadge status={r.ApprStatus} /></td>
                          <td className={td}>{isEditable(r.ApprStatus) && !isEd && <Button size="sm" onClick={() => startEdit(r)}><Pencil size={12} /> Edit</Button>}</td>
                        </tr>
                        {isEd && (
                          <tr className="border-b border-line bg-accent/5">
                            <td colSpan={COLS} className="px-4 py-3">
                              <RateEditPanel r={r} form={form} setForm={setForm} errs={fErr} prio={prio} dtl={Array.isArray(dtl[dtlKey(r)]) ? (dtl[dtlKey(r)] as BudRateSrcDtlRow[]) : undefined} lpMode={modeFor(r, k)} setLpMode={(m) => setLpRow((x) => ({ ...x, [k]: m }))} fallback={hb?.pick ? { source: hb.pick.RateSrc, rate: hb.pick.RatePc, freight: hb.pick.FrtTotal } : undefined} frtLines={hb?.pick ? hb.pick.FrtLines : r.FrtLines} onEnter={() => simulateRow(r, base > 0 ? base : undefined)} />
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <Button variant="primary" size="sm" disabled={saving} onClick={() => void save(r)}>{saving ? <Spinner /> : <Save size={13} />} Save changes</Button>
                                <Button size="sm" disabled={saving} onClick={() => setEditing('')}><X size={13} /> Cancel</Button>
                                {saveErr && <span role="alert" className="text-sm text-bad">{saveErr}</span>}
                              </div>
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
