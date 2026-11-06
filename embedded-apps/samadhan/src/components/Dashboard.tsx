'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LayoutGrid, PieChart, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { getDashboard, getMe, getOverview, savePrefs } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import { fmtTime } from '@/lib/format';
import { DASHBOARD_WIDGETS, type Dashboard as Data, type DashboardWidget, type Overview } from '@/lib/types';
import { ByGroup, Csat, Recent, Todos } from './DashboardExtras';
import { DashboardInsights } from './Insights';
import { Segmented } from './dashboard/charts2';
import { AgentLoadWidget, ByStatusWidget, BySeverityWidget, KpiRow, TrendsWidget } from './dashboard/CoreWidgets';
import { CustomiseDialog } from './dashboard/Customise';
import { SPAN_CLASS, WCard, WIDGET_INFO, WidgetCtx, cleanLayout } from './dashboard/frame';
import {
  AgeingWidget, BacklogWidget, CategoriesWidget, LeaderboardWidget, RegionStatusWidget, RiskWidget, SlaWidget, SourcesWidget,
} from './dashboard/OverviewWidgets';
import { Button, Card, Empty, Notice, Skeleton, cx } from './ui';

const PERIODS = [7, 14, 30, 60] as const;
type Period = (typeof PERIODS)[number];
const DAYS_KEY = 'samadhan.dashboard.days';

function readDays(): Period {
  try {
    const v = Number(window.localStorage.getItem(DAYS_KEY));
    return (PERIODS as readonly number[]).includes(v) ? (v as Period) : 30;
  } catch {
    return 30;
  }
}
const msg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export default function Dashboard() {
  const { meta, me, go } = useSamadhan();
  const [data, setData] = useState<Data | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [ovError, setOvError] = useState('');
  const [loadedAt, setLoadedAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [ovBusy, setOvBusy] = useState(false);
  const [days, setDays] = useState<Period>(readDays);
  const daysRef = useRef<Period>(days);
  const ovSeq = useRef(0);

  // ---- layout: the agent's own list, else the Admin default ----
  const adminDefault = useMemo(() => cleanLayout(meta.options?.['dashboard.widgets']) ?? [...DASHBOARD_WIDGETS], [meta.options]);
  const [mine, setMine] = useState<DashboardWidget[] | null | undefined>(undefined); // undefined = still reading /me
  const [customise, setCustomise] = useState(false);
  const [layoutError, setLayoutError] = useState('');
  useEffect(() => {
    let live = true;
    getMe().then((r) => { if (live) setMine(cleanLayout(r.prefs?.dashboardWidgets)); }).catch(() => { if (live) setMine(null); });
    return () => { live = false; };
  }, []);
  const layout = useMemo(() => mine ?? adminDefault, [mine, adminDefault]);

  const saveLayout = useCallback(async (list: DashboardWidget[] | null) => {
    const before = mine;
    setMine(list); // apply at once
    try {
      const prefs = await savePrefs({ dashboardWidgets: list });
      setMine(cleanLayout(prefs.dashboardWidgets));
    } catch (e) {
      setMine(before);
      throw e;
    }
  }, [mine]);
  const hide = useCallback((id: DashboardWidget) => {
    saveLayout(layout.filter((x) => x !== id)).catch((e) => setLayoutError(msg(e, 'Could not save your dashboard.')));
  }, [layout, saveLayout]);

  // ---- data ----
  const loadOverview = useCallback(async () => {
    const seq = ++ovSeq.current;
    setOvBusy(true);
    try {
      const o = await getOverview(daysRef.current);
      if (seq === ovSeq.current) { setOverview(o); setOvError(''); }
    } catch (e) {
      if (seq === ovSeq.current) setOvError(msg(e, 'Could not load the overview.'));
    } finally {
      if (seq === ovSeq.current) setOvBusy(false);
    }
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [d] = await Promise.allSettled([
        getDashboard().then((x) => { setData(x); setError(''); return x; }),
        loadOverview(),
      ]);
      if (d.status === 'rejected') setError(msg(d.reason, 'Could not load the dashboard.'));
      setLoadedAt(new Date().toISOString());
    } finally {
      setBusy(false);
    }
  }, [loadOverview]);

  useEffect(() => {
    load();
    // Refresh every minute while the tab is visible; catch up at once when the agent comes back to it.
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  const changeDays = (d: Period) => {
    setDays(d);
    daysRef.current = d;
    try { window.localStorage.setItem(DAYS_KEY, String(d)); } catch { /* private window: keep it for this visit only */ }
    loadOverview();
  };

  // ---- render ----
  const renderWidget = (id: DashboardWidget): ReactNode => {
    const info = WIDGET_INFO[id];
    if (id === 'insights') return <DashboardInsights />;
    if (info.overview) {
      if (!overview) {
        return (
          <WCard sub={info.description}>
            {ovError ? <Notice>{ovError}</Notice> : <Skeleton rows={5} />}
          </WCard>
        );
      }
      const p = { ov: overview, stale: ovBusy };
      switch (id) {
        case 'sla': return <SlaWidget {...p} />;
        case 'backlog': return <BacklogWidget {...p} />;
        case 'ageing': return <AgeingWidget {...p} />;
        case 'risk': return <RiskWidget {...p} />;
        case 'leaderboard': return <LeaderboardWidget {...p} />;
        case 'regionStatus': return <RegionStatusWidget {...p} />;
        case 'categories': return <CategoriesWidget {...p} />;
        case 'sources': return <SourcesWidget {...p} />;
        default: return null;
      }
    }
    if (id === 'todos') return <Todos />;
    if (!data) return null;
    switch (id) {
      case 'kpis': return <KpiRow data={data} />;
      case 'trends': return <TrendsWidget data={data} />;
      case 'byStatus': return <ByStatusWidget data={data} />;
      case 'bySeverity': return <BySeverityWidget data={data} />;
      case 'agentLoad': return <AgentLoadWidget data={data} />;
      case 'byGroup': return <ByGroup data={data} />;
      case 'csat': return <Csat data={data} />;
      case 'recent': return <Recent data={data} />;
      default: return null;
    }
  };

  const usesPeriod = layout.some((id) => id === 'backlog' || id === 'sla' || id === 'sources');
  const ready = data && mine !== undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold tracking-tight">Good to see you, {me.name.split(' ')[0]}</h2>
          <p className="text-sm text-muted">Live queue for Emami Secondary Support{loadedAt && ` · updated ${fmtTime(loadedAt)}`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {usesPeriod && (
            <div className="flex items-center gap-2">
              <span className="text-2xs font-bold uppercase tracking-wide text-muted">Period</span>
              <Segmented value={days} options={PERIODS} onChange={changeDays} label="Period for backlog, SLA health and sources" format={(d) => `${d} d`} />
            </div>
          )}
          <Button size="sm" onClick={() => setCustomise(true)} disabled={mine === undefined}><SlidersHorizontal size={13} /> Customise</Button>
          <Button size="sm" onClick={() => go('helpdesk')}><PieChart size={13} /> Helpdesk dashboard</Button>
          <Button size="sm" onClick={load} disabled={busy}><RefreshCw size={13} className={busy ? 'motion-safe:animate-spin' : ''} /> Refresh</Button>
        </div>
      </div>
      {error && <Notice onClose={() => setError('')}>{error}</Notice>}
      {layoutError && <Notice onClose={() => setLayoutError('')}>{layoutError}</Notice>}

      {!ready ? (
        error && !data ? null : <LoadingGrid />
      ) : layout.length === 0 ? (
        <Card>
          <Empty title="Your dashboard is empty" icon={LayoutGrid}>
            <p>Every widget is hidden.</p>
            <Button size="sm" variant="primary" className="mt-3" onClick={() => setCustomise(true)}><SlidersHorizontal size={13} /> Choose widgets</Button>
          </Empty>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-flow-row-dense md:grid-cols-2 xl:grid-cols-3">
          {layout.map((id) => (
            <div key={id} className={cx('min-w-0 motion-safe:animate-slideUp', SPAN_CLASS[WIDGET_INFO[id].span])}>
              <WidgetCtx.Provider value={{ id, onHide: id === 'kpis' || id === 'insights' ? undefined : () => hide(id) }}>
                {renderWidget(id)}
              </WidgetCtx.Provider>
            </div>
          ))}
        </div>
      )}

      <CustomiseDialog
        open={customise}
        onClose={() => setCustomise(false)}
        layout={layout}
        adminDefault={adminDefault}
        usingDefault={mine === null}
        onSave={saveLayout}
      />
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading the dashboard">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => <div key={i} className="skeleton h-[88px] rounded-2xl" />)}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[2, 1, 1, 1, 1].map((span, i) => (
          <Card key={i} className={span === 2 ? 'md:col-span-2' : ''}><Skeleton rows={6} /></Card>
        ))}
      </div>
    </div>
  );
}
