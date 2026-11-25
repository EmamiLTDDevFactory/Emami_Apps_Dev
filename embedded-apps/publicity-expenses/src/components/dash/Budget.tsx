'use client';
/**
 * Budget vs actual: OB (opening) and RB (revised) budget, utilisation of RB YTD, budget revision OB -> RB, straight-line
 * full-year projection against RB FY, over / under-running brands. OB / RB are mock until phase 2 (banner says so).
 */
import { useMemo, useState } from 'react';
import { Gauge, PiggyBank, RotateCcw, TrendingUp } from 'lucide-react';
import { useApp } from '@/lib/context';
import { fyLabel, pctPlain, share, short } from '@/lib/format';
import { categoryOf, projectFY, rangeOf, rollup, total, type Roll } from '@/lib/model';
import { Meter } from '../charts';
import { Card, Kpi, Notice, Tabs, cx } from '../ui';

type By = 'header' | 'category' | 'brand';

export default function Budget() {
  const { rows, meta, fmt, filters, go, sel } = useApp();
  const [by, setBy] = useState<By>('header');
  const t = useMemo(() => total(rows), [rows]);
  const list = useMemo(() => {
    const src = by === 'brand' ? rows.filter((r) => r.SerialNo) : rows;
    const key = by === 'header' ? (r: (typeof rows)[number]) => r.HeaderGroup : by === 'category' ? categoryOf : rangeOf;
    const label = by === 'header' ? (r: (typeof rows)[number]) => r.HeaderLabel : key;
    return rollup(src, key, label).filter((r) => r.rba || r.cy);
  }, [rows, by]);

  const util = (r: Roll) => (r.rby ? (r.cy / r.rby) * 100 : null);
  const brands = useMemo(() => rollup(rows.filter((r) => r.SerialNo), rangeOf).filter((r) => r.rby > 0), [rows]);
  const over = brands.filter((b) => b.cy > b.rby).sort((a, b) => (b.cy - b.rby) - (a.cy - a.rby)).slice(0, 8);
  const under = brands.filter((b) => b.cy < b.rby * 0.8).sort((a, b) => (b.rby - b.cy) - (a.rby - a.cy)).slice(0, 8);
  const proj = projectFY(t.cy, sel.n);
  const u = t.rby ? (t.cy / t.rby) * 100 : null;
  const ytd = sel.cy; const fy = fyLabel(filters.fy);

  return (
    <div className="space-y-3">
      {meta?.budget === 'mock' && (
        <Notice tone="warn">OB and RB are <b>mock figures</b> until the budget table is joined in SAP (phase 2): seeded per brand and header from the actual run-rate, phased straight-line. The screen switches to SAP budget values with no change here.</Notice>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Gauge} tone={u !== null && u > 100 ? 'bad' : 'good'} label={`Utilisation · ${ytd}`} value={u === null ? '–' : pctPlain(u)} sub={`CY ${short(t.cy)} of RB ${short(t.rby)} for the same periods`} />
        <Kpi icon={PiggyBank} label={`RB ${fy} balance`} value={short(t.rba - t.cy)} sub={`${pctPlain(share(t.rba - t.cy, t.rba))} of RB FY ${short(t.rba)} left${sel.ytd || sel.n === 1 && sel.latest === 1 ? '' : ` after ${ytd} only`}`} />
        <Kpi icon={RotateCcw} label="Budget revision OB → RB" value={`${t.oba ? (((t.rba - t.oba) / t.oba) * 100 >= 0 ? '+' : '') + (((t.rba - t.oba) / t.oba) * 100).toFixed(1) : '–'}%`} sub={`OB ${short(t.oba)} → RB ${short(t.rba)}`} />
        <Kpi icon={TrendingUp} tone={proj > t.rba ? 'warn' : 'accent'} label="Projected full year" value={short(proj)} sub={`${proj > t.rba ? 'over' : 'under'} RB FY by ${short(Math.abs(proj - t.rba))}`} />
      </div>
      <Card title="Budget vs actual" sub={`${ytd} · utilisation = CY / RB of the same periods; marker = 100 %; projected FY = average of the ${sel.n} period${sel.n === 1 ? '' : 's'} × 12`} actions={<Tabs label="By" value={by} onChange={setBy} tabs={[{ id: 'header', label: 'Header' }, { id: 'category', label: 'Category' }, { id: 'brand', label: 'Brand family' }]} />} bodyClass="p-0">
        <div className="scroll-thin max-h-[30rem] overflow-auto">
          <table className="w-full min-w-[46rem] text-left text-[12px]">
            <thead className="sticky top-0 bg-panel">
              <tr className="border-b border-line text-2xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2">Name</th><th className="px-2 text-right">OB {fy}</th><th className="px-2 text-right">RB {fy}</th><th className="px-2 text-right">RB {ytd}</th><th className="px-2 text-right">CY {ytd}</th><th className="px-2 text-right">CY − RB</th><th className="w-40 px-3">Utilised</th><th className="px-2 text-right">Projected FY</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((r) => {
                const v = util(r);
                return (
                  <tr key={r.key} className="cursor-pointer hover:bg-sunken" onClick={() => go('report', by === 'header' ? { groups: [r.key] } : by === 'category' ? { categories: [r.key] } : { brands: [r.key] })}>
                    <td className="max-w-[14rem] truncate px-3 py-1.5 font-semibold" title={r.label}>{r.label}</td>
                    <td className="num px-2 text-right text-muted">{fmt(r.oba)}</td>
                    <td className="num px-2 text-right">{fmt(r.rba)}</td>
                    <td className="num px-2 text-right">{fmt(r.rby)}</td>
                    <td className="num px-2 text-right font-semibold">{fmt(r.cy)}</td>
                    <td className={cx('num px-2 text-right', r.cy > r.rby ? 'text-bad' : 'text-good')}>{fmt(r.cy - r.rby)}</td>
                    <td className="px-3"><div className="flex items-center gap-2"><div className="flex-1"><Meter value={r.cy} budget={r.rby} /></div><span className="num w-11 text-right text-2xs font-bold">{v === null ? '–' : pctPlain(v, 0)}</span></div></td>
                    <td className={cx('num px-2 text-right', projectFY(r.cy, sel.n) > r.rba ? 'text-warn' : '')}>{fmt(projectFY(r.cy, sel.n))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {([['Over-running brands', `Spend above RB for ${ytd}, largest overrun first`, over, 'bad'], ['Under-utilised brands', `Below 80 % of RB for ${ytd}, largest unspent first`, under, 'good']] as const).map(([title, sub, items, tone]) => (
          <Card key={title} title={title} sub={sub}>
            {items.length === 0 ? <p className="text-sm text-muted">None.</p> : (
              <ul className="divide-y divide-line">
                {items.map((b) => (
                  <li key={b.key}>
                    <button type="button" onClick={() => go('report', { brands: [b.key] })} className="flex w-full items-center gap-3 py-2 text-left hover:bg-sunken">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{b.label}</span>
                      <span className="num text-2xs text-muted">{fmt(b.cy)} / {fmt(b.rby)}</span>
                      <span className={cx('num w-24 text-right text-xs font-bold', tone === 'bad' ? 'text-bad' : 'text-good')}>{tone === 'bad' ? '+' : '−'}{fmt(Math.abs(b.cy - b.rby))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
