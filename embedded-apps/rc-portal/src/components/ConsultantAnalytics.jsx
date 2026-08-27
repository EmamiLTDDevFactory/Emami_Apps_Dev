import { useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid, Cell, LabelList,
} from 'recharts';
import { formatCurrency } from '../utils/formatters';

// Derived entirely from the same `consultants` array Dashboard.jsx already fetches from SAP
// (getConsultants()) — no new API calls, no mock data. Self-contained component: deleting this
// file plus the two lines that import/render it in Dashboard.jsx fully reverts this feature.
//
// Colors chosen and validated with this session's dataviz skill (node scripts/validate_palette.js):
// - Status breakdown (categorical/identity): default palette slots 1-3 (blue/orange/aqua) — PASS,
//   including the strict all-pairs check.
// - Hires distribution (ordinal — Zero < 1-5 < 5+ is an inherently ordered scale): one hue
//   (blue), monotone lightness steps 250/450/650 from the documented sequential ramp — PASS.
// - Fees trend + top vendors (magnitude, not identity): the same sequential blue, one consistent
//   shade — matches the palette's "sequential default hue: blue" role.
const STATUS_COLORS = { ACTIVE: '#2a78d6', ONHOLD: '#eb6834', INACTIVE: '#1baf7a', OTHER: '#94a3b8' };
const HIRE_BUCKET_COLORS = { zero: '#86b6ef', mid: '#2a78d6', high: '#104281' };
const SEQUENTIAL_BLUE = '#2a78d6';
const CHART_SURFACE = '#fcfcfb';
const GRID_COLOR = '#e1e0d9';
const AXIS_COLOR = '#898781';
const TEXT_SECONDARY = '#52514e';

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

function ChartCard({ title, subtitle, height = 260, children }) {
  return (
    <div className="rc-card p-5">
      <div className="mb-4">
        <div className="text-sm font-bold text-slate-900">{title}</div>
        {subtitle && <div className="text-xs font-medium text-slate-500 mt-0.5">{subtitle}</div>}
      </div>
      <div style={{ width: '100%', height }}>{children}</div>
    </div>
  );
}

function EmptyChartState({ message }) {
  return (
    <div className="flex h-full items-center justify-center text-center px-6 text-xs font-medium text-slate-400">
      {message}
    </div>
  );
}

// Text stays in text tokens (slate), never the series color — see marks-and-anatomy.md. The
// swatch dot beside each row carries identity instead.
function CustomTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
      {label && <div className="mb-1 font-bold text-slate-900">{label}</div>}
      {payload.map((p) => (
        <div key={p.dataKey || p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
          <span className="font-medium text-slate-600">{p.name}:</span>
          <span className="font-bold text-slate-900">{formatter ? formatter(p.value) : p.value}</span>
        </div>
      ))}
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
    return { counts, hasOther: counts.OTHER > 0 };
  }, [consultants]);

  const hiresData = useMemo(() => {
    let zero = 0, mid = 0, high = 0;
    consultants.forEach((c) => {
      const hires = Number(c.TotalHires || 0);
      if (hires === 0) zero += 1;
      else if (hires <= 5) mid += 1;
      else high += 1;
    });
    return [
      { bucket: 'Zero', count: zero, fill: HIRE_BUCKET_COLORS.zero },
      { bucket: '1–5', count: mid, fill: HIRE_BUCKET_COLORS.mid },
      { bucket: '5+', count: high, fill: HIRE_BUCKET_COLORS.high },
    ];
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
    return Array.from(byMonth.values())
      .sort((a, b) => a.ms - b.ms)
      .slice(-12)
      .map((m) => ({ month: monthLabel(m.ms), fees: m.total }));
  }, [consultants]);

  const topVendorsData = useMemo(() => {
    const byVendor = new Map();
    consultants.forEach((c) => {
      const vendor = c.DummyVendor || c.ConsuName || 'Unknown';
      byVendor.set(vendor, (byVendor.get(vendor) || 0) + Number(c.TotalFees || 0));
    });
    return Array.from(byVendor.entries())
      .map(([vendor, fees]) => ({ vendor, fees }))
      .filter((v) => v.fees > 0)
      .sort((a, b) => b.fees - a.fees)
      .slice(0, 6);
  }, [consultants]);

  const totalConsultants = consultants.length;
  const hasFeesTrend = feesTrendData.length > 1;
  const hasTopVendors = topVendorsData.length > 0;

  return (
    <div>
      <div className="mb-4">
        <div className="text-lg font-bold text-slate-900">Analytics</div>
        <div className="mt-0.5 text-xs font-medium text-slate-500">Visual breakdown of consultant status, engagement, and spend</div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Consultant Status" subtitle="Share of all consultants by current status" height={180}>
          {totalConsultants > 0 ? (
            <ResponsiveContainer>
              <BarChart
                data={[{ name: 'Consultants', ...statusData.counts }]}
                layout="vertical"
                margin={{ top: 8, right: 24, left: 0, bottom: 0 }}
              >
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" hide />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
                <Legend verticalAlign="bottom" height={32} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: TEXT_SECONDARY }} />
                <Bar dataKey="ACTIVE" name="Active" stackId="s" fill={STATUS_COLORS.ACTIVE} stroke={CHART_SURFACE} strokeWidth={2} barSize={24}>
                  <LabelList dataKey="ACTIVE" position="center" fill="#fff" fontSize={12} fontWeight={700} formatter={(v) => (v > 0 ? v : '')} />
                </Bar>
                <Bar dataKey="ONHOLD" name="On Hold" stackId="s" fill={STATUS_COLORS.ONHOLD} stroke={CHART_SURFACE} strokeWidth={2} barSize={24}>
                  <LabelList dataKey="ONHOLD" position="center" fill="#fff" fontSize={12} fontWeight={700} formatter={(v) => (v > 0 ? v : '')} />
                </Bar>
                <Bar
                  dataKey="INACTIVE"
                  name="Inactive"
                  stackId="s"
                  fill={STATUS_COLORS.INACTIVE}
                  stroke={CHART_SURFACE}
                  strokeWidth={2}
                  barSize={24}
                  radius={statusData.hasOther ? 0 : [0, 4, 4, 0]}
                >
                  {/* Aqua is below 3:1 contrast on white per the palette validator — this direct
                      label is the required relief channel, not optional polish. */}
                  <LabelList dataKey="INACTIVE" position="center" fill="#0b0b0b" fontSize={12} fontWeight={700} formatter={(v) => (v > 0 ? v : '')} />
                </Bar>
                {statusData.hasOther && (
                  <Bar dataKey="OTHER" name="Other" stackId="s" fill={STATUS_COLORS.OTHER} stroke={CHART_SURFACE} strokeWidth={2} barSize={24} radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="OTHER" position="center" fill="#fff" fontSize={12} fontWeight={700} formatter={(v) => (v > 0 ? v : '')} />
                  </Bar>
                )}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartState message="No consultant records yet." />
          )}
        </ChartCard>

        <ChartCard title="Hires Distribution" subtitle="Consultants grouped by total hires">
          <ResponsiveContainer>
            <BarChart data={hiresData} margin={{ top: 20, right: 8, left: -16, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke={GRID_COLOR} />
              <XAxis dataKey="bucket" tickLine={false} axisLine={{ stroke: GRID_COLOR }} tick={{ fontSize: 12, fill: AXIS_COLOR }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: AXIS_COLOR }} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(42,120,214,0.06)' }} />
              <Bar dataKey="count" name="Consultants" radius={[4, 4, 0, 0]} barSize={40}>
                {hiresData.map((entry) => (
                  <Cell key={entry.bucket} fill={entry.fill} />
                ))}
                <LabelList dataKey="count" position="top" fill={TEXT_SECONDARY} fontSize={12} fontWeight={700} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Fees Paid Over Time" subtitle="Total consultant fees by contract start month">
          {hasFeesTrend ? (
            <ResponsiveContainer>
              <AreaChart data={feesTrendData} margin={{ top: 20, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="rcFeesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SEQUENTIAL_BLUE} stopOpacity={0.12} />
                    <stop offset="100%" stopColor={SEQUENTIAL_BLUE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={GRID_COLOR} />
                <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: GRID_COLOR }} tick={{ fontSize: 12, fill: AXIS_COLOR }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_COLOR }} tickFormatter={compactCurrency} />
                <Tooltip content={<CustomTooltip formatter={formatCurrency} />} cursor={{ stroke: GRID_COLOR }} />
                <Area
                  type="monotone"
                  dataKey="fees"
                  name="Fees"
                  stroke={SEQUENTIAL_BLUE}
                  strokeWidth={2}
                  fill="url(#rcFeesFill)"
                  dot={{ r: 4, fill: SEQUENTIAL_BLUE, stroke: CHART_SURFACE, strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: SEQUENTIAL_BLUE, stroke: CHART_SURFACE, strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartState message="Not enough contract-date data yet to show a trend." />
          )}
        </ChartCard>

        <ChartCard title="Top Vendors by Fees" subtitle="Highest cumulative spend, all-time">
          {hasTopVendors ? (
            <ResponsiveContainer>
              <BarChart data={topVendorsData} layout="vertical" margin={{ top: 8, right: 56, left: 8, bottom: 0 }} barCategoryGap="24%">
                <CartesianGrid horizontal={false} stroke={GRID_COLOR} />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="vendor" width={92} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: TEXT_SECONDARY, fontWeight: 600 }} />
                <Tooltip content={<CustomTooltip formatter={formatCurrency} />} cursor={{ fill: 'rgba(42,120,214,0.06)' }} />
                <Bar dataKey="fees" name="Fees" fill={SEQUENTIAL_BLUE} radius={[0, 4, 4, 0]} barSize={18}>
                  <LabelList dataKey="fees" position="right" fill={TEXT_SECONDARY} fontSize={11} fontWeight={700} formatter={formatCurrency} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartState message="No fee data recorded yet." />
          )}
        </ChartCard>
      </div>
    </div>
  );
}
