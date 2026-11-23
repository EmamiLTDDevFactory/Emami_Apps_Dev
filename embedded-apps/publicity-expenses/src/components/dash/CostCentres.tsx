'use client';
/**
 * Cost centres and reconciliation (from ZC_ATLBTL_EXP_DETAIL, totalled on the server): HO vs Units, profit centres,
 * cost-centre types, mapping rules R01..R11 / R99, top cost centres, non-brand groups, unmapped spend ("Not covered by
 * mapping logic", "Brand - hierarchy not found") and the check that the detail adds up to the summary (report = G/L).
 * Uses the period and company only; the dimension filters do not apply here (said on screen).
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, Building2, CheckCircle2, Network } from 'lucide-react';
import { api, type ApiError } from '@/lib/api';
import { useApp } from '@/lib/context';
import { growth, pct, pctPlain, share, short } from '@/lib/format';
import type { Breakdown, Bucket } from '@/lib/types';
import { BarList, SERIES, SplitBar } from '../charts';
import { Card, Kpi, Notice, Pill, Skeleton } from '../ui';

const CC_TYPE: Record<string, string> = { B: 'B · Brand', M: 'M · Marketing', S: 'S · Sales' };

export default function CostCentres() {
  const { filters, fmt } = useApp();
  const [data, setData] = useState<Breakdown | { error: string } | null>(null);

  useEffect(() => {
    let live = true;
    setData(null);
    api.breakdown({ fy: filters.fy, period: filters.period, company: filters.company || undefined }).then((b) => live && setData(b)).catch((e: ApiError) => live && setData({ error: e.message }));
    return () => { live = false; };
  }, [filters.fy, filters.period, filters.company]);

  if (!data) return <Card><Skeleton rows={10} /></Card>;
  if ('error' in data) return <Notice>{data.error}</Notice>;

  const rec = data.reconciliation;
  const totalCy = rec.detailCy;
  const unPct = share(data.unmapped.cy, totalCy);
  const bars = (b: Bucket[], label?: (b: Bucket) => string) => b.map((x) => ({ key: x.key, label: label ? label(x) : x.key, value: x.cy, compare: x.py, detail: `${pct(growth(x.cy, x.py))} YoY · ${x.rows} lines` }));
  const filtered = filters.site.length + filters.groups.length + filters.categories.length + filters.brands.length > 0;

  return (
    <div className="space-y-3">
      {filtered && <Notice tone="warn">This screen shows the whole period and company; the site, header, category and brand filters do not apply here.</Notice>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={rec.difference === 0 ? CheckCircle2 : AlertTriangle} tone={Math.abs(rec.difference) < 1 ? 'good' : 'bad'} label="Report = G/L check" value={Math.abs(rec.difference) < 1 ? 'Reconciled' : fmt(rec.difference)} sub={`detail ${short(rec.detailCy)} · summary ${short(rec.summaryCy)}`} />
        <Kpi icon={AlertTriangle} tone={unPct > 2 ? 'warn' : 'good'} label="Unmapped spend" value={pctPlain(unPct)} sub={`${short(data.unmapped.cy)} in ${data.unmapped.rows} lines`} />
        <Kpi icon={Building2} label="Cost centres with postings" value={String(rec.costCenters)} sub={`${rec.lines} posting lines`} />
        <Kpi icon={Network} label="Profit centres" value={String(data.byProfitCenter.length)} sub={`top: ${data.byProfitCenter[0]?.key ?? '–'}`} />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card title="HO vs Units" sub="CY YTD">
          <SplitBar fmt={fmt} parts={data.bySite.map((s, i) => ({ label: s.key === 'UN' ? 'Units' : s.key, value: s.cy, color: SERIES[i === 0 ? 4 : 5] }))} />
        </Card>
        <Card title="Cost-centre type (KOSAR)" sub="CY YTD · tick = PY">
          <BarList rows={bars(data.byCostCenterType, (b) => CC_TYPE[b.key] ?? b.key)} fmt={fmt} compareLabel="PY" />
        </Card>
        <Card title="Mapping rule" sub="Which rule of the cost-centre logic placed the spend">
          <BarList rows={bars(data.byRule, (b) => `${b.key}${b.lookup ? ` · ${b.lookup}` : ''}`)} fmt={fmt} compareLabel="PY" />
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="Top cost centres" sub="CY YTD · tick = PY">
          <BarList max={15} rows={bars(data.topCostCenters, (b) => `${b.key} ${b.name ?? ''}`)} fmt={fmt} compareLabel="PY" />
        </Card>
        <Card title="Profit centres" sub="CY YTD · tick = PY">
          <BarList max={15} rows={bars(data.byProfitCenter)} fmt={fmt} compareLabel="PY" />
        </Card>
      </div>
      <Card title="Non-brand and unmapped groups" sub="Spend that is not placed on a brand row - kept so the report always equals the G/L">
        {data.byProductGroup.length === 0 ? <p className="text-sm text-muted">None.</p> : (
          <ul className="divide-y divide-line">
            {data.byProductGroup.map((g) => {
              const bad = data.unmapped.byGroup.some((u) => u.key === g.key);
              return (
                <li key={g.key} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{g.key}</span>
                  {bad && <Pill tone="warn">needs mapping</Pill>}
                  <span className="num text-2xs text-muted">{pctPlain(share(g.cy, totalCy))} of spend · {g.rows} lines</span>
                  <span className="num w-24 text-right text-sm font-bold">{fmt(g.cy)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
