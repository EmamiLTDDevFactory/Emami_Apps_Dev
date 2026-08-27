import { useMemo } from 'react';
import Chart from 'react-apexcharts';
import { formatCurrency } from '../utils/formatters';

// Derived entirely from the same `consultants` array Dashboard.jsx already fetches from SAP
// (getConsultants()) — no new API calls, no mock data. Self-contained component: deleting this
// file plus the two lines that import/render it in Dashboard.jsx fully reverts this feature.
//
// Visual language matches a supplied ApexCharts reference (dark navy dashboard, neon
// yellow/cyan/magenta gradient palette, glowing line strokes, radial gauge). Palette re-validated
// with this session's dataviz skill against the dark card surface (#262D47): CVD-separation and
// contrast both PASS; the lightness-band check reads these as "unusually bright" — expected and
// intentional for a neon/glow look, kept as-is since the checks that gate real accessibility
// (colorblind separation, contrast) pass cleanly.
const NEON = { yellow: '#FCCF31', cyan: '#17ead9', magenta: '#f02fc2' };
const PAGE_DARK = '#1B213B';
const CARD_DARK = '#262D47';
const GRID_DARK = '#40475D';
const TEXT_LIGHT = '#e8e8f0';
const TEXT_MUTED = '#9aa0b8';

function parseDateMs(val) {
  if (!val) return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'string' && val.startsWith('/Date(')) {
    const ms = Number(val.match(/-?\d+/)?.[0]);
    return Number.isNaN(ms) ? null : ms;
  }
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

const monthLabel = (ms) => new Date(ms).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
const compactCurrency = (v) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v);

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="rounded-lg p-6" style={{ backgroundColor: CARD_DARK }}>
      <div className="mb-3">
        <div className="text-sm font-bold" style={{ color: TEXT_LIGHT }}>{title}</div>
        {subtitle && <div className="mt-0.5 text-xs font-medium" style={{ color: TEXT_MUTED }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function EmptyChartState({ message }) {
  return (
    <div className="flex h-[260px] items-center justify-center px-6 text-center text-xs font-medium" style={{ color: TEXT_MUTED }}>
      {message}
    </div>
  );
}

export default function ConsultantAnalytics({ consultants }) {
  const statusData = useMemo(() => {
    const counts = { ACTIVE: 0, ONHOLD: 0, INACTIVE: 0 };
    let other = 0;
    consultants.forEach((c) => {
      if (c.Status === 'ACTIVE' || c.Status === 'ONHOLD' || c.Status === 'INACTIVE') counts[c.Status] += 1;
      else other += 1;
    });
    const total = consultants.length || 1;
    return {
      series: [
        Math.round((counts.ACTIVE / total) * 100),
        Math.round((counts.ONHOLD / total) * 100),
        Math.round((counts.INACTIVE / total) * 100),
      ],
      labels: ['Active', 'On Hold', 'Inactive'],
      counts,
      other,
    };
  }, [consultants]);

  const hiresData = useMemo(() => {
    let zero = 0, mid = 0, high = 0;
    consultants.forEach((c) => {
      const hires = Number(c.TotalHires || 0);
      if (hires === 0) zero += 1;
      else if (hires <= 5) mid += 1;
      else high += 1;
    });
    return [zero, mid, high];
  }, [consultants]);

  const feesTrendData = useMemo(() => {
    const byMonth = new Map();
    consultants.forEach((c) => {
      const ms = parseDateMs(c.ContStart);
      if (ms == null) return;
      const d = new Date(ms);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucketMs = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const existing = byMonth.get(key) || { key, ms: bucketMs, total: 0 };
      existing.total += Number(c.TotalFees || 0);
      byMonth.set(key, existing);
    });
    const rows = Array.from(byMonth.values()).sort((a, b) => a.ms - b.ms).slice(-12);
    return { categories: rows.map((m) => monthLabel(m.ms)), values: rows.map((m) => m.total) };
  }, [consultants]);

  const topVendorsData = useMemo(() => {
    const byVendor = new Map();
    consultants.forEach((c) => {
      const vendor = c.DummyVendor || c.ConsuName || 'Unknown';
      byVendor.set(vendor, (byVendor.get(vendor) || 0) + Number(c.TotalFees || 0));
    });
    const rows = Array.from(byVendor.entries())
      .map(([vendor, fees]) => ({ vendor, fees }))
      .filter((v) => v.fees > 0)
      .sort((a, b) => b.fees - a.fees)
      .slice(0, 6);
    return { categories: rows.map((r) => r.vendor), values: rows.map((r) => r.fees) };
  }, [consultants]);

  const totalConsultants = consultants.length;
  const hasFeesTrend = feesTrendData.values.length > 1;
  const hasTopVendors = topVendorsData.values.length > 0;

  const statusOptions = {
    chart: { type: 'radialBar', foreColor: TEXT_LIGHT, toolbar: { show: false } },
    colors: [NEON.yellow, NEON.cyan, NEON.magenta],
    labels: statusData.labels,
    plotOptions: {
      radialBar: {
        hollow: { margin: 5, size: '42%', background: 'transparent' },
        track: { show: true, background: GRID_DARK, strokeWidth: '10%', opacity: 1, margin: 4 },
        dataLabels: {
          name: { fontSize: '12px' },
          value: { fontSize: '14px', fontWeight: 700 },
        },
      },
    },
    legend: {
      show: true,
      position: 'left',
      offsetY: 10,
      labels: { colors: TEXT_LIGHT },
      formatter: (val, opts) => `${val} - ${opts.w.globals.series[opts.seriesIndex]}%`,
    },
    fill: {
      type: 'gradient',
      gradient: { shade: 'dark', type: 'horizontal', shadeIntensity: 0.5, inverseColors: true, opacityFrom: 1, opacityTo: 1, stops: [0, 100] },
    },
    stroke: { lineCap: 'round' },
  };

  const hiresOptions = {
    chart: { type: 'bar', toolbar: { show: false }, foreColor: TEXT_LIGHT },
    colors: [NEON.cyan],
    plotOptions: { bar: { borderRadius: 6, columnWidth: '45%' } },
    dataLabels: { enabled: true, style: { colors: [TEXT_LIGHT], fontWeight: 700 } },
    stroke: { width: 0 },
    grid: { borderColor: GRID_DARK, strokeDashArray: 0 },
    xaxis: {
      categories: ['Zero', '1–5', '5+'],
      axisTicks: { color: GRID_DARK },
      axisBorder: { color: GRID_DARK },
      labels: { style: { colors: TEXT_MUTED } },
    },
    yaxis: { labels: { style: { colors: TEXT_MUTED } }, forceNiceScale: true },
    fill: {
      type: 'gradient',
      gradient: { shade: 'dark', type: 'vertical', shadeIntensity: 0.5, gradientToColors: ['#6078ea'], inverseColors: false, opacityFrom: 1, opacityTo: 0.85, stops: [0, 100] },
    },
    tooltip: { theme: 'dark', y: { formatter: (v) => `${v} consultants` } },
  };

  const feesTrendOptions = {
    chart: { type: 'line', toolbar: { show: false }, foreColor: TEXT_LIGHT, dropShadow: { enabled: true, opacity: 0.5, blur: 5, left: -5, top: 12, color: NEON.magenta } },
    colors: [NEON.magenta],
    stroke: { curve: 'smooth', width: 4 },
    markers: { size: 4, colors: [NEON.magenta], strokeColors: CARD_DARK, strokeWidth: 2 },
    grid: { borderColor: GRID_DARK },
    xaxis: {
      categories: feesTrendData.categories,
      axisTicks: { color: GRID_DARK },
      axisBorder: { color: GRID_DARK },
      labels: { style: { colors: TEXT_MUTED } },
    },
    yaxis: { labels: { style: { colors: TEXT_MUTED }, formatter: compactCurrency } },
    tooltip: { theme: 'dark', y: { formatter: (v) => formatCurrency(v) } },
    fill: {
      type: 'gradient',
      gradient: { gradientToColors: ['#6078ea'], shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0, stops: [0, 100] },
    },
  };

  const topVendorsOptions = {
    chart: { type: 'bar', toolbar: { show: false }, foreColor: TEXT_LIGHT },
    colors: [NEON.yellow],
    plotOptions: { bar: { horizontal: true, borderRadius: 6, barHeight: '55%', distributed: false } },
    dataLabels: {
      enabled: true,
      offsetX: 8,
      style: { colors: [TEXT_LIGHT], fontWeight: 700 },
      formatter: (v) => formatCurrency(v),
    },
    stroke: { width: 0 },
    grid: { borderColor: GRID_DARK },
    xaxis: {
      categories: topVendorsData.categories,
      labels: { show: false },
      axisTicks: { show: false },
      axisBorder: { color: GRID_DARK },
    },
    yaxis: { labels: { style: { colors: TEXT_LIGHT, fontWeight: 600 } } },
    fill: {
      type: 'gradient',
      gradient: { shade: 'dark', type: 'horizontal', shadeIntensity: 0.5, gradientToColors: ['#F55555'], inverseColors: false, opacityFrom: 1, opacityTo: 0.85, stops: [0, 100] },
    },
    tooltip: { theme: 'dark', y: { formatter: (v) => formatCurrency(v) } },
  };

  return (
    <div className="rounded-2xl p-6" style={{ backgroundColor: PAGE_DARK }}>
      <div className="mb-4">
        <div className="text-lg font-bold" style={{ color: TEXT_LIGHT }}>Analytics</div>
        <div className="mt-0.5 text-xs font-medium" style={{ color: TEXT_MUTED }}>
          Visual breakdown of consultant status, engagement, and spend
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Consultant Status" subtitle="Share of all consultants by current status">
          {totalConsultants > 0 ? (
            <Chart options={statusOptions} series={statusData.series} type="radialBar" height={300} />
          ) : (
            <EmptyChartState message="No consultant records yet." />
          )}
        </ChartCard>

        <ChartCard title="Hires Distribution" subtitle="Consultants grouped by total hires">
          <Chart options={hiresOptions} series={[{ name: 'Consultants', data: hiresData }]} type="bar" height={300} />
        </ChartCard>

        <ChartCard title="Fees Paid Over Time" subtitle="Total consultant fees by contract start month">
          {hasFeesTrend ? (
            <Chart options={feesTrendOptions} series={[{ name: 'Fees', data: feesTrendData.values }]} type="line" height={300} />
          ) : (
            <EmptyChartState message="Not enough contract-date data yet to show a trend." />
          )}
        </ChartCard>

        <ChartCard title="Top Vendors by Fees" subtitle="Highest cumulative spend, all-time">
          {hasTopVendors ? (
            <Chart
              options={topVendorsOptions}
              series={[{ name: 'Fees', data: topVendorsData.values }]}
              type="bar"
              height={Math.max(220, topVendorsData.values.length * 46)}
            />
          ) : (
            <EmptyChartState message="No fee data recorded yet." />
          )}
        </ChartCard>
      </div>
    </div>
  );
}
