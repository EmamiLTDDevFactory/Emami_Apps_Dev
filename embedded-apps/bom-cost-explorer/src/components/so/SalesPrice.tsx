'use client';
/**
 * Sales price (Admin of this app only): MRP and selling price taken by SAP from the LATEST sales order, with the order's full pricing.
 * Read-only. SAP chose the order and computed every price; this page presents them (and the live "Compare with cost" ratios, also SAP's).
 * Nothing loads before a click (Load sales areas / Load filter lists / Show), never from the URL, and no request has a time limit.
 */
import BomCostingPanel from '../costline/BomCostingPanel';
import { Fragment, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Clipboard, ClipboardCheck, FileSpreadsheet, Lock, Play, RefreshCw, Square } from 'lucide-react';
import PlanFrame from '../plan/PlanFrame';
import { MaterialHierarchyPicker, MaterialPicker } from '../Pickers';
import WacMessages from '../wac/WacMessages';
import CompareWithCost from './CompareWithCost';
import { SalesFiltersEditor } from './SalesFilters';
import { Button, Empty, Field, Spinner, Stat, Tabs, cx, inputCls } from '../ui';
import { fetchIsAdmin } from '@/lib/client/hubAccess';
import { useHubSession } from '@/lib/client/session';
import { loadSapConfig } from '@/lib/sap/config';
import { fmtDate, fmtMs, fmtNum } from '@/lib/format';
import { abortAll, ensure, entriesOf, invalidate, peek, stop, subscribe, type WacEntry } from '@/lib/wac/cache';
import { downloadWacWorkbook } from '@/lib/wac/export';
import { buildSoFilter, SO_MAX_MATERIALS, type SoQuery } from '@/lib/so/filter';
import { cogmSheet, filterListsSheet, pricesSheet, pricingSheet, procSheet, rulesSheet } from '@/lib/so/export';
import { SO_STALE_DAYS } from '@/lib/so/flag';
import type { SalesFiltersValue, SalesPreset } from '@/lib/so/presets';
import { fetchSo, fetchSoMerged } from '@/lib/so/service';
import { DEFAULT_SO_URL, parseSoSearch, soSearch, type SoUrlState } from '@/lib/so/url';
import type { CogmRow, SoAreaRow, SoCondRow, SoFilterRow, SoPriceRow, SoPricingRow, SoProcRow } from '@/lib/so/types';
import { CONSUMED_NOTE, LINE_STATE_LABEL, groupBySegment, hasAmount, hasConsumed, hasPcCost, pcSource, lineState, neverCountedAuarts, pricingLinesOf, priceKey, procSteps, proceduresIn, roleLabel, rowWarnings, segmentOptions } from '@/lib/so/view';

const PAGE_CTX = 'so-page';
const COND_KEY = 'so|COND';
const PICK_MAX = 500;
type Tab = 'prices' | 'procedure' | 'rules';

const useEntry = <T,>(key: string | null): WacEntry<T> | undefined => useSyncExternalStore(subscribe, () => peek<T>(key), () => undefined);

const toValue = (f: SoUrlState): SalesFiltersValue => ({ vkorg: f.vkorg, vtweg: f.vtweg, segment: f.segment ? [f.segment] : [], days: f.days, auart: f.auart, pstyv: f.pstyv, kdgrp: f.kdgrp, kunnr: f.kunnr });
const toQuery = (f: SoUrlState): SoQuery => ({ materials: f.materials, vkorg: f.vkorg, vtweg: f.vtweg, segment: f.segment ? [f.segment] : [], auart: f.auart, pstyv: f.pstyv, kdgrp: f.kdgrp, kunnr: f.kunnr, daysBack: f.days });
const runId = (f: SoUrlState) => JSON.stringify([[...f.materials].sort(), f.vkorg, f.vtweg, f.segment, f.days, f.auart, f.pstyv, f.kdgrp, f.kunnr]);
const listQuery = (f: SoUrlState): SoQuery => ({ materials: f.materials.slice(0, SO_MAX_MATERIALS), vkorg: f.vkorg, vtweg: f.vtweg, segment: f.segment ? [f.segment] : [], daysBack: f.days });
const safeFilter = (q: SoQuery, set: 'AREA' | 'FILTER'): string | null => { try { return buildSoFilter(q, set); } catch { return null; } };

const th = 'px-2.5 py-1.5 text-left text-2xs font-bold uppercase tracking-wide text-muted';
const thN = `${th} text-right`;
const td = 'px-2.5 py-1.5 align-top';
const tdN = `${td} num whitespace-nowrap text-right`;
const NA = <span className="text-faint" title="No value from SAP">n/a</span>;

function Amount({ v, curr, unit }: { v: string; curr: string; unit?: string }) {
  if (!hasAmount(v)) return NA;
  return <>{fmtNum(v, 2, curr)} <span className="text-2xs text-muted">{curr}{unit ? `/${unit}` : ''}</span></>;
}
/** RM, PM, perfume, total and % of the selling price of the latest production order, exactly as SAP sent them (never computed here); n/a when SAP has no cost.
 * The consumed cost is its own column, only when not 0, and is never part of the total. */
function CostCells({ r }: { r: SoPriceRow }) {
  const src = pcSource(r);
  const has = hasPcCost(r);
  return (
    <>
      <td className={tdN}><Amount v={r.RmCost} curr={r.Curr} unit={r.Uom} /></td><td className={tdN}><Amount v={r.PmCost} curr={r.Curr} unit={r.Uom} /></td><td className={tdN}><Amount v={r.PerfCost} curr={r.Curr} unit={r.Uom} /></td>
      <td className={cx(tdN, 'font-bold')} title={src ?? undefined}>
        <Amount v={r.PcTotal} curr={r.Curr} unit={r.Uom} />
        {has && src && <div className="max-w-[16rem] whitespace-normal text-2xs font-normal text-muted">{src}</div>}
      </td>
      <td className={tdN}>{has && hasAmount(r.PcRatio) ? `${fmtNum(r.PcRatio, 1, 'X')} %` : NA}</td>
      <td className={tdN} title={hasConsumed(r) ? CONSUMED_NOTE : undefined}>
        {hasConsumed(r) ? <span className="text-xs">{[['RM', r.ConsRm], ['PM', r.ConsPm], ['Perf', r.ConsPerf]].filter(([, v]) => hasAmount(v)).map(([k, v]) => `${k} ${fmtNum(v, 2, r.Curr)}`).join(' · ')} <span className="text-2xs text-muted">{r.Curr}</span></span> : <span className="text-faint">—</span>}
      </td>
    </>
  );
}
function RoleBadge({ role }: { role: string }) {
  if (role !== 'MRP' && role !== 'SP') return null;
  return <span className={cx('rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase', role === 'MRP' ? 'bg-accent/15 text-accent' : 'bg-good/15 text-good')}>{roleLabel(role)}</span>;
}
function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" aria-label={label} title="Copy" className="ml-1 text-muted hover:text-ink" onClick={async (e) => { e.stopPropagation(); try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ } }}>
      {done ? <ClipboardCheck size={12} /> : <Clipboard size={12} />}<span className="sr-only">{done ? 'Copied' : ''}</span>
    </button>
  );
}

/* ------------------------- pricing of the selected order (like VA03) ------------------------- */
function PricingPanel({ row, f, ctx }: { row: SoPriceRow; f: SoUrlState; ctx: string }) {
  const q = useMemo<SoQuery>(() => ({ materials: [row.Matnr], vkorg: [row.Vkorg], vtweg: [row.Vtweg], segment: row.Segment ? [row.Segment] : f.segment ? [f.segment] : [], auart: { in: [row.Auart], ex: [] }, pstyv: f.pstyv, kdgrp: f.kdgrp, kunnr: f.kunnr, daysBack: f.days }), [row, f]);
  const key = `so|PRICING|${priceKey(row)}|${runId(f)}`;
  const entry = useEntry<SoPricingRow>(key);
  useEffect(() => { void ensure<SoPricingRow>(key, ctx, 'PRICING', (signal) => fetchSo('PRICING', q, { signal })); }, [key, ctx, q]);
  if (!entry || entry.status === 'loading') return <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Reading the pricing of order {row.Vbeln || 'the selected order'}…</p>;
  if (entry.status === 'error') return <p role="alert" className="flex items-start gap-2 text-sm"><AlertTriangle size={14} className="mt-0.5 text-bad" aria-hidden />{entry.error} <Button size="sm" onClick={() => void ensure<SoPricingRow>(key, ctx, 'PRICING', (signal) => fetchSo('PRICING', q, { signal }), true)}>Retry</Button></p>;
  if (entry.status === 'cancelled') return <p className="text-sm text-muted">Stopped.</p>;
  const lines = pricingLinesOf(entry.data ?? [], row);
  if (!lines.length) return <p className="text-sm text-muted">SAP returned no pricing lines for this order item.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <p className="px-2.5 py-1.5 text-xs text-muted">Pricing of order <span className="font-mono font-bold">{row.Vbeln}</span> item <span className="font-mono">{row.Posnr}</span>, as in the VA03 condition screen.</p>
      <table className="w-full text-sm">
        <thead className="bg-sunken"><tr><th className={th}>Step</th><th className={th}>Counter</th><th className={th}>Condition</th><th className={th}>Text</th><th className={thN}>Rate</th><th className={thN}>Per</th><th className={th}>Unit</th><th className={thN}>Value</th><th className={th}>Currency</th><th className={th}>Note</th></tr></thead>
        <tbody>
          {lines.map((l, i) => {
            const st = lineState(l);
            const grey = st !== 'normal';
            return (
              <tr key={`${l.Stunr}|${l.Zaehk}|${i}`} className={cx('border-t border-line/60', grey && 'text-faint', l.Role === 'MRP' && !grey && 'bg-accent/[0.06]', l.Role === 'SP' && !grey && 'bg-good/[0.07]')}>
                <td className={cx(td, 'font-mono')}>{l.Stunr}</td><td className={cx(td, 'font-mono')}>{l.Zaehk}</td><td className={cx(td, 'font-mono font-bold')}>{l.Kschl}</td><td className={td}>{l.Txt}</td>
                <td className={tdN}>{l.Kbetr ? fmtNum(l.Kbetr, 4, l.Waers) : NA}</td><td className={tdN}>{l.Kpein ? fmtNum(l.Kpein, 0, 'X') : NA}</td><td className={td}>{l.Kmein || '—'}</td>
                <td className={tdN}>{l.Kwert ? fmtNum(l.Kwert, 2, l.Waers) : NA}</td><td className={td}>{l.Waers}</td>
                <td className={td}><RoleBadge role={l.Role} />{grey && <span className="ml-1 rounded bg-sunken px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">{LINE_STATE_LABEL[st]}</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------- pricing procedure and rules tabs ------------------------- */
/* ------------------------- details of one row: order pricing and BOM costing ------------------------- */
function RowDetails({ row, f, ctx }: { row: SoPriceRow; f: SoUrlState; ctx: string }) {
  const [sub, setSub] = useState<'pricing' | 'bom'>('pricing');
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Row details" className="flex gap-1">
        {([['pricing', 'Pricing of the selected order'], ['bom', 'BOM costing (all costs)']] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={sub === k} onClick={() => setSub(k)} className={cx('rounded-full border px-3 py-1 text-xs font-bold', sub === k ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:text-ink')}>{label}</button>
        ))}
      </div>
      {sub === 'pricing' && <PricingPanel row={row} f={f} ctx={ctx} />}
      {sub === 'bom' && (row.Werks ? <BomCostingPanel matnr={row.Matnr} werks={row.Werks} uom={row.Uom} defaultQty={1} /> : <p className="text-sm text-muted">SAP gave no plant for this order item, so the BOM cannot be costed here.</p>)}
    </div>
  );
}

function ProcedureTab({ rows }: { rows: SoPriceRow[] }) {
  const procs = useMemo(() => proceduresIn(rows), [rows]);
  const [kalsm, setKalsm] = useState('');
  const sel = kalsm || procs[0]?.kalsm || '';
  const key = `so|PROC|${sel}`;
  const entry = useEntry<SoProcRow>(sel ? key : null);
  useEffect(() => { if (sel) void ensure<SoProcRow>(key, PAGE_CTX, 'PROC', (signal) => fetchSo('PROC', { kalsm: [sel] }, { signal })); }, [sel, key]);
  if (!procs.length) return <Empty title="No pricing procedure yet">Show the prices first; the procedures of the selected orders appear here.</Empty>;
  const steps = procSteps(entry?.data ?? [], sel);
  return (
    <div className="flex flex-col gap-2">
      <label className="flex max-w-md flex-col gap-0.5 text-xs font-semibold">Pricing procedure
        <select className={inputCls} value={sel} onChange={(e) => setKalsm(e.target.value)} aria-label="Pricing procedure">{procs.map((p) => <option key={p.kalsm} value={p.kalsm}>{p.kalsm}{p.text ? ` - ${p.text}` : ''}</option>)}</select>
      </label>
      {(!entry || entry.status === 'loading') && <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Reading the steps…</p>}
      {entry?.status === 'error' && <p role="alert" className="text-sm text-bad">{entry.error}</p>}
      {entry?.status === 'done' && (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-sunken"><tr><th className={th}>Step</th><th className={th}>Counter</th><th className={th}>Condition</th><th className={th}>Text</th><th className={th}>Used for</th></tr></thead>
            <tbody>
              {steps.map((s, i) => <tr key={`${s.Stunr}|${s.Zaehl}|${i}`} className={cx('border-t border-line/60', s.Role === 'MRP' && 'bg-accent/[0.06]', s.Role === 'SP' && 'bg-good/[0.07]')}><td className={cx(td, 'font-mono')}>{s.Stunr}</td><td className={cx(td, 'font-mono')}>{s.Zaehl}</td><td className={cx(td, 'font-mono font-bold')}>{s.Kschl}</td><td className={td}>{s.Txt}</td><td className={td}><RoleBadge role={s.Role} /></td></tr>)}
              {!steps.length && <tr><td colSpan={5} className="px-3 py-5 text-center text-muted">SAP returned no steps for this procedure.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RulesTab() {
  const entry = useEntry<SoCondRow>(COND_KEY);
  const load = () => void ensure<SoCondRow>(COND_KEY, PAGE_CTX, 'COND', (signal) => fetchSo('COND', {}, { signal }), entry?.status === 'done');
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">Maintain the rules in SAP (SM30, table ZMM_COGM_SPCOND). They are shown here read-only.</p>
      {!entry && <div><Button size="sm" onClick={load}><Play size={13} /> Load rules</Button></div>}
      {entry?.status === 'loading' && <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Reading the rules…</p>}
      {entry?.status === 'error' && <p role="alert" className="text-sm text-bad">{entry.error}</p>}
      {entry?.status === 'done' && (
        <div className="max-h-[480px] overflow-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-sunken"><tr><th className={th}>Sales org</th><th className={th}>Channel</th><th className={th}>Doc type</th><th className={th}>Procedure</th><th className={th}>Selling price</th><th className={th}>MRP</th><th className={th}>Basis</th><th className={th}>Fallback</th><th className={th}>Segment</th><th className={th}>Counted?</th><th className={th}>Text</th><th className={th}>Changed by</th></tr></thead>
            <tbody>
              {(entry.data ?? []).map((c, i) => (
                <tr key={i} className={cx('border-t border-line/60', c.Excl && 'text-faint')}>
                  <td className={td}><span className="font-mono">{c.Vkorg}</span> {c.OrgTxt}</td><td className={td}><span className="font-mono">{c.Vtweg}</span> {c.ChnTxt}</td><td className={cx(td, 'font-mono')}>{c.Auart}</td><td className={cx(td, 'font-mono')}>{c.Kalsm}</td>
                  <td className={td}><span className="font-mono font-bold">{c.KschlSp}</span> {c.SpTxt}</td><td className={td}><span className="font-mono font-bold">{c.KschlMrp}</span> {c.MrpTxt}</td><td className={td}>{c.SpBasis}{c.SpAbs ? ` (${c.SpAbs})` : ''}</td><td className={td}>{c.Fallback || '—'}</td>
                  <td className={td}>{c.Segment ? `${c.Segment}${c.SegTxt ? ` - ${c.SegTxt}` : ''}` : '—'}</td><td className={td}>{c.Excl ? <span className="rounded bg-sunken px-1.5 py-0.5 text-[10px] font-bold uppercase">never counted</span> : 'counted'}</td><td className={td}>{c.Text}</td><td className={td}>{c.ChBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------- the page ------------------------- */
function Screen() {
  const hub = useHubSession();
  const email = hub && hub !== 'checking' ? hub.email : '';
  const [admin, setAdmin] = useState<'checking' | 'yes' | 'no'>('checking');
  useEffect(() => { if (email) void fetchIsAdmin(email).then((a) => setAdmin(a ? 'yes' : 'no')); }, [email]);
  const cfg = useMemo(() => (typeof window === 'undefined' ? null : loadSapConfig()), []);
  const system = cfg?.ok ? cfg.config.system : '';

  const [form, setForm] = useState<SoUrlState>(() => (typeof window === 'undefined' ? DEFAULT_SO_URL : parseSoSearch(window.location.search)));
  const patch = useCallback((p: Partial<SoUrlState>) => setForm((f) => ({ ...f, ...p })), []);
  useEffect(() => { const s = soSearch(form); if (s !== window.location.search) window.history.replaceState(null, '', `${window.location.pathname}${s}`); }, [form]);
  useEffect(() => () => abortAll(), []); // leaving the page ends every running request

  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>('prices');
  const [errors, setErrors] = useState<{ materials?: string; areas?: string }>({});
  const [ran, setRan] = useState<{ f: SoUrlState; at: Date } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cogmRows, setCogmRows] = useState<CogmRow[]>([]);

  // value lists (areas, rules, filter lists): only on their buttons
  const areaFilter = form.materials.length ? safeFilter(listQuery(form), 'AREA') : null;
  const areaKey = areaFilter === null ? null : `so|AREA|${safeFilter({ materials: form.materials.slice(0, SO_MAX_MATERIALS), daysBack: form.days }, 'AREA')}`;
  const areasEntry = useEntry<SoAreaRow>(areaKey);
  const condEntry = useEntry<SoCondRow>(COND_KEY);
  const filterFilter = form.materials.length && form.vkorg.length ? safeFilter(listQuery(form), 'FILTER') : null;
  const filterKey = filterFilter === null ? null : `so|FILTER|${filterFilter}`;
  const filterEntry = useEntry<SoFilterRow>(filterKey);

  const loadAreas = () => {
    if (!areaKey) return;
    const q = { materials: form.materials.slice(0, SO_MAX_MATERIALS), daysBack: form.days };
    void ensure<SoAreaRow>(areaKey, PAGE_CTX, 'AREA', (signal) => fetchSo('AREA', q, { signal }));
    void ensure<SoCondRow>(COND_KEY, PAGE_CTX, 'COND', (signal) => fetchSo('COND', {}, { signal }));
  };
  const loadFilters = () => {
    if (!filterKey) return;
    const q = listQuery(form);
    void ensure<SoFilterRow>(filterKey, PAGE_CTX, 'FILTER', (signal) => fetchSo('FILTER', q, { signal }));
  };

  const runCtx = ran ? `so-run|${runId(ran.f)}` : '';
  const runKey = ran ? `so|PRICE|${runId(ran.f)}` : null;
  const entry = useEntry<SoPriceRow>(runKey);
  const loading = entry?.status === 'loading';
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!loading || !entry) return;
    const t = setInterval(() => setElapsed(Date.now() - entry.startedAt), 250);
    return () => clearInterval(t);
  }, [loading, entry]);

  const startRun = (f: SoUrlState, force = false) => {
    void ensure<SoPriceRow>(`so|PRICE|${runId(f)}`, `so-run|${runId(f)}`, 'PRICE', (signal) => fetchSoMerged('PRICE', toQuery(f), { signal }), force);
  };
  const show = () => {
    const e: typeof errors = {};
    if (!form.materials.length) e.materials = 'Pick at least one material.';
    if (!form.vkorg.length) e.areas = 'Pick at least one sales organisation (load the sales areas first).';
    setErrors(e);
    if (Object.keys(e).length) return;
    const f = { ...form };
    setRan({ f, at: new Date() });
    setOpen(false);
    setExpanded(new Set());
    setTab('prices');
    startRun(f);
  };
  const refresh = () => { if (!ran) return; invalidate(runCtx); startRun(ran.f, true); };
  const stopAll = () => { stop(runCtx); stop(PAGE_CTX); };

  const rows = entry?.status === 'done' ? entry.data ?? [] : null;
  const groups = useMemo(() => (rows ? groupBySegment(rows) : []), [rows]);
  const warned = useMemo(() => (rows ? rows.filter((r) => rowWarnings(r).length > 0).length : 0), [rows]);
  const noOrder = useMemo(() => (rows ? rows.filter((r) => rowWarnings(r).some((w) => w.key === 'nosp')).length : 0), [rows]);
  const segments = useMemo(() => segmentOptions(condEntry?.data ?? []), [condEntry]);
  const never = useMemo(() => neverCountedAuarts(condEntry?.data ?? [], form.vkorg), [condEntry, form.vkorg]);
  const toggleRow = (k: string) => setExpanded((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const applyValue = (p: Partial<SalesFiltersValue>) => {
    const next: Partial<SoUrlState> = {};
    if (p.vkorg) next.vkorg = p.vkorg;
    if (p.vtweg) next.vtweg = p.vtweg;
    if (p.segment) next.segment = p.segment[0] ?? '';
    if (p.days !== undefined) next.days = p.days;
    if (p.auart) next.auart = p.auart;
    if (p.pstyv) next.pstyv = p.pstyv;
    if (p.kdgrp) next.kdgrp = p.kdgrp;
    if (p.kunnr) next.kunnr = p.kunnr;
    patch(next);
  };
  const applyPreset = (p: SalesPreset) => setForm((f) => ({ ...f, materials: p.materials ?? f.materials, vkorg: p.value.vkorg, vtweg: p.value.vtweg, segment: p.value.segment[0] ?? '', days: p.value.days, auart: p.value.auart, pstyv: p.value.pstyv, kdgrp: p.value.kdgrp, kunnr: p.value.kunnr }));

  const doExport = async () => {
    if (!rows || !ran) return;
    const flat = <T,>(ctx: string, set: string) => entriesOf(ctx, set).flatMap((e) => (e.data ?? []) as T[]);
    const sheets = [pricesSheet(rows), pricingSheet(flat<SoPricingRow>(runCtx, 'PRICING')), procSheet(flat<SoProcRow>(PAGE_CTX, 'PROC')), rulesSheet(condEntry?.data ?? []), filterListsSheet(flat<SoFilterRow>(PAGE_CTX, 'FILTER')), cogmSheet(cogmRows)]
      .filter((s, i) => i === 0 || s.count > 0);
    const f = ran.f;
    const lists = (l: { in: string[]; ex: string[] }) => [l.in.length ? `only ${l.in.join(', ')}` : '', l.ex.length ? `not ${l.ex.join(', ')}` : ''].filter(Boolean).join('; ') || 'any';
    await downloadWacWorkbook(sheets, [
      ['Report', 'Sales price: MRP and selling price from the latest sales order, with the pricing of the selected order'], ['SAP system', system], ['Run at', ran.at.toLocaleString('en-IN')],
      ['Materials', f.materials.join(', ')], ['Sales organisations', f.vkorg.join(', ')], ['Channels', f.vtweg.length ? f.vtweg.join(', ') : 'all of the chosen organisations'], ['Segment', f.segment || 'all'], ['Days back', String(f.days)],
      ['Document types', lists(f.auart)], ['Item categories', lists(f.pstyv)], ['Customer groups', lists(f.kdgrp)], ['Customers', lists(f.kunnr)],
      ['Rows in Prices', String(rows.length)], ['Stale after (days)', String(SO_STALE_DAYS)],
      ['Pricing / Pricing procedure / Rules / Filter lists / Compare with cost', 'only what was loaded in this run'],
      ['Note', 'Prices are per material unit in the currency of the sales organisation; nothing is converted. SAP computes every figure.'],
    ], 'sales-price');
  };

  if (admin === 'checking') return <div className="grid min-h-[40vh] place-items-center"><Spinner className="h-7 w-7" /></div>;
  if (admin === 'no') {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-line bg-panel p-7 text-center shadow-card">
        <Lock size={24} className="mx-auto text-warn" aria-hidden />
        <h1 className="mt-2 text-lg font-extrabold">Sales price is for Admins</h1>
        <p className="mt-1 text-sm text-muted">Ask a Costing Cockpit Admin for access (Manage Access in the Emami Apps Admin Center).</p>
      </div>
    );
  }

  const value = toValue(form);
  const areas = areasEntry?.status === 'done' ? areasEntry.data ?? [] : [];
  const cut = form.materials.length > SO_MAX_MATERIALS;
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold">Sales price</h1>
          <p className="text-xs text-muted">MRP and selling price from the latest sales order, per material unit, with the full pricing of that order. SAP chooses the order and computes every figure.</p>
        </div>
        <div className="num text-right text-2xs text-muted">
          <div>SAP system <span className="font-mono font-bold text-ink">{system || '—'}</span></div>
          {ran && entry?.status === 'done' && <div>Run {ran.at.toLocaleTimeString('en-IN')} · {fmtMs(entry.ms)} in SAP</div>}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-panel shadow-card">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-bold">
          {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />} Selection
          <span className="ml-2 truncate text-xs font-normal text-muted">{form.materials.length} material{form.materials.length === 1 ? '' : 's'} · {form.vkorg.join(', ') || 'no sales organisation'} · {form.days} days{form.segment ? ` · segment ${form.segment}` : ''}</span>
        </button>
        {open && (
          <div className="flex flex-col gap-3 border-t border-line px-4 py-3">
            <Field label="Materials" error={errors.materials} hint={`Up to ${SO_MAX_MATERIALS} per call to SAP; a longer list is split and merged.`}>
              {(id) => (
                <>
                  <MaterialPicker id={id} values={form.materials} onChange={(materials) => patch({ materials })} max={PICK_MAX} invalid={!!errors.materials} />
                  <MaterialHierarchyPicker values={form.materials} onChange={(materials) => patch({ materials })} max={PICK_MAX} />
                </>
              )}
            </Field>
            {cut && <p className="text-xs text-warn">The sales-area and filter lists are built from the first {SO_MAX_MATERIALS} materials; the prices are read for all {form.materials.length}.</p>}
            <SalesFiltersEditor
              areas={areas} areasLoading={areasEntry?.status === 'loading'} areasError={areasEntry?.status === 'error' ? areasEntry.error : errors.areas ?? null} onLoadAreas={loadAreas} canLoadAreas={!!areaKey}
              segments={segments} value={value} onChange={applyValue}
              filterRows={filterEntry?.status === 'done' ? filterEntry.data ?? [] : null} filterLoading={filterEntry?.status === 'loading'} filterError={filterEntry?.status === 'error' ? filterEntry.error : null} onLoadFilters={loadFilters} canLoadFilters={!!filterKey}
              neverCounted={never} email={email} materials={form.materials} onApplyPreset={applyPreset}
            />
            <div className="flex flex-wrap items-center gap-2">
              {loading ? <Button type="button" variant="ghost" onClick={stopAll}><Square size={14} /> Stop ({fmtMs(elapsed)})</Button> : <Button type="button" variant="primary" onClick={show}><Play size={14} /> Show</Button>}
              <Button type="button" onClick={refresh} disabled={!ran || loading} title="Read the same selection again from SAP (a result is kept until you refresh)"><RefreshCw size={14} /> Refresh</Button>
              <span className="text-xs text-faint">Nothing loads until you press a button. There is no time limit; Stop ends a run.</span>
            </div>
          </div>
        )}
      </div>

      {entry?.status === 'cancelled' && <p className="text-sm text-muted">The run was stopped.</p>}
      {loading && !rows && <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Reading the latest sales orders from SAP… {fmtMs(elapsed)}</p>}
      <WacMessages messages={entry?.messages ?? []} error={entry?.status === 'error' ? entry.error : null} />

      {ran && (
        <>
          <Tabs<Tab> label="Sales price views" value={tab} onChange={setTab} tabs={[{ id: 'prices', label: 'Prices' }, { id: 'procedure', label: 'Pricing procedure' }, { id: 'rules', label: 'Rules' }]} />
          {tab === 'procedure' && <ProcedureTab rows={rows ?? []} />}
          {tab === 'rules' && <RulesTab />}
          {tab === 'prices' && rows && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Rows" value={rows.length} sub="material x sales area x doc type" />
                <Stat label="Materials" value={new Set(rows.map((r) => r.Matnr)).size} />
                <Stat label="With a warning" value={warned} tone={warned ? 'warn' : undefined} sub="stale, skipped, MRP 0, no order" />
                <Stat label="No usable order" value={noOrder} tone={noOrder ? 'bad' : undefined} sub="selling price 0 with a message" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => void doExport()} disabled={!rows.length} title="Excel: Prices and everything loaded in this run (pricing, procedures, rules, filter lists, comparison), and Parameters"><FileSpreadsheet size={14} /> Excel</Button>
                <span className="text-xs text-faint">Prices are per material unit, in the currency shown; nothing is converted. Click a row (or press Enter) for the order&apos;s pricing.</span>
              </div>
              {rows.length === 0 ? <Empty title="No sales orders found">SAP found no order with a selling price condition for this selection. Widen the days, the sales organisations or the filters.</Empty> : (
                <div className="max-h-[70vh] overflow-auto rounded-2xl border border-line bg-panel shadow-card">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-sunken"><tr>
                      <th className={th}><span className="sr-only">Expand</span></th><th className={th}>Material</th><th className={th}>Sales area</th><th className={th}>Doc type</th><th className={thN}>MRP</th><th className={thN}>Selling price</th><th className={th}>Condition</th><th className={thN}>Net price (ref.)</th><th className={thN}>RM</th><th className={thN}>PM</th><th className={thN}>Perfume</th><th className={thN}>Total cost (RM+PM+perfume)</th><th className={thN}>% of selling price</th><th className={thN}>RM/PM/Perfume consumed</th>
                      <th className={th}>Order</th><th className={th}>Order date</th><th className={th}>Customer</th><th className={th}>Pricing procedure</th><th className={thN}>Orders / skipped</th><th className={th}>Warnings</th>
                    </tr></thead>
                    {groups.map((g) => (
                      <tbody key={g.label}>
                        <tr className="bg-sunken/60"><td colSpan={20} className="px-2.5 py-1.5 text-xs font-extrabold uppercase tracking-wide text-ink">Segment: {g.label} <span className="font-normal text-muted">({g.rows.length})</span></td></tr>
                        {g.rows.map((r) => {
                          const k = priceKey(r);
                          const isOpen = expanded.has(k);
                          const warn = rowWarnings(r);
                          return (
                            <Fragment key={k}>
                              <tr tabIndex={0} aria-expanded={isOpen} aria-label={`${r.Matnr} ${r.Maktx}, ${r.Vkorg} ${r.Vtweg} ${r.Auart}. Press Enter to ${isOpen ? 'hide' : 'show'} the pricing.`}
                                className="cursor-pointer border-t border-line/60 hover:bg-accent/5 focus:bg-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                                onClick={() => toggleRow(k)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleRow(k); } }}>
                                <td className={td} aria-hidden>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                                <td className={td}><span className="font-mono font-bold text-accent">{r.Matnr}</span> <span className="text-muted">{r.Maktx}</span></td>
                                <td className={td}><span className="font-mono">{r.Vkorg}</span>/<span className="font-mono">{r.Vtweg}</span></td>
                                <td className={td}><span className="font-mono">{r.Auart}</span> <span className="text-muted">{r.AuartTxt}</span></td>
                                <td className={tdN}><Amount v={r.Mrp} curr={r.Curr} unit={r.Uom} /></td><td className={cx(tdN, 'font-bold')}><Amount v={r.Sp} curr={r.Curr} unit={r.Uom} /></td>
                                <td className={cx(td, 'font-mono')}>{r.SpCond || '—'}</td><td className={tdN}><Amount v={r.NetPrice} curr={r.Curr} unit={r.Uom} /></td>
                                <CostCells r={r} />
                                <td className={cx(td, 'whitespace-nowrap font-mono')}>{r.Vbeln ? <>{r.Vbeln}/{r.Posnr}<Copy text={`${r.Vbeln}/${r.Posnr}`} label={`Copy order ${r.Vbeln} item ${r.Posnr}`} /></> : NA}</td>
                                <td className={cx(td, 'whitespace-nowrap')}>{r.Audat ? <>{fmtDate(r.Audat)} <span className="text-2xs text-muted">({r.DaysOld} d)</span></> : NA}</td>
                                <td className={cx(td, 'font-mono')}>{r.Kunnr || '—'}</td>
                                <td className={td}>{r.Kalsm ? <><span className="font-mono">{r.Kalsm}</span> <span className="text-muted">{r.KalsmTxt}</span></> : '—'}</td>
                                <td className={tdN}>{r.NOrders} / {r.NSkip}</td>
                                <td className={td}>
                                  <div className="flex flex-col gap-0.5">
                                    {warn.map((w) => <span key={w.key} title={w.detail} className={cx('inline-flex items-center gap-1 text-xs font-semibold', w.key === 'nosp' ? 'text-bad' : 'text-warn')}><AlertTriangle size={12} aria-hidden />{w.label}{w.detail && (w.key === 'nosp' || w.key === 'pcmsg') ? `: ${w.detail}` : ''}</span>)}
                                    {r.Msg && !warn.some((w) => w.key === 'nosp') && <span className="text-xs text-muted">{r.Msg}</span>}
                                  </div>
                                </td>
                              </tr>
                              {isOpen && <tr className="border-t border-line/60 bg-sunken/30"><td colSpan={20} className="px-4 py-3" onClick={(e) => e.stopPropagation()}><RowDetails row={r} f={ran.f} ctx={runCtx} /></td></tr>}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    ))}
                  </table>
                </div>
              )}
              {rows.length > 0 && (
                <div className="rounded-2xl border border-line bg-panel p-4 shadow-card">
                  <h2 className="mb-1 text-sm font-bold">Compare with cost (SAP)</h2>
                  <p className="mb-2 text-xs text-muted">SAP costs the finished goods live and relates the selling price to the cost. The amount remaining after manufacturing cost is SAP&apos;s figure.</p>
                  <CompareWithCost materials={Array.from(new Set(rows.map((r) => r.Matnr)))} selection={{ vkorg: ran.f.vkorg, vtweg: ran.f.vtweg, segment: ran.f.segment ? [ran.f.segment] : [], daysBack: ran.f.days, auart: ran.f.auart, pstyv: ran.f.pstyv, kdgrp: ran.f.kdgrp, kunnr: ran.f.kunnr }} onRows={setCogmRows} />
                </div>
              )}
            </>
          )}
        </>
      )}
      {!ran && <Empty title="Nothing loaded yet">Pick the materials, load the sales areas, choose the sales organisation, then press Show.</Empty>}
    </>
  );
}

export default function SalesPrice() {
  return (
    <PlanFrame active="so">
      <Screen />
    </PlanFrame>
  );
}
