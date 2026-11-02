'use client';
/**
 * Actual vs rate sources (Admin of this app only): the quantity-weighted average ACTUAL cost of finished goods for a period
 * and manufacturing units, split into RM / PM / Perfume, against the other rate sources. SAP computes every figure; this screen
 * presents them. Read-only. Nothing loads until Run, and no request has a time limit (Stop ends it).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Columns3, FileSpreadsheet, Lock } from 'lucide-react';
import PlanFrame from '../plan/PlanFrame';
import type { PlantsState } from '../FilterPanel';
import { Button, Empty, Spinner, Stat, cx } from '../ui';
import WacFilters, { type WacForm } from './WacFilters';
import WacHelp from './WacHelp';
import WacMessages from './WacMessages';
import WacTable from './WacTable';
import { splitList } from '../Pickers';
import { api } from '@/lib/client/api';
import { fetchIsAdmin } from '@/lib/client/hubAccess';
import { useHubSession } from '@/lib/client/session';
import { loadSapConfig } from '@/lib/sap/config';
import type { PlantRow } from '@/lib/sap/fields';
import { fmtMs } from '@/lib/format';
import { abortAll, entriesOf, stop } from '@/lib/wac/cache';
import { COLUMNS, sortRows, visibleColumns, type ColKey, type SortDir } from '@/lib/wac/columns';
import { presetRange } from '@/lib/wac/dates';
import { componentsSheet, comparisonSheet, documentsSheet, downloadWacWorkbook, summarySheet } from '@/lib/wac/export';
import { buildWacFilter, type WacFilterInput } from '@/lib/wac/filter';
import { WAC_RECON_WARN_PCT } from '@/lib/wac/flag';
import { parseWacUrl, wacSearch } from '@/lib/wac/url';
import { useWacRows } from '@/lib/wac/useWac';
import { LIMIT_FALLBACK, comparisonLimited, intersectPlants, kpis, selectionTotal } from '@/lib/wac/view';
import type { WacCompRow, WacCompareRow, WacDocRow, WacRow } from '@/lib/wac/types';

const initialForm = (): WacForm => {
  const url = typeof window === 'undefined' ? {} : parseWacUrl(window.location.search);
  const last = presetRange('lastMonth')!;
  const custom = !!(url.from || url.to);
  return {
    plants: url.plants ?? [], preset: custom ? 'custom' : 'lastMonth', from: url.from ?? last.from, to: url.to ?? last.to,
    mat: url.mat ?? [], prodha: (url.prodha ?? []).join(', '), cmp: url.cmp ?? false, varPct: '', varHigh: '',
  };
};

function Screen() {
  const hub = useHubSession();
  const email = hub && hub !== 'checking' ? hub.email : '';
  const [admin, setAdmin] = useState<'checking' | 'yes' | 'no'>('checking');
  useEffect(() => { if (email) void fetchIsAdmin(email).then((a) => setAdmin(a ? 'yes' : 'no')); }, [email]);

  const cfg = useMemo(() => (typeof window === 'undefined' ? null : loadSapConfig()), []);
  const system = cfg?.ok ? cfg.config.system : '';

  const [form, setForm] = useState<WacForm>(initialForm);
  const patch = useCallback((p: Partial<WacForm>) => setForm((f) => ({ ...f, ...p })), []);
  // The URL mirrors the selection (it never starts a run).
  useEffect(() => {
    const pc = new URLSearchParams(window.location.search).get('pc') ?? '';
    const s = wacSearch({ plants: form.plants, from: form.from, to: form.to, mat: form.mat, prodha: splitList(form.prodha), cmp: form.cmp }, { pc });
    if (s !== window.location.search) window.history.replaceState(null, '', `${window.location.pathname}${s}`);
  }, [form]);

  const [plants, setPlants] = useState<PlantRow[]>([]);
  const [plantsLoading, setPlantsLoading] = useState(false);
  const [plantsErr, setPlantsErr] = useState('');
  const loadPlants = useCallback(() => {
    setPlantsLoading(true);
    setPlantsErr('');
    api.plants().then((r) => setPlants(r.plants)).catch((e) => setPlantsErr(e.message)).finally(() => setPlantsLoading(false));
  }, []);
  useEffect(() => { if (admin === 'yes') loadPlants(); }, [admin, loadPlants]);
  const plantsState: PlantsState = useMemo(() => ({ plants, loading: plantsLoading, error: plantsErr, reload: loadPlants }), [plants, plantsLoading, plantsErr, loadPlants]);

  const [filtersOpen, setFiltersOpen] = useState(true);
  const [errors, setErrors] = useState<Partial<Record<'plants' | 'dates' | 'var', string>>>({});
  const [runInfo, setRunInfo] = useState<{ q: WacFilterInput; at: Date } | null>(null);
  const { entry, ctx, run, refresh } = useWacRows(runInfo?.q ?? null);
  useEffect(() => () => abortAll(), []); // leaving the page ends every running request

  const loading = entry?.status === 'loading';
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!loading || !entry) return;
    const t = setInterval(() => setElapsed(Date.now() - entry.startedAt), 250);
    return () => clearInterval(t);
  }, [loading, entry]);

  const start = () => {
    const e: typeof errors = {};
    if (!form.plants.length) e.plants = 'Pick at least one manufacturing unit.';
    if (!form.from || !form.to) e.dates = 'Both dates are required.';
    else if (form.from > form.to) e.dates = 'The "from" date is after the "to" date.';
    // Only plants SAP lists for this person may be used (the picker offers exactly those).
    const allowed = plants.length ? intersectPlants(form.plants, plants.map((p) => p.Werks)) : form.plants;
    if (form.plants.length && !allowed.length) e.plants = 'None of these plants is available to you in SAP.';
    for (const v of form.cmp ? [form.varPct, form.varHigh] : []) if (v.trim() && !Number.isFinite(Number(v))) e.var = 'Enter a number, or leave empty for SAP\'s default.';
    setErrors(e);
    if (Object.keys(e).length) return;
    const q: WacFilterInput = { plants: allowed, materials: form.mat, prodha: splitList(form.prodha), dateFrom: form.from, dateTo: form.to, inclCmp: form.cmp, varPct: form.cmp ? form.varPct : undefined, varHigh: form.cmp ? form.varHigh : undefined };
    try { buildWacFilter(q); } catch (err) { setErrors({ dates: (err as Error).message }); return; }
    setRunInfo({ q, at: new Date() });
    setFiltersOpen(false);
    void run(q);
  };

  const [showZero, setShowZero] = useState(false);
  const [sort, setSort] = useState<{ key: ColKey; dir: SortDir }>({ key: 'fg', dir: 'asc' });
  const [hidden, setHidden] = useState<Set<ColKey>>(() => new Set(COLUMNS.filter((c) => !c.defaultVisible).map((c) => c.key)));
  const [open, setOpen] = useState<Set<string>>(new Set());
  const onSort = (key: ColKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  const onToggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const all = (entry?.status === 'done' ? entry.data : null) as WacRow[] | null;
  const cmpOn = !!runInfo?.q.inclCmp;
  const displayed = useMemo(() => (all ? (showZero ? all : all.filter((r) => !(Number(r.Qty) === 0))) : []), [all, showZero]);
  const sorted = useMemo(() => sortRows(displayed, sort.key, sort.dir), [displayed, sort]);
  const cols = useMemo(() => visibleColumns(all ?? [], hidden, cmpOn), [all, hidden, cmpOn]);
  const k = useMemo(() => kpis(displayed), [displayed]);
  const total = useMemo(() => selectionTotal(displayed), [displayed]);
  const limited = !!all && comparisonLimited(entry?.messages ?? [], all, cmpOn);
  const zeroHidden = all ? all.length - displayed.length : 0;

  const doExport = async () => {
    if (!all || !runInfo) return;
    const flat = <T,>(set: string) => entriesOf(ctx, set).flatMap((e) => (e.data ?? []) as T[]);
    const sheets = [summarySheet(sorted, !!total), comparisonSheet(flat<WacCompareRow>('COMPARE')), componentsSheet(flat<WacCompRow>('COMP')), documentsSheet(flat<WacDocRow>('DOCS'))];
    const q = runInfo.q;
    await downloadWacWorkbook(sheets, [
      ['Report', 'Actual vs rate sources: quantity-weighted average actual cost per unit (INR) against the other rate sources'],
      ['SAP system', system], ['Run at', runInfo.at.toLocaleString('en-IN')], ['Plants', q.plants.join(', ')], ['Period', `${q.dateFrom} to ${q.dateTo}`],
      ['Finished goods', q.materials?.length ? q.materials.join(', ') : 'every finished good produced'], ['Product hierarchy', q.prodha?.length ? q.prodha.join(', ') : 'all'],
      ['Compare with rate sources', cmpOn ? 'yes' : 'no'], ['Amber from %', q.varPct || 'SAP default'], ['Red from %', q.varHigh || 'SAP default'],
      ['Rows in Summary', String(sorted.length)], ['Zero-quantity rows', showZero ? 'shown' : `hidden (${zeroHidden})`],
      ['Comparison / Components / Documents', 'only the finished goods whose detail was opened in this run'],
      ['Note', 'Source costs use today\'s rates and the current BOM; actual uses the documents of the period.'],
    ]);
  };

  if (admin === 'checking') return <div className="grid min-h-[40vh] place-items-center"><Spinner className="h-7 w-7" /></div>;
  if (admin === 'no') {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-line bg-panel p-7 text-center shadow-card">
        <Lock size={24} className="mx-auto text-warn" aria-hidden />
        <h1 className="mt-2 text-lg font-extrabold">Actual vs rate sources is for Admins</h1>
        <p className="mt-1 text-sm text-muted">Ask a Costing Cockpit Admin for access (Manage Access in the Emami Apps Admin Center).</p>
      </div>
    );
  }

  const derived = limited && !(entry?.messages ?? []).some((m) => /25/.test(m.message)) ? [LIMIT_FALLBACK] : [];
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold">Actual vs rate sources</h1>
          <p className="text-xs text-muted">Weighted average actual cost per unit (INR) from goods-receipt documents, against the selected rate, C-MAP, consumption and average rate. SAP computes every figure.</p>
        </div>
        <div className="num text-right text-2xs text-muted">
          <div>SAP system <span className="font-mono font-bold text-ink">{system || '—'}</span></div>
          {runInfo && entry?.status === 'done' && <div>Run {runInfo.at.toLocaleTimeString('en-IN')} · {fmtMs(entry.ms)} in SAP</div>}
        </div>
      </div>

      <WacFilters form={form} onChange={patch} plantsState={plantsState} errors={errors} open={filtersOpen} onToggle={() => setFiltersOpen(!filtersOpen)}
        running={!!loading} elapsed={elapsed} onRun={start} onStop={() => stop(ctx)} onRefresh={() => void refresh()} canRefresh={!!runInfo} />

      <p className="text-xs text-muted">Source costs use <b>today&apos;s rates and the current BOM</b>; the actual cost uses the documents of the period, so a gap is not always a shop-floor gap.</p>

      {entry?.status === 'cancelled' && <p className="text-sm text-muted">The run was stopped.</p>}
      {loading && !all && <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Reading from SAP… {fmtMs(elapsed)}{cmpOn ? ' (live costing can take a while)' : ''}</p>}
      <WacMessages messages={entry?.messages ?? []} error={entry?.status === 'error' ? entry.error : null} derived={derived} />

      {all && entry?.status === 'done' && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <Stat label="Finished goods" value={k.fgs} />
            <Stat label="Plants" value={k.plants} />
            <Stat label="Documents" value={k.docs} sub={`${k.batches} batches`} />
            <Stat label="Batches" value={k.batches} />
            <Stat label="Several PO-cost rows" value={k.dupRows} tone={k.dupRows ? 'warn' : undefined} sub="rows with status D" />
            <Stat label="Red flag" value={k.red} tone={k.red ? 'bad' : undefined} sub={cmpOn ? 'rows with a High variance' : 'comparison off'} title="Rows with at least one red (H) flag from SAP" />
            <Stat label="Amber flag" value={k.amber} tone={k.amber ? 'warn' : undefined} sub={cmpOn ? 'rows with a Medium variance' : 'comparison off'} title="Rows with an amber (M) flag and no red flag" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showZero} onChange={(e) => setShowZero(e.target.checked)} /> Show rows with zero quantity{zeroHidden ? ` (${zeroHidden} hidden)` : ''}</label>
            <details className="relative">
              <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-xs font-semibold hover:bg-sunken"><Columns3 size={14} aria-hidden /> Columns</summary>
              <div className="absolute z-20 mt-1 w-56 rounded-xl border border-line bg-panel p-2 shadow-pop">
                {COLUMNS.filter((c) => c.key !== 'fg').map((c) => (
                  <label key={c.key} className="flex items-center gap-2 px-2 py-1 text-sm"><input type="checkbox" checked={!hidden.has(c.key)} onChange={() => setHidden((s) => { const n = new Set(s); if (n.has(c.key)) n.delete(c.key); else n.add(c.key); return n; })} /> {c.label}</label>
                ))}
              </div>
            </details>
            <Button size="sm" onClick={() => void doExport()} disabled={!displayed.length} title="Excel: Summary, Comparison, Components, Documents, Parameters. Exports only what has been loaded (Comparison, Components and Documents only for the rows you opened)."><FileSpreadsheet size={14} /> Excel</Button>
            <span className={cx('ml-auto text-xs text-faint')}>{displayed.length} row{displayed.length === 1 ? '' : 's'} · click a row (or press Enter) for the comparison, components and documents{cmpOn ? '' : ' · switch on "Compare with rate sources" for the variance columns'}</span>
          </div>

          {displayed.length ? (
            <WacTable rows={sorted} cols={cols} sort={sort} onSort={onSort} open={open} onToggle={onToggle} run={runInfo!.q} cmpOn={cmpOn} total={total} reconPct={WAC_RECON_WARN_PCT} />
          ) : (
            <Empty title="No production in this period for the selection">{all.length ? 'Every row has zero quantity: tick "Show rows with zero quantity" to see them.' : 'SAP found no goods-receipt documents for these plants and dates. Try a wider period or other plants.'}</Empty>
          )}
          {displayed.length > 0 && !total && <p className="text-xs text-faint">No selection total: the rows use different units (or no quantity), so a weighted mean would not mean anything.</p>}
        </>
      )}
      {!runInfo && <Empty title="Nothing loaded yet">Pick the plants and the period, then press Run.</Empty>}
      <WacHelp />
    </>
  );
}

export default function ActualVsSources() {
  return (
    <PlanFrame active="wac">
      <Screen />
    </PlanFrame>
  );
}
