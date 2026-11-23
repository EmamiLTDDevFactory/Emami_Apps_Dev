'use client';
/**
 * Executive overview - FMCG A&P KPIs on the expense side:
 * total A&P (GR Total LR) and MIS spend YTD with growth, ATL : BTL ratio and its shift, budget utilisation against RB YTD,
 * month spend vs the same month last year, full-year run-rate against RB, monthly trend, header-group and brand roll-ups.
 */
import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Gauge, IndianRupee, Megaphone, Scale, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/lib/context';
import { growth, monthOf, pct, pctPlain, periodLabel, share, short, ytdLabel } from '@/lib/format';
import { actuals, projectFY, rangeOf, rollup, total } from '@/lib/model';
import type { TrendMonth } from '@/lib/types';
import { BarList, CLASS_COLOR, SERIES, SplitBar, TrendBars } from '../charts';
import { Card, Kpi, Notice, Pill, Skeleton } from '../ui';

export default function Overview() {
  const { rows, filters, fmt, go, q } = useApp();
  const [trend, setTrend] = useState<TrendMonth[] | null | 'error'>(null);

  useEffect(() => {
    let live = true;
    setTrend(null);
    api.trend(q).then((b) => live && setTrend(b.months)).catch(() => live && setTrend('error'));
    return () => { live = false; };
  }, [q]);

  const k = useMemo(() => {
    const all = total(rows);
    const mis = total(rows.filter((r) => r.InMIS));
    const cls = rollup(rows, (r) => r.SpendClass);
    const get = (c: string) => cls.find((x) => x.key === c) ?? { cy: 0, py: 0 };
    const atl = get('ATL'); const btl = get('BTL');
    const atlShare = share(atl.cy, atl.cy + btl.cy); const atlSharePy = share(atl.py, atl.py + btl.py);
    return { all, mis, atl, btl, other: get('OTHER'), unmapped: get('UNMAPPED'), atlShare, atlShift: atlShare - atlSharePy };
  }, [rows]);

  const groups = useMemo(() => rollup(rows, (r) => r.HeaderGroup, (r) => r.HeaderLabel), [rows]);
  const brands = useMemo(() => rollup(rows.filter((r) => r.SerialNo), rangeOf), [rows]);
  const sites = useMemo(() => rollup(actuals(rows), (r) => r.Site), [rows]);
  const watch = useMemo(() => brands.filter((b) => b.cy > k.all.cy * 0.005).map((b) => ({ ...b, g: growth(b.cy, b.py), u: b.rby ? (b.cy / b.rby) * 100 : null }))
    .filter((b) => (b.g !== null && Math.abs(b.g) >= 25) || (b.u !== null && b.u > 110)).slice(0, 8), [brands, k.all.cy]);

  const dimFiltered = filters.site.length + filters.categories.length + filters.brands.length > 0;
  const months = Array.isArray(trend) ? trend.map((m) => {
    const sel = filters.groups.length ? filters.groups : null;
    const pick = (f: 'cy' | 'py') => (sel ? sel.reduce((s, g) => s + (m.byGroup[g]?.[f] ?? 0), 0) : m[f]);
    return { label: periodLabel(filters.fy, m.period), cy: pick('cy'), py: pick('py') };
  }) : [];

  const util = k.all.rby ? (k.all.cy / k.all.rby) * 100 : null;
  const proj = projectFY(k.all.cy, filters.period);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi icon={IndianRupee} label={`Total A&P spend · ${ytdLabel(filters.fy, filters.period)}`} value={short(k.all.cy)} sub={`PY ${short(k.all.py)} · ${pct(growth(k.all.cy, k.all.py))} YoY`} />
        <Kpi icon={Megaphone} label="MIS spend (ATL + BTL heads)" value={short(k.mis.cy)} sub={`${pctPlain(share(k.mis.cy, k.all.cy))} of A&P · ${pct(growth(k.mis.cy, k.mis.py))} YoY`} onClick={() => go('media')} />
        <Kpi icon={Scale} label="ATL : BTL" value={`${Math.round(k.atlShare)} : ${100 - Math.round(k.atlShare)}`} sub={`ATL share ${k.atlShift >= 0 ? '+' : ''}${k.atlShift.toFixed(1)} pp vs PY`} onClick={() => go('media')} />
        <Kpi icon={Gauge} tone={util !== null && util > 100 ? 'bad' : 'good'} label="Budget utilisation (CY / RB YTD)" value={util === null ? '–' : pctPlain(util)} sub={`RB YTD ${short(k.all.rby)} · ${util !== null && util > 100 ? 'over' : 'within'} budget`} onClick={() => go('budget')} />
        <Kpi icon={CalendarRange} label={`Spend in ${monthOf(filters.period)} (period ${filters.period})`} value={short(k.all.cyP)} sub={`Same month PY ${short(k.all.pyP)} · ${pct(growth(k.all.cyP, k.all.pyP))}`} />
        <Kpi icon={TrendingUp} tone={k.all.rba && proj > k.all.rba ? 'warn' : 'accent'} label="Full-year run-rate" value={short(proj)} sub={k.all.rba ? `${pctPlain(share(proj, k.all.rba))} of RB FY ${short(k.all.rba)}` : 'no RB for the year'} onClick={() => go('budget')} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Monthly spend - current vs previous year" sub={dimFiltered ? 'Header filter applied; site / category / brand filters do not apply to the trend' : 'All brands, by fiscal period'}>
          {trend === null && <Skeleton rows={6} />}
          {trend === 'error' && <Notice>Could not load the monthly trend.</Notice>}
          {Array.isArray(trend) && <TrendBars months={months} fmt={fmt} />}
        </Card>
        <Card title="Spend class split" sub="ATL / BTL by report header · CY YTD">
          <SplitBar fmt={fmt} parts={[
            { label: 'ATL', value: k.atl.cy, color: CLASS_COLOR.ATL },
            { label: 'BTL', value: k.btl.cy, color: CLASS_COLOR.BTL },
            { label: 'DSR & other', value: k.other.cy, color: CLASS_COLOR.OTHER },
            { label: 'Unmapped header', value: k.unmapped.cy, color: CLASS_COLOR.UNMAPPED },
          ]} />
          <div className="mt-4 border-t border-line pt-3">
            <div className="mb-2 text-2xs font-bold uppercase tracking-wide text-muted">HO vs Units</div>
            <SplitBar fmt={fmt} parts={sites.map((s, i) => ({ label: s.key === 'UN' ? 'Units' : s.key, value: s.cy, color: SERIES[i === 0 ? 4 : 5] }))} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="By report header" sub="CY YTD · tick = PY YTD">
          <BarList rows={groups.map((g) => ({ key: g.key, label: g.label, value: g.cy, compare: g.py, detail: `${pct(growth(g.cy, g.py))} YoY` }))} fmt={fmt} compareLabel="PY" onPick={(key) => go('report', { groups: [key] })} />
        </Card>
        <Card title="Top 10 brands" sub="Brand family · CY YTD · tick = PY YTD" actions={<button type="button" className="text-2xs font-bold text-accent hover:underline" onClick={() => go('brands')}>All brands</button>}>
          <BarList rows={brands.slice(0, 10).map((b) => ({ key: b.key, label: b.label, value: b.cy, compare: b.py, detail: `${pctPlain(share(b.cy, k.all.cy))} of spend · ${pct(growth(b.cy, b.py))} YoY` }))} fmt={fmt} compareLabel="PY" onPick={(key) => go('brands', { brands: [key] })} />
        </Card>
      </div>

      {watch.length > 0 && (
        <Card title="Watch list" sub="Brands above 0.5 % of spend with YoY growth beyond ±25 % or more than 110 % of RB YTD used">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {watch.map((b) => (
              <button key={b.key} type="button" onClick={() => go('report', { brands: [b.key] })} className="rounded-xl border border-line p-3 text-left transition hover:border-accent/40 hover:bg-sunken">
                <div className="truncate text-sm font-bold">{b.label}</div>
                <div className="num text-2xs text-muted">{fmt(b.cy)} CY · {fmt(b.py)} PY</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {b.g !== null && Math.abs(b.g) >= 25 && <Pill tone={b.g > 0 ? 'warn' : 'accent'}>{pct(b.g)} YoY</Pill>}
                  {b.u !== null && b.u > 110 && <Pill tone="bad">{pctPlain(b.u)} of RB</Pill>}
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
