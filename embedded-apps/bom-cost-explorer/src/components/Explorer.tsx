'use client';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useAppSession } from '@/lib/client/session';
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
import FilterPanel, { ModeSelector } from './FilterPanel';
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
  const { session, signOut } = useAppSession();
  const user = session?.user?.email ?? '';
  const [plants, setPlants] = useState<PlantRow[]>([]);
  const [groupCurr, setGroupCurr] = useState('INR');
  const [mock, setMock] = useState(false);
  const [bootErr, setBootErr] = useState('');
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
  const [sidebar, setSidebar] = useState(true);
  const [dark, setDark] = useState(false);
  const [copied, setCopied] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [resultAt, setResultAt] = useState<number>(0);

  const scen = useScenarios(user);
  const [autoRun, setAutoRun] = useState<string[]>([]);
  const runner = useRun((signal: AbortSignal, q: CostQuery) => api.cost(q, signal));

  // ---- boot: config, plants, initial query (URL > last per user > default) -----------------
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
    setCoverDays(ls.get('bce:cover-days', 30));
  }, []);
  useEffect(() => {
    if (!user) return;
    api.config().then((c) => { setGroupCurr(c.GROUP_CURR || 'INR'); setMock(!!c.mock); }).catch(() => undefined);
    api.plants().then((r) => setPlants(r.plants)).catch((e) => setBootErr(e.message));
    const fromUrl = decodeQuery(new URLSearchParams(window.location.search).get('q'));
    const q = fromUrl ?? ls.get<CostQuery | null>(lastQueryKey(user), null);
    if (q) setQuery({ ...defaultQuery(q.mode), ...q });
  }, [user]);

  const run = useCallback(
    async (q: CostQuery = query) => {
      setRanQuery(q);
      ls.set(lastQueryKey(user), q);
      const url = new URL(window.location.href);
      url.searchParams.set('q', encodeQuery(q));
      window.history.replaceState(null, '', url);
      if (q.mode === 'R' || q.mode === 'F' || q.mode === 'M') {
        setPagedMsgs(null);
        setTab('table');
        setPagedRun((n) => n + 1);
        return;
      }
      setDrawer(null);
      const r = await runner.run(q);
      if (r) {
        ls.set(lastMsKey(q.mode), r.ms);
        setResultAt(Date.now());
        setTab((t) => (q.mode === 'C' ? (t === 'tree' || t === 'table' || t === 'sim' ? 'compare' : t) : t === 'compare' || t === 'table' ? 'tree' : t));
      }
    },
    [query, runner, user],
  );

  // ---- derived results ---------------------------------------------------------------------
  const result: CostResult | null = runner.data && ranQuery && (ranQuery.mode === 'B' || ranQuery.mode === 'C') ? runner.data : null;
  const mode = ranQuery?.mode ?? query.mode;
  const plantNames = useMemo(() => Object.fromEntries(plants.map((p) => [p.Werks, p.Name1])), [plants]);
  const tree = useMemo(() => (result && ranQuery?.mode === 'B' ? buildTree(result.rows, plantNames) : null), [result, ranQuery, plantNames]);
  const pivot = useMemo(() => (result && ranQuery?.mode === 'C' ? buildPivot(result.rows, ranQuery.compPlants) : null), [result, ranQuery]);
  const rows = tree ? tree.rows : result?.rows ?? [];
  const simOn = !isIdentity(simDeferred) && ranQuery?.mode === 'B';
  const simRows = useMemo(() => simulate(rows, ranQuery?.mode === 'B' ? simDeferred : EMPTY_SIM), [rows, simDeferred, ranQuery]);
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
    for (const r of rows) m[r.Werks] ??= r.LocCurr;
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

  const toggleTheme = () => {
    const d = !dark;
    setDark(d);
    document.documentElement.classList.toggle('dark', d);
    ls.set('bce-theme', d ? 'dark' : 'light');
    try { localStorage.setItem('bce-theme', d ? 'dark' : 'light'); } catch { /* ignore */ }
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
    if (ranQuery.mode === 'B') await exportCostLines({ fmt, query: ranQuery, rows, sim: simRows, settings: simDeferred, messages: result.messages });
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
            { id: 'dash', label: 'Dashboard' },
            { id: 'dq', label: 'Data quality', badge: dqCount ? <Pill tone="warn">{dqCount}</Pill> : undefined },
            { id: 'scen', label: 'Scenarios' },
          ]
        : [{ id: 'table', label: MODE_LABEL[mode] }];
  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;

  if (!session) return <div className="grid h-screen place-items-center text-sm text-muted" role="status">Checking your Emami Apps session…</div>;

  return (
    <div className="flex h-screen flex-col overflow-clip">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-3 no-print">
        <Button variant="ghost" size="sm" onClick={() => setSidebar(!sidebar)} aria-label={sidebar ? 'Hide selection' : 'Show selection'} aria-expanded={sidebar}>☰</Button>
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-xs font-bold text-accent-ink" aria-hidden>BC</span>
          <h1 className="text-sm font-semibold">BOM Cost Explorer <span className="font-normal text-muted">&amp; Simulator</span></h1>
          {mock && <Pill tone="warn" title="MOCK_SAP=true - sample data, not SAP">MOCK SAP</Pill>}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {result && (
            <>
              <Button size="sm" onClick={() => doExport('xlsx')}>Excel</Button>
              <Button size="sm" onClick={() => doExport('csv')}>CSV</Button>
              <Button size="sm" onClick={doPrint}>Print</Button>
            </>
          )}
          <Button size="sm" onClick={share} title="Copy a link with this query">{copied ? 'Link copied ✓' : 'Share link'}</Button>
          <Button size="sm" variant="ghost" onClick={toggleTheme} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>{dark ? '☀' : '☾'}</Button>
          <div className="hidden text-right text-2xs leading-tight text-muted md:block">
            <div className="font-medium text-ink">{user}</div>
            <div title={(session?.user?.plants ?? []).join(', ')}>plants: {(session?.user?.plants ?? []).includes('*') ? 'all' : (session?.user?.plants ?? []).length}</div>
          </div>
          <Button size="sm" variant="ghost" onClick={signOut}>Sign out</Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {sidebar && (
          <aside className="scroll-thin max-h-[55vh] shrink-0 overflow-auto border-b border-line bg-panel px-3 pt-3 no-print lg:max-h-none lg:w-[330px] lg:border-b-0 lg:border-r">
            {bootErr && <p className="mb-2 rounded bg-bad/10 p-2 text-xs text-bad" role="alert">Plants could not be loaded: {bootErr}</p>}
            <FilterPanel
              query={query}
              onChange={setQuery}
              plants={plants}
              running={running}
              onRun={() => run()}
              onCancel={() => (runner.status === 'running' ? runner.cancel() : pagedBusy.cancel?.())}
            />
          </aside>
        )}

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-clip">
          {!sidebar && (
            <div className="border-b border-line bg-panel p-2 no-print">
              <ModeSelector mode={query.mode} onChange={(m) => setQuery({ ...query, mode: m })} />
            </div>
          )}

          {running && (
            <div className="border-b border-line bg-panel px-3 py-2 no-print" role="status" aria-live="polite">
              <div className="flex items-center gap-3 text-sm">
                <span className="font-medium">SAP is costing…</span>
                <span className="num text-muted">{fmtMs(elapsed)}{typical ? ` · last run took ${fmtMs(typical)}` : ''} · times out at 120 s</span>
                <Button size="sm" variant="danger" className="ml-auto" onClick={() => (runner.status === 'running' ? runner.cancel() : pagedBusy.cancel?.())}>Cancel</Button>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded bg-sunken">
                {typical ? <div className="h-full bg-accent transition-all" style={{ width: `${Math.min(95, (elapsed / typical) * 90)}%` }} /> : <div className="indeterminate h-full w-1/3 bg-accent" />}
              </div>
            </div>
          )}

          {runner.status === 'cancelled' && !result && <p className="mx-3 mt-2 text-sm text-muted">Run cancelled.</p>}
          {runner.status === 'error' && runner.error && (
            <div className="mx-3 mt-2 rounded-md border border-bad/40 bg-bad/[0.06] px-3 py-2 text-sm" role="alert">
              <div className="flex items-start gap-2">
                <span className="font-semibold text-bad">SAP error:</span>
                <span className="flex-1">{runner.error.message}</span>
                <Button size="sm" onClick={() => ranQuery && run(ranQuery)}>Retry</Button>
              </div>
              {runner.error.details.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs text-muted">{runner.error.details.map((d, i) => <li key={i}>{d.message}</li>)}</ul>
              )}
              {runner.error.issues.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs text-muted">{runner.error.issues.map((d, i) => <li key={i}>{d.path}: {d.message}</li>)}</ul>
              )}
            </div>
          )}

          <Warnings messages={messages} />

          {(result || mode === 'R' || mode === 'F' || mode === 'M') && ranQuery && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 pt-2 text-xs text-muted no-print">
              <span><strong className="text-ink">{MODE_LABEL[mode]}</strong> · {ranQuery.materials.length} material(s) · {(ranQuery.mode === 'C' ? [ranQuery.bomPlant, '→', ...ranQuery.compPlants] : ranQuery.plants).join(' ')}</span>
              {result && <span>{result.rows.length.toLocaleString('en-IN')} lines · SAP {fmtMs(result.ms)}</span>}
              {pagedMsgs && <span>SAP {fmtMs(pagedMsgs.ms)}</span>}
              {total && mode === 'B' && (
                <span className="ml-auto text-sm">
                  Total <strong className="num text-ink">{fmtNum(total, 2)}</strong> {groupCurr}
                  {simTotal && <> · <SimTag /> <strong className="num sim-val">{fmtNum(simTotal, 2)}</strong></>}
                </span>
              )}
              {JSON.stringify(query) !== JSON.stringify(ranQuery) && <Pill tone="warn" title="The selection was changed after this run">selection changed – press Run</Pill>}
            </div>
          )}

          <div className="px-3 pt-1 no-print">
            <Tabs label="Views" tabs={tabs} value={activeTab} onChange={setTab} />
          </div>

          <div className="min-h-0 flex-1 overflow-clip">
            {mode === 'R' || mode === 'F' || mode === 'M' ? (
              ranQuery && ranQuery.mode === mode ? (
                <PagedTable
                  key={mode}
                  query={ranQuery}
                  runKey={pagedRun}
                  onMessages={(m, ms) => setPagedMsgs({ messages: m, ms })}
                  onRunning={(on, cancel) => setPagedBusy(on ? { on, cancel, started: Date.now() } : { on: false })}
                />
              ) : (
                <Empty title={`${MODE_LABEL[mode]}`}>Pick materials and plants, then <strong>Run in SAP</strong>. Results are paged on the server.</Empty>
              )
            ) : activeTab === 'scen' ? (
              <Scenarios store={scen} workspace={{ query: ranQuery ?? query, sim, result: workspaceResult }} onLoad={loadScenario} plants={plants} groupCurr={groupCurr} autoRun={autoRun} onAutoRunDone={() => setAutoRun([])} />
            ) : runner.status === 'running' && !result ? (
              <Skeleton rows={16} />
            ) : !result ? (
              <Empty title="Nothing costed yet" icon="▦">
                Choose a mode, up to 50 header materials and plants, then press <strong>Run in SAP</strong>. SAP does all costing; this app presents, compares and simulates.
              </Empty>
            ) : activeTab === 'tree' && tree && agg ? (
              rows.length ? <BomTree tree={tree} sim={simRows} simOn={simOn} agg={agg} plantCurr={plantCurr} onOpen={setDrawer} focusRow={focusRow} /> : <Empty title="SAP returned no lines">Check the warnings above.</Empty>
            ) : activeTab === 'compare' && pivot ? (
              pivot.rows.length ? <ComparisonView pivot={pivot} plantNames={plantNames} /> : <Empty title="SAP returned no lines">Check the warnings above.</Empty>
            ) : activeTab === 'dash' ? (
              <Dashboard rows={rows} vals={simRows} simOn={simOn} plantNames={plantNames} onOpenRow={openRow} coverDays={coverDays} setCoverDays={(n) => { setCoverDays(n); ls.set('bce:cover-days', n); }} groupCurr={groupCurr} compare={mode === 'C'} />
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
              />
            ) : activeTab === 'dq' ? (
              <DataQuality rows={rows} onOpenRow={openRow} />
            ) : null}
          </div>
        </main>
      </div>

      {drawer !== null && rows[drawer] && (
        <RowDrawer
          row={rows[drawer]}
          sim={simRows[drawer]}
          onClose={() => setDrawer(null)}
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
    </div>
  );
}
