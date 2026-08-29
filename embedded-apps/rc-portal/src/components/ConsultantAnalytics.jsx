import { useMemo } from 'react';
import Chart from 'react-apexcharts';
import { formatCurrency } from '../utils/formatters';

// Derived entirely from the same `consultants` array Dashboard.jsx already fetches from SAP
// (getConsultants()) — no new API calls, no mock data. Self-contained component: deleting this
// file plus the two lines that import/render it in Dashboard.jsx fully reverts this feature.
//
// Rebuilt to match a supplied ApexCharts reference exactly: dark navy cards, no inline bar
// labels, a floating top-right value per panel, two bold glowing lines (not one faint one), all
// status rings actually populated, and vendor rows as individual gradient progress bars instead
// of one combined chart.
const NEON = { yellow: '#FCCF31', cyan: '#17ead9', magenta: '#f02fc2', orange: '#F55555', blue: '#6078ea' };
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
const compactCurrency = (v) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${v}`);
const pctOfMax = (arr) => { const max = Math.max(1, ...arr); return arr.map((v) => Math.round((v / max) * 100)); };

// Matches the reference's per-panel floating value (top-right "14%" / "20") — a plain title/
// subtitle pair, not a chart element, so it works identically across every chart type below.
function ChartCard({ title, subtitle, value, children }) {
  return (
    <div className="rounded-lg p-4" style={{ backgroundColor: CARD_DARK }}>
      <div className="mb-1 flex items-start justify-between">
        <div>
          <div className="text-sm font-bold" style={{ color: TEXT_LIGHT }}>{title}</div>
          {subtitle && <div className="mt-0.5 text-xs font-medium" style={{ color: TEXT_MUTED }}>{subtitle}</div>}
        </div>
        {value != null && <div className="text-2xl font-black" style={{ color: TEXT_LIGHT }}>{value}</div>}
      </div>
      {children}
    </div>
  );
}

function EmptyChartState({ message }) {
  return (
    <div className="flex h-[200px] items-center justify-center px-6 text-center text-xs font-medium" style={{ color: TEXT_MUTED }}>
      {message}
    </div>
  );
}

// One row of the reference's "Process 1/2/3" progress-bar pattern — plain HTML/CSS, not a chart
// instance, since each one is just a title + gradient bar + percentage (matches the reference's
// visual exactly without spinning up N extra ApexCharts mounts for something this simple).
function ProgressRow({ label, valueLabel, pct, gradient }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-bold" style={{ color: TEXT_LIGHT }}>{label}</span>
        <span className="text-sm font-black" style={{ color: TEXT_LIGHT }}>{valueLabel}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: GRID_DARK }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(2, pct)}%`, backgroundImage: `linear-gradient(90deg, ${gradient[0]}, ${gradient[1]})` }}
        />
      </div>
    </div>
  );
}

export default function ConsultantAnalytics({ consultants }) {
  const statusData = useMemo(() => {
    const counts = { ACTIVE: 0, ONHOLD: 0, INACTIVE: 0, OTHER: 0 };
    consultants.forEach((c) => {
      if (c.Status === 'ACTIVE' || c.Status === 'ONHOLD' || c.Status === 'INACTIVE') counts[c.Status] += 1;
      else counts.OTHER += 1;
    });
    const total = consultants.length || 1;
    const labels = ['Active', 'On Hold', 'Inactive'];
    const colors = [NEON.orange, NEON.cyan, NEON.magenta];
    const series = [counts.ACTIVE, counts.ONHOLD, counts.INACTIVE];
    if (counts.OTHER > 0) {
      labels.push('Other');
      colors.push(TEXT_MUTED);
      series.push(counts.OTHER);
    }
    return {
      series: series.map((n) => Math.round((n / total) * 100)),
      labels,
      colors,
      activeCount: counts.ACTIVE,
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
    return { values: [zero, mid, high], total: zero + mid + high };
  }, [consultants]);

  // Two real series, correctly indexed to a common 0-100 base (not a dual-axis) since fees (₹
  // lakhs) and contract counts are on wildly different scales — see this session's dataviz
  // notes: two measures of different scale share one axis only when indexed, never via a second
  // y-axis. Tooltip below still shows the real absolute value, not the indexed percentage.
  const feesTrendData = useMemo(() => {
    const byMonth = new Map();
    consultants.forEach((c) => {
      const ms = parseDateMs(c.ContStart);
      if (ms == null) return;
      const d = new Date(ms);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucketMs = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const existing = byMonth.get(key) || { key, ms: bucketMs, fees: 0, contracts: 0 };
      existing.fees += Number(c.TotalFees || 0);
      existing.contracts += 1;
      byMonth.set(key, existing);
    });
    const rows = Array.from(byMonth.values()).sort((a, b) => a.ms - b.ms).slice(-12);
    const fees = rows.map((m) => m.fees);
    const contracts = rows.map((m) => m.contracts);
    return {
      categories: rows.map((m) => monthLabel(m.ms)),
      fees,
      contracts,
      feesIndexed: pctOfMax(fees),
      contractsIndexed: pctOfMax(contracts),
      totalFees: fees.reduce((a, b) => a + b, 0),
    };
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
      .slice(0, 3);
    const max = Math.max(1, ...rows.map((r) => r.fees));
    return rows.map((r) => ({ ...r, pct: Math.round((r.fees / max) * 100) }));
  }, [consultants]);

  const totalConsultants = consultants.length;
  const hasFeesTrend = feesTrendData.fees.length > 1;

  const statusOptions = {
    chart: { type: 'radialBar', foreColor: TEXT_LIGHT, toolbar: { show: false } },
    colors: statusData.colors,
    labels: statusData.labels,
    plotOptions: {
      radialBar: {
        hollow: { margin: 5, size: '38%', background: 'transparent' },
        track: { show: true, background: GRID_DARK, strokeWidth: '10%', opacity: 1, margin: 4 },
        dataLabels: { name: { show: false }, value: { show: false } },
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
    colors: [NEON.yellow],
    plotOptions: { bar: { borderRadius: 6, columnWidth: '45%' } },
    dataLabels: { enabled: false },
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
      gradient: { shade: 'dark', type: 'vertical', shadeIntensity: 0.5, gradientToColors: [NEON.orange], inverseColors: false, opacityFrom: 1, opacityTo: 0.85, stops: [0, 100] },
    },
    tooltip: { theme: 'dark', y: { formatter: (v) => `${v} consultants` } },
  };

  const feesTrendOptions = {
    chart: {
      type: 'line',
      toolbar: { show: false },
      foreColor: TEXT_LIGHT,
      dropShadow: { enabled: true, opacity: 0.55, blur: 6, left: -5, top: 12 },
    },
    colors: [NEON.yellow, NEON.cyan],
    stroke: { curve: 'smooth', width: 5 },
    markers: { size: 0 },
    grid: { borderColor: GRID_DARK },
    xaxis: {
      categories: feesTrendData.categories,
      axisTicks: { color: GRID_DARK },
      axisBorder: { color: GRID_DARK },
      labels: { style: { colors: TEXT_MUTED } },
    },
    yaxis: {
      min: 0,
      max: 100,
      labels: { style: { colors: TEXT_MUTED }, formatter: (v) => `${v}%` },
    },
    legend: { show: true, labels: { colors: TEXT_LIGHT }, markers: { radius: 12 } },
    tooltip: {
      theme: 'dark',
      y: {
        formatter: (_v, { seriesIndex, dataPointIndex }) =>
          seriesIndex === 0 ? formatCurrency(feesTrendData.fees[dataPointIndex]) : `${feesTrendData.contracts[dataPointIndex]} contracts`,
      },
    },
  };

  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: PAGE_DARK }}>
      <div className="mb-3">
        <div className="text-lg font-bold" style={{ color: TEXT_LIGHT }}>Analytics</div>
        <div className="mt-0.5 text-xs font-medium" style={{ color: TEXT_MUTED }}>
          Visual breakdown of consultant status, engagement, and spend
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Consultant Status" subtitle="Share of all consultants by current status" value={`${statusData.activeCount}`}>
          {totalConsultants > 0 ? (
            <Chart options={statusOptions} series={statusData.series} type="radialBar" height={200} />
          ) : (
            <EmptyChartState message="No consultant records yet." />
          )}
        </ChartCard>

        <ChartCard title="Hires Distribution" subtitle="Consultants grouped by total hires" value={`${hiresData.total}`}>
          <Chart options={hiresOptions} series={[{ name: 'Consultants', data: hiresData.values }]} type="bar" height={200} />
        </ChartCard>

        <ChartCard title="Fees Paid Over Time" subtitle="Total fees & new contracts by month" value={compactCurrency(feesTrendData.totalFees)}>
          {hasFeesTrend ? (
            <Chart
              options={feesTrendOptions}
              series={[
                { name: 'Fees', data: feesTrendData.feesIndexed },
                { name: 'New Contracts', data: feesTrendData.contractsIndexed },
              ]}
              type="line"
              height={200}
            />
          ) : (
            <EmptyChartState message="Not enough contract-date data yet to show a trend." />
          )}
        </ChartCard>

        <ChartCard title="Top Vendors by Fees" subtitle="Highest cumulative spend, all-time">
          {topVendorsData.length > 0 ? (
            <div className="pt-2">
              {topVendorsData.map((v, i) => (
                <ProgressRow
                  key={v.vendor}
                  label={v.vendor}
                  valueLabel={formatCurrency(v.fees)}
                  pct={v.pct}
                  gradient={[[NEON.orange, NEON.yellow], [NEON.cyan, NEON.blue], [NEON.blue, NEON.magenta]][i % 3]}
                />
              ))}
            </div>
          ) : (
            <EmptyChartState message="No fee data recorded yet." />
          )}
        </ChartCard>
      </div>
    </div>
  );
}
