'use client';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useHubSession, BASE_PATH } from '@/lib/client/session';
import { fetchIsAdmin } from '@/lib/client/hubAccess';
import { loadSapConfig } from '@/lib/sap/config';
import { COSTING_TIMEOUT_MS } from '@/lib/sap/client';
import { subscribeCostProgress, type CostProgress } from '@/lib/client/plantRun';
import { isPlantWide, needsOnePlant, PLANT_WIDE_ENABLED } from '@/lib/plantwide/flag';
import { NO_PICK, usePlantWide, type HierPick } from '@/lib/plantwide/usePlantWide';
import { etaText } from '@/lib/plantwide/runBatches';
import RateSummary from './rates/RateSummary';
import CostBreakup from './costbreakup/CostBreakup';
import type { CostLine } from '@/lib/sap/fields';
import dynamic from 'next/dynamic';
import { AI_ENABLED } from '@/lib/ai/config';

// AI layer (flag NEXT_PUBLIC_AI_ENABLED, default off): loaded only when on.
const AiBar = dynamic(() => import('./ai/AiBar'), { ssr: false });
import { useRateOptions } from '@/lib/rates/useRateOptions';
import { attachRateOptions } from '@/lib/rates/options';
import RateSources from './rates/RateSources';
import RateCoverage from './rates/RateCoverage';
import { prioLabel } from '@/lib/rates/priority';
import type { PlantRow } from '@/lib/sap/fields';
import { defaultQuery, MODE_LABEL, MODES, type CostQuery, type Mode } from '@/lib/query/schema';
import { decodeQuery, encodeQuery } from '@/lib/query/url';
import { api, type CostResult } from '@/lib/client/api';
import { ls } from '@/lib/client/storage';
import { useRun } from '@/lib/client/useRun';
import { MAX_SCENARIOS, scenarioResults, useScenarios, type Scenario, type ScenarioResult } from '@/lib/client/scenarios';
import { D } from '@/lib/cost/decimal';
import { buildTree, leafPrefix, nodeTotals, grandTotal, rowKey, isLeafRow } from '@/lib/cost/tree';
import { localTotals } from '@/lib/cost/localTotals';
import { buildPivot } from '@/lib/cost/pivot';
import { EMPTY_SIM, isIdentity, simulate, type SimSettings } from '@/lib/cost/simulate';
import { dataQuality } from '@/lib/cost/analytics';
import { fmtMs, fmtNum } from '@/lib/format';
import { exportPivot } from '@/lib/client/export';
import { bomTreeSheet, exportBomTree } from '@/lib/client/treeExport';
import { exportAllTabs } from './exportAllTabs';
import type { SapMessage } from '@/lib/sap/messages';
import { AlertTriangle, Check, Download, FileSpreadsheet, FlaskConical, Link2, Printer } from 'lucide-react';
import FilterPanel, { type PlantsState } from './FilterPanel';
import Shell from './Shell';
import SectionHome from './SectionHome';
import type { SectionId } from '@/lib/nav/sections';
import { FgStrips } from './price-context/slots';
import { fgsOfLines, fgsOfSelection } from '@/lib/price-context/fgs';
import { useScreenHistory } from '@/lib/useScreenHistory';
import BomTree, { PRESETS as TREE_PRESETS, TREE_COLUMNS, type NodeAgg } from './BomTree';
import RowDrawer from './RowDrawer';
import ComparisonView from './ComparisonView';
import PagedTable from './PagedTable';
import Dashboard from './Dashboard';
import DataQuality from './DataQuality';
import Simulator from './Simulator';
import Scenarios from './Scenarios';
import Warnings from './Warnings';
import PrintView from './PrintView';
import { Button, cx, Empty, Pill, SimTag, Skeleton, Tabs } from './ui';

type Tab = 'tree' | 'compare' | 'table' | 'dash' | 'sim' | 'dq' | 'scen' | 'rates' | 'coverage' | 'ratesum' | 'breakup';

const lastQueryKey = (u: string) => `bce:last-query:${u}`;
const lastMsKey = (m: Mode) => `bce:last-ms:${m}`;

export default function Explorer() {
  const hub = useHubSession();
  const session = hub === 'checking' ? null : hub;
  const user = session?.email ?? '';
  const cfg = useMemo(() => (typeof window === 'undefined' ? null : loadSapConfig()), []);
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (user) void fetchIsAdmin(user).then(setIsAdmin);
  }, [user]);
  const [plants, setPlants] = useState<PlantRow[]>([]);
  const [plantsLoading, setPlantsLoading] = useState(false);
  const [plantsErr, setPlantsErr] = useState('');
  const [groupCurr, setGroupCurr] = useState('INR');
  const [query, setQuery] = useState<CostQuery>(defaultQuery('B'));
  const [ranQuery, setRanQuery] = useState<CostQuery | null>(null);
  const [tab, setTab] = useState<Tab>('tree');
  const [sim, setSim] = useState<SimSettings>(EMPTY_SIM);
  const simDeferred = useDeferredValue(sim);
  const [drawer, setDrawer] = useState<number | null>(null);
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const [coverDays, setCoverDays] = useState(30);
  const [pagedRun, setPagedRun] = useState(0);
  const [pagedMsgs, setPagedMsgs] = useState<{ messages: SapMessage[]; ms: number } | null>(null);
  const [pagedBusy, setPagedBusy] = useState<{ on: boolean; cancel?: () => void; started?: number }>({ on: false });
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [resultAt, setResultAt] = useState<number>(0);
  const [booted, setBooted] = useState(false);
  // In-app "Back": the screen is the side-pane mode, the result tab and the open row drawer. A
  // drawer is remembered with the result it belongs to, so it is only reopened on that result.
  // The section page (tiles of Costing / Analysis) shows over the costing screens without closing them, so a run is kept.
  const [home, setHome] = useState<SectionId | null>(null);
  const { back } = useScreenHistory(
    booted ? { mode: query.mode, tab, drawer: drawer === null ? null : [drawer, resultAt], home } : null,
    (s) => {
      setHome(s.home ?? null);
      setQuery((q) => (q.mode === s.mode ? q : { ...q, mode: s.mode }));
      setTab(s.tab);
      setDrawer(s.drawer && s.drawer[1] === resultAt ? s.drawer[0] : null);
    },
  );

  const scen = useScenarios(user);
  const [autoRun, setAutoRun] = useState<string[]>([]);
  const runner = useRun((signal: AbortSignal, q: CostQuery) => api.cost(q, signal));
  // Plant-wide costing (flag PLANT_WIDE_ENABLED, one plant + Materials empty); inactive = no request, no change.
  const [hierPick, setHierPick] = useState<HierPick>(NO_PICK);
  const pw = usePlantWide({ query, pick: hierPick, cancel: runner.cancel });

  // ---- boot: config, plants, initial query (URL > last per user > default) -----------------
  useEffect(() => setCoverDays(ls.get('bce:cover-days', 30)), []);
  const loadPlants = useCallback(() => {
    setPlantsLoading(true);
    setPlantsErr('');
    api.plants()
      .then((r) => setPlants(r.plants))
      .catch((e) => setPlantsErr(e.message))
      .finally(() => setPlantsLoading(false));
  }, []);
  const plantsState: PlantsState = useMemo(() => ({ plants, loading: plantsLoading, error: plantsErr, reload: loadPlants }), [plants, plantsLoading, plantsErr, loadPlants]);
  useEffect(() => {
    if (!user) return;
    api.config().then((c) => setGroupCurr(c.GROUP_CURR || 'INR')).catch(() => undefined);
    loadPlants();
    const fromUrl = decodeQuery(new URLSearchParams(window.location.search).get('q'));
    const q = fromUrl ?? ls.get<CostQuery | null>(lastQueryKey(user), null);
    const pick = new URLSearchParams(window.location.search).get('mode') as Mode | null; // a tile of a section page on another route
    if (pick && (MODES as readonly string[]).includes(pick) && q?.mode !== pick) { setQuery(defaultQuery(pick)); setTab(pick === 'C' ? 'compare' : pick === 'B' ? 'tree' : 'table'); }
    else if (q) setQuery({ ...defaultQuery(q.mode), ...q });
    setBooted(true);
  }, [user]);

  const run = useCallback(
    async (q: CostQuery = query) => {
      setRanQuery(q);
      ls.set(lastQueryKey(user), q);
      const url = new URL(window.location.href);
      url.searchParams.set('q', encodeQuery(q));
      window.history.replaceState(null, '', url);
      if (q.mode === 'R' || q.mode === 'F' || q.mode === 'M') {
        setCollapsed(true);
        setPagedMsgs(null);
        setTab('table');
        setPagedRun((n) => n + 1);
        return;
      }
      setDrawer(null);
      const r = PLANT_WIDE_ENABLED && isPlantWide(q) && pw.active ? await runner.runWith((signal) => pw.run(signal, q, runner.publish)) : await runner.run(q);
      if (r && AI_ENABLED && q.mode === 'B') void import('@/lib/snapshots/snapshot').then((m) => m.saveSnapshotIfEnabled(r.rows, q, cfg?.ok ? cfg.config.system : '', user));
      if (r) {
        setCollapsed(true);
        ls.set(lastMsKey(q.mode), r.ms);
        setResultAt(Date.now());
        setTab((t) => (q.mode === 'C' ? (t === 'tree' || t === 'table' ? 'compare' : t) : t === 'compare' || t === 'table' ? 'tree' : t));
      }
    },
    [query, runner, user, pw],
  );

  // ---- derived results ---------------------------------------------------------------------
  // The side-pane mode drives the screen; a result is shown only for the mode it was run in.
  const mode = query.mode;
  const result: CostResult | null = runner.data && ranQuery && ranQuery.mode === mode && (mode === 'B' || mode === 'C') ? runner.data : null;
  const plantNames = useMemo(() => Object.fromEntries(plants.map((p) => [p.Werks, p.Name1])), [plants]);
  // Rate options load lazily (Rate sources tab, row drawer, re-pick what-ifs) - never on the main run.
  // Plant run (materials empty): rate options are read for the finished goods that were costed.
  const ratesQuery = useMemo(() => (ranQuery && result?.resolvedMaterials?.length ? { ...ranQuery, materials: result.resolvedMaterials } : ranQuery), [ranQuery, result]);
  const rates = useRateOptions(result && mode === 'B' && ratesQuery ? ratesQuery : null, cfg?.ok ? cfg.config.system : '');
  // Freight break-up: FreightDays / StdFrt of the run that produced the lines (never the form).
  const freightRun = useMemo(() => (result && ranQuery ? { freightDays: ranQuery.freightDays, stdFrt: ranQuery.stdFrt } : null), [result, ranQuery]);
  const costRows = useMemo(() => (result && mode === 'B' && rates.status === 'ready' && rates.rows ? attachRateOptions(result.rows, rates.rows) : result?.rows ?? []), [result, mode, rates.status, rates.rows]);
  const tree = useMemo(() => (result && mode === 'B' ? buildTree(costRows, plantNames) : null), [result, costRows, mode, plantNames]);
  const pivot = useMemo(() => (result && mode === 'C' && ranQuery ? buildPivot(result.rows, ranQuery.compPlants) : null), [result, mode, ranQuery]);
  const rows = tree ? tree.rows : result?.rows ?? [];
  /** Rate options are loaded (mode B): the re-pick what-ifs and the drawer's options table can use them. */
  const rateOptions = mode === 'B' && rates.status === 'ready';
  // KPI: leaf rows SAP costed with rates from the donor plant (Donor set on the line).
  const donorRows = useMemo(() => (result?.rows ?? []).filter((r) => isLeafRow(r) && !!r.Donor).length, [result]);
  const { request: requestRates } = rates;
  useEffect(() => {
    if (drawer !== null && mode === 'B') requestRates();
  }, [drawer, mode, requestRates]);
  // Without rate options the re-pick what-ifs can't run: simulate with SAP's own pick.
  const effectiveSim = useMemo(() => (rateOptions || simDeferred.pick === 'sap' ? simDeferred : { ...simDeferred, pick: 'sap' as const }), [rateOptions, simDeferred]);
  // Component-rate / % what-ifs work on CostLineSet results: BOM costing and plant comparison.
  const simMode = mode === 'B' || mode === 'C';
  const simOn = !isIdentity(effectiveSim) && simMode;
  const simRows = useMemo(() => simulate(rows, simMode ? effectiveSim : EMPTY_SIM), [rows, effectiveSim, simMode]);
  const agg: NodeAgg | null = useMemo(() => {
    if (!tree) return null;
    return {
      inr: nodeTotals(tree, leafPrefix(tree, (i) => tree.rows[i].TotCostInr)),
      loc: nodeTotals(tree, leafPrefix(tree, (i) => tree.rows[i].TotCostLoc)),
      sim: simOn ? nodeTotals(tree, leafPrefix(tree, (i) => simRows[i].total)) : null,
    };
  }, [tree, simRows, simOn]);
  // Cost breakup tab: line quantity and FG quantity of the BOM costing run.
  const lineQty = useCallback((l: CostLine) => D(l.ProdQty), []);
  const explQtyRan = ranQuery?.explQty ?? '1';
  const fgQty = useCallback(() => D(explQtyRan), [explQtyRan]);
  const total = useMemo(() => (tree ? grandTotal(leafPrefix(tree, (i) => tree.rows[i].TotCostInr)) : null), [tree]);
  const simTotal = useMemo(() => (tree && simOn ? grandTotal(leafPrefix(tree, (i) => simRows[i].total)) : null), [tree, simRows, simOn]);
  // The same total in local currency, per currency: shown as soon as one plant's currency is not INR (then every
  // currency, INR plants included, so the local parts add up to the INR total).
  const locTotals = useMemo(() => {
    if (!tree) return [];
    const all = localTotals(tree.rows, tree.isLeaf, simOn ? (i) => simRows[i].total : undefined);
    return all.some((t) => t.curr !== groupCurr) ? all : [];
  }, [tree, simRows, simOn, groupCurr]);
  const plantCurr = useMemo(() => {
    const m: Record<string, string> = Object.fromEntries(plants.map((p) => [p.Werks, p.Waers]));
    for (const r of rows) m[r.Hwerks] ??= r.LocCurr;
    return m;
  }, [plants, rows]);
  const dqCount = useMemo(() => (rows.length ? dataQuality(rows).length : 0), [rows]);
  const messages = (mode === 'R' || mode === 'F' || mode === 'M' ? pagedMsgs?.messages : result?.messages) ?? [];

  const openRow = useCallback((i: number) => {
    if (ranQuery?.mode === 'B') {
      setTab('tree');
      setFocusRow(i);
    }
    setDrawer(i);
  }, [ranQuery]);

  const workspaceResult: ScenarioResult | null = result ? { ...result, at: resultAt || Date.now() } : null;
  const loadScenario = (s: Scenario, r: ScenarioResult | null) => {
    setQuery(s.query);
    setSim(s.sim);
    setRanQuery(s.query);
    runner.reset(r);
    setResultAt(r?.at ?? 0);
    setTab(s.query.mode === 'C' ? 'compare' : 'tree');
    if (!r) void run(s.query);
  };

  /** Simulator "Verify in SAP": the current run as base + one SAP scenario per quantity multiple. */
  const qtyScenarios = async (mults: number[]) => {
    if (!ranQuery || !workspaceResult) return;
    const ids: string[] = [];
    if (scen.list.length < MAX_SCENARIOS) {
      const b = scen.add({ name: `Qty ${ranQuery.explQty}`, query: ranQuery, sim });
      if (b) await scenarioResults.set(b.id, workspaceResult);
    }
    for (const m of mults) {
      const q = D(ranQuery.explQty).times(m).toFixed();
      const s = scen.add({ name: `Qty ${q} (×${m})`, query: { ...ranQuery, explQty: q }, sim, note: `ExplQty ${ranQuery.explQty} → ${q}` });
      if (s) ids.push(s.id);
    }
    setAutoRun(ids);
    setTab('scen');
  };

  const share = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('q', encodeQuery(query));
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      prompt('Copy this link', url.toString());
    }
  };

  /** The BOM tree columns the user has chosen (the tree keeps them in local storage); the Excel carries exactly these. */
  const shownTreeCols = () => ls.get<string[]>('bce:tree-cols', TREE_PRESETS.Standard).filter((id) => TREE_COLUMNS.some((c) => c.id === id));
  const doExport = async (fmt: 'xlsx' | 'csv') => {
    if (!ranQuery || !result) return;
    if (ranQuery.mode === 'B' && tree && agg) await exportBomTree({ fmt, query: ranQuery, tree, sim: simRows, simOn, agg, colIds: shownTreeCols(), explQty: ranQuery.explQty, settings: effectiveSim, messages: result.messages });
    else if (pivot) await exportPivot({ fmt, query: ranQuery, pivot, messages: result.messages });
  };

  // "All tabs" Excel: rate options are needed for the Rate sources / coverage sheets, so request them and wait (up to 90 s).
  const latest = useRef({ rows, simRows, rates, effectiveSim });
  latest.current = { rows, simRows, rates, effectiveSim };
  const [exportingAll, setExportingAll] = useState(false);
  const doExportAll = async () => {
    if (!ranQuery || !result || ranQuery.mode !== 'B' || exportingAll) return;
    setExportingAll(true);
    try {
      latest.current.rates.request();
      for (let t = 0; t < 360; t++) {
        const st = latest.current.rates.status;
        if (st === 'ready' || st === 'unavailable' || st === 'error') break;
        await new Promise((r) => setTimeout(r, 250));
      }
      const l = latest.current;
      await exportAllTabs({ bomTree: tree && agg ? bomTreeSheet({ tree, sim: l.simRows, simOn, agg, colIds: shownTreeCols(), explQty: ranQuery.explQty }) : undefined, query: ranQuery, rows: l.rows, sim: l.simRows, settings: l.effectiveSim, messages: result.messages, rates: l.rates, scenarios: scen.list, plantNames, coverDays, groupCurr });
    } catch (e) {
      alert(`Excel export failed: ${(e as Error).message}`);
    } finally {
      setExportingAll(false);
    }
  };

  const doPrint = () => {
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 50);
  };

  const running = runner.status === 'running' || pagedBusy.on;
  const pwProgress = runner.status === 'running' ? pw.progress : null;
  const retryFailed = () => { const q = ranQuery; if (q && !running) void runner.runWith((signal) => pw.retryFailed(signal, q, runner.publish)); };
  const elapsed = runner.status === 'running' ? runner.elapsed : pagedBusy.started ? Date.now() - pagedBusy.started : 0;
  const typical = ls.get<number>(lastMsKey(query.mode), 0);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!pagedBusy.on) return;
    const t = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [pagedBusy.on]);

  const tabs: { id: Tab; label: React.ReactNode; badge?: React.ReactNode }[] =
    mode === 'B'
      ? [
          { id: 'tree', label: 'BOM tree' },
          { id: 'breakup', label: 'Cost breakup' },
          { id: 'dash', label: 'Dashboard' },
          { id: 'sim', label: 'Simulator', badge: simOn ? <SimTag /> : undefined },
          { id: 'dq', label: 'Data quality', badge: dqCount ? <Pill tone="warn">{dqCount}</Pill> : undefined },
          { id: 'scen', label: 'Scenarios' },
          { id: 'rates', label: 'Rate sources' },
          { id: 'ratesum', label: 'Rate summary' },
          { id: 'coverage', label: 'Rate coverage' },
        ]
      : mode === 'C'
        ? [
            { id: 'compare', label: 'Plant comparison' },
            { id: 'sim', label: 'Simulator', badge: simOn ? <SimTag /> : undefined },
            { id: 'dash', label: 'Dashboard' },
            { id: 'dq', label: 'Data quality', badge: dqCount ? <Pill tone="warn">{dqCount}</Pill> : undefined },
            { id: 'scen', label: 'Scenarios' },
          ]
        : [{ id: 'table', label: MODE_LABEL[mode] }];
  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;

  if (hub === 'checking' || !cfg) {
    return (
      <div className="grid h-screen place-items-center bg-bg" role="status" aria-label="Loading">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-accent border-t-transparent" />
      </div>
    );
  }
  if (!cfg.ok || !session) {
    return (
      <div className="flex min-h-screen flex-col bg-bg">
        <div className="grid flex-1 place-items-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-7 text-center shadow-card">
            <a href="/" title="Back to Emami Apps" aria-label="Back to Emami Apps" className="mx-auto block w-fit">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Apps" width={140} height={116} className="mx-auto" />
            </a>
            <AlertTriangle size={26} className="mx-auto mt-4 text-warn" />
            <h1 className="mt-2 text-lg font-extrabold">{!cfg.ok ? "Costing Cockpit can't start" : 'Please open this app from Emami Apps'}</h1>
            <p className="mt-1 text-sm text-muted">{!cfg.ok ? cfg.error : 'Sign in to the Emami Apps hub first; your session comes from there.'}</p>
            <a href="/" className="mt-5 inline-flex rounded-xl bg-gradient-to-br from-accent to-accent-deep px-5 py-2 text-sm font-bold text-white">Go to Emami Apps</a>
          </div>
        </div>
      </div>
    );
  }
  const sap = cfg.config;

  const headerActions = (
    <>
      {result && (
        <>
          <Button size="sm" onClick={() => doExport('xlsx')} title="Excel: the BOM tree columns shown on screen + Parameters sheet"><FileSpreadsheet size={14} /><span className="hidden lg:inline">Excel</span></Button>
          {ranQuery?.mode === 'B' && <Button size="sm" disabled={exportingAll} onClick={doExportAll} title="Excel with every tab: BOM tree, Cost breakup, Dashboard, Simulator, Data quality, Scenarios, Rate sources, Rate summary, Rate coverage"><FileSpreadsheet size={14} /><span className="hidden lg:inline">{exportingAll ? 'Preparing…' : 'Excel (all tabs)'}</span></Button>}
          <Button size="sm" onClick={() => doExport('csv')} title="CSV"><Download size={14} /><span className="hidden lg:inline">CSV</span></Button>
          <Button size="sm" onClick={doPrint} title="Print"><Printer size={14} /><span className="hidden lg:inline">Print</span></Button>
        </>
      )}
      <Button size="sm" onClick={share} title="Copy a link with this selection">{copied ? <><Check size={14} /> Copied</> : <><Link2 size={14} /><span className="hidden lg:inline">Share</span></>}</Button>
      {isAdmin && (
        <a href={`${BASE_PATH}/admin/connection/`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-xs font-semibold hover:bg-sunken" title="SAP connection diagnostics (admin)">
          <FlaskConical size={14} /><span className="hidden lg:inline">Connection</span>
        </a>
      )}
    </>
  );
  const isPaged = mode === 'R' || mode === 'F' || mode === 'M';
  const hasResult = !!result || (isPaged && ranQuery?.mode === mode);

  return (
    <Shell env={{ system: sap.system, appEnv: sap.appEnv }} mode={mode} section={home ?? undefined} onHome={setHome} email={user} actions={headerActions} onBack={back}>
      {home && <SectionHome id={home} onMode={(m) => { setHome(null); setQuery({ ...query, mode: m }); setCollapsed(false); setTab(m === 'C' ? 'compare' : m === 'B' ? 'tree' : 'table'); }} />}
      <div className={cx('flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 lg:p-4', home && 'hidden')}>
        <FilterPanel
          query={query}
          onChange={setQuery}
          plants={plantsState}
          running={running}
          onRun={() => run()}
          onCancel={() => (runner.status === 'running' ? runner.cancel() : pagedBusy.cancel?.())}
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
          {...(PLANT_WIDE_ENABLED ? { plantWide: pw.active ? pw : undefined, onePlantHint: needsOnePlant(query), hierPick, onHierPick: setHierPick } : {})}
        />

        {running && (
          <div className="rounded-2xl border border-line bg-panel px-4 py-3 shadow-card no-print" role="status" aria-live="polite">
            <div className="flex items-center gap-3 text-sm">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden />
              <span className="font-bold">SAP is costing…</span>
              {pwProgress ? (
                <>
                  <span className="num text-xs text-accent">Batch {pwProgress.batch}/{pwProgress.batches} · {pwProgress.lines.toLocaleString('en-IN')} lines so far{etaText(pwProgress.etaMs) ? ` · ${etaText(pwProgress.etaMs)}` : ''}</span>
                  <span className="num text-muted">{fmtMs(elapsed)}</span>
                  <button type="button" className="ml-auto text-xs font-semibold text-bad hover:underline" onClick={pw.stop}>Stop</button>
                </>
              ) : (
                <>
                  <PlantRunProgress />
                  <span className="num text-muted">{fmtMs(elapsed)}{typical ? ` · last run took ${fmtMs(typical)}` : ''} · times out at {COSTING_TIMEOUT_MS / 1000} s</span>
                  <Button size="sm" variant="danger" className="ml-auto" onClick={() => (runner.status === 'running' ? runner.cancel() : pagedBusy.cancel?.())}>Cancel</Button>
                </>
              )}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
              {pwProgress ? <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-deep transition-all" style={{ width: `${pwProgress.batches ? Math.max(3, ((pwProgress.headersDone) / Math.max(1, pwProgress.headersTotal)) * 100) : 3}%` }} /> : typical ? <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-deep transition-all" style={{ width: `${Math.min(95, (elapsed / typical) * 90)}%` }} /> : <div className="indeterminate h-full w-1/3 rounded-full bg-accent" />}
            </div>
          </div>
        )}

        {runner.status === 'cancelled' && !result && <p className="text-sm text-muted">Run cancelled.</p>}
        {runner.status === 'error' && runner.error && ranQuery?.mode === mode && (
          <div className="rounded-2xl border border-bad/30 bg-bad/[0.05] px-4 py-3 text-sm" role="alert">
            <div className="flex items-start gap-2">
              <span className="font-bold text-bad">SAP error:</span>
              <span className="flex-1">{runner.error.message}</span>
              <Button size="sm" onClick={() => ranQuery && run(ranQuery)}>Retry</Button>
            </div>
            {runner.error.details.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-muted">{runner.error.details.map((d, i) => <li key={i}>{d.message}</li>)}</ul>}
            {runner.error.issues.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-muted">{runner.error.issues.map((d, i) => <li key={i}>{d.path}: {d.message}</li>)}</ul>}
          </div>
        )}

        <Warnings messages={messages} action={result?.plantWide && result.plantWide.failed > 0 && !running ? <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={retryFailed}>Retry {result.plantWide.failed} failed</button> : undefined} />

        {hasResult && ranQuery && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 no-print">
            <Tabs label="Views" tabs={tabs} value={activeTab} onChange={setTab} />
            <span className="text-xs text-muted">
              {result && <>{result.rows.length.toLocaleString('en-IN')} lines · SAP {fmtMs(result.ms)}</>}
              {result?.plantWide && !running && <> · Plant-wide: {result.plantWide.headers.toLocaleString('en-IN')} headers, {result.plantWide.skipped} skipped{result.plantWide.failed ? `, ${result.plantWide.failed} failed` : ''}{runner.status === 'cancelled' ? ` (stopped after ${(result.plantWide.costed + result.plantWide.skipped + result.plantWide.failed).toLocaleString('en-IN')})` : ''}</>}
              {pagedMsgs && isPaged && <>SAP {fmtMs(pagedMsgs.ms)}</>}
            </span>
            {JSON.stringify(query) !== JSON.stringify(ranQuery) && <Pill tone="warn" title="The selection was changed after this run">selection changed – run again</Pill>}
            {total && mode === 'B' && (
              <div className="ml-auto flex items-baseline gap-3 rounded-2xl border border-line bg-panel px-4 py-2 shadow-card">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-faint">Total</span>
                <strong className="num text-lg font-extrabold">{fmtNum(total, 2)}</strong>
                <span className="text-xs font-semibold text-muted">{groupCurr}{result?.plantWide ? ` · ${result.plantWide.headers.toLocaleString('en-IN')} headers` : ''}</span>
                {simTotal && <><SimTag /><strong className="num sim-val text-lg font-extrabold">{fmtNum(simTotal, 2)}</strong></>}
                {locTotals.map((t, i) => (
                  <span key={t.curr} className={cx('flex items-baseline gap-1.5', i === 0 && 'border-l border-line pl-3')} title={`Lines costed in ${t.curr}: ${fmtNum(t.loc, 2)} ${t.curr} = ${fmtNum(t.inr, 2)} ${groupCurr} of the total`}>
                    {i === 0 && <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-faint">Local</span>}
                    <strong className="num text-lg font-extrabold">{fmtNum(t.loc, 2)}</strong>
                    <span className="text-xs font-semibold text-muted">{t.curr}</span>
                    {t.simLoc && <><SimTag /><strong className="num sim-val text-lg font-extrabold">{fmtNum(t.simLoc, 2)}</strong></>}
                  </span>
                ))}
                <span className="text-2xs text-muted" title="Rate source priority SAP used for this result">Priority: <b className="text-ink">{prioLabel(ranQuery.prio)}</b></span>
                {donorRows > 0 && <Pill tone="warn" title={`Leaf rows costed with rates from donor plant ${ranQuery.donorPlant || ''}`}>{donorRows} donor row{donorRows === 1 ? '' : 's'}</Pill>}
                {AI_ENABLED && result && <AiBar rows={result.rows} result={result} query={ranQuery} system={cfg?.ok ? cfg.config.system : ''} user={user} scenarios={scen.list} onSelectRow={openRow} />}
              </div>
            )}
          </div>
        )}

        {/* Price context (MRP, selling price, standard cost) of the finished goods shown; nothing without the flag, the switch and a sales organisation. */}
        {!(activeTab === 'scen' || activeTab === 'dq') && <FgStrips fgs={isPaged ? (ranQuery && ranQuery.mode === mode ? fgsOfSelection(ranQuery.materials, ranQuery.plants) : []) : fgsOfLines(rows)} />}
        <div className={cx('shrink-0 overflow-clip rounded-2xl border border-line bg-panel shadow-card', hasResult || runner.status === 'running' ? 'h-[calc(100vh-150px)] min-h-[420px]' : '')}>
          {isPaged ? (
            ranQuery && ranQuery.mode === mode ? (
              <PagedTable
                key={mode}
                query={ranQuery}
                runKey={pagedRun}
                onMessages={(m, ms) => setPagedMsgs({ messages: m, ms })}
                onRunning={(on, cancel) => setPagedBusy(on ? { on, cancel, started: Date.now() } : { on: false })}
              />
            ) : (
              <Empty title={MODE_LABEL[mode]} icon="▦">Choose materials and plants above, then press <strong>Run in SAP</strong>. Results are paged on the server.</Empty>
            )
          ) : activeTab === 'scen' ? (
            <Scenarios store={scen} workspace={{ query: ranQuery ?? query, sim, result: workspaceResult }} onLoad={loadScenario} plants={plants} groupCurr={groupCurr} autoRun={autoRun} onAutoRunDone={() => setAutoRun([])} />
          ) : runner.status === 'running' && !result ? (
            <Skeleton rows={16} />
          ) : !result ? (
            <Empty title="Nothing costed yet" icon="▦">
              Pick up to 50 header materials and the plants above, then press <strong>Run in SAP</strong>. SAP does all the costing; this app presents, compares and simulates.
            </Empty>
          ) : activeTab === 'tree' && tree && agg ? (
            rows.length ? <BomTree tree={tree} sim={simRows} simOn={simOn} agg={agg} plantCurr={plantCurr} onOpen={setDrawer} focusRow={focusRow} freightRun={freightRun} explQty={ranQuery?.explQty ?? '1'} /> : <Empty title="SAP returned no lines">Check the SAP messages above, or try other plants.</Empty>
          ) : activeTab === 'compare' && pivot ? (
            pivot.rows.length ? <ComparisonView pivot={pivot} plantNames={plantNames} /> : <Empty title="SAP returned no lines">Check the SAP messages above.</Empty>
          ) : activeTab === 'dash' ? (
            <Dashboard rows={rows} vals={simRows} simOn={simOn} plantNames={plantNames} onOpenRow={openRow} coverDays={coverDays} setCoverDays={(n) => { setCoverDays(n); ls.set('bce:cover-days', n); }} groupCurr={groupCurr} compare={mode === 'C'} explQty={ranQuery?.explQty ?? '1'} qtyMult={effectiveSim.qtyMult || 1} />
          ) : activeTab === 'sim' ? (
            <Simulator
              rows={rows}
              sim={simRows}
              settings={sim}
              onChange={setSim}
              explQty={ranQuery?.explQty ?? '1'}
              groupCurr={groupCurr}
              onOpenRow={openRow}
              pending={sim !== simDeferred}
              onSapQtyScenarios={qtyScenarios}
              rateOptions={rateOptions}
              rateOptionsUnavailable={mode === 'B' && rates.status === 'unavailable'}
              onNeedRateOptions={mode === 'B' ? requestRates : undefined}
              plantNames={plantNames}
            />
          ) : activeTab === 'rates' && ranQuery ? (
            <RateSources rows={rows} rates={rates} query={ranQuery} onOpenRow={setDrawer} prio={ranQuery.prio} />
          ) : activeTab === 'breakup' && ranQuery ? (
            <div className="h-full overflow-auto"><CostBreakup lines={rows} qtyOf={lineQty} fgQtyOf={fgQty} qtyLabel={`the explosion quantity (${ranQuery.explQty})`} exportName="Cost breakup" /></div>
          ) : activeTab === 'ratesum' && ranQuery ? (
            <RateSummary rows={rows} rates={rates} query={ranQuery} />
          ) : activeTab === 'coverage' && ranQuery ? (
            <RateCoverage
              lines={rows}
              rates={rates}
              prio={ranQuery.prio}
              lookback={ranQuery.lookback}
              onOpenRow={setDrawer}
              onLookback={(days) => { const q = { ...ranQuery, lookback: days }; setQuery(q); run(q); }}
              onAddDonor={() => {
                setCollapsed(false);
                setTimeout(() => { const el = document.querySelector<HTMLSelectElement>('[data-field="donor-plant"]'); el?.scrollIntoView({ block: 'center' }); el?.focus(); }, 60);
              }}
            />
          ) : activeTab === 'dq' ? (
            <DataQuality rows={rows} onOpenRow={openRow} />
          ) : null}
        </div>
      </div>

      {drawer !== null && !home && rows[drawer] && (
        <RowDrawer
          row={rows[drawer]}
          sim={simRows[drawer]}
          onClose={() => setDrawer(null)}
          rateOptions={rateOptions}
          rateOptionsState={mode === 'B' ? { status: rates.status, note: rates.note, onRetest: rates.retest } : undefined}
          freightRun={freightRun}
          override={sim.overrides[rowKey(rows[drawer])]}
          onOverride={(k, v) => {
            const o = { ...sim.overrides };
            if (v === null) delete o[k];
            else o[k] = v;
            setSim({ ...sim, overrides: o });
          }}
        />
      )}

      {printing && ranQuery && result && <PrintView query={ranQuery} tree={tree} pivot={pivot} sim={simRows} simOn={simOn} total={total} messages={result.messages} />}
    </Shell>
  );
}

/** "Batch 2 of 7 · FGs 51-100 of 340" while a plant run (materials left empty) is costing. */
function PlantRunProgress() {
  const [p, setP] = useState<CostProgress | null>(null);
  useEffect(() => subscribeCostProgress(setP), []);
  if (!p) return null;
  return (
    <span className="num text-xs text-accent">
      {p.phase === 'fgs' ? 'finding the finished goods of the plant…' : `batch ${p.batch} of ${p.batches} · FGs ${p.done + 1}–${Math.min(p.done + 50, p.total)} of ${p.total}`}
    </span>
  );
}
