'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, OctagonAlert } from 'lucide-react';
import HubGate from '../components/HubGate';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import FiltersBar from '../components/FiltersBar';
import KpiCard from '../components/KpiCard';
import SecondaryKpi from '../components/SecondaryKpi';
import ForecastChart from '../components/ForecastChart';
import ExplainPanel from '../components/ExplainPanel';
import InsightsPanel from '../components/InsightsPanel';
import RiskPanel from '../components/RiskPanel';
import ActionCenter from '../components/ActionCenter';
import CashLineTable from '../components/CashLineTable';
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/States';
import { createAction, fetchCompanyCodeOptions, loadDashboard } from '../lib/sapClient';
import { companyCodes as MOCK_COMPANY_CODES } from '../data/mock';
import { addDays, fmt, fmtDate, monthShort } from '../utils/format';
import type {
  ChartOptions,
  CompanyCodeOption,
  DashboardFilters,
  DashboardPayload,
  ForecastPoint,
  Insight,
  Kpi,
} from '../types';

const DEFAULT_FILTERS: DashboardFilters = {
  scenario: 'BASE',
  companyCode: 'ALL',
  horizon: 13,
  fromDate: '2026-09-01',
  granularity: 'WEEKLY',
  currency: 'INR',
};
const DEFAULT_CHART: ChartOptions = { showBand: true, showPolicy: true, showPo: false, showPipeline: false, showConfidence: false };

/** Scenario multipliers keep the UI deterministic while the SAP service
 *  returns BASE figures; BEST/STRESS mirror the ABAP scenario rules. */
const SCENARIO_RULES: Record<string, { cash: number; inflow: number; outflow: number }> = {
  BASE: { cash: 1, inflow: 1, outflow: 1 },
  BEST: { cash: 1.12, inflow: 1.05, outflow: 0.98 },
  STRESS: { cash: 0.82, inflow: 0.9, outflow: 1.05 },
};

function applyScenario(points: ForecastPoint[], scenario: DashboardFilters['scenario']): ForecastPoint[] {
  const rule = SCENARIO_RULES[scenario];
  return points.map((p) => ({
    ...p,
    closingCash: +(p.closingCash * rule.cash).toFixed(1),
    inflows: +(p.inflows * rule.inflow).toFixed(1),
    outflows: +(p.outflows * rule.outflow).toFixed(1),
    lowerBound: +(p.lowerBound * rule.cash).toFixed(1),
    upperBound: +(p.upperBound * rule.cash).toFixed(1),
  }));
}

/** Add display fields (week label + actual date) from the selected From Date. */
function withDates(points: ForecastPoint[], fromDate: string): ForecastPoint[] {
  return points.map((p, i) => ({
    ...p,
    label: `W${i + 1}`,
    date: fmtDate(addDays(fromDate, 7 * i)),
  }));
}

/** Monthly granularity: bucket weeks by the month of their start date. */
function aggregateMonthly(rows: ForecastPoint[]): ForecastPoint[] {
  const groups = new Map<string, ForecastPoint[]>();
  rows.forEach((r) => {
    const key = r.date?.slice(-3) ?? r.week; // 'Sep' style from '07 Sep'
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  });
  return Array.from(groups.entries()).map(([key, weeks]) => {
    const last = weeks[weeks.length - 1];
    return {
      ...last,
      week: key,
      label: key,
      inflows: +weeks.reduce((s, w) => s + w.inflows, 0).toFixed(1),
      outflows: +weeks.reduce((s, w) => s + w.outflows, 0).toFixed(1),
      poCommitments: +weeks.reduce((s, w) => s + (w.poCommitments ?? 0), 0).toFixed(1),
      salesPipeline: +weeks.reduce((s, w) => s + (w.salesPipeline ?? 0), 0).toFixed(1),
      lowerBound: Math.min(...weeks.map((w) => w.lowerBound)),
      upperBound: Math.max(...weeks.map((w) => w.upperBound)),
      confidence: Math.min(...weeks.map((w) => w.confidence)),
    };
  });
}

function exportCsv(rows: ForecastPoint[], currency: DashboardFilters['currency']): void {
  const header = `Period,Closing Cash (${currency} Cr),Inflows,Outflows,P10,P90,Confidence`;
  const body = rows.map((r) => [r.label ?? r.week, r.closingCash, r.inflows, r.outflows, r.lowerBound, r.upperBound, r.confidence].join(',')).join('\n');
  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cashflow-forecast.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function DashboardContent() {
  const [data, setData] = useState<DashboardPayload>();
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const [chartOptions, setChartOptions] = useState<ChartOptions>(DEFAULT_CHART);
  const [companyCodeOptions, setCompanyCodeOptions] = useState<CompanyCodeOption[]>(MOCK_COMPANY_CODES);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string>();
  const [navOpen, setNavOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [insightBusy, setInsightBusy] = useState<string>();
  const [createdActions, setCreatedActions] = useState<Record<string, string>>({});

  const load = useCallback((f: DashboardFilters) => {
    setBusy(true);
    setError(undefined);
    loadDashboard(f)
      .then(setData)
      .catch((e: Error) => setError(e.message || 'Unexpected error'))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    load(filters);
    fetchCompanyCodeOptions().then(setCompanyCodeOptions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.scenario, filters.companyCode, filters.horizon]);

  // Scenario- and horizon-adjusted weekly series (base unit: INR Crore).
  const weekly = useMemo(
    () => (data ? applyScenario(data.forecast, filters.scenario).slice(0, filters.horizon) : []),
    [data, filters.scenario, filters.horizon]
  );

  // From-date + granularity aware display series (also drives the chart).
  const points = useMemo(() => {
    const dated = withDates(weekly, filters.fromDate);
    return filters.granularity === 'MONTHLY' ? aggregateMonthly(dated) : dated;
  }, [weekly, filters.fromDate, filters.granularity]);

  // ---- Dynamic KPI engine: KPI cards react to horizon, scenario, optional
  // ---- series (PO commitments / sales pipeline) and display currency.
  const kpis = useMemo<Kpi[]>(() => {
    if (!data) return [];
    const sum = (key: 'inflows' | 'outflows' | 'poCommitments' | 'salesPipeline') =>
      weekly.reduce((s, p) => s + (p[key] ?? 0), 0);
    const pipeline = chartOptions.showPipeline ? sum('salesPipeline') : 0;
    const po = chartOptions.showPo ? sum('poCommitments') : 0;
    const net = sum('inflows') + pipeline - sum('outflows') - po;
    const lowest = weekly.length ? Math.min(...weekly.map((p) => p.closingCash)) : 0;

    return data.kpis.map((k) => {
      switch (k.key) {
        case 'net13w':
          return { ...k, label: `${filters.horizon}-Week Net Cash Flow`, value: fmt(net, filters.currency), note: `Scenario ${filters.scenario} · confidence 87%` };
        case 'receipts':
          return { ...k, value: fmt(sum('inflows') + pipeline, filters.currency), note: `AR + SD pipeline · ${filters.horizon} weeks` };
        case 'payments':
          return { ...k, value: fmt(sum('outflows') + po, filters.currency), note: 'AP + payroll + statutory dues' };
        case 'lowest': {
          const below = lowest < data.policyBuffer;
          return {
            ...k,
            value: fmt(lowest, filters.currency),
            note: below ? `Below ${fmt(data.policyBuffer, filters.currency)} policy buffer` : 'Within policy buffer',
            tone: below ? 'amber' : 'green',
          };
        }
        default:
          return k;
      }
    });
  }, [data, weekly, filters.horizon, filters.scenario, filters.currency, chartOptions.showPipeline, chartOptions.showPo]);

  const handleAction = async () => {
    setActionBusy(true);
    try {
      await createAction({ Type: 'LIQUIDITY_MITIGATION', Scenario: filters.scenario, CompanyCode: filters.companyCode });
    } finally {
      setActionBusy(false);
    }
  };

  const handleInsightAction = async (insight: Insight) => {
    if (!insight.actionType) return;
    setInsightBusy(insight.id);
    try {
      const res = await createAction({
        Type: insight.actionType,
        Scenario: filters.scenario,
        CompanyCode: filters.companyCode,
        InsightId: insight.id,
      });
      setCreatedActions((prev) => ({ ...prev, [insight.id]: res.id ?? 'ACT-CREATED' }));
    } catch {
      /* error surfaces via a retry-able button; state just resets below */
    } finally {
      setInsightBusy(undefined);
    }
  };

  if (busy && !data) return <LoadingSkeleton />;
  if (error && !data) return <ErrorState message={error} onRetry={() => load(filters)} />;
  if (!data) return <EmptyState title="No dashboard data available." />;

  return (
    <div className="layout">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} live={data.live} />
      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
      <main>
        <Topbar onRefresh={() => load(filters)} onExport={() => exportCsv(points, filters.currency)} onMenu={() => setNavOpen(true)} busy={busy} />
        <div className="content">
          <section className="attention" role="status">
            <OctagonAlert size={19} />
            <span>{data.alert}</span>
            <button onClick={handleAction} disabled={actionBusy}>
              {actionBusy ? 'Creating…' : 'Create mitigation action'}
            </button>
          </section>

          <FiltersBar
            filters={filters}
            onChange={setFilters}
            chartOptions={chartOptions}
            onChartOptions={setChartOptions}
            companyCodeOptions={companyCodeOptions}
          />

          <section className="metrics" id="overview" aria-label="Key performance indicators">
            {kpis.map((k) => (
              <KpiCard key={k.key} kpi={k} />
            ))}
          </section>

          <section className="minis" aria-label="Efficiency indicators">
            {data.secondary.map((k) => (
              <SecondaryKpi key={k.key} kpi={k} />
            ))}
          </section>

          <section className="card" id="forecast">
            <div className="card-head">
              <h2>
                <Activity size={18} /> Cash Forecast · {filters.granularity === 'WEEKLY' ? `W1–W${filters.horizon}` : `${monthShort(filters.fromDate)} onward`}
              </h2>
              <span className="chip">
                Scenario: {filters.scenario} · From {fmtDate(filters.fromDate)} · As of {data.asOf}
              </span>
            </div>
            <ForecastChart data={points} policyBuffer={data.policyBuffer} options={chartOptions} currency={filters.currency} />
          </section>

          <InsightsPanel insights={data.insights} created={createdActions} onCreate={handleInsightAction} busyId={insightBusy} />

          <RiskPanel risks={data.risks} />
          <ExplainPanel factors={data.factors} opening={data.forecast[0]?.closingCash ?? 0} />
          <ActionCenter actions={data.actions} onCreate={handleAction} busy={actionBusy} />
          <CashLineTable
            lines={filters.companyCode === 'ALL' ? data.lines : data.lines.filter((l) => l.companyCode === filters.companyCode)}
          />

          <footer className="foot">
            CashFlow Intelligence · {data.live ? 'SAP OData V2' : 'Demo data'} · ECC 6.0 EHP8 / SoH 2.0 · Display currency: {filters.currency} ·
            Governed by approval workflow · Read-only recommendation model
          </footer>
        </div>
      </main>
    </div>
  );
}

export default function CashFlowForecastPage() {
  return (
    <HubGate>
      <DashboardContent />
    </HubGate>
  );
}
