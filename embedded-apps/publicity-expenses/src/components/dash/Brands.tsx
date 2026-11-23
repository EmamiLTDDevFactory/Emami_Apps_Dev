'use client';
/**
 * Brand portfolio: share of A&P spend and its shift vs PY, YoY growth, spend concentration (Pareto / top-5 share),
 * ATL : BTL mix per brand and budget utilisation per brand. Levels: category, brand family (range), brand (product type).
 */
import { useMemo, useState } from 'react';
import { ArrowDownUp, Download, Layers, PieChart, Tags, TrendingUp } from 'lucide-react';
import { useApp } from '@/lib/context';
import { growth, pct, pctPlain, share, short, UNIT_LABEL, ytdLabel } from '@/lib/format';
import { categoryOf, pareto, rangeOf, rollup, typeOf } from '@/lib/model';
import type { SummaryRow } from '@/lib/types';
import { CLASS_COLOR, Pareto, StackedRows } from '../charts';
import { Card, Kpi, Tabs, cx } from '../ui';

type Level = 'category' | 'range' | 'type';
const KEY: Record<Level, (r: SummaryRow) => string> = { category: categoryOf, range: rangeOf, type: (r) => `${rangeOf(r)} › ${typeOf(r)}` };
type SortKey = 'label' | 'cy' | 'py' | 'g' | 'sh' | 'shd' | 'atl' | 'u';

export default function Brands() {
  const { rows, fmt, go, filters, unit } = useApp();
  const [level, setLevel] = useState<Level>('range');
  const [sort, setSort] = useState<{ k: SortKey; desc: boolean }>({ k: 'cy', desc: true });
  const branded = useMemo(() => rows.filter((r) => r.SerialNo), [rows]);
  const base = level === 'category' ? rows : branded;

  const data = useMemo(() => {
    const rolls = rollup(base, KEY[level]);
    const atl = new Map(rollup(base.filter((r) => r.SpendClass === 'ATL'), KEY[level]).map((x) => [x.key, x.cy]));
    const btl = new Map(rollup(base.filter((r) => r.SpendClass === 'BTL'), KEY[level]).map((x) => [x.key, x.cy]));
    const cyAll = rolls.reduce((s, r) => s + r.cy, 0); const pyAll = rolls.reduce((s, r) => s + r.py, 0);
    const list = rolls.map((r) => {
      const sh = share(r.cy, cyAll); const shPy = share(r.py, pyAll);
      const a = atl.get(r.key) ?? 0; const b = btl.get(r.key) ?? 0;
      return { ...r, g: growth(r.cy, r.py), sh, shd: sh - shPy, atl: a + b ? (a / (a + b)) * 100 : null, atlAmt: a, btlAmt: b, u: r.rby ? (r.cy / r.rby) * 100 : null };
    });
    return { list, cyAll, pyAll, p: pareto(rolls) };
  }, [base, level]);

  const sorted = useMemo(() => {
    const v = (x: (typeof data.list)[number]) => (sort.k === 'label' ? x.label : (x[sort.k] as number | null) ?? -Infinity);
    return [...data.list].sort((a, b) => { const x = v(a); const y = v(b); const c = x < y ? -1 : x > y ? 1 : 0; return sort.desc ? -c : c; });
  }, [data, sort]);

  const active = data.list.filter((r) => r.cy > 0).length;
  const top5 = data.p.rows.slice(0, 5).reduce((s, r) => s + r.cy, 0);
  const growing = data.list.filter((r) => r.g !== null && r.g > 0).length;
  const levelName = level === 'category' ? 'categories' : level === 'range' ? 'brand families' : 'brands';
  const pick = (key: string) => {
    if (level === 'category') go('report', { categories: [key] });
    else go('report', { brands: [key.split(' › ')[0]] });
  };

  async function exportXlsx() {
    const XLSX = await import('xlsx');
    const div = unit === 'lakh' ? 1e5 : unit === 'crore' ? 1e7 : 1;
    const r2 = (v: number) => Math.round((v / div) * 100) / 100;
    const out = [[level === 'category' ? 'Category' : level === 'range' ? 'Brand family' : 'Brand', `CY YTD (${UNIT_LABEL[unit]})`, `PY YTD (${UNIT_LABEL[unit]})`, 'Growth %', 'Share of spend %', 'Share change pp', 'ATL share %', `RB YTD (${UNIT_LABEL[unit]})`, 'Utilised %'],
      ...sorted.map((r) => [r.label, r2(r.cy), r2(r.py), r.g === null ? '' : +r.g.toFixed(1), +r.sh.toFixed(2), +r.shd.toFixed(2), r.atl === null ? '' : +r.atl.toFixed(1), r2(r.rby), r.u === null ? '' : +r.u.toFixed(1)])];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(out), 'Brands');
    XLSX.writeFile(wb, `ATL-BTL-brands-${ytdLabel(filters.fy, filters.period)}.xlsx`);
  }

  const Th = ({ k, children, right = true }: { k: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th className={cx('whitespace-nowrap px-2 py-2 font-bold', right && 'text-right')}>
      <button type="button" className={cx('inline-flex items-center gap-1 hover:text-ink', sort.k === k && 'text-accent')} onClick={() => setSort((s) => ({ k, desc: s.k === k ? !s.desc : k !== 'label' }))}>
        {children}{sort.k === k && <ArrowDownUp size={10} />}
      </button>
    </th>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs label="Level" value={level} onChange={setLevel} tabs={[{ id: 'category', label: 'Category' }, { id: 'range', label: 'Brand family' }, { id: 'type', label: 'Brand' }]} />
        <p className="text-2xs text-muted">{level === 'category' ? 'All rows incl. non-brand groups' : 'Brand rows only (non-brand groups are on the Cost centres screen)'}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Tags} label={`Active ${levelName}`} value={String(active)} sub={`with spend in ${ytdLabel(filters.fy, filters.period)}`} />
        <Kpi icon={Layers} label="Spend concentration" value={`${data.p.n80 || '–'}`} sub={`${levelName} = 80 % of spend`} />
        <Kpi icon={PieChart} label="Top 5 share" value={pctPlain(share(top5, data.cyAll))} sub={`${short(top5)} of ${short(data.cyAll)}`} />
        <Kpi icon={TrendingUp} label="Spending more than PY" value={`${growing} / ${data.list.length}`} sub={`portfolio ${pct(growth(data.cyAll, data.pyAll))} YoY`} />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="Spend concentration (Pareto)" sub={`Top 20 ${levelName} · share of CY YTD spend and cumulative share`}>
          <Pareto rows={data.p.rows} fmt={fmt} onPick={pick} />
        </Card>
        <Card title="ATL : BTL mix by brand" sub="Top 12 by spend · share of each brand's ATL + BTL spend">
          <StackedRows fmt={fmt}
            rows={data.list.slice(0, 12).map((r) => ({ key: r.key, label: r.label, parts: { ATL: r.atlAmt, BTL: r.btlAmt } }))}
            series={[{ key: 'ATL', label: 'ATL', color: CLASS_COLOR.ATL }, { key: 'BTL', label: 'BTL', color: CLASS_COLOR.BTL }]} />
        </Card>
      </div>
      <Card title={`Portfolio table · ${data.list.length} ${levelName}`} sub="Click a row to open it in the MIS report" bodyClass="p-0"
        actions={<button type="button" onClick={exportXlsx} className="inline-flex items-center gap-1 text-2xs font-bold text-accent hover:underline"><Download size={12} /> Excel</button>}>
        <div className="scroll-thin max-h-[32rem] overflow-auto">
          <table className="w-full text-left text-[12px]">
            <thead className="sticky top-0 bg-panel">
              <tr className="border-b border-line text-2xs uppercase tracking-wide text-muted">
                <Th k="label" right={false}>Name</Th><Th k="cy">CY YTD</Th><Th k="py">PY YTD</Th><Th k="g">Growth</Th><Th k="sh">Share</Th><Th k="shd">Share Δ pp</Th><Th k="atl">ATL %</Th><Th k="u">RB used</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sorted.map((r) => (
                <tr key={r.key} className="cursor-pointer hover:bg-sunken" onClick={() => pick(r.key)}>
                  <td className="max-w-[16rem] truncate px-2 py-1.5 font-semibold" title={r.label}>{r.label}</td>
                  <td className="num px-2 py-1.5 text-right font-semibold">{fmt(r.cy)}</td>
                  <td className="num px-2 py-1.5 text-right text-muted">{fmt(r.py)}</td>
                  <td className="num px-2 py-1.5 text-right">{pct(r.g)}</td>
                  <td className="num px-2 py-1.5 text-right">{pctPlain(r.sh)}</td>
                  <td className={cx('num px-2 py-1.5 text-right', r.shd > 0.5 ? 'text-accent' : r.shd < -0.5 ? 'text-muted' : '')}>{r.shd >= 0 ? '+' : ''}{r.shd.toFixed(2)}</td>
                  <td className="num px-2 py-1.5 text-right">{r.atl === null ? '–' : pctPlain(r.atl, 0)}</td>
                  <td className={cx('num px-2 py-1.5 text-right', r.u !== null && r.u > 100 ? 'font-bold text-bad' : '')}>{r.u === null ? '–' : pctPlain(r.u, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
