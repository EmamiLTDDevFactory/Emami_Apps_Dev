'use client';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtCompactInr, fmtNum } from '@/lib/format';

/** Chart colours are picked per theme in JS (SVG presentation attributes can't read CSS vars
 * reliably). Values from the validated reference palette; source colours are the app's fixed
 * rate-source identity colours (CONTRACT green, INFOREC yellow, MARKT cyan, CONSUMP orange,
 * MBEW red, no rate grey). */
export function useChartTheme() {
  // Light only, like the hub. Single series = the hub's indigo; diverging = red (up) / blue (down).
  return {
    series: '#4F3FD6', up: '#C0392B', down: '#2a78d6', grid: '#ECEAF6', axis: '#6B7280', text: '#1F1B33', surface: '#ffffff', sim: '#C2185B', neutral: '#8B8FA3',
    src: { CONTRACT: '#008300', INFOREC: '#eda100', MARKT: '#0e9fb5', CONSUMP: '#eb6834', MBEW: '#e34948', 'NO RATE': '#8a8984' } as Record<string, string>,
  };
}

const tooltipStyle = (t: ReturnType<typeof useChartTheme>) => ({
  contentStyle: { background: t.surface, border: `1px solid ${t.grid}`, borderRadius: 6, fontSize: 12, color: t.text },
  itemStyle: { color: t.text },
  labelStyle: { color: t.text, fontWeight: 600 },
  cursor: { fill: t.grid, opacity: 0.5 },
});

export interface Datum { name: string; value: number; label?: string }

/** Donut: share of cost by rate source, with a legend that carries value and % (identity never
 * by colour alone). */
export function SourceDonut({ data }: { data: Datum[] }) {
  const t = useChartTheme();
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row">
      <div className="h-48 w-48 shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="95%" paddingAngle={1} stroke={t.surface} strokeWidth={2} isAnimationActive={false}>
              {data.map((d) => <Cell key={d.name} fill={t.src[d.name] ?? t.neutral} />)}
            </Pie>
            <Tooltip {...tooltipStyle(t)} formatter={(v: unknown) => [`${fmtNum(String(v), 2)} INR (${((Number(v) / total) * 100).toFixed(1)}%)`, 'Cost']} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full space-y-1 text-xs">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: t.src[d.name] ?? t.neutral }} aria-hidden />
            <span className="font-medium">{d.name}</span>
            <span className="num ml-auto text-muted">{fmtCompactInr(d.value)}</span>
            <span className="num w-12 text-right font-semibold">{((d.value / total) * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bars for a ranked list (one series -> one colour, labels on the axis). */
export function HBars({ data, height, color, unit = 'INR' }: { data: Datum[]; height?: number; color?: string; unit?: string }) {
  const t = useChartTheme();
  const h = height ?? Math.max(120, data.length * 26 + 30);
  return (
    <div style={{ height: h }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }} barCategoryGap={4}>
          <CartesianGrid horizontal={false} stroke={t.grid} />
          <XAxis type="number" tickFormatter={fmtCompactInr} tick={{ fill: t.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="label" width={170} tick={{ fill: t.axis, fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
          <Tooltip {...tooltipStyle(t)} formatter={(v: unknown) => [`${fmtNum(String(v), 2)} ${unit}`, 'Cost']} labelFormatter={(l) => String(l)} />
          <Bar dataKey="value" fill={color ?? t.series} radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Diverging bars around 0 (budget variance, deltas): red = cost up, blue = cost down. */
export function DivergingBars({ data, height }: { data: Datum[]; height?: number }) {
  const t = useChartTheme();
  const h = height ?? Math.max(120, data.length * 26 + 30);
  return (
    <div style={{ height: h }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }} barCategoryGap={4}>
          <CartesianGrid horizontal={false} stroke={t.grid} />
          <XAxis type="number" tickFormatter={fmtCompactInr} tick={{ fill: t.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="label" width={170} tick={{ fill: t.axis, fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
          <ReferenceLine x={0} stroke={t.axis} />
          <Tooltip {...tooltipStyle(t)} formatter={(v: unknown) => [`${Number(v) > 0 ? '+' : ''}${fmtNum(String(v), 2)} INR`, 'Variance']} />
          <Bar dataKey="value" radius={4} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.name} fill={d.value >= 0 ? t.up : t.down} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface TornadoDatum { label: string; down: number; up: number }
/** Tornado: total INR impact of -x% (left) and +x% (right) per driver, largest first. */
export function Tornado({ data, pct }: { data: TornadoDatum[]; pct: number }) {
  const t = useChartTheme();
  return (
    <div style={{ height: Math.max(140, data.length * 26 + 40) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" stackOffset="sign" margin={{ left: 8, right: 16, top: 4, bottom: 4 }} barCategoryGap={4}>
          <CartesianGrid horizontal={false} stroke={t.grid} />
          <XAxis type="number" tickFormatter={fmtCompactInr} tick={{ fill: t.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="label" width={200} tick={{ fill: t.axis, fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
          <ReferenceLine x={0} stroke={t.axis} />
          <Tooltip {...tooltipStyle(t)} formatter={(v: unknown, k: unknown) => [`${Number(v) > 0 ? '+' : ''}${fmtNum(String(v), 2)} INR`, k === 'up' ? `+${pct}%` : `−${pct}%`]} />
          <Bar dataKey="down" stackId="s" fill={t.down} radius={[4, 0, 0, 4]} isAnimationActive={false} />
          <Bar dataKey="up" stackId="s" fill={t.up} radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface WaterfallDatum { label: string; value: number; kind: 'total' | 'step' }
/** Waterfall: baseline total, each effect as a floating bar, scenario total. */
export function Waterfall({ data }: { data: WaterfallDatum[] }) {
  const t = useChartTheme();
  let run = 0;
  const rows = data.map((d) => {
    if (d.kind === 'total') {
      run = d.value;
      return { label: d.label, base: 0, bar: d.value, raw: d.value, kind: d.kind };
    }
    const start = run;
    run += d.value;
    return { label: d.label, base: Math.min(start, run), bar: Math.abs(d.value), raw: d.value, kind: d.kind };
  });
  // The axis starts near the smaller total (not 0) so small effects stay visible; the caption says so.
  const lo = Math.min(...rows.map((r) => (r.kind === 'total' ? r.raw : r.base)));
  const min = lo > 0 ? lo * 0.97 : lo;
  return (
    <div className="h-72">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ left: 8, right: 8, top: 8, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke={t.grid} />
          <XAxis dataKey="label" tick={{ fill: t.axis, fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
          <YAxis tickFormatter={fmtCompactInr} tick={{ fill: t.axis, fontSize: 11 }} axisLine={false} tickLine={false} domain={[min, 'auto']} allowDataOverflow />
          <Tooltip {...tooltipStyle(t)} formatter={(_v: unknown, _k: unknown, p: { payload?: { kind: string; raw: number; label: string } }) => [`${p.payload?.kind === 'step' && (p.payload?.raw ?? 0) > 0 ? '+' : ''}${fmtNum(String(p.payload?.raw ?? 0), 2)} INR`, p.payload?.label ?? '']} />
          <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="bar" stackId="w" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {rows.map((r) => <Cell key={r.label} fill={r.kind === 'total' ? t.neutral : r.raw >= 0 ? t.up : t.down} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
