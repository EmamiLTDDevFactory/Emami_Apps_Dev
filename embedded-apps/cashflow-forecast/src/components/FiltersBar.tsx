'use client';

import type { ChartOptions, CompanyCodeOption, CurrencyCode, DashboardFilters, Scenario } from '../types';
import { ListFilter, CalendarRange } from 'lucide-react';

const SCENARIOS: { key: Scenario; label: string }[] = [
  { key: 'BASE', label: 'Base' },
  { key: 'BEST', label: 'Optimistic' },
  { key: 'STRESS', label: 'Stress' },
];

const GRANULARITIES: { key: 'WEEKLY' | 'MONTHLY'; label: string }[] = [
  { key: 'WEEKLY', label: 'Weekly' },
  { key: 'MONTHLY', label: 'Monthly' },
];

const CURRENCY_OPTIONS: { key: CurrencyCode; label: string }[] = [
  { key: 'INR', label: '₹ INR' },
  { key: 'USD', label: '$ USD' },
  { key: 'EUR', label: '€ EUR' },
];

interface Props {
  filters: DashboardFilters;
  onChange: (f: DashboardFilters) => void;
  chartOptions: ChartOptions;
  onChartOptions: (o: ChartOptions) => void;
  companyCodeOptions: CompanyCodeOption[];
}

export default function FiltersBar({ filters, onChange, chartOptions, onChartOptions, companyCodeOptions }: Props) {
  return (
    <section className="filters" aria-label="Dashboard filters">
      <div className="filters-head">
        <ListFilter size={15} /> Filters
      </div>
      <div className="filters-body">
        <div className="segmented" role="radiogroup" aria-label="Scenario">
          {SCENARIOS.map((s) => (
            <button
              key={s.key}
              role="radio"
              aria-checked={filters.scenario === s.key}
              className={filters.scenario === s.key ? 'active' : ''}
              onClick={() => onChange({ ...filters, scenario: s.key })}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="segmented" role="radiogroup" aria-label="View granularity">
          {GRANULARITIES.map((g) => (
            <button
              key={g.key}
              role="radio"
              aria-checked={filters.granularity === g.key}
              className={filters.granularity === g.key ? 'active' : ''}
              onClick={() => onChange({ ...filters, granularity: g.key })}
            >
              {g.label}
            </button>
          ))}
        </div>
        <label>
          Company Code
          <select value={filters.companyCode} onChange={(e) => onChange({ ...filters, companyCode: e.target.value })}>
            {companyCodeOptions.map((c) => (
              <option key={c.key} value={c.key}>
                {c.text}
              </option>
            ))}
          </select>
        </label>
        <label>
          Horizon
          <select value={filters.horizon} onChange={(e) => onChange({ ...filters, horizon: Number(e.target.value) })}>
            <option value={8}>8 Weeks</option>
            <option value={13}>13 Weeks</option>
            <option value={26}>26 Weeks</option>
          </select>
        </label>
        <label>
          <span className="lab">
            <CalendarRange size={12} /> From Date
          </span>
          <input
            type="date"
            value={filters.fromDate}
            onChange={(e) => onChange({ ...filters, fromDate: e.target.value || filters.fromDate })}
          />
        </label>
        <label>
          Display Currency
          <select
            value={filters.currency}
            onChange={(e) => onChange({ ...filters, currency: e.target.value as CurrencyCode })}
            title="Display convenience only — transaction currency is resolved server-side via TCURR"
          >
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="checks">
          <legend>Chart layers</legend>
          <div className="checks-inner">
            <label className="check">
              <input
                type="checkbox"
                checked={chartOptions.showBand}
                onChange={(e) => onChartOptions({ ...chartOptions, showBand: e.target.checked })}
              />
              Confidence band
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={chartOptions.showPolicy}
                onChange={(e) => onChartOptions({ ...chartOptions, showPolicy: e.target.checked })}
              />
              Policy buffer
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={chartOptions.showPo}
                onChange={(e) => onChartOptions({ ...chartOptions, showPo: e.target.checked })}
              />
              PO commitments
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={chartOptions.showPipeline}
                onChange={(e) => onChartOptions({ ...chartOptions, showPipeline: e.target.checked })}
              />
              Sales pipeline
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={chartOptions.showConfidence}
                onChange={(e) => onChartOptions({ ...chartOptions, showConfidence: e.target.checked })}
              />
              Confidence %
            </label>
          </div>
        </fieldset>
      </div>
    </section>
  );
}
