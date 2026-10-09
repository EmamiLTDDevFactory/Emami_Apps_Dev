'use client';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useHubSession, BASE_PATH } from '@/lib/client/session';
import { fetchIsAdmin } from '@/lib/client/hubAccess';
import { loadSapConfig } from '@/lib/sap/config';
import { resetCapability } from '@/lib/sap/capability';
import type { PlantRow } from '@/lib/sap/fields';
import { defaultQuery, MODE_LABEL, type CostQuery, type Mode } from '@/lib/query/schema';
import { decodeQuery, encodeQuery } from '@/lib/query/url';
import { api, type CostResult } from '@/lib/client/api';
import { ls } from '@/lib/client/storage';
import { useRun } from '@/lib/client/useRun';
import { MAX_SCENARIOS, scenarioResults, useScenarios, type Scenario, type ScenarioResult } from '@/lib/client/scenarios';
import { D } from '@/lib/cost/decimal';
import { buildTree, leafPrefix, nodeTotals, grandTotal, rowKey } from '@/lib/cost/tree';
import { buildPivot } from '@/lib/cost/pivot';
import { EMPTY_SIM, isIdentity, simulate, type SimSettings } from '@/lib/cost/simulate';
import { dataQuality } from '@/lib/cost/analytics';
import { fmtMs, fmtNum } from '@/lib/format';
import { exportCostLines, exportPivot } from '@/lib/client/export';
import type { SapMessage } from '@/lib/sap/messages';
import { AlertTriangle, Check, Download, FileSpreadsheet, FlaskConical, Link2, Printer, RefreshCw } from 'lucide-react';
import FilterPanel, { type PlantsState } from './FilterPanel';
import Shell from './Shell';
import { useScreenHistory } from '@/lib/useScreenHistory';
import BomTree, { type NodeAgg } from './BomTree';
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

type Tab = 'tree' | 'compare' | 'table' | 'dash' | 'sim' | 'dq' | 'scen';

const lastQueryKey = (u: string) => `bce:last-query:${u}`;
const lastMsKey = (m: Mode) => `bce:last-ms:${m}`;

export default function Explorer() {
  const hub = useHubSession();
  const session = hub === 'checking' ? null : hub;
  const user = session?.email ?? '';
  const cfg = useMemo(() => (typeof window === 'undefined' ? null : loadSapConfig()), []);
  const [isAdmin, setIsAdmin] = useState(false);
  const [capNote, setCapNote] = useState('');
  useEffect(() => {
    if (user) void fetchIsAdmin(user).then(setIsAdmin);
  }, [user]);
  // Every app start re-tests the RateOptions expand (no stale "unsupported" from an earlier visit).
  useEffect(() => {
    if (cfg?.ok) resetCapability(cfg.config.system);
  }, [cfg]);
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
  const { back } = useScreenHistory(
    booted ? { mode: query.mode, tab, drawer: drawer === null ? null : [drawer, resultAt] } : null,
    (s) => {
      setQuery((q) => (q.mode === s.mode ? q : { ...q, mode: s.mode }));
      setTab(s.tab);
      setDrawer(s.drawer && s.drawer[1] === resultAt ? s.drawer[0] : null);
    },
  );

  const scen = useScenarios(user);
  const [autoRun, setAutoRun] = useState<string[]>([]);
  const runner = useRun((signal: AbortSignal, q: CostQuery) => api.cost(q, signal));

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
    if (q) setQuery({ ...defaultQuery(q.mode), ...q });
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
      const r = await runner.run(q);
      if (r) {
        setCollapsed(true);
        ls.set(lastMsKey(q.mode), r.ms);
        setResultAt(Date.now());
        setTab((t) => (q.mode === 'C' ? (t === 'tree' || t === 'table' ? 'compare' : t) : t === 'compare' || t === 'table' ? 'tree' : t));
      }
    },
    [query, runner, user],
  );

  // ---- derived results ---------------------------------------------------------------------
  // The side-pane mode drives the screen; a result is shown only for the mode it was run in.
  const mode = query.mode;
  const result: CostResult | null = runner.data && ranQuery && ranQuery.mode === mode && (mode === 'B' || mode === 'C') ? runner.data : null;
  const plantNames = useMemo(() => Object.fromEntries(plants.map((p) => [p.Werks, p.Name1])), [plants]);
  const tree = useMemo(() => (result && mode === 'B' ? buildTree(result.rows, plantNames) : null), [result, mode, plantNames]);
  const pivot = useMemo(() => (result && mode === 'C' && ranQuery ? buildPivot(result.rows, ranQuery.compPlants) : null), [result, mode, ranQuery]);
  const rows = tree ? tree.rows : result?.rows ?? [];
  /** Rate options came back from CostLineSet?$expand=RateOptions (mode B, SAP supports the expand). */
  const rateOptions = mode === 'B' && result?.rateOptions !== false;
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
  const total = useMemo(() => (tree ? grandTotal(leafPrefix(tree, (i) => tree.rows[i].TotCostInr)) : null), [tree]);
  const simTotal = useMemo(() => (tree && simOn ? grandTotal(leafPrefix(tree, (i) => simRows[i].total)) : null), [tree, simRows, simOn]);
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

  const doExport = async (fmt: 'xlsx' | 'csv') => {
    if (!ranQuery || !result) return;
    if (ranQuery.mode === 'B') await exportCostLines({ fmt, query: ranQuery, rows, sim: simRows, settings: effectiveSim, messages: result.messages });
    else if (pivot) await exportPivot({ fmt, query: ranQuery, pivot, messages: result.messages });
  };

  const doPrint = () => {
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 50);
  };

  const running = runner.status === 'running' || pagedBusy.on;
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
          { id: 'dash', label: 'Dashboard' },
          { id: 'sim', label: 'Simulator', badge: simOn ? <SimTag /> : undefined },
          { id: 'dq', label: 'Data quality', badge: dqCount ? <Pill tone="warn">{dqCount}</Pill> : undefined },
          { id: 'scen', label: 'Scenarios' },
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
        <a href="/" className="bg-plum px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-plum-deep">← Back to Emami Apps</a>
        <div className="grid flex-1 place-items-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-7 text-center shadow-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Apps" width={140} height={116} className="mx-auto" />
            <AlertTriangle size={26} className="mx-auto mt-4 text-warn" />
            <h1 className="mt-2 text-lg font-extrabold">{!cfg.ok ? "BOM Simulator can't start" : 'Please open this app from Emami Apps'}</h1>
            <p className="mt-1 text-sm text-muted">{!cfg.ok ? cfg.error : 'Sign in to the Emami Apps hub first; your session comes from there.'}</p>
            <a href="/" className="mt-5 inline-flex rounded-xl bg-gradient-to-br from-accent to-accent-deep px-5 py-2 text-sm font-bold text-white">Go to Emami Apps</a>
          </div>
        </div>
      </div>
    );
  }
  const sap = cfg.config;
  const retestExpand = () => {
    resetCapability(sap.system);
    setCapNote('Rate options will be re-tested on the next BOM costing run.');
    setTimeout(() => setCapNote(''), 6000);
  };

  const headerActions = (
    <>
      {result && (
        <>
          <Button size="sm" onClick={() => doExport('xlsx')} title="Excel (all columns + Parameters sheet)"><FileSpreadsheet size={14} /><span className="hidden lg:inline">Excel</span></Button>
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
    <Shell env={{ system: sap.system, appEnv: sap.appEnv }} mode={mode} onMode={(m) => { setQuery({ ...query, mode: m }); setCollapsed(false); setTab(m === 'C' ? 'compare' : m === 'B' ? 'tree' : 'table'); }} email={user} actions={headerActions} onBack={back}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 lg:p-4">
        <FilterPanel
          query={query}
          onChange={setQuery}
          plants={plantsState}
          running={running}
          onRun={() => run()}
          onCancel={() => (runner.status === 'running' ? runner.cancel() : pagedBusy.cancel?.())}
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
        />

        {running && (
          <div className="rounded-2xl border border-line bg-panel px-4 py-3 shadow-card no-print" role="status" aria-live="polite">
            <div className="flex items-center gap-3 text-sm">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden />
              <span className="font-bold">SAP is costing…</span>
              <span className="num text-muted">{fmtMs(elapsed)}{typical ? ` · last run took ${fmtMs(typical)}` : ''} · times out at 120 s</span>
              <Button size="sm" variant="danger" className="ml-auto" onClick={() => (runner.status === 'running' ? runner.cancel() : pagedBusy.cancel?.())}>Cancel</Button>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
              {typical ? <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-deep transition-all" style={{ width: `${Math.min(95, (elapsed / typical) * 90)}%` }} /> : <div className="indeterminate h-full w-1/3 rounded-full bg-accent" />}
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

        <Warnings messages={messages} />

        {hasResult && ranQuery && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 no-print">
            <Tabs label="Views" tabs={tabs} value={activeTab} onChange={setTab} />
            <span className="text-xs text-muted">
              {result && <>{result.rows.length.toLocaleString('en-IN')} lines · SAP {fmtMs(result.ms)}</>}
              {pagedMsgs && isPaged && <>SAP {fmtMs(pagedMsgs.ms)}</>}
            </span>
            {JSON.stringify(query) !== JSON.stringify(ranQuery) && <Pill tone="warn" title="The selection was changed after this run">selection changed – run again</Pill>}
            {mode === 'B' && result && !rateOptions && (
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-xs text-muted">
                Rate options are not available from SAP for this system
                {sap.expand === 'auto' && (
                  <button type="button" onClick={retestExpand} className="inline-flex items-center gap-1 font-bold text-accent hover:underline" title="Forget the 'unsupported' verdict and send $expand=RateOptions on the next run">
                    <RefreshCw size={12} /> Re-test
                  </button>
                )}
              </span>
            )}
            {capNote && <span className="text-xs font-semibold text-good">{capNote}</span>}
            {total && mode === 'B' && (
              <div className="ml-auto flex items-baseline gap-3 rounded-2xl border border-line bg-panel px-4 py-2 shadow-card">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-faint">Total</span>
                <strong className="num text-lg font-extrabold">{fmtNum(total, 2)}</strong>
                <span className="text-xs font-semibold text-muted">{groupCurr}</span>
                {simTotal && <><SimTag /><strong className="num sim-val text-lg font-extrabold">{fmtNum(simTotal, 2)}</strong></>}
              </div>
            )}
          </div>
        )}

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
            rows.length ? <BomTree tree={tree} sim={simRows} simOn={simOn} agg={agg} plantCurr={plantCurr} onOpen={setDrawer} focusRow={focusRow} /> : <Empty title="SAP returned no lines">Check the SAP messages above, or try other plants.</Empty>
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
              plantNames={plantNames}
            />
          ) : activeTab === 'dq' ? (
            <DataQuality rows={rows} onOpenRow={openRow} />
          ) : null}
        </div>
      </div>

      {drawer !== null && rows[drawer] && (
        <RowDrawer
          row={rows[drawer]}
          sim={simRows[drawer]}
          onClose={() => setDrawer(null)}
          rateOptions={rateOptions}
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
